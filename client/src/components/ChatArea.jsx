import { useState, useEffect, useRef, useCallback } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  Chip,
  Avatar,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  Tooltip,
} from "@mui/material";
import {
  Send as SendIcon,
  Stop as StopIcon,
  FolderOpen as FolderIcon,
  Edit as EditIcon,
  ArrowDropDown as ArrowDropDownIcon,
  SmartToy as ModelIcon,
} from "@mui/icons-material";
import socket from "../hooks/useSocket";
import MessageBubble from "./MessageBubble";

function contentSig(content) {
  try { return JSON.stringify(content); } catch { return String(content); }
}

export default function ChatArea({ sid, addToast, onRename }) {
  const [msgs, setMsgs] = useState([]);
  const [name, setName] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [input, setInput] = useState("");
  const [imgs, setImgs] = useState([]);
  const [live, setLive] = useState(false);
  const [streamBlocks, setStreamBlocks] = useState([]);
  const [model, setModel] = useState("");
  const [models, setModels] = useState([]);
  const [modelAnchor, setModelAnchor] = useState(null);

  const bottomRef = useRef(null);
  const seenSigsRef = useRef(new Set());
  const toolResultsRef = useRef({}); // toolCallId -> {result, isError} for current streaming blocks

  const scrollDown = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // ── Message dedup helpers ─────────────────────────────────────────────
  // Signature is computed on the RAW (pre-merge) content so a message added
  // at message_end and re-supplied at agent_end (with tool results attached)
  // dedupes correctly instead of double-adding.
  const addAssistantMessage = useCallback((rawContent, extra = {}) => {
    if (!rawContent || (Array.isArray(rawContent) && rawContent.length === 0)) return;
    const sig = contentSig(rawContent);
    if (seenSigsRef.current.has(sig)) return;
    seenSigsRef.current.add(sig);
    setMsgs((prev) => [
      ...prev,
      { role: "assistant", content: mergeToolResults(rawContent), ts: Date.now(), ...extra },
    ]);
  }, [mergeToolResults]);

  const initSeenSigs = useCallback((messages) => {
    const set = new Set();
    for (const m of messages) {
      if (m && m.role === "assistant") set.add(contentSig(m.content));
    }
    seenSigsRef.current = set;
  }, []);

  // Merge tool results (from execution events) into a content block list
  const mergeToolResults = useCallback((content) => {
    if (!Array.isArray(content)) return content;
    return content.map((blk) => {
      if (blk.type === "toolCall") {
        const tr = toolResultsRef.current[blk.id];
        if (tr) return { ...blk, result: tr.result, isError: tr.isError };
      }
      return blk;
    });
  }, []);

  // Update a toolCall block IN PLACE inside completed messages
  const updateMsgTool = useCallback((tcid, patch) => {
    setMsgs((prev) =>
      prev.map((m) => {
        if (m.role !== "assistant" || !Array.isArray(m.content)) return m;
        let changed = false;
        const content = m.content.map((blk) => {
          if (blk.type === "toolCall" && blk.id === tcid) {
            changed = true;
            return { ...blk, ...patch };
          }
          return blk;
        });
        return changed ? { ...m, content } : m;
      })
    );
  }, []);

  // ── Socket events ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!sid) return;

    function onHistory(d) {
      if (d.sessionId !== sid) return;
      setMsgs(d.messages || []);
      initSeenSigs(d.messages || []);
      setName(d.name || "");
      setWorkspace(d.workspace || "");
      setLive(!!d.streaming);
      // Restore a partial in-flight assistant block on refresh mid-turn
      if (d.partialBlock) {
        setStreamBlocks(d.partialBlock.content || []);
      } else {
        setStreamBlocks([]);
      }
      toolResultsRef.current = {};
    }

    function onEvent(ev) {
      switch (ev.type) {
        case "agent_start":
          setLive(true);
          setStreamBlocks([]);
          toolResultsRef.current = {};
          break;
        case "agent_end":
        case "agent_settled":
          setLive(false);
          // Flush any final assistant messages from the run
          for (const m of ev.messages || []) {
            if (m && m.role === "assistant" && m.content) {
              addAssistantMessage(mergeToolResults(m.content), { model: m.model });
            }
          }
          setStreamBlocks([]);
          toolResultsRef.current = {};
          break;
        case "message_start":
          if (ev.message?.role === "assistant") {
            setStreamBlocks([]);
            setLive(true);
            if (ev.message.model) setModel(ev.message.model);
          }
          break;
        case "message_update":
          handleDelta(ev.assistantMessageEvent);
          break;
        case "message_end":
          if (ev.message?.role === "assistant" && ev.message.content) {
            setStreamBlocks([]);
            addAssistantMessage(mergeToolResults(ev.message.content), { model: ev.message.model });
          }
          break;
        case "tool_execution_start":
          // Mark in place (no transient streaming bubble for already-completed msgs)
          updateMsgTool(ev.toolCallId, { name: ev.toolName, args: ev.args, executing: true });
          break;
        case "tool_execution_update":
          updateMsgTool(ev.toolCallId, {
            executing: true,
            result: ev.partialResult?.content
              ? ev.partialResult.content.map((c) => c.text || "").join("\n")
              : "",
          });
          break;
        case "tool_execution_end":
          toolResultsRef.current[ev.toolCallId] = { result: ev.result, isError: ev.isError };
          updateMsgTool(ev.toolCallId, {
            executing: false,
            isError: ev.isError,
            result: ev.result?.content
              ? ev.result.content.map((c) => c.text || "").join("\n")
              : (typeof ev.result === "string" ? ev.result : ""),
          });
          break;
        case "compaction_start":
          addToast("♻️ 上下文压缩中...");
          break;
        case "compaction_end":
          addToast("✅ 压缩完成");
          break;
        case "extension_ui_request":
          handleExtUI(ev, sid);
          break;
      }
    }

    function onResponse(resp) {
      if (resp?.command === "get_state") {
        const st = resp.data;
        if (st) {
          if (st.model?.name) setModel(st.model.name);
          else if (st.model?.id) setModel(st.model.id);
        }
      } else if (resp?.command === "get_available_models") {
        const list = resp.data?.models || [];
        setModels(list);
      } else if (resp?.command === "set_model" && resp.data) {
        const st = resp.data;
        setModel(st.name || st.id || "");
        addToast("已切换模型: " + (st.name || st.id || ""));
      }
    }

    function onRenamed({ id, name: newName }) {
      if (id === sid && newName) setName(newName);
    }

    function onWsUpd({ workspace: ws }) { setWorkspace(ws); }
    function onErr(d) { addToast(d.error, true); setLive(false); }
    function onDC(d) {
      if (d.code) addToast("⚠️ Pi 进程断开 (code=" + d.code + ")", true);
      setLive(false);
    }

    socket.on("session_history", onHistory);
    socket.on("session_renamed", onRenamed);
    socket.on("pi_event", onEvent);
    socket.on("pi_response", onResponse);
    socket.on("pi_error", onErr);
    socket.on("pi_disconnected", onDC);
    socket.on("workspace_updated", onWsUpd);

    // Fetch model info
    socket.emit("get_state", { sessionId: sid });
    socket.emit("get_available_models", { sessionId: sid });

    return () => {
      socket.off("session_history", onHistory);
      socket.off("session_renamed", onRenamed);
      socket.off("pi_event", onEvent);
      socket.off("pi_response", onResponse);
      socket.off("pi_error", onErr);
      socket.off("pi_disconnected", onDC);
      socket.off("workspace_updated", onWsUpd);
    };
  }, [sid, addToast, addAssistantMessage, initSeenSigs, mergeToolResults]);

  useEffect(() => {
    scrollDown();
  }, [msgs, streamBlocks, scrollDown]);

  // ── Streaming deltas ──────────────────────────────────────────────────
  function handleDelta(delta) {
    if (!delta) return;
    setStreamBlocks((prev) => {
      const next = [...prev];
      if (delta.type === "text_start") {
        next.push({ type: "text", text: "" });
      } else if (delta.type === "text_delta") {
        const last = next[next.length - 1];
        if (last && last.type === "text") {
          next[next.length - 1] = { ...last, text: last.text + (delta.delta || "") };
        } else {
          next.push({ type: "text", text: delta.delta || "" });
        }
      } else if (delta.type === "thinking_start") {
        next.push({ type: "thinking", thinking: "" });
      } else if (delta.type === "thinking_delta") {
        const last = next[next.length - 1];
        if (last && last.type === "thinking") {
          next[next.length - 1] = { ...last, thinking: last.thinking + (delta.delta || "") };
        } else {
          next.push({ type: "thinking", thinking: delta.delta || "" });
        }
      } else if (delta.type === "toolcall_end" && delta.toolCall) {
        const tc = delta.toolCall;
        next.push({
          type: "toolCall",
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments || {},
        });
      }
      return next;
    });
  }

  // ── Actions ───────────────────────────────────────────────────────────
  function send() {
    const txt = input.trim();
    if ((!txt && !imgs.length) || !sid || live) return;
    const msgText = txt || "(image)";
    setMsgs((prev) => [...prev, { role: "user", content: msgText, ts: Date.now() }]);
    socket.emit("prompt", {
      sessionId: sid,
      message: msgText,
      images: imgs.length > 0 ? imgs : undefined,
    });
    setInput("");
    setImgs([]);
    scrollDown();
  }

  function abort() {
    socket.emit("abort", { sessionId: sid });
  }

  function onPaste(e) {
    if (!sid) return;
    for (const item of e.clipboardData?.items || []) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const b = item.getAsFile();
        const r = new FileReader();
        r.onload = () =>
          setImgs((prev) => [...prev, { data: r.result.split(",")[1], mimeType: b.type }]);
        r.readAsDataURL(b);
      }
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function selectModel(m) {
    setModelAnchor(null);
    if (!m) return;
    socket.emit("set_model", { sessionId: sid, provider: m.provider, modelId: m.id });
  }

  const allMessages = [...msgs];
  if (live && streamBlocks.length > 0) {
    allMessages.push({ role: "assistant", content: streamBlocks, ts: Date.now(), streaming: true });
  }
  return (
    <>
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 2,
          height: 46,
          minHeight: 46,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Tooltip title="重命名会话">
          <IconButton
            size="small"
            onClick={() => onRename && onRename(name)}
            sx={{ color: "text.secondary" }}
          >
            <EditIcon sx={{ fontSize: 15 }} />
          </IconButton>
        </Tooltip>
        <Typography variant="body2" fontWeight={700} noWrap sx={{ flex: 1 }}>
          {name || "Session"}
        </Typography>

        {models.length > 0 && (
          <>
            <Tooltip title="切换模型">
              <Chip
                icon={<ModelIcon sx={{ fontSize: 14 }} />}
                label={model || "模型"}
                size="small"
                variant="outlined"
                deleteIcon={<ArrowDropDownIcon />}
                onClick={(e) => setModelAnchor(e.currentTarget)}
                onDelete={(e) => setModelAnchor(e.currentTarget)}
                sx={{ "& .MuiChip-label": { fontSize: 11, maxWidth: 160 } }}
              />
            </Tooltip>
            <Menu
              anchorEl={modelAnchor}
              open={!!modelAnchor}
              onClose={() => setModelAnchor(null)}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              transformOrigin={{ vertical: "top", horizontal: "right" }}
            >
              {models.map((m) => (
                <MenuItem
                  key={m.provider + "/" + m.id}
                  selected={model === (m.name || m.id)}
                  onClick={() => selectModel(m)}
                >
                  <ListItemIcon>
                    <ModelIcon fontSize="small" />
                  </ListItemIcon>
                  <Box>
                    <Typography variant="body2" sx={{ fontSize: 13 }}>{m.name || m.id}</Typography>
                    <Typography variant="caption" color="text.secondary">{m.provider}</Typography>
                  </Box>
                </MenuItem>
              ))}
            </Menu>
          </>
        )}

        <Chip
          icon={<FolderIcon sx={{ fontSize: 14 }} />}
          label={workspace || "/"}
          size="small"
          variant="outlined"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("openBrowser", { detail: workspace }))
          }
          sx={{
            maxWidth: 240,
            "& .MuiChip-label": { fontSize: 11, overflow: "hidden", textOverflow: "ellipsis" },
            cursor: "pointer",
          }}
        />
        <Chip
          label={live ? "streaming" : "idle"}
          size="small"
          color={live ? "primary" : "default"}
          variant={live ? "filled" : "outlined"}
          sx={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            ...(live && {
              animation: "pulse 1.5s infinite",
              "@keyframes pulse": {
                "0%,100%": { opacity: 1 },
                "50%": { opacity: 0.45 },
              },
            }),
          }}
        />
      </Box>

      {/* Messages */}
      <Box
        sx={{
          flex: 1,
          overflow: "auto",
          p: 2,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {allMessages.length === 0 ? (
          <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Typography variant="body2" color="text.disabled">
              发送消息开始对话
            </Typography>
          </Box>
        ) : (
          allMessages.map((m, i) => (
            <MessageBubble key={m.streaming ? "live" : `msg-${i}`} msg={m} />
          ))
        )}
        <div ref={bottomRef} />
      </Box>

      {/* Input */}
      <Box sx={{ borderTop: 1, borderColor: "divider", p: 1.5 }}>
        {imgs.length > 0 && (
          <Box sx={{ display: "flex", gap: 0.5, mb: 1, flexWrap: "wrap" }}>
            {imgs.map((img, i) => (
              <Box key={i} sx={{ position: "relative", width: 48, height: 48 }}>
                <Avatar
                  src={`data:${img.mimeType};base64,${img.data}`}
                  variant="rounded"
                  sx={{ width: 48, height: 48 }}
                />
                <IconButton
                  size="small"
                  onClick={() => setImgs((prev) => prev.filter((_, j) => j !== i))}
                  sx={{
                    position: "absolute",
                    top: -4,
                    right: -4,
                    width: 16,
                    height: 16,
                    bgcolor: "rgba(0,0,0,0.7)",
                    color: "#fff",
                    fontSize: 9,
                    "&:hover": { bgcolor: "rgba(0,0,0,0.9)" },
                  }}
                >
                  ✕
                </IconButton>
              </Box>
            ))}
          </Box>
        )}

        <Box sx={{ display: "flex", gap: 1, alignItems: "flex-end" }}>
          <TextField
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            placeholder="输入消息... Enter 发送, Shift+Enter 换行, Ctrl+V 贴图"
            multiline
            maxRows={5}
            fullWidth
            size="small"
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
          />
          {live ? (
            <Button
              variant="contained"
              color="error"
              onClick={abort}
              startIcon={<StopIcon />}
              sx={{ minWidth: 100, height: 40, borderRadius: 3, fontWeight: 700 }}
            >
              中断
            </Button>
          ) : (
            <Button
              variant="contained"
              onClick={send}
              disabled={!input.trim() && !imgs.length}
              startIcon={<SendIcon />}
              sx={{ minWidth: 90, height: 40, borderRadius: 3, fontWeight: 700 }}
            >
              发送
            </Button>
          )}
        </Box>
      </Box>
    </>
  );
}

function handleExtUI(ev, sid) {
  let response;
  switch (ev.method) {
    case "select":
      response = {
        type: "extension_ui_response",
        id: ev.id,
        value: prompt(ev.title, ev.options?.[0]) || ev.options?.[0],
      };
      break;
    case "confirm":
      response = {
        type: "extension_ui_response",
        id: ev.id,
        confirmed: confirm((ev.title || "") + "\n" + (ev.message || "")),
      };
      break;
    case "input":
      response = {
        type: "extension_ui_response",
        id: ev.id,
        value: prompt(ev.title, ev.placeholder || "") || "",
      };
      break;
    case "editor":
      response = {
        type: "extension_ui_response",
        id: ev.id,
        value: prompt(ev.title, ev.prefill || "") || "",
      };
      break;
    default:
      return;
  }
  socket.emit("extension_ui_response", { sessionId: sid, response });
}
