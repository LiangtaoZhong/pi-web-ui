import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Box,
  Alert,
} from "@mui/material";
import socket from "./hooks/useSocket";
import { claudeTokens, fontSans, fontSerif, fontMono } from "./theme/tokens";
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

// Claude 设计系统（取自 claude.ai 分享页 CSS 变量）
function buildTheme(mode) {
  const t = claudeTokens[mode];
  const brand = t.brand100;
  const border = mode === "dark" ? "rgba(247,247,242,0.12)" : "rgba(30,30,29,0.15)";
  return createTheme({
    palette: {
      mode,
      background: { default: t.bg100, paper: t.bg000 },
      divider: border,
      primary: { main: brand, light: t.brand200, dark: t.brand000 },
      text: { primary: t.text000, secondary: t.text400, disabled: t.text500 },
      error: { main: t.danger },
      success: { main: t.success },
      warning: { main: t.warning },
    },
    shape: { borderRadius: 8 },
    typography: {
      fontFamily: fontSans,
      body2: { fontSize: "0.875rem" },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ":root": {
            "--mui-fontFamilies-sans": fontSans,
            "--mui-fontFamilies-serif": fontSerif,
            "--mui-fontFamilies-monospace": fontMono,
          },
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
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            bgcolor: mode === "dark" ? "hsl(48 33.3% 97.1%)" : "hsl(60 2.6% 7.6%)",
            color: mode === "dark" ? "hsl(60 2.6% 7.6%)" : "hsl(48 33.3% 97.1%)",
            fontSize: 12,
            borderRadius: "6px",
            px: 1.5,
            py: 0.75,
          },
        },
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

  // Stable callbacks so ChatArea's socket effect doesn't re-run on every render
  const handleModelsLoaded = useCallback((m, cur) => {
    if (m) setModels(m);
    if (cur) setModel(cur);
  }, []);
  const handleOpenSettings = useCallback(() => setSettingsOpen(true), []);
  const handleRename = useCallback((currentName) => {
    if (sid) setRenamePrompt({ id: sid, name: currentName });
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
          onOpenSettings={handleOpenSettings}
        />

        <Box component="main" sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {sid ? (
            <ChatArea
              sid={sid}
              addToast={addToast}
              onToggleTheme={toggleTheme}
              onOpenSettings={handleOpenSettings}
              models={models}
              model={model}
              onModelsLoaded={handleModelsLoaded}
              onSelectModel={onSelectModel}
              onRename={handleRename}
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
