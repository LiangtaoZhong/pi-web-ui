import { useState, useEffect, useRef, useCallback } from "react";
import { escape } from "../utils/markdown";
import { renderBlocks } from "./MessageBubble";

export default function ChatArea({ sid, socket, on, emit, addToast }) {
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [name, setName] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [input, setInput] = useState("");
  const [imgs, setImgs] = useState([]);
  const [streamText, setStreamText] = useState(""); // current streaming text
  const [streamBlocks, setStreamBlocks] = useState([]); // tool/thinking blocks
  const msgsRef = useRef(null);
  const streamRef = useRef({ text: "", blocks: [] });

  // Auto-scroll
  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
  }, [messages, streamText, streamBlocks]);

  // Listen for session history
  useEffect(() => {
    if (!sid) return;
    const unsub = on("session_history", (d) => {
      if (d.sessionId !== sid) return;
      setMessages(d.messages || []);
      setName(d.name || "");
      setWorkspace(d.workspace || "");
      setStreaming(!!d.streaming);
    });
    return unsub;
  }, [sid, on]);

  // Listen for Pi events
  useEffect(() => {
    if (!sid) return;
    const unsubs = [];

    unsubs.push(
      on("pi_event", (ev) => {
        if (ev.type === "agent_start") {
          setStreaming(true);
          streamRef.current = { text: "", blocks: [] };
          setStreamText("");
          setStreamBlocks([]);
        } else if (ev.type === "agent_end" || ev.type === "agent_settled") {
          setStreaming(false);
          // Push streaming content as completed message
          const finalBlocks = [];
          if (streamRef.current.text) finalBlocks.push({ type: "text", text: streamRef.current.text });
          for (const b of streamRef.current.blocks) finalBlocks.push(b);
          if (finalBlocks.length > 0) {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: finalBlocks, timestamp: Date.now() },
            ]);
          }
          streamRef.current = { text: "", blocks: [] };
          setStreamText("");
          setStreamBlocks([]);
        } else if (ev.type === "message_update") {
          const d = ev.assistantMessageEvent;
          if (d?.type === "text_delta") {
            streamRef.current.text += d.delta || "";
            setStreamText(streamRef.current.text);
          } else if (d?.type === "thinking_delta") {
            const last = streamRef.current.blocks[streamRef.current.blocks.length - 1];
            if (last?.type === "thinking") {
              last.thinking += d.delta || "";
            } else {
              streamRef.current.blocks.push({ type: "thinking", thinking: d.delta || "" });
            }
            setStreamBlocks([...streamRef.current.blocks]);
          } else if (d?.type === "toolcall_end" && d.toolCall) {
            streamRef.current.blocks.push({
              type: "toolCall",
              id: d.toolCall.id,
              name: d.toolCall.name,
              arguments: d.toolCall.arguments || {},
            });
            setStreamBlocks([...streamRef.current.blocks]);
          }
        } else if (ev.type === "tool_execution_start") {
          // Update the matching toolCall block
          const idx = streamRef.current.blocks.findIndex(
            (b) => b.type === "toolCall" && b.id === ev.toolCallId
          );
          if (idx >= 0) {
            streamRef.current.blocks[idx] = {
              ...streamRef.current.blocks[idx],
              name: ev.toolName,
              arguments: ev.args,
              executing: true,
            };
            setStreamBlocks([...streamRef.current.blocks]);
          }
        } else if (ev.type === "tool_execution_end") {
          const idx = streamRef.current.blocks.findIndex(
            (b) => b.type === "toolCall" && b.id === ev.toolCallId
          );
          if (idx >= 0) {
            streamRef.current.blocks[idx] = {
              ...streamRef.current.blocks[idx],
              result: ev.result,
              isError: ev.isError,
              executing: false,
            };
            setStreamBlocks([...streamRef.current.blocks]);
          }
        } else if (ev.type === "compaction_start") {
          addToast("♻️ 上下文压缩中...");
        }
      })
    );

    unsubs.push(
      on("pi_error", (d) => {
        addToast(d.error, true);
        setStreaming(false);
      })
    );

    unsubs.push(
      on("pi_disconnected", (d) => {
        if (d.code !== 0) addToast("Pi 进程断开", true);
        setStreaming(false);
      })
    );

    unsubs.push(
      on("workspace_updated", ({ workspace: ws }) => {
        setWorkspace(ws);
      })
    );

    return () => unsubs.forEach((u) => u());
  }, [sid, on, addToast]);

  const handleSend = useCallback(() => {
    if ((!input.trim() && !imgs.length) || !sid) return;
    const msg = input.trim() || "(image)";
    const images = [...imgs];
    setImgs([]);
    setInput("");

    setMessages((prev) => [...prev, { role: "user", content: msg, timestamp: Date.now() }]);
    emit("prompt", {
      sessionId: sid,
      message: msg,
      images: images.length > 0 ? images : undefined,
    });
  }, [input, imgs, sid, emit]);

  const handleAbort = useCallback(() => {
    emit("abort", { sessionId: sid });
  }, [sid, emit]);

  // Paste images
  const handlePaste = useCallback((e) => {
    if (!sid) return;
    for (const item of e.clipboardData?.items || []) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const blob = item.getAsFile();
        const reader = new FileReader();
        reader.onload = () => {
          setImgs((prev) => [
            ...prev,
            { data: reader.result.split(",")[1], mimeType: blob.type },
          ]);
        };
        reader.readAsDataURL(blob);
      }
    }
  }, [sid]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Rebuild stream content blocks for display
  const streamContent = [];
  if (streamText) streamContent.push({ type: "text", text: streamText });
  for (const b of streamBlocks) streamContent.push(b);

  return (
    <>
      <div className="chat-top">
        <span className="ct-title">{name || "Session"}</span>
        <span className="ct-ws" title="点击切换工作区">
          📁{" "}
          <span
            onClick={() =>
              emit("openBrowser", { currentPath: workspace })
            }
          >
            {workspace || "/"}
          </span>
        </span>
        <span className={"ct-badge " + (streaming ? "live" : "ok")}>
          {streaming ? "streaming" : "idle"}
        </span>
      </div>

      <div className="msgs" ref={msgsRef}>
        {messages.map((m, i) => (
          <div key={i} className={"msg " + m.role}>
            <div className="bub">
              {m.role === "user" ? (
                escape(typeof m.content === "string" ? m.content : "")
              ) : (
                <div
                  className="bub-body"
                  dangerouslySetInnerHTML={{ __html: renderBlocks(m.content) }}
                  onClick={(e) => {
                    const btn = e.target.closest(".copy-btn");
                    if (!btn) return;
                    const code = btn.parentElement?.querySelector("code");
                    if (!code) return;
                    navigator.clipboard.writeText(code.textContent).then(() => {
                      btn.textContent = "已复制!";
                      setTimeout(() => { btn.textContent = "复制"; }, 1500);
                    });
                  }}
                />
              )}
            </div>
          </div>
        ))}

        {/* Streaming bubble */}
        {streaming && streamContent.length > 0 && (
          <div className="msg assistant streaming">
            <div className="bub">
              <div
                className="bub-body"
                dangerouslySetInnerHTML={{ __html: renderBlocks(streamContent) }}
              />
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
            <button className="ib ib-abort" style={{ display: "inline-block" }} onClick={handleAbort}>
              中断
            </button>
          ) : (
            <button
              className="ib ib-send"
              disabled={!input.trim() && !imgs.length}
              onClick={handleSend}
            >
              发送
            </button>
          )}
        </div>
      </div>
    </>
  );
}
