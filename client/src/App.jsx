import { useState, useEffect, useCallback } from "react";
import { useSocket } from "./hooks/useSocket";
import { useTheme } from "./hooks/useTheme";
import Sidebar from "./components/Sidebar";
import ChatArea from "./components/ChatArea";
import FileBrowser from "./components/FileBrowser";
import Toast, { useToasts } from "./components/Toast";

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const { connected, emit, on, saveActiveSid, getSavedSid } = useSocket();
  const { toasts, addToast } = useToasts();

  const [activeSid, setActiveSid] = useState(null);
  const [showBrowser, setShowBrowser] = useState(false);
  const [browserPath, setBrowserPath] = useState("/");

  // Auto-restore session on mount
  useEffect(() => {
    const saved = getSavedSid();
    if (saved) {
      // Need to wait for session list to populate
      const tryJoin = async () => {
        try {
          const r = await fetch("/api/sessions");
          const list = await r.json();
          if (list.some((s) => s.id === saved)) {
            setActiveSid(saved);
            emit("session_join", { sessionId: saved });
          }
        } catch {}
      };
      setTimeout(tryJoin, 600);
    }
  }, []);

  // Persist active session
  useEffect(() => {
    saveActiveSid(activeSid);
  }, [activeSid, saveActiveSid]);

  // Sync theme toggle from sidebar
  useEffect(() => {
    const unsub = on("toggleTheme", toggleTheme);
    return unsub;
  }, [on, toggleTheme]);

  // Handle file browser open
  useEffect(() => {
    const unsub = on("openBrowser", ({ currentPath }) => {
      setBrowserPath(currentPath || "/");
      setShowBrowser(true);
    });
    return unsub;
  }, [on]);

  const handleBrowserSelect = useCallback(
    (path) => {
      setShowBrowser(false);
      if (activeSid && path) {
        emit("session_update_workspace", { sessionId: activeSid, workspace: path });
        addToast("工作区 → " + path);
      }
    },
    [activeSid, emit, addToast]
  );

  return (
    <>
      <Sidebar
        emit={emit}
        on={on}
        addToast={addToast}
        activeSid={activeSid}
        setActiveSid={setActiveSid}
      />

      <main className="main">
        {activeSid ? (
          <ChatArea sid={activeSid} socket={null} on={on} emit={emit} addToast={addToast} />
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
