import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Box,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
} from "@mui/material";
import socket from "./hooks/useSocket";
import Sidebar from "./components/Sidebar";
import ChatArea from "./components/ChatArea";
import FileBrowser from "./components/FileBrowser";
import SkillsMcpDialog from "./components/SkillsMcpDialog";
import Toast from "./components/Toast";
import { useToasts } from "./components/Toast";

const LS_SID = "pi-web-ui-sid";
const LS_THEME = "pi-web-ui-theme";

function getInitialMode() {
  return localStorage.getItem(LS_THEME) || "dark";
}

export default function App() {
  const [mode, setMode] = useState(getInitialMode);
  const [sid, setSid] = useState(null);
  const [conn, setConn] = useState(socket.connected);
  const [fbOpen, setFbOpen] = useState(false);
  const [fbPath, setFbPath] = useState("/");
  const [manageOpen, setManageOpen] = useState(false);
  const [renamePrompt, setRenamePrompt] = useState(null); // {id, name}
  const { toasts, addToast } = useToasts();

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          ...(mode === "dark"
            ? {
                background: { default: "#0f1117", paper: "#151821" },
                divider: "#2a2d3e",
                primary: { main: "#6c8cff" },
                text: { primary: "#e1e4ed", secondary: "#8b8fa8" },
              }
            : {
                background: { default: "#f5f6fa", paper: "#ffffff" },
                divider: "#dde0e8",
                primary: { main: "#4f6ef7" },
                text: { primary: "#1a1c2e", secondary: "#6b7094" },
              }),
        },
        shape: { borderRadius: 12 },
        typography: {
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", sans-serif',
        },
        components: {
          MuiCssBaseline: {
            styleOverrides: {
              "::-webkit-scrollbar": { width: 5, height: 5 },
              "::-webkit-scrollbar-track": { background: "transparent" },
              "::-webkit-scrollbar-thumb": {
                background: mode === "dark" ? "#2a2d3e" : "#dde0e8",
                borderRadius: 3,
              },
            },
          },
          MuiPaper: {
            styleOverrides: { root: { backgroundImage: "none" } },
          },
        },
      }),
    [mode]
  );

  function toggleTheme() {
    const next = mode === "dark" ? "light" : "dark";
    setMode(next);
    localStorage.setItem(LS_THEME, next);
  }

  // Track connection; re-join the active session when the socket reconnects
  // (e.g. after a server restart) so the Pi process is restarted on demand.
  const sidRef = useRef(sid);
  useEffect(() => { sidRef.current = sid; }, [sid]);
  useEffect(() => {
    function on() {
      setConn(true);
      if (sidRef.current) {
        socket.emit("session_join", { sessionId: sidRef.current });
      }
    }
    function off() { setConn(false); }
    socket.on("connect", on);
    socket.on("disconnect", off);
    return () => {
      socket.off("connect", on);
      socket.off("disconnect", off);
    };
  }, []);

  // Auto-restore session
  useEffect(() => {
    const saved = localStorage.getItem(LS_SID);
    if (!saved) return;
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/sessions");
        const list = await r.json();
        if (list.some((s) => s.id === saved)) {
          setSid(saved);
          socket.emit("session_join", { sessionId: saved });
        } else {
          localStorage.removeItem(LS_SID);
        }
      } catch {}
    }, 600);
    return () => clearTimeout(t);
  }, []);

  // Persist sid
  useEffect(() => {
    if (sid) localStorage.setItem(LS_SID, sid);
    else localStorage.removeItem(LS_SID);
  }, [sid]);

  // File browser trigger
  useEffect(() => {
    function handler(e) {
      setFbPath(e.detail || "/");
      setFbOpen(true);
    }
    window.addEventListener("openBrowser", handler);
    return () => window.removeEventListener("openBrowser", handler);
  }, []);

  const onFbSelect = useCallback(
    (path) => {
      setFbOpen(false);
      if (sid && path) {
        socket.emit("session_update_workspace", { sessionId: sid, workspace: path });
        addToast("工作区 → " + path);
      }
    },
    [sid, addToast]
  );

  // Session deleted remotely
  useEffect(() => {
    function handler({ id }) {
      if (id === sid) setSid(null);
    }
    socket.on("session_deleted", handler);
    return () => socket.off("session_deleted", handler);
  }, [sid]);

  async function doRename(value) {
    if (!renamePrompt || !value.trim()) return;
    try {
      const r = await fetch(`/api/sessions/${renamePrompt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: value.trim() }),
      });
      if (r.ok) addToast("已重命名");
      else addToast("重命名失败", true);
    } catch (e) {
      addToast("重命名失败: " + e.message, true);
    }
    setRenamePrompt(null);
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: "flex", height: "100vh", overflow: "hidden" }}>
        {!conn && (
          <Alert
            severity="error"
            sx={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              zIndex: 9999,
              borderRadius: 0,
              justifyContent: "center",
            }}
          >
            ⚠ 服务器连接断开，正在重连...
          </Alert>
        )}

        <Sidebar
          sid={sid}
          onSelect={setSid}
          mode={mode}
          onToggleTheme={toggleTheme}
          onOpenManage={() => setManageOpen(true)}
        />

        <Box component="main" sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {sid ? (
            <ChatArea
              sid={sid}
              addToast={addToast}
              onRename={(currentName) => setRenamePrompt({ id: sid, name: currentName })}
            />
          ) : (
            <Box
              sx={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 1,
                color: "text.secondary",
              }}
            >
              <Box sx={{ fontSize: 52, opacity: 0.5 }}>💬</Box>
              <Box sx={{ typography: "h6", fontWeight: 700, color: "text.primary" }}>
                选择或创建一个 Session
              </Box>
              <Box sx={{ typography: "body2", textAlign: "center", maxWidth: 340, lineHeight: 1.6 }}>
                在左侧面板创建新 Session 或点击已有 Session，即可在此与 Pi 对话
              </Box>
            </Box>
          )}
        </Box>

        {fbOpen && (
          <FileBrowser
            currentPath={fbPath}
            onSelect={onFbSelect}
            onClose={() => setFbOpen(false)}
          />
        )}

        <SkillsMcpDialog
          open={manageOpen}
          onClose={() => setManageOpen(false)}
          addToast={addToast}
        />

        {renamePrompt && (
          <RenameDialog
            initial={renamePrompt.name}
            onClose={() => setRenamePrompt(null)}
            onConfirm={doRename}
          />
        )}

        <Toast toasts={toasts} />
      </Box>
    </ThemeProvider>
  );
}

function RenameDialog({ initial, onClose, onConfirm }) {
  const [value, setValue] = useState(initial || "");
  useEffect(() => {
    setValue(initial || "");
  }, [initial]);

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>重命名会话</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          size="small"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); onConfirm(value); }
          }}
          placeholder="输入新名称"
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 2 }}>
        <Button onClick={onClose} size="small" variant="outlined">取消</Button>
        <Button
          onClick={() => onConfirm(value)}
          size="small"
          variant="contained"
          disabled={!value.trim()}
        >
          确定
        </Button>
      </DialogActions>
    </Dialog>
  );
}
