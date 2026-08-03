import { useState, useEffect, useCallback } from "react";
import socket from "./hooks/useSocket";
import Sidebar from "./components/Sidebar";
import ChatArea from "./components/ChatArea";
import FileBrowser from "./components/FileBrowser";
import Toast, { useToasts } from "./components/Toast";

const LS = "pi-web-ui-sid";
const LS_T = "pi-web-ui-theme";

export default function App() {
  const [sid, setSid] = useState(null);
  const [conn, setConn] = useState(socket.connected);
  const [fb, setFb] = useState(false);
  const [fbPath, setFbPath] = useState("/");
  const { toasts, addToast } = useToasts();

  // Init theme
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", localStorage.getItem(LS_T) || "dark");
  }, []);

  // Track connection
  useEffect(() => {
    function on() { setConn(true); }
    function off() { setConn(false); }
    socket.on("connect", on);
    socket.on("disconnect", off);
    return () => { socket.off("connect", on); socket.off("disconnect", off); };
  }, []);

  // Auto-restore
  useEffect(() => {
    const saved = localStorage.getItem(LS);
    if (!saved) return;
    setTimeout(async () => {
      try {
        const r = await fetch("/api/sessions");
        const list = await r.json();
        if (list.some(s => s.id === saved)) {
          setSid(saved);
          socket.emit("session_join", { sessionId: saved });
        } else {
          localStorage.removeItem(LS);
        }
      } catch {}
    }, 600);
  }, []);

  // Persist sid
  useEffect(() => {
    if (sid) localStorage.setItem(LS, sid);
    else localStorage.removeItem(LS);
  }, [sid]);

  // File browser trigger
  useEffect(() => {
    function handler(e) {
      setFbPath(e.detail || "/");
      setFb(true);
    }
    window.addEventListener("openBrowser", handler);
    return () => window.removeEventListener("openBrowser", handler);
  }, []);

  const onFbSelect = useCallback((path) => {
    setFb(false);
    if (sid && path) {
      socket.emit("session_update_workspace", { sessionId: sid, workspace: path });
      addToast("工作区 → " + path);
    }
  }, [sid, addToast]);

  // Session deleted remotely
  useEffect(() => {
    function handler({ id }) { if (id === sid) setSid(null); }
    socket.on("session_deleted", handler);
    return () => socket.off("session_deleted", handler);
  }, [sid]);

  return (
    <>
      {!conn && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 999, background: "var(--red)", color: "#fff", textAlign: "center", padding: "6px 10px", fontSize: 13, fontWeight: 600 }}>
          ⚠ 服务器连接断开，正在重连...
        </div>
      )}
      <Sidebar sid={sid} onSelect={setSid} />
      <main className="main">
        {sid
          ? <ChatArea sid={sid} addToast={addToast} />
          : <div className="empty"><span className="eicon">💬</span><h2>选择或创建一个 Session</h2><p>在左侧面板创建新 Session 或点击已有 Session，即可在此与 Pi 对话</p></div>
        }
      </main>
      {fb && <FileBrowser currentPath={fbPath} onSelect={onFbSelect} onClose={() => setFb(false)} />}
      <Toast toasts={toasts} />
    </>
  );
}
