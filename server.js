const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const express = require("express");
const { Server: SocketIOServer } = require("socket.io");
const { StringDecoder } = require("string_decoder");

const app = express();
app.use(express.json());

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: "*" },
  maxHttpBufferSize: 10 * 1024 * 1024,
});

// ─── Config ────────────────────────────────────────────────────────────────
const SESSIONS_DIR = path.join(
  process.env.PI_SESSION_DIR || path.join(os.homedir(), ".pi", "agent", "sessions"),
  "pi-web-ui"
);
const META_FILE = path.join(SESSIONS_DIR, "_meta.json");
const DEFAULT_WORKSPACE = process.cwd();

fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// ─── Session Store ─────────────────────────────────────────────────────────
const sessions = new Map();

function loadMeta() {
  try {
    if (fs.existsSync(META_FILE)) {
      return JSON.parse(fs.readFileSync(META_FILE, "utf8"));
    }
  } catch (e) { /* ignore */ }
  return [];
}

function saveMeta() {
  const list = [];
  for (const [id, meta] of sessions) {
    list.push({
      id,
      name: meta.name,
      workspace: meta.workspace,
      messages: meta.messages,
      createdAt: meta.createdAt,
    });
  }
  list.sort((a, b) => b.createdAt - a.createdAt);
  fs.writeFileSync(META_FILE, JSON.stringify(list, null, 2));
}

// Restore sessions from disk on startup
function restoreSessions() {
  const list = loadMeta();
  for (const item of list) {
    sessions.set(item.id, {
      id: item.id,
      name: item.name,
      workspace: item.workspace,
      rpcProc: null,
      rpcReady: false,
      streaming: false,
      messages: item.messages || [],
      socketRooms: new Set(),
      createdAt: item.createdAt,
      currentAssistantBlock: null,
      currentToolBlocks: {},
      pendingToolCalls: {},
    });
  }
  console.log(`Restored ${list.length} sessions from disk`);
}

restoreSessions();

function sessionDir(workspace) {
  const dir = path.join(SESSIONS_DIR, sanitizeWorkspace(workspace));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sanitizeWorkspace(ws) {
  return ws.replace(/[^a-zA-Z0-9_\-\.]/g, "_").replace(/^\/+/, "").replace(/\/+/g, "_") || "root";
}

function sessionFilePath(workspace, sessionId) {
  return path.join(sessionDir(workspace), `${sessionId}.jsonl`);
}

function generateId() {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Pi RPC ────────────────────────────────────────────────────────────────
function spawnPiRPC(workspace, sessionFile) {
  const proc = spawn("pi", ["--mode", "rpc", "--session", sessionFile, "--name", "pi-web-ui"], {
    cwd: workspace,
    env: { ...process.env },
    stdio: ["pipe", "pipe", "pipe"],
  });
  return proc;
}

function attachJsonlReader(stream, onLine, onError) {
  const decoder = new StringDecoder("utf8");
  let buffer = "";

  stream.on("data", (chunk) => {
    buffer += typeof chunk === "string" ? chunk : decoder.write(chunk);
    while (true) {
      const idx = buffer.indexOf("\n");
      if (idx === -1) break;
      let line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.trim()) {
        try { onLine(JSON.parse(line)); } catch (e) { /* skip */ }
      }
    }
  });

  stream.on("end", () => {
    buffer += decoder.end();
    if (buffer.length > 0) {
      let line = buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer;
      if (line.trim()) {
        try { onLine(JSON.parse(line)); } catch (e) { /* skip */ }
      }
    }
  });

  stream.on("error", (err) => { if (onError) onError(err); });
}

function startSession(sessionId) {
  const meta = sessions.get(sessionId);
  if (!meta) return;

  const sfp = sessionFilePath(meta.workspace, sessionId);
  const proc = spawnPiRPC(meta.workspace, sfp);
  meta.rpcProc = proc;
  meta.rpcReady = false;
  meta.messages = meta.messages || [];

  attachJsonlReader(proc.stdout, (event) => handleRPCEvent(sessionId, event), (err) => {
    console.error(`[${sessionId}] stdout error:`, err.message);
  });

  let stderrBuf = "";
  proc.stderr.on("data", (d) => {
    stderrBuf += d.toString();
    const lines = stderrBuf.split("\n");
    stderrBuf = lines.pop();
    lines.forEach((l) => { if (l.trim()) io.to(sessionId).emit("pi_stderr", { text: l }); });
  });

  proc.on("close", (code) => {
    console.log(`[${sessionId}] Pi exited code=${code}`);
    meta.rpcProc = null;
    meta.rpcReady = false;
    io.to(sessionId).emit("pi_disconnected", { code });
  });

  proc.on("error", (err) => {
    console.error(`[${sessionId}] Pi error:`, err.message);
    io.to(sessionId).emit("pi_error", { error: err.message });
  });
}

function killSession(sessionId) {
  const meta = sessions.get(sessionId);
  if (!meta) return;
  if (meta.rpcProc) {
    meta.rpcProc.kill("SIGTERM");
    meta.rpcProc = null;
  }
  meta.rpcReady = false;
  meta.streaming = false;
}

function handleRPCEvent(sessionId, event) {
  const meta = sessions.get(sessionId);
  if (!meta) return;

  if (event.type === "agent_start") {
    meta.streaming = true;
    meta.currentAssistantBlock = { role: "assistant", content: [], model: "", usage: null, timestamp: Date.now() };
    meta.currentTextIdx = -1;
    meta.currentToolBlocks = {};
    meta.pendingToolCalls = {};
    io.to(sessionId).emit("pi_event", event);
  } else if (event.type === "agent_end" || event.type === "agent_settled") {
    meta.streaming = false;
    if (meta.currentAssistantBlock && meta.currentAssistantBlock.content.length > 0) {
      meta.messages.push(meta.currentAssistantBlock);
      saveMeta();
    }
    meta.currentAssistantBlock = null;
    meta.currentToolBlocks = {};
    meta.pendingToolCalls = {};
    io.to(sessionId).emit("pi_event", event);
  } else if (event.type === "message_start") {
    if (event.message?.role === "assistant") {
      meta.currentAssistantBlock = { role: "assistant", content: [], model: event.message.model || "", usage: event.message.usage, timestamp: Date.now() };
      meta.currentTextIdx = -1;
    }
    io.to(sessionId).emit("pi_event", event);
  } else if (event.type === "message_update") {
    const delta = event.assistantMessageEvent;
    if (meta.currentAssistantBlock && delta) {
      if (delta.type === "text_start") {
        meta.currentAssistantBlock.content.push({ type: "text", text: "" });
        meta.currentTextIdx = meta.currentAssistantBlock.content.length - 1;
      } else if (delta.type === "text_delta") {
        if (meta.currentTextIdx >= 0) {
          const block = meta.currentAssistantBlock.content[meta.currentTextIdx];
          if (block && block.type === "text") block.text += delta.delta || "";
        }
      } else if (delta.type === "thinking_start") {
        meta.currentAssistantBlock.content.push({ type: "thinking", thinking: "" });
      } else if (delta.type === "thinking_delta") {
        const last = meta.currentAssistantBlock.content[meta.currentAssistantBlock.content.length - 1];
        if (last && last.type === "thinking") last.thinking += delta.delta || "";
      } else if (delta.type === "toolcall_end" && delta.toolCall) {
        const tc = delta.toolCall;
        meta.currentAssistantBlock.content.push({
          type: "toolCall", id: tc.id, name: tc.name, arguments: tc.arguments || {},
        });
        meta.pendingToolCalls[tc.id] = tc;
      }
    }
    io.to(sessionId).emit("pi_event", event);
  } else if (event.type === "message_end") {
    if (meta.currentAssistantBlock && event.message?.role === "assistant") {
      meta.currentAssistantBlock.usage = event.message.usage;
      meta.currentAssistantBlock.stopReason = event.message.stopReason;
    }
    io.to(sessionId).emit("pi_event", event);
  } else if (event.type === "tool_execution_start") {
    meta.currentToolBlocks[event.toolCallId] = {
      toolCallId: event.toolCallId, toolName: event.toolName,
      args: event.args, executing: true, result: null, isError: false,
    };
    io.to(sessionId).emit("pi_event", event);
  } else if (event.type === "tool_execution_update") {
    io.to(sessionId).emit("pi_event", event);
  } else if (event.type === "tool_execution_end") {
    const tb = meta.currentToolBlocks[event.toolCallId];
    if (tb) { tb.result = event.result; tb.isError = event.isError; tb.executing = false; }
    io.to(sessionId).emit("pi_event", event);
  } else if (event.type === "response") {
    io.to(sessionId).emit("pi_response", event);
  } else if (event.type === "extension_ui_request") {
    io.to(sessionId).emit("pi_event", event);
  } else {
    io.to(sessionId).emit("pi_event", event);
  }
}

function sendRPC(sessionId, cmd) {
  const meta = sessions.get(sessionId);
  if (!meta || !meta.rpcProc) return false;
  try {
    meta.rpcProc.stdin.write(JSON.stringify(cmd) + "\n");
    return true;
  } catch (e) {
    console.error(`[${sessionId}] RPC send error:`, e.message);
    return false;
  }
}

// ─── REST API ──────────────────────────────────────────────────────────────
// Serve Vite build in production, fallback to old public/
const clientDist = path.join(__dirname, "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  console.log("Serving Vite production build");
} else {
  app.use(express.static(path.join(__dirname, "public")));
}

// List sessions
app.get("/api/sessions", (_req, res) => {
  const list = [];
  for (const [id, meta] of sessions) {
    list.push({
      id, name: meta.name, workspace: meta.workspace,
      streaming: meta.streaming || false,
      messageCount: meta.messages?.length || 0,
      createdAt: meta.createdAt,
    });
  }
  list.sort((a, b) => b.createdAt - a.createdAt);
  res.json(list);
});

// Delete session
app.delete("/api/sessions/:id", (req, res) => {
  const { id } = req.params;
  const meta = sessions.get(id);
  if (!meta) return res.status(404).json({ error: "Not found" });
  killSession(id);
  try { fs.unlinkSync(sessionFilePath(meta.workspace, id)); } catch (e) { /* */ }
  sessions.delete(id);
  saveMeta();
  io.to(id).emit("session_deleted", { id });
  res.json({ success: true });
});

// Browse filesystem
app.get("/api/browse", (req, res) => {
  let dirPath = req.query.path || os.homedir();
  dirPath = path.resolve(dirPath);

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const items = entries
      .filter(e => e.isDirectory() && !e.name.startsWith("."))
      .map(e => ({ name: e.name, type: "directory", path: path.join(dirPath, e.name) }));
    items.sort((a, b) => a.name.localeCompare(b.name));

    const parent = path.dirname(dirPath);
    res.json({
      current: dirPath,
      parent: parent !== dirPath ? parent : null,
      items,
      // Also include common roots
      roots: [
        { name: "Home", path: os.homedir() },
        { name: "Root", path: "/" },
        { name: "Current", path: process.cwd() },
      ],
    });
  } catch (e) {
    res.status(400).json({ error: e.message, current: dirPath, parent: path.dirname(dirPath), items: [] });
  }
});

// Rename session
app.patch("/api/sessions/:id", (req, res) => {
  const { id } = req.params;
  const meta = sessions.get(id);
  if (!meta) return res.status(404).json({ error: "Not found" });
  if (req.body.name !== undefined) meta.name = req.body.name;
  saveMeta();
  res.json({ success: true });
});

// ─── WebSocket ─────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(`[WS] ${socket.id} connected`);

  socket.on("session_create", ({ name, workspace }) => {
    const id = generateId();
    const ws = workspace || DEFAULT_WORKSPACE;
    const meta = {
      id, name: name || `Session ${id.slice(-6)}`, workspace: ws,
      rpcProc: null, rpcReady: false, streaming: false,
      messages: [], socketRooms: new Set(), createdAt: Date.now(),
      currentAssistantBlock: null, currentToolBlocks: {}, pendingToolCalls: {},
    };
    sessions.set(id, meta);
    socket.join(id);
    meta.socketRooms.add(socket.id);
    saveMeta();
    startSession(id);
    socket.emit("session_created", { id, name: meta.name, workspace: meta.workspace, createdAt: meta.createdAt });
  });

  socket.on("session_join", ({ sessionId }) => {
    const meta = sessions.get(sessionId);
    if (!meta) { socket.emit("pi_error", { error: "Session not found" }); return; }
    socket.join(sessionId);
    meta.socketRooms.add(socket.id);
    socket.emit("session_history", {
      sessionId, messages: meta.messages, streaming: meta.streaming,
      workspace: meta.workspace, name: meta.name,
    });
    if (!meta.rpcProc) startSession(sessionId);
  });

  socket.on("session_update_workspace", ({ sessionId, workspace }) => {
    const meta = sessions.get(sessionId);
    if (!meta) return;
    // Kill old process
    killSession(sessionId);
    // Update workspace
    meta.workspace = workspace;
    saveMeta();
    // Restart Pi with new workspace
    startSession(sessionId);
    socket.emit("workspace_updated", { sessionId, workspace });
  });

  socket.on("prompt", ({ sessionId, message, images }) => {
    const meta = sessions.get(sessionId);
    if (!meta) { socket.emit("pi_error", { error: "Session not found" }); return; }
    const cmd = { type: "prompt", message };
    if (images && images.length > 0) {
      cmd.images = images.map(img => ({ type: "image", data: img.data, mimeType: img.mimeType || "image/png" }));
    }
    if (!sendRPC(sessionId, cmd)) socket.emit("pi_error", { error: "Pi process not running" });
  });

  socket.on("steer", ({ sessionId, message }) => {
    if (!sendRPC(sessionId, { type: "steer", message })) socket.emit("pi_error", { error: "Cannot steer" });
  });

  socket.on("abort", ({ sessionId }) => {
    if (!sendRPC(sessionId, { type: "abort" })) socket.emit("pi_error", { error: "Cannot abort" });
  });

  socket.on("extension_ui_response", ({ sessionId, response }) => {
    if (!sendRPC(sessionId, response)) socket.emit("pi_error", { error: "Cannot respond" });
  });

  socket.on("set_model", ({ sessionId, provider, modelId }) => {
    if (!sendRPC(sessionId, { type: "set_model", provider, modelId })) socket.emit("pi_error", { error: "Cannot set model" });
  });

  socket.on("new_session", ({ sessionId }) => {
    if (!sendRPC(sessionId, { type: "new_session" })) socket.emit("pi_error", { error: "Cannot new session" });
  });

  socket.on("disconnect", () => {
    for (const [, meta] of sessions) meta.socketRooms.delete(socket.id);
  });
});

// ─── Start ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3099;
server.listen(PORT, () => {
  console.log(`Pi Web UI → http://localhost:${PORT}`);
  console.log(`Sessions: ${SESSIONS_DIR}`);
});
