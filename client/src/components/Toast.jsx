import { useState } from "react";

export default function Toast({ toasts, removeToast }) {
  if (!toasts.length) return null;
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={"toast" + (t.err ? " err" : "")}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

let _tid = 0;
export function useToasts() {
  const [toasts, setToasts] = useState([]);

  const add = (msg, err) => {
    const id = ++_tid;
    setToasts((prev) => [...prev, { id, msg, err }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  return { toasts, addToast: add };
}
