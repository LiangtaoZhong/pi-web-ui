import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon as MenuItemIcon,
  ListItemText as MenuItemText,
  CircularProgress,
} from "@mui/material";
import {
  Folder as FolderIcon,
  InsertDriveFile as FileIcon,
  ArrowUpward as UpIcon,
  Home as HomeIcon,
  Visibility as ViewIcon,
  SmartToy as AiReadIcon,
  ContentCopy as CopyIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import socket from "../hooks/useSocket";

// 文件图标按扩展名着色
const EXT_COLOR = {
  js: "#f7df1e", jsx: "#61dafb", ts: "#3178c6", tsx: "#3178c6",
  json: "#c9a227", html: "#e34c26", css: "#2965f1", md: "#9aa0a6",
  py: "#3572A5", rb: "#701516", go: "#00ADD8", rs: "#dea584",
  java: "#b07219", c: "#555", cpp: "#f34b7d", sh: "#89e051",
  yml: "#cb171e", yaml: "#cb171e", toml: "#7f7f7f",
};

function fileColor(item) {
  return EXT_COLOR[item.ext] || "#9aa0a6";
}

function fmtBytes(n) {
  if (n == null) return "";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + " MB";
  if (n >= 1e3) return Math.round(n / 1e3) + " KB";
  return n + " B";
}

export default function FileBrowserSidebar({ workspace, sid, onOpenFile, onAddReference }) {
  const [path, setPath] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState(null); // {mouseX, mouseY, item}

  // 跟随工作区
  useEffect(() => {
    if (workspace) setPath(workspace);
  }, [workspace]);

  const load = useCallback((p) => {
    setLoading(true);
    setError("");
    fetch(`/api/browse?path=${encodeURIComponent(p)}`)
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(new Error(d.error || "HTTP " + r.status)))))
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => {
    if (path) load(path);
  }, [path, load]);

  function enter(item) {
    if (item.type === "directory") setPath(item.path);
    else if (item.type === "file" && onOpenFile) onOpenFile(item.path);
  }

  function goUp() {
    if (data?.parent) setPath(data.parent);
  }

  function openContextMenu(e, item) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ mouseX: e.clientX, mouseY: e.clientY, item });
  }

  function closeMenu() { setMenu(null); }

  function readAsContext(item) {
    closeMenu();
    socket.emit("read_context", { sessionId: sid, path: item.path, isDir: item.type === "directory" });
    // 直观反馈：把 @引用 追加到输入框
    if (onAddReference) onAddReference(item.path, item.type === "directory");
  }

  function copyPath(item) {
    closeMenu();
    navigator.clipboard.writeText(item.path).catch(() => {});
  }

  const menuItem = menu?.item || null;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* 导航栏：返回 + 刷新 + 路径 */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, px: 1, py: 0.5, borderBottom: 1, borderColor: "divider" }}>
        <Tooltip title="返回上级" placement="right">
          <span>
            <IconButton size="small" disabled={!data?.parent} onClick={goUp} sx={{ color: "text.secondary" }}>
              <UpIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="回到工作区根目录" placement="right">
          <span>
            <IconButton size="small" onClick={() => workspace && setPath(workspace)} sx={{ color: "text.secondary" }}>
              <HomeIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="刷新" placement="right">
          <IconButton size="small" onClick={() => path && load(path)} sx={{ color: "text.secondary" }}>
            <RefreshIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        <Typography
          variant="caption"
          noWrap
          title={path}
          sx={{
            flex: 1,
            minWidth: 0,
            fontSize: "0.62rem",
            color: "text.secondary",
            fontFamily: "var(--mui-fontFamilies-monospace)",
            textAlign: "right",
          }}
        >
          {path}
        </Typography>
      </Box>

      {/* 目录列表 */}
      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", py: 0.5 }}>
        {!path ? (
          <Typography variant="caption" color="text.disabled" sx={{ p: 1.5, display: "block" }}>
            请先选择会话（需要工作区）
          </Typography>
        ) : loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 3 }}>
            <CircularProgress size={20} />
          </Box>
        ) : error ? (
          <Typography variant="caption" color="error.main" sx={{ p: 1.5, display: "block" }}>
            {error}
          </Typography>
        ) : !data?.items?.length ? (
          <Typography variant="caption" color="text.disabled" sx={{ p: 1.5, display: "block" }}>
            空目录
          </Typography>
        ) : (
          <List dense disablePadding>
            {data.items.map((it) => (
              <ListItemButton
                key={it.path}
                dense
                onClick={() => enter(it)}
                onContextMenu={(e) => openContextMenu(e, it)}
                sx={{
                  px: 1,
                  py: 0.25,
                  borderRadius: 1,
                  mx: 0.5,
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <ListItemIcon sx={{ minWidth: 26 }}>
                  {it.type === "directory" ? (
                    <FolderIcon sx={{ fontSize: 16, color: "primary.main" }} />
                  ) : (
                    <FileIcon sx={{ fontSize: 16, color: fileColor(it) }} />
                  )}
                </ListItemIcon>
                <ListItemText
                  primary={it.name}
                  secondary={it.type === "file" ? fmtBytes(it.size) : undefined}
                  slotProps={{
                    primary: { fontSize: "0.72rem", noWrap: true, fontFamily: it.type === "file" ? "var(--mui-fontFamilies-monospace)" : undefined },
                    secondary: { fontSize: "0.58rem", noWrap: true },
                  }}
                  sx={{ my: 0 }}
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </Box>

      {/* 右键菜单 */}
      <Menu
        open={!!menu}
        onClose={closeMenu}
        anchorReference="anchorPosition"
        anchorPosition={menu ? { top: menu.mouseY, left: menu.mouseX } : undefined}
        slotProps={{ paper: { sx: { minWidth: 180, borderRadius: "10px" } } }}
      >
        {menuItem?.type === "file" && (
          <MenuItem dense onClick={() => { closeMenu(); onOpenFile(menuItem.path); }}>
            <MenuItemIcon sx={{ minWidth: 30 }}><ViewIcon fontSize="small" /></MenuItemIcon>
            <MenuItemText primary="查看代码" slotProps={{ primary: { fontSize: 13 } }} />
          </MenuItem>
        )}
        <MenuItem dense onClick={() => readAsContext(menuItem)}>
          <MenuItemIcon sx={{ minWidth: 30 }}><AiReadIcon fontSize="small" sx={{ color: "primary.main" }} /></MenuItemIcon>
          <MenuItemText
            primary={menuItem?.type === "directory" ? "让 AI 读取目录" : "让 AI 读取文件"}
            slotProps={{ primary: { fontSize: 13 } }}
          />
        </MenuItem>
        <MenuItem dense onClick={() => copyPath(menuItem)}>
          <MenuItemIcon sx={{ minWidth: 30 }}><CopyIcon fontSize="small" /></MenuItemIcon>
          <MenuItemText primary="复制路径" slotProps={{ primary: { fontSize: 13 } }} />
        </MenuItem>
      </Menu>
    </Box>
  );
}
