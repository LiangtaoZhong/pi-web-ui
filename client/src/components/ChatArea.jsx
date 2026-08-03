import { useState, useEffect, useRef, useCallback } from "react";
import { escape, parseMarkdown } from "../utils/markdown";
import socket from "../hooks/useSocket";

export default function ChatArea({ sid, addToast }) {
  const [msgs, setMsgs] = useState([]);
  const [name, setName] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [input, setInput] = useState("");
  const [imgs, setImgs] = useState([]);
  const [live, setLive] = useState(false);
  const [stream, setStream] = useState("");
  const bottomRef = useRef(null);

  const scrollDown = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Socket events
  useEffect(() => {
    if (!sid) return;

    function onHistory(d) {
      if (d.sessionId !== sid) return;
      setMsgs(d.messages || []);
      setName(d.name || "");
      setWorkspace(d.workspace || "");
      setLive(!!d.streaming);
      setStream("");
    }

    function onEvent(ev) {
      if (ev.type === "agent_start") { setLive(true); setStream(""); }
      else if (ev.type === "agent_end" || ev.type === "agent_settled") {
        setLive(false);
        if (stream) {
          setMsgs(prev => [...prev, { role: "assistant", content: [{ type: "text", text: stream }], ts: Date.now() }]);
        }
        setStream("");
      }
      else if (ev.type === "message_update") {
        const d = ev.assistantMessageEvent;
        if (d?.type === "text_delta") setStream(s => s + (d.delta || ""));
      }
      else if (ev.type === "tool_execution_end") {
        // Show tool result as a separate block
        const text = ev.result?.content?.map(c => c.text || "").join("\n") || "";
        if (ev.isError) addToast(ev.toolName + " 失败", true);
      }
      else if (ev.type === "compaction_start") addToast("♻️ 压缩中...");
      else if (ev.type === "extension_ui_request") handleExtUI(ev);
    }

    function onWsUpd({ workspace: ws }) { setWorkspace(ws); }
    function onErr(d) { addToast(d.error, true); setLive(false); }
    function onDC(d) { if (d.code) addToast("Pi 断开 code=" + d.code, true); setLive(false); }

    socket.on("session_history", onHistory);
    socket.on("pi_event", onEvent);
    socket.on("pi_error", onErr);
    socket.on("pi_disconnected", onDC);
    socket.on("workspace_updated", onWsUpd);

    return () => {
      socket.off("session_history", onHistory);
      socket.off("pi_event", onEvent);
      socket.off("pi_error", onErr);
      socket.off("pi_disconnected", onDC);
      socket.off("workspace_updated", onWsUpd);
    };
  }, [sid]);

  useEffect(() => { scrollDown(); }, [msgs, stream]);

  function send() {
    const txt = input.trim();
    if ((!txt && !imgs.length) || !sid) return;
    const msg = txt || "(image)";
    setMsgs(prev => [...prev, { role: "user", content: msg, ts: Date.now() }]);
    socket.emit("prompt", { sessionId: sid, message: msg, images: imgs.length ? imgs : undefined });
    setInput(""); setImgs([]); scrollDown();
  }

  function abort() { socket.emit("abort", { sessionId: sid }); }

  function onPaste(e) {
    if (!sid) return;
    for (const item of e.clipboardData?.items || []) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const b = item.getAsFile();
        const r = new FileReader();
        r.onload = () => setImgs(prev => [...prev, { data: r.result.split(",")[1], mimeType: b.type }]);
        r.readAsDataURL(b);
      }
    }
  }

  function onKD(e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }

  return (
    <>
      <div className="chat-top">
        <span className="ct-title">{name || "Session"}</span>
        <span className="ct-ws" onClick={() => window.dispatchEvent(new CustomEvent("openBrowser", { detail: workspace }))}>
          📁 <span>{workspace || "/"}</span>
        </span>
        <span className={"ct-badge " + (live ? "live" : "ok")}>{live ? "streaming" : "idle"}</span>
      </div>

      <div className="msgs">
        {msgs.map((m, i) => (
          <div key={i} className={"msg " + m.role}>
            <div className="bub">
              {m.role === "user"
                ? escape(typeof m.content === "string" ? m.content : "")
                : <div className="bub-body" dangerouslySetInnerHTML={{ __html: parseMarkdown(
                    Array.isArray(m.content) ? m.content.filter(c => c.type === "text").map(c => c.text).join("\n\n") : String(m.content)
                  ) }} />
              }
            </div>
          </div>
        ))}
        {live && stream && (
          <div className="msg assistant streaming">
            <div className="bub">
              <div className="bub-body" dangerouslySetInnerHTML={{ __html: parseMarkdown(stream) }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="input-zone">
        {imgs.length > 0 && (
          <div className="img-preview">
            {imgs.map((img, i) => (
              <div key={i} className="ip">
                <img src={`data:${img.mimeType};base64,${img.data}`} alt="" />
                <button onClick={() => setImgs(prev => prev.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
          </div>
        )}
        <div className="input-row">
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKD} onPaste={onPaste}
            placeholder="输入消息... Enter 发送, Shift+Enter 换行" rows={1} />
          {live
            ? <button className="ib ib-abort" style={{ display: "inline-block" }} onClick={abort}>中断</button>
            : <button className="ib ib-send" disabled={!input.trim() && !imgs.length} onClick={send}>发送</button>
          }
        </div>
      </div>
    </>
  );
}

function handleExtUI(ev) {
  switch (ev.method) {
    case "select": socket.emit("extension_ui_response", { sessionId: null, response: { type: "extension_ui_response", id: ev.id, value: prompt(ev.title, ev.options?.[0]) || ev.options?.[0] } }); break;
    case "confirm": socket.emit("extension_ui_response", { sessionId: null, response: { type: "extension_ui_response", id: ev.id, confirmed: confirm((ev.title || "") + "\n" + (ev.message || "")) } }); break;
    case "input": socket.emit("extension_ui_response", { sessionId: null, response: { type: "extension_ui_response", id: ev.id, value: prompt(ev.title, ev.placeholder || "") || "" } }); break;
    case "editor": socket.emit("extension_ui_response", { sessionId: null, response: { type: "extension_ui_response", id: ev.id, value: prompt(ev.title, ev.prefill || "") || "" } }); break;
  }
}
