import { useState, useCallback } from "react";
import { Snackbar, Alert } from "@mui/material";

let _tid = 0;

export function useToasts() {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((msg, isErr) => {
    const id = ++_tid;
    setToasts((prev) => [...prev, { id, msg, err: !!isErr }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return { toasts, addToast };
}

export default function Toast({ toasts }) {
  return (
    <>
      {toasts.map((t, i) => (
        <Snackbar
          key={t.id}
          open
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          sx={{ position: "fixed", bottom: 16 + i * 56 }}
        >
          <Alert
            severity={t.err ? "error" : "info"}
            variant="filled"
            sx={{ width: "100%", maxWidth: 380, boxShadow: 4 }}
          >
            {t.msg}
          </Alert>
        </Snackbar>
      ))}
    </>
  );
}
