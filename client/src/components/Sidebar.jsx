import { useState, useEffect } from "react";
import { escape } from "../utils/markdown";
import socket from "../hooks/useSocket";

const LS = "pi-web-ui-sid";
const LS_T = "pi-web-ui-theme";

export default function Sidebar({ sid, onSelect, onNew }) {
  const [list, setList] = useState([]);

  async function refresh() {
    try { const r = await fetch("/api/sessions"); setList(await r.json()); } catch {}
  }

  useEffect(() => { refresh(); const t = setInterval(refresh, 8000); return () => clearInterval(t); }, []);

  useEffect(() => {
    function onCreated() { refresh(); }
    function onDeleted() { refresh(); }
    socket.on("session_created", onCreated);
    socket.on("session_deleted", onDeleted);
    return () => { socket.off("session_created", onCreated); socket.off("session_deleted", onDeleted); };
  }, []);

  function create() {
    socket.emit("session_create", { name: "Session " + new Date().toLocaleTimeString("zh-CN"), workspace: "" });
  }

  async function del(id) {
    if (!confirm("确定删除？")) return;
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    refresh();
  }

  function join(id) {
    if (id === sid) return;
    localStorage.setItem(LS, id);
    onSelect(id);
    socket.emit("session_join", { sessionId: id });
  }

  function toggleTheme() {
    const h = document.documentElement;
    const n = h.getAttribute("data-theme") === "light" ? "dark" : "light";
    h.setAttribute("data-theme", n);
    localStorage.setItem(LS_T, n);
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span className="sb-logo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20" /><path d="M2 12h20" />
          </svg>
          Pi Web UI
        </span>
        <button className="theme-btn" onClick={toggleTheme} title="切换主题" />
      </div>

      <div className="sess-list">
        {list.length === 0
          ? <div style={{ padding: 16, color: "var(--text2)", fontSize: 13, textAlign: "center" }}>暂无<br /><small>点击「+ 新建」开始</small></div>
          : list.map(s => (
              <div key={s.id} className={"sess-item" + (s.id === sid ? " active" : "")} onClick={() => join(s.id)}>
                <div className="si-av">💬</div>
                <div className="si-info">
                  <div className="si-name">{escape(s.name)}</div>
                  <div className="si-ws">{escape(s.workspace)}</div>
                  <div className="si-meta">{s.messageCount || 0} msg{s.streaming ? " · live" : ""}</div>
                </div>
                <button className="si-del" onClick={e => { e.stopPropagation(); del(s.id); }}>✕</button>
              </div>
            ))
        }
      </div>

      <div className="sidebar-foot">
        <button className="btn1" onClick={create}>+ 新建</button>
        <button className="btn2" onClick={refresh}>↻</button>
      </div>
    </aside>
  );
}
