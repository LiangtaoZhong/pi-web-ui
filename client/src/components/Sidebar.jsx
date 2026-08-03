import { useState, useEffect } from "react";
import { escape } from "../utils/markdown";

export default function Sidebar({ emit, on, addToast, activeSid, setActiveSid }) {
  const [sessions, setSessions] = useState([]);

  const refresh = async () => {
    try {
      const r = await fetch("/api/sessions");
      setSessions(await r.json());
    } catch {}
  };

  useEffect(() => { refresh(); const i = setInterval(refresh, 8000); return () => clearInterval(i); }, []);

  // Listen for new sessions created via socket
  useEffect(() => {
    const u1 = on("session_created", (d) => {
      setActiveSid(d.id);
      refresh();
    });
    const u2 = on("session_deleted", () => refresh());
    return () => { u1(); u2(); };
  }, [on, setActiveSid]);

  const create = () => {
    emit("session_create", {
      name: "Session " + new Date().toLocaleTimeString("zh-CN"),
      workspace: "",
    });
  };

  const del = async (id) => {
    if (!confirm("确定删除此 Session？")) return;
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    if (activeSid === id) setActiveSid(null);
    refresh();
  };

  const join = (id) => {
    if (id === activeSid) return;
    setActiveSid(id);
    emit("session_join", { sessionId: id });
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span className="sb-logo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20" /><path d="M2 12h20" />
          </svg>
          Pi Web UI
        </span>
        <button className="theme-btn" onClick={() => emit("toggleTheme")} title="切换主题"></button>
      </div>

      <div className="sess-list">
        {sessions.length === 0 ? (
          <div style={{ padding: 16, color: "var(--text2)", fontSize: 13, textAlign: "center" }}>
            暂无 Session<br /><small>点击「+ 新建」开始</small>
          </div>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              className={"sess-item" + (s.id === activeSid ? " active" : "")}
              onClick={() => join(s.id)}
            >
              <div className="si-av">💬</div>
              <div className="si-info">
                <div className="si-name">{escape(s.name)}</div>
                <div className="si-ws">{escape(s.workspace)}</div>
                <div className="si-meta">{s.messageCount || 0} msg{s.streaming ? " · live" : ""}</div>
              </div>
              <button className="si-del" onClick={(e) => { e.stopPropagation(); del(s.id); }}>✕</button>
            </div>
          ))
        )}
      </div>

      <div className="sidebar-foot">
        <button className="btn1" onClick={create}>+ 新建</button>
        <button className="btn2" onClick={refresh}>↻</button>
      </div>
    </aside>
  );
}
