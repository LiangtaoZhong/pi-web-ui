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
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  DarkMode as DarkIcon,
  LightMode as LightIcon,
  Chat as ChatIcon,
  Public as GlobeIcon,
  Extension as ExtensionIcon,
} from "@mui/icons-material";
import socket from "../hooks/useSocket";

const DRAWER_WIDTH = 310;

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

export default function Sidebar({ sid, onSelect, mode, onToggleTheme, onOpenManage }) {
  const [list, setList] = useState([]);
  const [renameId, setRenameId] = useState(null);

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
          width: DRAWER_WIDTH,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: DRAWER_WIDTH,
            boxSizing: "border-box",
            borderRight: 1,
            borderColor: "divider",
          },
        }}
      >
        {/* Header */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 2,
            py: 1.5,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <GlobeIcon sx={{ color: "primary.main", fontSize: 22 }} />
            <Typography variant="subtitle1" fontWeight={800} color="primary">
              Pi Web UI
            </Typography>
          </Box>
          <Box>
            <Tooltip title="Skills / MCP 管理">
              <IconButton onClick={onOpenManage} size="small" sx={{ mr: 0.5 }}>
                <ExtensionIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <IconButton onClick={onToggleTheme} size="small">
              {mode === "dark" ? <LightIcon fontSize="small" /> : <DarkIcon fontSize="small" />}
            </IconButton>
          </Box>
        </Box>

        <Divider />

        {/* Session List */}
        <Box sx={{ flex: 1, overflow: "auto", py: 1 }}>
          {list.length === 0 ? (
            <Box sx={{ p: 3, textAlign: "center" }}>
              <Typography variant="body2" color="text.secondary">
                暂无 Session
              </Typography>
              <Typography variant="caption" color="text.disabled">
                点击「+ 新建」开始
              </Typography>
            </Box>
          ) : (
            <List disablePadding dense>
              {list.map((s) => (
                <ListItemButton
                  key={s.id}
                  selected={s.id === sid}
                  onClick={() => join(s.id)}
                  sx={{
                    mx: 0.5,
                    borderRadius: 2,
                    mb: 0.25,
                    "&.Mui-selected": {
                      bgcolor: "primary.main",
                      color: "primary.contrastText",
                      "&:hover": { bgcolor: "primary.dark" },
                      "& .MuiListItemText-secondary": {
                        color: "rgba(255,255,255,0.7)",
                      },
                    },
                  }}
                >
                  <ListItemAvatar sx={{ minWidth: 40 }}>
                    <Avatar
                      sx={{
                        width: 32,
                        height: 32,
                        bgcolor: s.id === sid ? "rgba(255,255,255,0.2)" : "action.selected",
                      }}
                    >
                      <ChatIcon sx={{ fontSize: 16 }} />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={s.name}
                    secondary={
                      <>
                        {s.workspace || "/"} · {s.messageCount || 0} msg
                        {s.streaming ? " · live" : ""}
                      </>
                    }
                    primaryTypographyProps={{ fontSize: 13, fontWeight: 600, noWrap: true }}
                    secondaryTypographyProps={{ fontSize: 10, noWrap: true }}
                    sx={{ my: 0 }}
                  />
                  <Tooltip title="重命名">
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenameId(s.id);
                      }}
                      sx={{
                        opacity: 0,
                        "&:hover": { color: "primary.main" },
                        ".MuiListItemButton-root:hover &": { opacity: 1 },
                      }}
                    >
                      <EditIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="删除">
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        del(s.id);
                      }}
                      sx={{
                        opacity: 0,
                        "&:hover": { color: "error.main" },
                        ".MuiListItemButton-root:hover &": { opacity: 1 },
                      }}
                    >
                      <DeleteIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                </ListItemButton>
              ))}
            </List>
          )}
        </Box>

        <Divider />

        {/* Footer */}
        <Box sx={{ display: "flex", gap: 0.5, p: 1.5 }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={create}
            fullWidth
            sx={{ fontWeight: 600, fontSize: 13 }}
          >
            新建
          </Button>
          <Button variant="outlined" onClick={refresh} sx={{ minWidth: 44, px: 1 }}>
            <RefreshIcon fontSize="small" />
          </Button>
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
