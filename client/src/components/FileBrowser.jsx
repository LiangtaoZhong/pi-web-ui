import { useState, useEffect } from "react";
import { escape } from "../utils/markdown";

export default function FileBrowser({ onSelect, onClose, currentPath }) {
  const [path, setPath] = useState(currentPath || "/");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/browse?path=${encodeURIComponent(path)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [path]);

  return (
    <div className="m-overlay" onClick={onClose}>
      <div className="m-box" onClick={(e) => e.stopPropagation()}>
        <div className="m-head">
          <h3>选择工作区</h3>
          <button className="m-close" onClick={onClose}>✕</button>
        </div>
        <div className="m-nav">
          {data?.roots?.map((r) => (
            <button key={r.path} onClick={() => setPath(r.path)}>{r.name}</button>
          ))}
          <button onClick={() => setPath(data?.parent || path)} disabled={!data?.parent}>
            ⬆ 上级
          </button>
          <span className="mpath">{escape(path)}</span>
        </div>
        <div className="m-body">
          {loading ? (
            <div className="mi" style={{ justifyContent: "center", color: "var(--text2)" }}>加载中...</div>
          ) : data?.items?.length ? (
            data.items.map((it) => (
              <div
                key={it.path}
                className={"mi" + (it.path === path ? " sel" : "")}
                onClick={() => setPath(it.path)}
              >
                📁 {escape(it.name)}
              </div>
            ))
          ) : (
            <div style={{ padding: 20, color: "var(--text2)", textAlign: "center" }}>没有子目录</div>
          )}
        </div>
        <div className="m-foot">
          <button className="m-cancel" onClick={onClose}>取消</button>
          <button className="m-ok" onClick={() => onSelect(path)}>确认</button>
        </div>
      </div>
    </div>
  );
}
