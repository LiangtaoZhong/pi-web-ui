import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Box,
  Alert,
} from "@mui/material";
import socket from "./hooks/useSocket";
import Sidebar from "./components/Sidebar";
import ChatArea from "./components/ChatArea";
import FileBrowser from "./components/FileBrowser";
import SettingsDialog from "./components/SettingsDialog";
import Toast from "./components/Toast";
import { useToasts } from "./components/Toast";

const LS_SID = "pi-web-ui-sid";
const LS_THEME = "pi-web-ui-theme";

function getInitialMode() {
  return localStorage.getItem(LS_THEME) || "dark";
}

// Claude-style palette
function buildTheme(mode) {
  return createTheme({
    palette: {
      mode,
      ...(mode === "dark"
        ? {
            background: { default: "#262624", paper: "#2E2E2C" },
            divider: "rgba(255,255,255,0.09)",
            primary: { main: "#D97757", light: "#E69A80", dark: "#C15F3C" },
            text: { primary: "#EDEDEA", secondary: "#A8A8A3" },
          }
        : {
            background: { default: "#FEFEFC", paper: "#FFFFFF" },
            divider: "rgba(0,0,0,0.08)",
            primary: { main: "#C15F3C", light: "#D97757", dark: "#A84E2F" },
            text: { primary: "#1F1F1E", secondary: "#6E6E69" },
          }),
    },
    shape: { borderRadius: 10 },
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
            background: mode === "dark" ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)",
            borderRadius: 3,
          },
        },
      },
      MuiPaper: {
        styleOverrides: { root: { backgroundImage: "none" } },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { textTransform: "none" } },
      },
    },
  });
}

export default function App() {
  const [mode, setMode] = useState(getInitialMode);
  const [sid, setSid] = useState(null);
  const [conn, setConn] = useState(socket.connected);
  const [fbOpen, setFbOpen] = useState(false);
  const [fbPath, setFbPath] = useState("/");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [models, setModels] = useState([]);
  const [model, setModel] = useState("");
  const { toasts, addToast } = useToasts();

  const theme = useMemo(() => buildTheme(mode), [mode]);

  function toggleTheme() {
    const next = mode === "dark" ? "light" : "dark";
    setMode(next);
    localStorage.setItem(LS_THEME, next);
  }

  // Track connection; re-join the active session when the socket reconnects
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

  // Model switching (from settings dialog)
  const onSelectModel = useCallback((m) => {
    if (sid && m) {
      socket.emit("set_model", { sessionId: sid, provider: m.provider, modelId: m.id });
    }
  }, [sid]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: "flex", height: "100vh", overflow: "hidden" }}>
        {!conn && (
          <Alert
            severity="error"
            sx={{
              position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
              borderRadius: 0, justifyContent: "center",
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
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <Box component="main" sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {sid ? (
            <ChatArea
              sid={sid}
              addToast={addToast}
              mode={mode}
              onToggleTheme={toggleTheme}
              onOpenSettings={() => setSettingsOpen(true)}
              models={models}
              model={model}
              onModelsLoaded={(m, cur) => { if (m) setModels(m); if (cur) setModel(cur); }}
              onSelectModel={onSelectModel}
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
              <Box sx={{ fontSize: 46, opacity: 0.5 }}>💬</Box>
              <Box sx={{ typography: "h6", fontWeight: 600, color: "text.primary" }}>
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

        <SettingsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          addToast={addToast}
          mode={mode}
          onToggleTheme={toggleTheme}
          sid={sid}
          models={models}
          model={model}
          onSelectModel={onSelectModel}
        />

        <Toast toasts={toasts} />
      </Box>
    </ThemeProvider>
  );
}
