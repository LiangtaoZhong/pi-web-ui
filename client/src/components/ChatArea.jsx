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
  ListItemText,
  ListItemButton,
  Paper,
  List,
  LinearProgress,
  Tooltip,
} from "@mui/material";
import {
  Send as SendIcon,
  Stop as StopIcon,
  FolderOpen as FolderIcon,
  Edit as EditIcon,
  ArrowDropDown as ArrowDropDownIcon,
  SmartToy as ModelIcon,
  Memory as MemoryIcon,
  Terminal as CommandIcon,
  Settings as SettingsIcon,
  Close as CloseIcon,
} from "@mui/icons-material";
import socket from "../hooks/useSocket";
import MessageBubble from "./MessageBubble";
import RightNav from "./RightNav";
import FileViewer from "./FileViewer";
import { UnfoldMore as DragHandleIcon } from "@mui/icons-material";

function contentSig(content) {
  try { return JSON.stringify(content); } catch { return String(content); }
}

function fmtTokens(n) {
  if (n == null || isNaN(n)) return "-";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return Math.round(n / 1e3) + "k";
  return String(n);
}

// 简短显示工作区路径（保留最后两段）
function shortPath(p) {
  if (!p || p === "/") return "/";
  const parts = p.split("/").filter(Boolean);
  if (parts.length <= 2) return p;
  return "…/" + parts.slice(-2).join("/");
}

export default function ChatArea({
  sid, addToast, onRename,
  onOpenSettings, models, model, onModelsLoaded, onSelectModel,
  viewingFile, onCloseViewer, pendingRef, onRefConsumed,
}) {
  const [msgs, setMsgs] = useState([]);
  const [name, setName] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [input, setInput] = useState("");
  const [imgs, setImgs] = useState([]);
  const [live, setLive] = useState(false);
  const [streamBlocks, setStreamBlocks] = useState([]);
  const [modelAnchor, setModelAnchor] = useState(null);
  // 上下文窗口统计
  const [ctx, setCtx] = useState(null); // {tokens, contextWindow, percent}
  // 命令补全
  const [commands, setCommands] = useState([]);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdIndex, setCmdIndex] = useState(0);
  // 斜杠命令执行面板
  const [cmdPanel, setCmdPanel] = useState(null); // {cmd, lines:[{type,text}], status:'running'|'done'|'error'}
  const cmdRunRef = useRef(false);   // 本次 prompt 是斜杠命令（输出重定向到面板）
  const cmdAgentRef = useRef(false); // 命令轮触发了 agent（等 agent_end 结束）
  const cmdPanelRef = useRef(null);
  const inputRef = useRef(null);
  const manualHRef = useRef(null); // 输入框手动拉伸高度 (px)，实时 DOM 控制

  const bottomRef = useRef(null);
  const seenSigsRef = useRef(new Set());
  const toolResultsRef = useRef({}); // toolCallId -> {result, isError} for current streaming blocks
  const modelRef = useRef(model);
  useEffect(() => { modelRef.current = model; }, [model]);

  const scrollDown = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // 命令面板输出自动滚到底部
  useEffect(() => {
    const el = cmdPanelRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [cmdPanel]);

  // ── Message dedup helpers ─────────────────────────────────────────────
  // Merge tool results (from execution events) into a content block list.
  // Declared before addAssistantMessage (which depends on it) to avoid TDZ.
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

  // ── 命令面板 helpers（斜杠命令输出显示于此）────────────────────────
  const appendCmdLines = useCallback((lines) => {
    setCmdPanel((prev) => (prev ? { ...prev, lines: [...prev.lines, ...lines] } : prev));
  }, []);

  const finishCmdPanel = useCallback((status) => {
    setCmdPanel((prev) => (prev && prev.status === "running" ? { ...prev, status } : prev));
    cmdRunRef.current = false;
    cmdAgentRef.current = false;
  }, []);

  // 命令轮流式文本 → 面板最后一行
  function cmdStreamDelta(delta) {
    if (!delta) return;
    if (delta.type === "text_start") {
      setCmdPanel((prev) => (prev ? { ...prev, lines: [...prev.lines, { type: "out", text: "" }] } : prev));
    } else if (delta.type === "text_delta") {
      setCmdPanel((prev) => {
        if (!prev || prev.lines.length === 0) return prev;
        const lines = [...prev.lines];
        const last = lines[lines.length - 1];
        if (last && last.type === "out") {
          lines[lines.length - 1] = { ...last, text: last.text + (delta.delta || "") };
          return { ...prev, lines };
        }
        return { ...prev, lines: [...lines, { type: "out", text: delta.delta || "" }] };
      });
    }
  }

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
          seenSigsRef.current = new Set();
          if (cmdRunRef.current) cmdAgentRef.current = true;
          break;
        case "agent_end":
        case "agent_settled":
          setLive(false);
          if (cmdRunRef.current) {
            // 命令轮：输出已由 message_end / pi_stderr 进面板，这里兜底补一次并结束
            setCmdPanel((prev) => {
              if (prev && !prev.lines.some((l) => l.type !== "cmd")) {
                const text = (ev.messages || [])
                  .filter((m) => m && m.role === "assistant" && m.content)
                  .map((m) => extractText(m.content))
                  .filter(Boolean)
                  .join("\n");
                if (text) return { ...prev, lines: [...prev.lines, { type: "out", text }] };
              }
              return prev;
            });
            setStreamBlocks([]);
            toolResultsRef.current = {};
            finishCmdPanel("done");
            break;
          }
          // Flush any final assistant messages from the run.
          // IMPORTANT: pass the RAW content (merge happens inside addAssistantMessage)
          // so the dedup signature matches what message_end already added.
          for (const m of ev.messages || []) {
            if (m && m.role === "assistant" && m.content) {
              addAssistantMessage(m.content, { model: m.model });
            }
          }
          setStreamBlocks([]);
          toolResultsRef.current = {};
          break;
        case "message_start":
          if (ev.message?.role === "assistant") {
            setStreamBlocks([]);
            setLive(true);
            if (ev.message.model) onModelsLoaded(undefined, ev.message.model);
          }
          break;
        case "message_update":
          if (cmdRunRef.current) cmdStreamDelta(ev.assistantMessageEvent);
          else handleDelta(ev.assistantMessageEvent);
          break;
        case "message_end":
          if (ev.message?.role === "assistant" && ev.message.content) {
            setStreamBlocks([]);
            if (cmdRunRef.current) {
              // 命令轮：assistant 文本进命令面板，不进聊天流
              const text = extractText(ev.message.content);
              if (text) appendCmdLines([{ type: "out", text }]);
            } else {
              // Pass RAW content (merge happens inside addAssistantMessage)
              addAssistantMessage(ev.message.content, { model: ev.message.model });
            }
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
          if (cmdRunRef.current && ev.method === "notify") {
            const icon = ev.notifyType === "error" ? "❌" : ev.notifyType === "warning" ? "⚠️" : "ℹ️";
            appendCmdLines([{ type: ev.notifyType === "error" ? "err" : "out", text: icon + " " + (ev.message || "") }]);
          } else {
            handleExtUI(ev, sid, addToast);
          }
          break;
      }
    }

    function onResponse(resp) {
      if (resp?.command === "get_state") {
        const st = resp.data;
        if (st) {
          onModelsLoaded(undefined, st.model?.name || st.model?.id || "");
        }
      } else if (resp?.command === "get_available_models") {
        onModelsLoaded(resp.data?.models || [], modelRef.current);
      } else if (resp?.command === "get_session_stats" && resp.data) {
        const cu = resp.data.contextUsage;
        if (cu) setCtx({ tokens: cu.tokens, contextWindow: cu.contextWindow, percent: cu.percent });
      } else if (resp?.command === "get_commands") {
        const list = resp.data?.commands || [];
        setCommands(list);
      } else if (resp?.command === "set_model" && resp.data) {
        const st = resp.data;
        onModelsLoaded(undefined, st.name || st.id || "");
        addToast("已切换模型: " + (st.name || st.id || ""));
      } else if (resp?.command === "prompt") {
        // 斜杠命令执行结果
        if (!cmdRunRef.current) return;
        if (!resp.success) {
          finishCmdPanel("error");
        } else {
          // 扩展命令立即返回；若随后有 agent 输出则等 agent_end 再结束
          setTimeout(() => {
            if (cmdRunRef.current && !cmdAgentRef.current) finishCmdPanel("done");
          }, 800);
        }
      }
    }

    function onRenamed({ id, name: newName }) {
      if (id === sid && newName) setName(newName);
    }

    function onWsUpd({ workspace: ws }) { setWorkspace(ws); }
    function onStderr(d) {
      if (cmdRunRef.current && d?.text) appendCmdLines([{ type: "err", text: d.text.trimEnd() }]);
    }
    function onErr(d) { addToast(d.error, true); setLive(false); }
    function onDC(d) {
      // An expected restart (workspace switch) doesn't mean something broke
      if (d.expected) return;
      if (d.code) addToast("⚠️ Pi 进程断开 (code=" + d.code + ")", true);
      setLive(false);
    }

    socket.on("session_history", onHistory);
    socket.on("session_renamed", onRenamed);
    socket.on("pi_event", onEvent);
    socket.on("pi_error", onErr);
    socket.on("pi_disconnected", onDC);
    socket.on("workspace_updated", onWsUpd);
    socket.on("pi_stderr", onStderr);

    // Fetch model info + commands, and poll context usage every 5s.
    // The freshly-spawned pi process needs a moment to become ready, so
    // retry the initial queries until all three respond.
    let gotState = false;
    let gotModels = false;
    let gotCommands = false;
    const handleResponse = (r) => {
      if (r?.command === "get_state") gotState = true;
      if (r?.command === "get_available_models") gotModels = true;
      if (r?.command === "get_commands") gotCommands = true;
      onResponse(r);
    };
    socket.on("pi_response", handleResponse);

    const queryInitial = () => {
      socket.emit("get_state", { sessionId: sid });
      socket.emit("get_available_models", { sessionId: sid });
      socket.emit("get_commands", { sessionId: sid });
    };
    queryInitial();
    socket.emit("get_session_stats", { sessionId: sid });

    const retryTimer = setInterval(() => {
      if (gotState && gotModels && gotCommands) {
        clearInterval(retryTimer);
        return;
      }
      queryInitial();
    }, 2000);
    const retryStop = setTimeout(() => clearInterval(retryTimer), 20000);

    const statsTimer = setInterval(() => {
      socket.emit("get_session_stats", { sessionId: sid });
    }, 5000);

    return () => {
      clearInterval(statsTimer);
      clearInterval(retryTimer);
      clearTimeout(retryStop);
      socket.off("session_history", onHistory);
      socket.off("session_renamed", onRenamed);
      socket.off("pi_event", onEvent);
      socket.off("pi_response", handleResponse);
      socket.off("pi_error", onErr);
      socket.off("pi_disconnected", onDC);
      socket.off("workspace_updated", onWsUpd);
      socket.off("pi_stderr", onStderr);
    };
  }, [sid, addToast, addAssistantMessage, initSeenSigs, mergeToolResults, onModelsLoaded, appendCmdLines, finishCmdPanel]);

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

  // ── 消费右侧“让 AI 读取”的 @引用：追加到输入框 ───────────────────────
  useEffect(() => {
    if (!pendingRef?.path) return;
    setInput((prev) => {
      const ref = "@" + pendingRef.path + (pendingRef.isDir ? "/" : "");
      return prev.trim() ? prev.replace(/\s*$/, "") + " " + ref + " " : ref + " ";
    });
    setTimeout(() => inputRef.current?.focus(), 50);
    onRefConsumed && onRefConsumed();
  }, [pendingRef, onRefConsumed]);

  // ── Actions ───────────────────────────────────────────────────────────
  function appendToInput(text) {
    if (!text) return;
    setInput((prev) => {
      const base = prev.trimEnd();
      if (!base) return text + "\n";
      return base + "\n\n```\n" + text + "\n```\n";
    });
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function send() {
    const txt = input.trim();
    if ((!txt && !imgs.length) || !sid || live) return;
    const isCmd = txt.startsWith("/");
    if (isCmd) {
      // 斜杠命令：输出显示在命令面板（输入框上方终端风格面板），不进聊天流
      cmdRunRef.current = true;
      cmdAgentRef.current = false;
      setCmdPanel({ cmd: txt, lines: [{ type: "cmd", text: txt }], status: "running" });
      socket.emit("prompt", {
        sessionId: sid,
        message: txt,
        images: imgs.length > 0 ? imgs : undefined,
      });
      setInput("");
      setImgs([]);
      return;
    }
    setCmdPanel(null); // 普通消息时关闭残留命令面板
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

  // ── 命令补全 ─────────────────────────────────────────────────────────
  // 输入以 "/" 开头且尚未包含空格时，按前缀过滤可用命令并展示
  const filteredCmds = (() => {
    if (!cmdOpen || !input.startsWith("/")) return [];
    const raw = input.slice(1);
    const q = raw.split(/\s+/)[0].toLowerCase();
    const all = [...commands]
      .filter((c) => c.name && !c.name.startsWith("skill:"))
      .sort((a, b) => a.name.localeCompare(b.name));
    // 不截断：配合滚动跟随，所有命令都能通过 ↑↓ 循环到达
    if (!q) return all;
    return all.filter((c) => c.name.toLowerCase().startsWith(q));
  })();

  function pickCmd(c) {
    setInput(`/${c.name} `);
    setCmdOpen(false);
    setCmdIndex(0);
    inputRef.current?.focus();
  }

  function onInputChange(v) {
    setInput(v);
    // 手动拉伸后，输入内容时保持高度（防止 autosize 缩回）
    if (manualHRef.current) {
      requestAnimationFrame(() => {
        const ta = inputRef.current;
        if (ta) {
          ta.style.height = manualHRef.current + "px";
          ta.style.overflowY = "auto";
        }
      });
    }
    if (v.startsWith("/") && !v.includes(" ")) {
      setCmdOpen(true);
      setCmdIndex(0);
    } else {
      setCmdOpen(false);
    }
  }

  // 当前高亮的命令索引（供上下键导航）
  const activeIndex = Math.min(cmdIndex, Math.max(0, filteredCmds.length - 1));

  // 补全窗口滚动跟随高亮项：防止高亮移出可视区（“焦点离开补全窗口”的根因）
  const cmdListRef = useRef(null);
  useEffect(() => {
    if (!cmdOpen) return;
    const el = cmdListRef.current?.querySelector(".Mui-selected");
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [activeIndex, cmdOpen]);


  function onKeyDown(e) {
    if (e.key === "ArrowDown" && cmdOpen && filteredCmds.length > 0) {
      e.preventDefault();
      setCmdIndex((i) => (i + 1) % filteredCmds.length);
    } else if (e.key === "ArrowUp" && cmdOpen && filteredCmds.length > 0) {
      e.preventDefault();
      setCmdIndex((i) => (i - 1 + filteredCmds.length) % filteredCmds.length);
    } else if (e.key === "Enter" && !e.shiftKey) {
      if (cmdOpen && filteredCmds.length > 0) {
        e.preventDefault();
        pickCmd(filteredCmds[activeIndex]);
        return;
      }
      e.preventDefault();
      send();
    } else if (e.key === "Tab" && cmdOpen && filteredCmds.length > 0) {
      e.preventDefault();
      pickCmd(filteredCmds[activeIndex]);
    } else if (e.key === "Escape" && cmdOpen) {
      e.preventDefault();
      setCmdOpen(false);
    }
  }

  function selectModel(m) {
    setModelAnchor(null);
    if (!m) return;
    onSelectModel(m);
  }

  const allMessages = [...msgs];
  if (live && streamBlocks.length > 0) {
    allMessages.push({ role: "assistant", content: streamBlocks, ts: Date.now(), streaming: true });
  }

  // 用户提问列表（供右侧导航）: 提取用户消息在 allMessages 中的位置
  const userQuestions = [];
  allMessages.forEach((m, idx) => {
    if (m.role !== "user") return;
    const raw = typeof m.content === "string" ? m.content : "";
    const text = raw.replace(/\s+/g, " ").trim();
    if (text && text !== "(image)") userQuestions.push({ text: text.slice(0, 60), idx });
  });

  // 滚动定位到某条消息（右侧提问导航点击跳转）
  const scrollToMsg = useCallback((idx) => {
    const el = document.getElementById(`chat-msg-${idx}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // ── 输入框上下拖拽拉升（手柄在顶部，向上拖变大）────────────────────
  function onDragStart(e) {
    e.preventDefault();
    const ta = inputRef.current;
    const startY = e.clientY;
    const startH = ta ? ta.getBoundingClientRect().height : 56;
    function move(ev) {
      // 向上拖动（clientY 减小）→ 高度增加；向下 → 高度减小
      const h = Math.min(Math.max(startH + (startY - ev.clientY), 44), 320);
      manualHRef.current = Math.round(h);
      if (ta) {
        ta.style.height = manualHRef.current + "px";
        ta.style.overflowY = "auto";
      }
    }
    function up() {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
    }
    document.body.style.cursor = "ns-resize";
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }

  function resetInputHeight() {
    manualHRef.current = null;
    const ta = inputRef.current;
    if (ta) {
      ta.style.height = "";
      ta.style.overflowY = "hidden";
    }
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
          bgcolor: "background.default",
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
        <Tooltip title="设置">
          <IconButton size="small" onClick={onOpenSettings} sx={{ color: "text.secondary" }}>
            <SettingsIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Messages / 代码查看器（输入框保持底部） */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          position: "relative",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {viewingFile ? (
          <FileViewer path={viewingFile} onClose={onCloseViewer} onAddToInput={appendToInput} />
        ) : (
        <>
        <Box
          sx={{
            flex: 1,
            overflow: "auto",
            px: { xs: 1.5, sm: 3 },
            py: 3,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <Box sx={{ width: "100%", maxWidth: 768, display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {allMessages.length === 0 ? (
              <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", py: 10 }}>
                <Typography variant="body2" color="text.disabled">
                  发送消息开始对话
                </Typography>
              </Box>
            ) : (
              allMessages.map((m, i) => (
                <div key={m.streaming ? "live" : `msg-${i}`} id={`chat-msg-${i}`}>
                  <MessageBubble msg={m} />
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </Box>
        </Box>

        {/* 右侧提问导航（悬停展开的圆角卡片） */}
        <RightNav questions={userQuestions} onJump={scrollToMsg} />
        </>
        )}
      </Box>

      {/* Input */}
      <Box
        sx={{
          borderTop: 1,
          borderColor: "divider",
          px: { xs: 1.5, sm: 3 },
          py: 1.5,
          bgcolor: "background.default",
        }}
      >
        <Box sx={{ width: "100%", maxWidth: 768, mx: "auto" }}>
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

          <Box sx={{ position: "relative" }}>
            {cmdOpen && filteredCmds.length > 0 && (
              <Paper
                elevation={3}
                sx={{
                  position: "absolute",
                  bottom: "100%",
                  left: 0,
                  right: 0,
                  mb: 0.5,
                  maxHeight: 240,
                  overflow: "auto",
                  zIndex: 20,
                  borderRadius: 2,
                }}
              >
                <List dense disablePadding ref={cmdListRef}>
                  {filteredCmds.map((c, idx) => (
                    <ListItemButton
                      key={c.name}
                      selected={idx === activeIndex}
                      onClick={() => pickCmd(c)}
                      onMouseEnter={() => setCmdIndex(idx)}
                      sx={{
                        px: 1.5,
                        py: 0.5,
                        "&.Mui-selected": {
                          bgcolor: "action.selected",
                        },
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 30 }}>
                        <CommandIcon sx={{ fontSize: 16, color: "primary.main" }} />
                      </ListItemIcon>
                      <ListItemText
                        primary={`/${c.name}`}
                        secondary={c.description || c.source}
                        slotProps={{
                          primary: { fontSize: 13, fontWeight: 600, fontFamily: "monospace" },
                          secondary: { fontSize: 11, noWrap: true },
                        }}
                      />
                    </ListItemButton>
                  ))}
                </List>
              </Paper>
            )}

            {cmdPanel && (
              <Paper
                ref={cmdPanelRef}
                elevation={4}
                sx={{
                  position: "absolute",
                  bottom: "100%",
                  left: 0,
                  right: 0,
                  mb: 0.5,
                  maxHeight: 300,
                  overflow: "auto",
                  zIndex: 20,
                  borderRadius: 2,
                  bgcolor: "#1B1B1A",
                  border: "1px solid rgba(247,247,242,0.14)",
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    px: 1.5,
                    py: 0.75,
                    borderBottom: "1px solid rgba(247,247,242,0.1)",
                    position: "sticky",
                    top: 0,
                    bgcolor: "#1B1B1A",
                    zIndex: 1,
                  }}
                >
                  <CommandIcon sx={{ fontSize: 14, color: "#8B949E", flexShrink: 0 }} />
                  <Typography
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      fontFamily: "var(--mui-fontFamilies-monospace)",
                      fontSize: "0.72rem",
                      color: "#F7F7F2",
                      fontWeight: 600,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {cmdPanel.cmd}
                  </Typography>
                  {cmdPanel.status === "running" ? (
                    <Chip
                      size="small"
                      label="运行中"
                      sx={{ height: 18, fontSize: "0.6rem", bgcolor: "rgba(121,192,255,0.15)", color: "#79C0FF" }}
                    />
                  ) : cmdPanel.status === "done" ? (
                    <Chip
                      size="small"
                      label="完成"
                      sx={{ height: 18, fontSize: "0.6rem", bgcolor: "rgba(126,231,135,0.15)", color: "#7EE787" }}
                    />
                  ) : (
                    <Chip
                      size="small"
                      label="失败"
                      sx={{ height: 18, fontSize: "0.6rem", bgcolor: "rgba(255,123,114,0.15)", color: "#FF7B72" }}
                    />
                  )}
                  <IconButton
                    size="small"
                    onClick={() => {
                      setCmdPanel(null);
                      cmdRunRef.current = false;
                      cmdAgentRef.current = false;
                    }}
                    sx={{ color: "text.secondary", p: 0.25 }}
                  >
                    <CloseIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Box>
                <Box
                  sx={{
                    px: 1.5,
                    py: 1,
                    fontFamily: "var(--mui-fontFamilies-monospace)",
                    fontSize: "0.72rem",
                    lineHeight: 1.6,
                  }}
                >
                  {cmdPanel.lines.map((l, i) => (
                    <Box
                      key={i}
                      sx={{
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        color:
                          l.type === "cmd" ? "#F7F7F2" :
                          l.type === "err" ? "#FF7B72" :
                          l.type === "ok" ? "#7EE787" : "#C9C9C4",
                        fontWeight: l.type === "cmd" ? 600 : 400,
                      }}
                    >
                      {l.type === "cmd" ? `$ ${l.text}` : l.text}
                    </Box>
                  ))}
                </Box>
              </Paper>
            )}

            {/* Claude 风格输入框：圆角矩形、细边框、聚焦橙边 */}
            <Paper
              variant="outlined"
              sx={(theme) => ({
                borderRadius: "16px",
                borderColor: "divider",
                bgcolor: "background.paper",
                "&:focus-within": {
                  borderColor: "primary.main",
                  boxShadow: "0 0 0 1px " + theme.palette.primary.main,
                },
                transition: "border-color .2s, box-shadow .2s",
              })}
            >
              {/* 顶部拖拽手柄：向上拖输入框变大（双击还原） */}
              <Box
                onMouseDown={onDragStart}
                onDoubleClick={resetInputHeight}
                title="拖动调整高度（双击还原）"
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 12,
                  cursor: "ns-resize",
                  color: "text.disabled",
                  opacity: 0.45,
                  "&:hover": { opacity: 1, color: "primary.main" },
                  transition: "opacity .15s, color .15s",
                  userSelect: "none",
                  borderBottom: "none",
                }}
              >
                <DragHandleIcon sx={{ fontSize: 14 }} />
              </Box>
              <TextField
                inputRef={inputRef}
                value={input}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                onBlur={() => setTimeout(() => setCmdOpen(false), 150)}
                placeholder="输入消息... / 显示命令, Enter 发送, Shift+Enter 换行"
                multiline
                maxRows={6}
                fullWidth
                variant="standard"
                InputProps={{ disableUnderline: true }}
                sx={{
                  px: 1.5,
                  pb: 1,
                  "& .MuiInputBase-root": { fontSize: "0.9rem", py: 1 },
                  "& textarea": {
                    overflowX: "hidden",
                    wordBreak: "break-word",
                    resize: "none",
                  },
                }}
              />
            </Paper>

            {/* 底部工具行：提示 + 模型切换 + 发送 */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.75 }}>
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.65rem", flex: 1 }}>
                Enter 发送 · Shift+Enter 换行 · / 命令
              </Typography>

              <Tooltip title="切换工作区">
                <Button
                  size="small"
                  variant="text"
                  onClick={() =>
                    window.dispatchEvent(new CustomEvent("openBrowser", { detail: workspace }))
                  }
                  startIcon={<FolderIcon sx={{ fontSize: 13 }} />}
                  sx={{
                    color: "text.secondary",
                    fontSize: "0.7rem",
                    py: 0.25,
                    minWidth: 0,
                    maxWidth: 180,
                    "& .MuiButton-startIcon": { mr: 0.5 },
                  }}
                >
                  <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {shortPath(workspace)}
                  </Box>
                </Button>
              </Tooltip>

              {models.length > 0 && (
                <>
                  <Button
                    size="small"
                    variant="text"
                    onClick={(e) => setModelAnchor(e.currentTarget)}
                    endIcon={<ArrowDropDownIcon />}
                    sx={{
                      color: "text.secondary",
                      fontSize: "0.7rem",
                      py: 0.25,
                      minWidth: 0,
                    }}
                  >
                    {model || "模型"}
                  </Button>
                  <Menu
                    anchorEl={modelAnchor}
                    open={!!modelAnchor}
                    onClose={() => setModelAnchor(null)}
                    anchorOrigin={{ vertical: "top", horizontal: "right" }}
                    transformOrigin={{ vertical: "bottom", horizontal: "right" }}
                  >
                    {models.map((m) => (
                      <MenuItem
                        key={m.provider + "/" + m.id}
                        selected={model === (m.name || m.id)}
                        onClick={() => selectModel(m)}
                        sx={{ fontSize: 13 }}
                      >
                        <ListItemIcon sx={{ minWidth: 30 }}>
                          <ModelIcon fontSize="small" />
                        </ListItemIcon>
                        {m.name || m.id}
                        <Typography variant="caption" color="text.disabled" sx={{ ml: 1 }}>
                          {m.provider}
                        </Typography>
                      </MenuItem>
                    ))}
                  </Menu>
                </>
              )}

              {live ? (
                <Button
                  variant="contained"
                  color="error"
                  onClick={abort}
                  size="small"
                  startIcon={<StopIcon />}
                  sx={{ borderRadius: 3, fontWeight: 700 }}
                >
                  中断
                </Button>
              ) : (
                <IconButton
                  color="primary"
                  onClick={send}
                  disabled={!input.trim() && !imgs.length}
                  sx={{
                    bgcolor: "primary.main",
                    color: "#fff",
                    "&:hover": { bgcolor: "primary.dark" },
                    "&.Mui-disabled": { bgcolor: "action.disabledBackground", color: "text.disabled" },
                    borderRadius: 2.5,
                    width: 34,
                    height: 34,
                  }}
                >
                  <SendIcon sx={{ fontSize: 17 }} />
                </IconButton>
              )}
            </Box>
          </Box>
        </Box>
      </Box>

      {/* 状态栏：模型 + 上下文窗口占用 */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          px: 2,
          py: 0.5,
          borderTop: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <Tooltip title="当前模型">
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
            <ModelIcon sx={{ fontSize: 13, color: "text.secondary", flexShrink: 0 }} />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontSize: "0.65rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140 }}
            >
              {model || "-"}
            </Typography>
          </Box>
        </Tooltip>
        <Box sx={{ flex: 1, display: "flex", alignItems: "center", gap: 1 }}>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, ctx?.percent ?? 0)}
            color={ctx?.percent > 80 ? "error" : ctx?.percent > 60 ? "warning" : "primary"}
            sx={{ flex: 1, height: 4, borderRadius: 2 }}
          />
          <Tooltip title={`上下文 ${fmtTokens(ctx?.tokens)} / ${fmtTokens(ctx?.contextWindow)} tokens`}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}>
              <MemoryIcon sx={{ fontSize: 13, color: "text.secondary" }} />
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem", whiteSpace: "nowrap" }}>
                {ctx ? `${(ctx.percent ?? 0).toFixed(1)}%` : "上下文 -"}
              </Typography>
            </Box>
          </Tooltip>
        </Box>
      </Box>
    </>
  );
}

// 从 assistant content blocks 中提取纯文本
function extractText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b && b.type === "text" && b.text)
    .map((b) => b.text)
    .join("\n");
}

function handleExtUI(ev, sid, addToast) {
  // Fire-and-forget methods: display but never reply
  if (ev.method === "notify") {
    const icon = ev.notifyType === "error" ? "❌" : ev.notifyType === "warning" ? "⚠️" : "ℹ️";
    addToast(icon + " " + (ev.message || ""), ev.notifyType === "error");
    return;
  }
  if (["setStatus", "setWidget", "setTitle", "set_editor_text"].includes(ev.method)) {
    return; // informational, no response needed
  }

  // Dialog methods: reply with the user's choice
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
