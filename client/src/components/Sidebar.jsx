import { useState, useEffect } from "react";
import {
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemText,
  ListItemAvatar,
  Avatar,
  IconButton,
  Button,
  Typography,
  Divider,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from "@mui/material";
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Settings as SettingsIcon,
  Chat as ChatIcon,
  MenuOpen as CollapseIcon,
  Menu as ExpandIcon,
  Folder as FolderTabIcon,
} from "@mui/icons-material";
import socket from "../hooks/useSocket";
import FileBrowserSidebar from "./FileBrowserSidebar";

const DRAWER_WIDTH = 260;
const DRAWER_COLLAPSED = 60;
const LS_SIDEBAR = "pi-web-ui-sidebar";

function RenameDialog({ open, initial, onClose, onConfirm }) {
  const [value, setValue] = useState(initial || "");
  useEffect(() => {
    if (open) setValue(initial || "");
  }, [open, initial]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
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
        <Button onClick={() => onConfirm(value)} size="small" variant="contained" disabled={!value.trim()}>
          确定
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function Sidebar({ sid, onSelect, mode, onToggleTheme, onOpenSettings, onOpenFile }) {
  const [list, setList] = useState([]);
  const [renameId, setRenameId] = useState(null);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(LS_SIDEBAR) === "1");
  const [tab, setTab] = useState("sessions");
  const [workspace, setWorkspace] = useState("");
  const width = collapsed ? DRAWER_COLLAPSED : DRAWER_WIDTH;

  // 同步当前工作区（文件浏览器根目录）
  useEffect(() => {
    function onHistory(d) {
      if (d.sessionId === sid && d.workspace) setWorkspace(d.workspace);
    }
    function onWsUpd(d) {
      if (d.sessionId === sid && d.workspace) setWorkspace(d.workspace);
    }
    socket.on("session_history", onHistory);
    socket.on("workspace_updated", onWsUpd);
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((list) => {
        const s = list.find((x) => x.id === sid);
        if (s?.workspace) setWorkspace(s.workspace);
      })
      .catch(() => {});
    return () => {
      socket.off("session_history", onHistory);
      socket.off("workspace_updated", onWsUpd);
    };
  }, [sid]);
  function toggleCollapse() {
    setCollapsed((c) => {
      localStorage.setItem(LS_SIDEBAR, c ? "0" : "1");
      return !c;
    });
  }

  async function refresh() {
    try {
      const r = await fetch("/api/sessions");
      setList(await r.json());
    } catch {}
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    function onCreated() { refresh(); }
    function onDeleted() { refresh(); }
    function onRenamed() { refresh(); }
    socket.on("session_created", onCreated);
    socket.on("session_deleted", onDeleted);
    socket.on("session_renamed", onRenamed);
    return () => {
      socket.off("session_created", onCreated);
      socket.off("session_deleted", onDeleted);
      socket.off("session_renamed", onRenamed);
    };
  }, []);

  function create() {
    socket.emit("session_create", {
      name: "Session " + new Date().toLocaleTimeString("zh-CN"),
      workspace: "",
    });
  }

  async function del(id) {
    const target = list.find((s) => s.id === id);
    if (!confirm(`确定删除会话「${target?.name || id}」？此操作不可恢复。`)) return;
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    refresh();
  }

  async function doRename(value) {
    if (!renameId || !value.trim()) return;
    await fetch(`/api/sessions/${renameId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: value.trim() }),
    });
    setRenameId(null);
    refresh();
  }

  function join(id) {
    if (id === sid) return;
    localStorage.setItem("pi-web-ui-sid", id);
    onSelect(id);
    socket.emit("session_join", { sessionId: id });
  }

  return (
    <>
      <Drawer
        variant="permanent"
        sx={{
          width,
          flexShrink: 0,
          transition: "width .2s ease",
          "& .MuiDrawer-paper": {
            width,
            boxSizing: "border-box",
            borderRight: 1,
            borderColor: "divider",
            bgcolor: "background.default",
            overflowX: "hidden",
            transition: "width .2s ease",
          },
        }}
      >
        {/* Header / logo */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            px: collapsed ? 0.75 : 2,
            py: 1.5,
            gap: 0.5,
            ...(collapsed && { flexDirection: "column", gap: 0.75 }),
          }}
        >
          {collapsed ? (
            <>
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: "8px",
                  bgcolor: "primary.main",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 16,
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                P
              </Box>
              <Tooltip title={mode === "dark" ? "浅色模式" : "深色模式"} placement="right">
                <IconButton size="small" onClick={onToggleTheme} sx={{ color: "text.secondary" }}>
                  {mode === "dark" ? <span style={{ fontSize: 15 }}>☀️</span> : <span style={{ fontSize: 15 }}>🌙</span>}
                </IconButton>
              </Tooltip>
              <Tooltip title="展开侧边栏" placement="right">
                <IconButton size="small" onClick={toggleCollapse} sx={{ color: "text.secondary" }}>
                  <ExpandIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
              <Box sx={{ borderTop: 1, borderColor: "divider", pt: 0.75, mt: 0.5, display: "flex", flexDirection: "column", gap: 0.5, width: "100%" }}>
                <Tooltip title="会话" placement="right">
                  <IconButton
                    size="small"
                    onClick={() => setTab("sessions")}
                    sx={{ color: tab === "sessions" ? "primary.main" : "text.secondary", bgcolor: tab === "sessions" ? "action.selected" : "transparent" }}
                  >
                    <ChatIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="文件" placement="right">
                  <IconButton
                    size="small"
                    onClick={() => setTab("files")}
                    sx={{ color: tab === "files" ? "primary.main" : "text.secondary", bgcolor: tab === "files" ? "action.selected" : "transparent" }}
                  >
                    <FolderTabIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            </>
          ) : (
            <>
              <Typography variant="subtitle1" fontWeight={800} sx={{ color: "text.primary", fontSize: 16 }}>
                Pi Web UI
              </Typography>
              <Box sx={{ flex: 1 }} />
              <Tooltip title={mode === "dark" ? "浅色模式" : "深色模式"}>
                <IconButton size="small" onClick={onToggleTheme} sx={{ color: "text.secondary" }}>
                  {mode === "dark" ? <span style={{ fontSize: 15 }}>☀️</span> : <span style={{ fontSize: 15 }}>🌙</span>}
                </IconButton>
              </Tooltip>
              <Tooltip title="收起侧边栏">
                <IconButton size="small" onClick={toggleCollapse} sx={{ color: "text.secondary" }}>
                  <CollapseIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Box>

        <Divider />

        {/* Tab 切换：会话 / 文件（展开时） */}
        {!collapsed && (
          <Box sx={{ display: "flex", p: 0.75, gap: 0.5 }}>
            <Box
              onClick={() => setTab("sessions")}
              sx={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 0.5,
                py: 0.6,
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: "0.72rem",
                color: tab === "sessions" ? "text.primary" : "text.secondary",
                bgcolor: tab === "sessions" ? (mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)") : "transparent",
                transition: "background-color .15s",
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <ChatIcon sx={{ fontSize: 14 }} /> 会话
            </Box>
            <Box
              onClick={() => setTab("files")}
              sx={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 0.5,
                py: 0.6,
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: "0.72rem",
                color: tab === "files" ? "text.primary" : "text.secondary",
                bgcolor: tab === "files" ? (mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)") : "transparent",
                transition: "background-color .15s",
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <FolderTabIcon sx={{ fontSize: 14 }} /> 文件
            </Box>
          </Box>
        )}

        {/* 内容区：会话列表 / 文件浏览器 */}
        {tab === "files" && !collapsed ? (
          <FileBrowserSidebar workspace={workspace} sid={sid} onOpenFile={onOpenFile} />
        ) : (
        <Box sx={{ flex: 1, overflow: "auto", py: 0.5, ...(collapsed && { display: "none" }) }}>
          {list.length === 0 ? (
            <Box sx={{ p: 3, textAlign: "center" }}>
              <Typography variant="body2" color="text.secondary">暂无会话</Typography>
              <Typography variant="caption" color="text.disabled">点击「新建会话」开始</Typography>
            </Box>
          ) : (
            <List disablePadding dense>
              {list.map((s) => (
                <ListItemButton
                  key={s.id}
                  selected={s.id === sid}
                  onClick={() => join(s.id)}
                  sx={{
                    mx: 0.75,
                    borderRadius: 1.5,
                    mb: 0.25,
                    py: 0.5,
                    "&.Mui-selected": {
                      bgcolor: mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
                      color: "text.primary",
                      "&:hover": { bgcolor: mode === "dark" ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)" },
                    },
                  }}
                >
                  <ListItemAvatar sx={{ minWidth: 34 }}>
                    <Avatar
                      sx={{
                        width: 26,
                        height: 26,
                        fontSize: 13,
                        bgcolor: s.id === sid ? "primary.main" : "action.selected",
                      }}
                    >
                      <ChatIcon sx={{ fontSize: 14 }} />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={s.name}
                    secondary={
                      <>
                        {s.workspace || "/"} · {s.messageCount || 0}
                        {s.streaming ? " · live" : ""}
                      </>
                    }
                    slotProps={{
                      primary: { fontSize: 13, fontWeight: 600, noWrap: true },
                      secondary: { fontSize: 10, noWrap: true },
                    }}
                    sx={{ my: 0 }}
                  />
                  <Tooltip title="重命名">
                    <IconButton
                      size="small"
                      onClick={(e) => { e.stopPropagation(); setRenameId(s.id); }}
                      sx={{
                        opacity: 0,
                        "&:hover": { color: "primary.main" },
                        ".MuiListItemButton-root:hover &": { opacity: 1 },
                      }}
                    >
                      <EditIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="删除">
                    <IconButton
                      size="small"
                      onClick={(e) => { e.stopPropagation(); del(s.id); }}
                      sx={{
                        opacity: 0,
                        "&:hover": { color: "error.main" },
                        ".MuiListItemButton-root:hover &": { opacity: 1 },
                      }}
                    >
                      <DeleteIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                  </Tooltip>
                </ListItemButton>
              ))}
            </List>
          )}
        </Box>
        )}

        <Divider />

        {/* Footer: new session + settings */}
        <Box sx={{ p: collapsed ? 0.75 : 1, display: "flex", flexDirection: "column", gap: 0.5 }}>
          <Tooltip title="新建会话" placement="right">
            <Button
              variant="text"
              startIcon={<AddIcon />}
              onClick={create}
              sx={{
                justifyContent: collapsed ? "center" : "flex-start",
                px: collapsed ? 1 : 1.5,
                fontWeight: 600,
                fontSize: 13,
                color: "text.primary",
                minWidth: 0,
                "& .MuiButton-startIcon": collapsed ? { m: 0 } : undefined,
              }}
            >
              {!collapsed && "新建会话"}
            </Button>
          </Tooltip>
          <Tooltip title="设置" placement="right">
            <Button
              variant="text"
              startIcon={<SettingsIcon />}
              onClick={onOpenSettings}
              sx={{
                justifyContent: collapsed ? "center" : "flex-start",
                px: collapsed ? 1 : 1.5,
                fontWeight: 600,
                fontSize: 13,
                color: "text.secondary",
                minWidth: 0,
                "& .MuiButton-startIcon": collapsed ? { m: 0 } : undefined,
              }}
            >
              {!collapsed && "设置"}
            </Button>
          </Tooltip>
        </Box>
      </Drawer>

      <RenameDialog
        open={!!renameId}
        initial={renameId ? list.find((s) => s.id === renameId)?.name || "" : ""}
        onClose={() => setRenameId(null)}
        onConfirm={doRename}
      />
    </>
  );
}
