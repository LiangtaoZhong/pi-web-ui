import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Box,
  Chip,
  CircularProgress,
  IconButton,
} from "@mui/material";
import {
  Folder as FolderIcon,
  Home as HomeIcon,
  Computer as RootIcon,
  Work as CwdIcon,
  ArrowUpward as UpIcon,
  Close as CloseIcon,
} from "@mui/icons-material";

export default function FileBrowser({ onSelect, onClose, currentPath }) {
  const [path, setPath] = useState(currentPath || "/");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/browse?path=${encodeURIComponent(path)}`)
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setData({ items: [], error: e.message });
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle
        sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pb: 1 }}
      >
        <Typography variant="subtitle1" fontWeight={700}>
          选择工作区
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      {/* Navigation */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          px: 2,
          pb: 1,
          flexWrap: "wrap",
        }}
      >
        {data?.roots?.map((r) => (
          <Chip
            key={r.path}
            label={r.name}
            size="small"
            icon={
              r.name === "Home" ? (
                <HomeIcon sx={{ fontSize: 14 }} />
              ) : r.name === "Root" ? (
                <RootIcon sx={{ fontSize: 14 }} />
              ) : (
                <CwdIcon sx={{ fontSize: 14 }} />
              )
            }
            variant="outlined"
            onClick={() => setPath(r.path)}
          />
        ))}
        <Chip
          icon={<UpIcon sx={{ fontSize: 14 }} />}
          label="上级"
          size="small"
          variant="outlined"
          disabled={!data?.parent}
          onClick={() => setPath(data?.parent || path)}
        />
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            fontFamily: "monospace",
            fontSize: "0.65rem",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "100%",
            mt: 0.5,
          }}
        >
          {path}
        </Typography>
      </Box>

      {/* Directory listing */}
      <DialogContent dividers sx={{ minHeight: 200, maxHeight: 350, p: 0 }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : data?.items?.length ? (
          <List dense disablePadding>
            {data.items.map((it) => (
              <ListItemButton
                key={it.path}
                selected={it.path === path}
                onClick={() => setPath(it.path)}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <FolderIcon color="primary" fontSize="small" />
                </ListItemIcon>
                <ListItemText primary={it.name} primaryTypographyProps={{ fontSize: 13 }} />
              </ListItemButton>
            ))}
          </List>
        ) : (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              没有子目录
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1.5 }}>
        <Button onClick={onClose} variant="outlined" size="small">
          取消
        </Button>
        <Button onClick={() => onSelect(path)} variant="contained" size="small">
          确认
        </Button>
      </DialogActions>
    </Dialog>
  );
}
