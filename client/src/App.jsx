import { useState, useEffect, useCallback } from "react";
import { getSocket, getSavedSid, saveActiveSid } from "./hooks/useSocket";
import Sidebar from "./components/Sidebar";
import ChatArea from "./components/ChatArea";
import FileBrowser from "./components/FileBrowser";
import Toast, { useToasts } from "./components/Toast";

const socket = getSocket();

export default function App() {
  const [activeSid, setActiveSid] = useState(null);
  const [showBrowser, setShowBrowser] = useState(false);
  const [browserPath, setBrowserPath] = useState("/");
  const { toasts, addToast } = useToasts();

  // Init theme from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("pi-web-ui-theme") || "dark";
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  // Auto-restore session
  useEffect(() => {
    const saved = getSavedSid();
    if (!saved) return;
    const tryJoin = async () => {
      try {
        const r = await fetch("/api/sessions");
        const list = await r.json();
        if (list.some((s) => s.id === saved)) {
          setActiveSid(saved);
          socket.emit("session_join", { sessionId: saved });
        } else {
          saveActiveSid(null);
        }
      } catch {}
    };
    setTimeout(tryJoin, 500);
  }, []);

  // Persist activeSid
  useEffect(() => {
    saveActiveSid(activeSid);
  }, [activeSid]);

  // Listen for openBrowser event from ChatArea
  useEffect(() => {
    const handler = (e) => {
      setBrowserPath(e.detail || "/");
      setShowBrowser(true);
    };
    window.addEventListener("openBrowser", handler);
    return () => window.removeEventListener("openBrowser", handler);
  }, []);

  const handleBrowserSelect = useCallback((path) => {
    setShowBrowser(false);
    if (activeSid && path) {
      socket.emit("session_update_workspace", { sessionId: activeSid, workspace: path });
      addToast("工作区 → " + path);
    }
  }, [activeSid, addToast]);

  // Connection status
  const [connected, setConnected] = useState(socket.connected);
  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  return (
    <>
      {!connected && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 999,
          background: "var(--red)", color: "#fff", textAlign: "center",
          padding: "6px", fontSize: 13, fontWeight: 600
        }}>
          ⚠ 连接断开，正在重连...
        </div>
      )}

      <Sidebar activeSid={activeSid} setActiveSid={setActiveSid} addToast={addToast} />

      <main className="main">
        {activeSid ? (
          <ChatArea sid={activeSid} addToast={addToast} />
        ) : (
          <div className="empty">
            <span className="eicon">💬</span>
            <h2>选择或创建一个 Session</h2>
            <p>在左侧面板创建新 Session 或点击已有 Session，即可在此与 Pi 对话</p>
          </div>
        )}
      </main>

      {showBrowser && (
        <FileBrowser
          currentPath={browserPath}
          onSelect={handleBrowserSelect}
          onClose={() => setShowBrowser(false)}
        />
      )}

      <Toast toasts={toasts} />
    </>
  );
}
