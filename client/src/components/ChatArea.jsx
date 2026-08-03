import { useState, useEffect, useRef, useCallback } from "react";
import { escape } from "../utils/markdown";
import { renderBlocks } from "./MessageBubble";
import { getSocket } from "../hooks/useSocket";

const socket = getSocket();

export default function ChatArea({ sid, addToast }) {
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [name, setName] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [input, setInput] = useState("");
  const [imgs, setImgs] = useState([]);
  const [streamBlocks, setStreamBlocks] = useState([]);
  const msgsRef = useRef(null);
  const streamRef = useRef({ text: "", blocks: [] });

  const scrollBot = useCallback(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
  }, []);

  // Subscribe to socket events
  useEffect(() => {
    if (!sid) return;

    const onHistory = (d) => {
      if (d.sessionId !== sid) return;
      setMessages(d.messages || []);
      setName(d.name || "");
      setWorkspace(d.workspace || "");
      setStreaming(!!d.streaming);
      scrollBot();
    };

    const onEvent = (ev) => {
      switch (ev.type) {
        case "agent_start":
          setStreaming(true);
          streamRef.current = { text: "", blocks: [] };
          setStreamBlocks([]);
          break;
        case "agent_end":
        case "agent_settled":
          setStreaming(false);
          if (streamRef.current.text || streamRef.current.blocks.length) {
            const blocks = [];
            if (streamRef.current.text) blocks.push({ type: "text", text: streamRef.current.text });
            blocks.push(...streamRef.current.blocks);
            setMessages((prev) => [...prev, { role: "assistant", content: blocks, timestamp: Date.now() }]);
          }
          streamRef.current = { text: "", blocks: [] };
          setStreamBlocks([]);
          break;
        case "message_update": {
          const d = ev.assistantMessageEvent;
          if (!d) break;
          if (d.type === "text_delta") {
            streamRef.current.text += d.delta || "";
            setStreamBlocks([...streamRef.current.blocks, { type: "text", text: streamRef.current.text }]);
          } else if (d.type === "thinking_delta") {
            const last = streamRef.current.blocks[streamRef.current.blocks.length - 1];
            if (last?.type === "thinking") last.thinking += d.delta || "";
            else streamRef.current.blocks.push({ type: "thinking", thinking: d.delta || "" });
            setStreamBlocks([...streamRef.current.blocks]);
          } else if (d.type === "toolcall_end" && d.toolCall) {
            streamRef.current.blocks.push({
              type: "toolCall", id: d.toolCall.id, name: d.toolCall.name,
              arguments: d.toolCall.arguments || {},
            });
            setStreamBlocks([...streamRef.current.blocks]);
          }
          break;
        }
        case "tool_execution_start": {
          const idx = streamRef.current.blocks.findIndex(
            (b) => b.type === "toolCall" && b.id === ev.toolCallId
          );
          if (idx >= 0) {
            streamRef.current.blocks[idx] = {
              ...streamRef.current.blocks[idx],
              name: ev.toolName, arguments: ev.args, executing: true,
            };
            setStreamBlocks([...streamRef.current.blocks]);
          }
          break;
        }
        case "tool_execution_update": {
          const idx = streamRef.current.blocks.findIndex(
            (b) => b.type === "toolCall" && b.id === ev.toolCallId
          );
          if (idx >= 0 && ev.partialResult) {
            streamRef.current.blocks[idx] = {
              ...streamRef.current.blocks[idx], result: ev.partialResult,
            };
            setStreamBlocks([...streamRef.current.blocks]);
          }
          break;
        }
        case "tool_execution_end": {
          const idx = streamRef.current.blocks.findIndex(
            (b) => b.type === "toolCall" && b.id === ev.toolCallId
          );
          if (idx >= 0) {
            streamRef.current.blocks[idx] = {
              ...streamRef.current.blocks[idx],
              result: ev.result, isError: ev.isError, executing: false,
            };
            setStreamBlocks([...streamRef.current.blocks]);
          }
          break;
        }
        case "compaction_start":
          addToast("♻️ 上下文压缩中...");
          break;
        case "extension_ui_request":
          handleExtUI(ev);
          break;
      }
      scrollBot();
    };

    const onError = (d) => { addToast(d.error, true); setStreaming(false); };
    const onDisconnected = (d) => { if (d.code && d.code !== 0) addToast("Pi 断开", true); setStreaming(false); };
    const onWsUpdated = ({ workspace: ws }) => { setWorkspace(ws); };

    socket.on("session_history", onHistory);
    socket.on("pi_event", onEvent);
    socket.on("pi_error", onError);
    socket.on("pi_disconnected", onDisconnected);
    socket.on("workspace_updated", onWsUpdated);

    return () => {
      socket.off("session_history", onHistory);
      socket.off("pi_event", onEvent);
      socket.off("pi_error", onError);
      socket.off("pi_disconnected", onDisconnected);
      socket.off("workspace_updated", onWsUpdated);
    };
  }, [sid, addToast, scrollBot]);

  // Auto-scroll
  useEffect(() => { scrollBot(); }, [messages, streamBlocks, scrollBot]);

  const handleSend = useCallback(() => {
    if ((!input.trim() && !imgs.length) || !sid) return;
    const msg = input.trim() || "(image)";
    setMessages((prev) => [...prev, { role: "user", content: msg, timestamp: Date.now() }]);
    socket.emit("prompt", {
      sessionId: sid,
      message: msg,
      images: imgs.length > 0 ? imgs : undefined,
    });
    setInput(""); setImgs([]);
    scrollBot();
  }, [input, imgs, sid, scrollBot]);

  const handleAbort = useCallback(() => {
    socket.emit("abort", { sessionId: sid });
  }, [sid]);

  const handlePaste = useCallback((e) => {
    if (!sid) return;
    for (const item of e.clipboardData?.items || []) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const blob = item.getAsFile();
        const reader = new FileReader();
        reader.onload = () => setImgs((prev) => [...prev, { data: reader.result.split(",")[1], mimeType: blob.type }]);
        reader.readAsDataURL(blob);
      }
    }
  }, [sid]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  // Build streaming display blocks (text last to overwrite earlier text)
  const displayBlocks = [...streamBlocks.filter(b => b.type !== "text")];
  if (streamRef.current.text) displayBlocks.push({ type: "text", text: streamRef.current.text });

  return (
    <>
      <div className="chat-top">
        <span className="ct-title">{name || "Session"}</span>
        <span className="ct-ws" title="点击切换工作区">
          📁 <span onClick={() => window.dispatchEvent(new CustomEvent("openBrowser", { detail: workspace }))}>{workspace || "/"}</span>
        </span>
        <span className={"ct-badge " + (streaming ? "live" : "ok")}>{streaming ? "streaming" : "idle"}</span>
      </div>

      <div className="msgs" ref={msgsRef}>
        {messages.map((m, i) => (
          <div key={i} className={"msg " + m.role}>
            <div className="bub">
              {m.role === "user" ? (
                escape(typeof m.content === "string" ? m.content : "")
              ) : (
                <div className="bub-body" dangerouslySetInnerHTML={{ __html: renderBlocks(m.content) }} />
              )}
            </div>
          </div>
        ))}
        {streaming && displayBlocks.length > 0 && (
          <div className="msg assistant streaming">
            <div className="bub">
              <div className="bub-body" dangerouslySetInnerHTML={{ __html: renderBlocks(displayBlocks) }} />
            </div>
          </div>
        )}
      </div>

      <div className="input-zone">
        {imgs.length > 0 && (
          <div className="img-preview">
            {imgs.map((img, i) => (
              <div key={i} className="ip">
                <img src={`data:${img.mimeType};base64,${img.data}`} alt="" />
                <button onClick={() => setImgs((prev) => prev.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
          </div>
        )}
        <div className="input-row">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="输入消息... Enter 发送, Shift+Enter 换行"
            rows={1}
          />
          {streaming ? (
            <button className="ib ib-abort" style={{ display: "inline-block" }} onClick={handleAbort}>中断</button>
          ) : (
            <button className="ib ib-send" disabled={!input.trim() && !imgs.length} onClick={handleSend}>发送</button>
          )}
        </div>
      </div>
    </>
  );
}

function handleExtUI(ev) {
  switch (ev.method) {
    case "select": {
      const v = prompt(ev.title + "\n\n" + ev.options.join("\n"), ev.options[0]);
      socket.emit("extension_ui_response", { sessionId: null, response: { type: "extension_ui_response", id: ev.id, value: v || ev.options[0] } });
      break;
    }
    case "confirm": {
      socket.emit("extension_ui_response", { sessionId: null, response: { type: "extension_ui_response", id: ev.id, confirmed: confirm((ev.title || "") + "\n" + (ev.message || "")) } });
      break;
    }
    case "input": {
      const v = prompt(ev.title, ev.placeholder || "");
      socket.emit("extension_ui_response", { sessionId: null, response: { type: "extension_ui_response", id: ev.id, value: v || "" } });
      break;
    }
    case "editor": {
      const v = prompt(ev.title, ev.prefill || "");
      socket.emit("extension_ui_response", { sessionId: null, response: { type: "extension_ui_response", id: ev.id, value: v || "" } });
      break;
    }
    case "notify": {
      // Toast handled by the main app
      break;
    }
  }
}
