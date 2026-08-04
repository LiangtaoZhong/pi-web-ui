const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const express = require("express");
const { Server: SocketIOServer } = require("socket.io");
const { StringDecoder } = require("string_decoder");

const app = express();
app.use(express.json({ limit: "20mb" }));

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: "*" },
  maxHttpBufferSize: 20 * 1024 * 1024,
});

// ─── Config ────────────────────────────────────────────────────────────────
const PI_AGENT_DIR = path.join(os.homedir(), ".pi", "agent");
const SESSIONS_DIR = path.join(
  process.env.PI_SESSION_DIR || path.join(PI_AGENT_DIR, "sessions"),
  "pi-web-ui"
);
const META_FILE = path.join(SESSIONS_DIR, "_meta.json");
const SKILLS_DIR = path.join(PI_AGENT_DIR, "skills");
const MCP_FILE = path.join(PI_AGENT_DIR, "mcp.json");
const DEFAULT_WORKSPACE = process.cwd();

fs.mkdirSync(SESSIONS_DIR, { recursive: true });
fs.mkdirSync(SKILLS_DIR, { recursive: true });

// ─── Helpers ───────────────────────────────────────────────────────────────
function contentSignature(content) {
  try { return JSON.stringify(content); } catch { return String(content); }
}

function generateId() {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeWorkspace(ws) {
  return ws.replace(/[^a-zA-Z0-9_\-\.]/g, "_").replace(/^\/+/, "").replace(/\/+/g, "_") || "root";
}

// Security: ensure a resolved path stays inside the workspace root
function isWithinRoot(target, root) {
  try {
    const t = path.resolve(String(target));
    const r = path.resolve(String(root));
    return t === r || t.startsWith(r + path.sep);
  } catch {
    return false;
  }
}

function sessionDir(workspace) {
  const dir = path.join(SESSIONS_DIR, sanitizeWorkspace(workspace));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sessionFilePath(workspace, sessionId) {
  return path.join(sessionDir(workspace), `${sessionId}.jsonl`);
}

// ─── Session Store ─────────────────────────────────────────────────────────
const sessions = new Map();

function loadMeta() {
  try {
    if (fs.existsSync(META_FILE)) {
      return JSON.parse(fs.readFileSync(META_FILE, "utf8"));
    }
  } catch (e) { console.error("loadMeta:", e.message); }
  return [];
}

function saveMeta() {
  try {
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
  } catch (e) { console.error("saveMeta:", e.message); }
}

// Debounced variant for high-frequency updates (tool_execution_end etc.)
let _saveTimer = null;
function scheduleSaveMeta() {
  if (_saveTimer) return;
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    saveMeta();
  }, 400);
}

// Merge an assistant message into meta.messages with content-based dedup.
// Returns true if a new message was appended.
function appendAssistantMessage(meta, message) {
  if (!message || message.role !== "assistant") return false;
  const content = message.content;
  if (!content || (Array.isArray(content) && content.length === 0)) return false;
  const last = meta.messages[meta.messages.length - 1];
  if (last && last.role === "assistant" && contentSignature(last.content) === contentSignature(content)) {
    // Update metadata on the existing entry rather than duplicating
    if (message.usage) last.usage = message.usage;
    if (message.stopReason) last.stopReason = message.stopReason;
    if (message.model) last.model = message.model;
    return false;
  }
  const copy = { role: "assistant", content, timestamp: Date.now() };
  if (message.usage) copy.usage = message.usage;
  if (message.stopReason) copy.stopReason = message.stopReason;
  if (message.model) copy.model = message.model;
  meta.messages.push(copy);
  return true;
}

// Merge tool results into the last assistant message's toolCall blocks
function attachToolResults(meta) {
  const last = meta.messages[meta.messages.length - 1];
  if (!last || !Array.isArray(last.content)) return;
  for (const blk of last.content) {
    if (blk.type === "toolCall") {
      const tb = meta.currentToolBlocks[blk.id];
      if (tb && tb.result) {
        blk.result = tb.result;
        blk.isError = tb.isError;
      }
    }
  }
}

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
    // An expected restart (workspace switch / manual restart) kills the old
    // process on purpose; don't surface it to the UI as an error.
    const expected = meta.expectedRestart;
    meta.expectedRestart = false;
    // Guard: only clear state if this proc is still the current one,
    // otherwise a stale close event would clobber a newer process.
    if (meta.rpcProc === proc) {
      meta.rpcProc = null;
      meta.rpcReady = false;
    }
    meta.streaming = false;
    if (!expected) io.to(sessionId).emit("pi_disconnected", { code });
  });

  proc.on("error", (err) => {
    console.error(`[${sessionId}] Pi error:`, err.message);
    io.to(sessionId).emit("pi_error", { error: err.message });
  });
}

// Kill a session's pi process. Pass expected=true when the termination is
// intentional (workspace switch / restart) so the client isn't shown an
// error for it.
function killSession(sessionId, expected) {
  const meta = sessions.get(sessionId);
  if (!meta) return;
  if (meta.rpcProc) {
    meta.expectedRestart = !!expected;
    meta.rpcProc.kill("SIGTERM");
    meta.rpcProc = null;
  }
  meta.rpcReady = false;
  meta.streaming = false;
}

function handleRPCEvent(sessionId, event) {
  const meta = sessions.get(sessionId);
  if (!meta) return;

  switch (event.type) {
    case "agent_start":
      meta.streaming = true;
      meta.currentAssistantBlock = null;
      meta.currentToolBlocks = {};
      meta.pendingToolCalls = {};
      break;

    case "agent_end":
    case "agent_settled":
      meta.streaming = false;
      // Flush any remaining partial block so nothing is lost
      if (meta.currentAssistantBlock && meta.currentAssistantBlock.content?.length > 0) {
        appendAssistantMessage(meta, meta.currentAssistantBlock);
        attachToolResults(meta);
        saveMeta();
      }
      meta.currentAssistantBlock = null;
      meta.currentToolBlocks = {};
      meta.pendingToolCalls = {};
      break;

    case "message_start":
      if (event.message?.role === "assistant") {
        meta.currentAssistantBlock = {
          role: "assistant", content: [],
          model: event.message.model || "",
          usage: event.message.usage, timestamp: Date.now(),
        };
        meta.currentTextIdx = -1;
      }
      break;

    case "message_update": {
      const delta = event.assistantMessageEvent;
      const blk = meta.currentAssistantBlock;
      if (blk && delta) {
        if (delta.type === "text_start") {
          blk.content.push({ type: "text", text: "" });
          meta.currentTextIdx = blk.content.length - 1;
        } else if (delta.type === "text_delta") {
          if (meta.currentTextIdx >= 0 && blk.content[meta.currentTextIdx]?.type === "text") {
            blk.content[meta.currentTextIdx].text += delta.delta || "";
          } else {
            blk.content.push({ type: "text", text: delta.delta || "" });
            meta.currentTextIdx = blk.content.length - 1;
          }
        } else if (delta.type === "thinking_start") {
          blk.content.push({ type: "thinking", thinking: "" });
        } else if (delta.type === "thinking_delta") {
          const last = blk.content[blk.content.length - 1];
          if (last && last.type === "thinking") last.thinking += delta.delta || "";
          else blk.content.push({ type: "thinking", thinking: delta.delta || "" });
        } else if (delta.type === "toolcall_end" && delta.toolCall) {
          const tc = delta.toolCall;
          blk.content.push({
            type: "toolCall", id: tc.id, name: tc.name, arguments: tc.arguments || {},
          });
          meta.pendingToolCalls[tc.id] = tc;
        }
      }
      break;
    }

    case "message_end":
      if (meta.currentAssistantBlock && event.message?.role === "assistant") {
        meta.currentAssistantBlock.usage = event.message.usage;
        meta.currentAssistantBlock.stopReason = event.message.stopReason;
        // Persist immediately so a page refresh mid-turn keeps completed messages
        if (appendAssistantMessage(meta, meta.currentAssistantBlock)) {
          attachToolResults(meta);
          saveMeta();
        }
        meta.currentAssistantBlock = null;
      }
      break;

    case "tool_execution_start":
      meta.currentToolBlocks[event.toolCallId] = {
        toolCallId: event.toolCallId, toolName: event.toolName,
        args: event.args, executing: true, result: null, isError: false,
      };
      break;

    case "tool_execution_update":
      break; // streamed via pi_event below

    case "tool_execution_end": {
      const tb = meta.currentToolBlocks[event.toolCallId];
      if (tb) { tb.result = event.result; tb.isError = event.isError; tb.executing = false; }
      // Persist the tool result onto the saved message (debounced)
      attachToolResults(meta);
      scheduleSaveMeta();
      break;
    }
  }

  // Forward everything to the room (response, extension_ui_request, etc.)
  io.to(sessionId).emit(event.type === "response" ? "pi_response" : "pi_event", event);
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
app.use(express.static(path.join(__dirname, "public")));

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
  killSession(id, true);
  try { fs.unlinkSync(sessionFilePath(meta.workspace, id)); } catch (e) { /* */ }
  sessions.delete(id);
  saveMeta();
  io.to(id).emit("session_deleted", { id });
  res.json({ success: true });
});

// Rename session
app.patch("/api/sessions/:id", (req, res) => {
  const { id } = req.params;
  const meta = sessions.get(id);
  if (!meta) return res.status(404).json({ error: "Not found" });
  if (req.body.name !== undefined && String(req.body.name).trim()) {
    meta.name = String(req.body.name).trim();
    saveMeta();
    io.to(id).emit("session_renamed", { id, name: meta.name });
  }
  res.json({ success: true, name: meta.name });
});

// Browse filesystem (directories + files)
app.get("/api/browse", (req, res) => {
  let dirPath;
  try {
    dirPath = path.resolve(String(req.query.path || os.homedir()));
  } catch (e) {
    return res.status(400).json({ error: "Invalid path" });
  }

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const items = entries
      .filter((e) => !e.name.startsWith("."))
      .map((e) => {
        const full = path.join(dirPath, e.name);
        if (e.isDirectory()) {
          return { name: e.name, type: "directory", path: full };
        }
        if (e.isFile()) {
          try {
            const st = fs.statSync(full);
            return {
              name: e.name,
              type: "file",
              path: full,
              size: st.size,
              ext: path.extname(e.name).slice(1).toLowerCase(),
            };
          } catch {
            return null;
          }
        }
        return null;
      })
      .filter(Boolean);
    items.sort((a, b) =>
      a.type === b.type
        ? a.name.localeCompare(b.name)
        : a.type === "directory"
          ? -1
          : 1
    );

    const parent = path.dirname(dirPath);
    res.json({
      current: dirPath,
      parent: parent !== dirPath ? parent : null,
      items,
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

// Read file content for the code viewer (text only, max 2MB)
app.get("/api/file", (req, res) => {
  let filePath;
  try {
    filePath = path.resolve(String(req.query.path || ""));
  } catch (e) {
    return res.status(400).json({ error: "Invalid path" });
  }
  try {
    const st = fs.statSync(filePath);
    if (!st.isFile()) return res.status(400).json({ error: "Not a file" });
    if (st.size > 2 * 1024 * 1024) {
      return res.status(413).json({ error: "File too large (max 2MB)", size: st.size });
    }
    const buf = fs.readFileSync(filePath);
    const head = buf.subarray(0, 8192);
    if (head.includes(0)) {
      return res.json({ binary: true, size: st.size, path: filePath, language: null, content: null });
    }
    const content = buf.toString("utf8");
    const ext = path.extname(filePath).slice(1).toLowerCase();
    res.json({ binary: false, size: st.size, path: filePath, language: ext || null, content });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ─── Skills API ────────────────────────────────────────────────────────────
function readSkillDir(dir) {
  try {
    const name = path.basename(dir);
    const skillFile = path.join(dir, "SKILL.md");
    if (!fs.existsSync(skillFile)) return null;
    let description = "";
    const raw = fs.readFileSync(skillFile, "utf8");
    const m = raw.match(/^---\n([\s\S]*?)\n---/);
    if (m) {
      const desc = m[1].match(/^description:\s*(.+)$/m);
      if (desc) description = desc[1].trim();
    }
    return { name, path: dir, description };
  } catch { return null; }
}

app.get("/api/skills", (_req, res) => {
  const skills = [];
  try {
    for (const entry of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const s = readSkillDir(path.join(SKILLS_DIR, entry.name));
        if (s) skills.push(s);
      } else if (entry.name.endsWith(".md")) {
        const base = entry.name.replace(/\.md$/, "");
        skills.push({ name: base, path: path.join(SKILLS_DIR, entry.name), description: "" });
      }
    }
  } catch (e) { return res.status(500).json({ error: e.message }); }
  skills.sort((a, b) => a.name.localeCompare(b.name));
  res.json({ dir: SKILLS_DIR, skills });
});

app.post("/api/skills", (req, res) => {
  const { name, description, content } = req.body || {};
  if (!name || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(String(name))) {
    return res.status(400).json({ error: "Invalid skill name (lowercase letters, digits, hyphens)" });
  }
  const dir = path.join(SKILLS_DIR, String(name));
  try {
    if (fs.existsSync(dir)) return res.status(409).json({ error: "Skill already exists" });
    fs.mkdirSync(dir, { recursive: true });
    const body = content && content.trim()
      ? String(content)
      : (description
          ? `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\n描述：${description}\n`
          : `---\nname: ${name}\ndescription: ${name}\n---\n\n# ${name}\n`);
    fs.writeFileSync(path.join(dir, "SKILL.md"), body);
    res.json({ success: true, name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/skills/:name", (req, res) => {
  const name = String(req.params.name || "");
  // Security: only allow valid skill names so this can never be a path traversal
  // (e.g. "..", ".", "../" would otherwise escape SKILLS_DIR and rmSync recursively).
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) {
    return res.status(400).json({ error: "Invalid skill name" });
  }
  const dir = path.join(SKILLS_DIR, name);
  try {
    if (!fs.existsSync(dir)) return res.status(404).json({ error: "Skill not found" });
    fs.rmSync(dir, { recursive: true, force: true });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── MCP API ───────────────────────────────────────────────────────────────
function readMcpConfig() {
  try {
    if (fs.existsSync(MCP_FILE)) {
      const cfg = JSON.parse(fs.readFileSync(MCP_FILE, "utf8"));
      return cfg.mcpServers || {};
    }
  } catch (e) { console.error("readMcpConfig:", e.message); }
  return {};
}

function writeMcpConfig(servers) {
  const cfg = { mcpServers: servers };
  fs.writeFileSync(MCP_FILE, JSON.stringify(cfg, null, 2));
}

app.get("/api/mcp", (_req, res) => {
  try {
    const servers = readMcpConfig();
    const list = Object.entries(servers).map(([name, cfg]) => ({
      name,
      command: cfg.command || "",
      args: cfg.args || [],
      transport: cfg.transport || "stdio",
      lifecycle: cfg.lifecycle || "lazy",
    }));
    list.sort((a, b) => a.name.localeCompare(b.name));
    res.json({ file: MCP_FILE, servers: list });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/mcp", (req, res) => {
  const { name, command, args, transport, lifecycle } = req.body || {};
  if (!name || !command) {
    return res.status(400).json({ error: "name and command are required" });
  }
  try {
    const servers = readMcpConfig();
    if (servers[name]) return res.status(409).json({ error: "MCP server already exists" });
    servers[name] = {
      transport: transport || "stdio",
      command: String(command),
      args: Array.isArray(args) ? args : [],
    };
    if (lifecycle) servers[name].lifecycle = lifecycle;
    writeMcpConfig(servers);
    res.json({ success: true, name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/mcp/:name", (req, res) => {
  const { name } = req.params;
  try {
    const servers = readMcpConfig();
    if (!servers[name]) return res.status(404).json({ error: "MCP server not found" });
    delete servers[name];
    writeMcpConfig(servers);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Restart all Pi processes (applies skill / MCP / settings changes)
app.post("/api/restart", (_req, res) => {
  let count = 0;
  for (const [, meta] of sessions) {
    if (meta.rpcProc) { killSession(meta.id, true); count++; }
  }
  res.json({ success: true, restarted: count });
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
      // Persist in-flight partial so a refresh mid-turn can restore it
      partialBlock: meta.streaming && meta.currentAssistantBlock
        ? { role: "assistant", content: meta.currentAssistantBlock.content, streaming: true }
        : null,
    });
    if (!meta.rpcProc) startSession(sessionId);
  });

  // Persist a user message (client-side, since Pi does not stream user role back)
  socket.on("persist_user_message", ({ sessionId, content }) => {
    const meta = sessions.get(sessionId);
    if (!meta || !content) return;
    const text = typeof content === "string" ? content : (content.text || "");
    if (!text.trim()) return;
    meta.messages.push({ role: "user", content: text.trim(), timestamp: Date.now() });
    saveMeta();
  });

  socket.on("session_update_workspace", ({ sessionId, workspace }) => {
    const meta = sessions.get(sessionId);
    if (!meta) return;
    // Kill old process; expected restart — don't show an error to the client
    killSession(sessionId, true);
    meta.workspace = workspace;
    saveMeta();
    startSession(sessionId);
    socket.emit("workspace_updated", { sessionId, workspace });
  });

  socket.on("prompt", ({ sessionId, message, images }) => {
    const meta = sessions.get(sessionId);
    if (!meta) { socket.emit("pi_error", { error: "Session not found" }); return; }
    // Persist the user message so it survives refresh / server restart,
    // regardless of which client sent it.
    // Slash commands are shown in the client's command panel (not the chat
    // stream), so they are not persisted as chat messages.
    if (message && String(message).trim()) {
      const text = String(message).trim();
      if (!text.startsWith("/")) {
        meta.messages.push({ role: "user", content: text, timestamp: Date.now() });
        saveMeta();
      }
    }
    const cmd = { type: "prompt", message };
    if (images && images.length > 0) {
      cmd.images = images.map(img => ({ type: "image", data: img.data, mimeType: img.mimeType || "image/png" }));
    }
    if (!sendRPC(sessionId, cmd)) socket.emit("pi_error", { error: "Pi process not running" });
  });

  socket.on("steer", ({ sessionId, message }) => {
    if (!sendRPC(sessionId, { type: "steer", message })) socket.emit("pi_error", { error: "Cannot steer" });
  });

  socket.on("follow_up", ({ sessionId, message }) => {
    if (!sendRPC(sessionId, { type: "follow_up", message })) socket.emit("pi_error", { error: "Cannot queue" });
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

  socket.on("compact", ({ sessionId }) => {
    if (!sendRPC(sessionId, { type: "compact" })) socket.emit("pi_error", { error: "Cannot compact" });
  });

  socket.on("set_thinking_level", ({ sessionId, level }) => {
    if (!sendRPC(sessionId, { type: "set_thinking_level", level })) socket.emit("pi_error", { error: "Cannot set thinking level" });
  });

  socket.on("new_session", ({ sessionId }) => {
    if (!sendRPC(sessionId, { type: "new_session" })) socket.emit("pi_error", { error: "Cannot new session" });
  });

  socket.on("get_state", ({ sessionId }) => {
    if (!sendRPC(sessionId, { type: "get_state" })) socket.emit("pi_error", { error: "Cannot get state" });
  });

  socket.on("get_available_models", ({ sessionId }) => {
    if (!sendRPC(sessionId, { type: "get_available_models" })) socket.emit("pi_error", { error: "Cannot list models" });
  });

  socket.on("get_session_stats", ({ sessionId }) => {
    if (!sendRPC(sessionId, { type: "get_session_stats" })) socket.emit("pi_error", { error: "Cannot get stats" });
  });

  socket.on("get_commands", ({ sessionId }) => {
    if (!sendRPC(sessionId, { type: "get_commands" })) socket.emit("pi_error", { error: "Cannot list commands" });
  });

  // Let the AI read a file/folder into context: run `cat -n` / `ls -la` via
  // RPC bash. The BashExecutionMessage is injected into the LLM context on the
  // next prompt automatically. Paths are constrained to the session workspace.
  socket.on("read_context", ({ sessionId, path: p, isDir }) => {
    const meta = sessions.get(sessionId);
    if (!meta) { socket.emit("pi_error", { error: "Session not found" }); return; }
    if (!p) { socket.emit("pi_error", { error: "No path given" }); return; }
    if (!isWithinRoot(p, meta.workspace)) {
      socket.emit("pi_error", { error: "Path is outside the workspace" });
      return;
    }
    const safe = String(p).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const cmd = isDir
      ? `ls -la "${safe}" | head -200`
      : `cat -n "${safe}" 2>/dev/null | head -400 || head -400 "${safe}"`;
    if (!sendRPC(sessionId, { type: "bash", command: cmd })) {
      socket.emit("pi_error", { error: "Pi process not running" });
      return;
    }
    socket.emit("context_added", { sessionId, path: String(p), isDir: !!isDir });
  });

  socket.on("disconnect", () => {
    for (const [, meta] of sessions) meta.socketRooms.delete(socket.id);
  });
});

// ─── Start ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3099;
const HOST = process.env.HOST || "127.0.0.1"; // bind localhost by default
server.listen(PORT, HOST, () => {
  console.log(`Pi Web UI → http://${HOST}:${PORT}`);
  console.log(`Sessions: ${SESSIONS_DIR}`);
  console.log(`Skills: ${SKILLS_DIR}`);
  console.log(`MCP: ${MCP_FILE}`);
});
