import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Box, Typography, IconButton, Tooltip, CircularProgress, Button } from "@mui/material";
import {
  Close as CloseIcon,
  InsertComment as AddToInputIcon,
  Code as CodeIcon,
} from "@mui/icons-material";
import hljs from "highlight.js";
import "highlight.js/styles/github-dark.css";

// ── 代码文件 → highlight.js 语言映射 ───────────────────────────────────
const EXT_LANG = {
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  ts: "typescript", tsx: "typescript",
  py: "python", rb: "ruby", go: "go", rs: "rust", java: "java", kt: "kotlin",
  c: "c", h: "c", cpp: "cpp", hpp: "cpp", cs: "csharp",
  sh: "bash", bash: "bash", zsh: "bash", sql: "sql", graphql: "graphql",
  json: "json", yml: "yaml", yaml: "yaml", toml: "ini", ini: "ini",
  css: "css", scss: "scss", less: "less", html: "xml", xml: "xml", svg: "xml",
  md: "markdown", markdown: "markdown", vue: "xml", php: "php", swift: "swift",
  scala: "scala", lua: "lua", r: "r", dart: "dart", dockerfile: "dockerfile",
  tf: "hcl", proto: "protobuf", diff: "diff",
};
const NAME_LANG = {
  dockerfile: "dockerfile", makefile: "makefile", gemfile: "ruby",
};

function detectLanguage(path, ext) {
  const base = (path || "").split("/").pop() || "";
  const byName = NAME_LANG[base.toLowerCase()];
  if (byName) return byName;
  const e = (ext || base.split(".").pop() || "").toLowerCase();
  return EXT_LANG[e] || null;
}

function fmtBytes(n) {
  if (n == null) return "";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + " MB";
  if (n >= 1e3) return Math.round(n / 1e3) + " KB";
  return n + " B";
}

// ── 行号列宽度随行数自适应 ─────────────────────────────────────────────
function gutterWidth(lineCount) {
  const digits = String(lineCount || 1).length;
  return Math.max(3, digits + 1) + "ch";
}

export default function FileViewer({ path, onClose, onAddToInput }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sel, setSel] = useState(null); // {x, y, text}
  const codeRef = useRef(null);
  const activePathRef = useRef(path);
  useEffect(() => { activePathRef.current = path; }, [path]);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setData(null);
    setSel(null);
    fetch(`/api/file?path=${encodeURIComponent(path)}`)
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(new Error(d.error || "HTTP " + r.status)))))
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [path]);

  // 高亮后的 HTML 整块渲染（行号列静态对齐，右侧可横向滚动）
  const highlighted = useMemo(() => {
    if (!data || data.binary || !data.content) return "";
    const lang = detectLanguage(data.path, data.language);
    try {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(data.content, { language: lang, ignoreIllegals: true }).value;
      }
      return hljs.highlightAuto(data.content).value;
    } catch {
      return data.content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
  }, [data]);

  const lineCount = useMemo(() => (data && data.content ? data.content.split("\n").length : 0), [data]);

  // ── 框选检测：mouseup 时检查选区，弹出"添加到输入框"工具条 ─────────
  const onMouseUp = useCallback(() => {
    const selObj = window.getSelection();
    if (!selObj || selObj.isCollapsed) { setSel(null); return; }
    const text = selObj.toString();
    if (!text || text.trim().length === 0) { setSel(null); return; }
    const range = selObj.getRangeAt(0);
    const container = codeRef.current;
    if (container && !container.contains(range.commonAncestorContainer)) { setSel(null); return; }
    const rect = range.getBoundingClientRect();
    const host = container?.getBoundingClientRect();
    setSel({
      x: rect.left - (host ? host.left : 0) + (container ? container.scrollLeft : 0),
      y: rect.bottom - (host ? host.top : 0) + (container ? container.scrollTop : 0),
      text,
    });
  }, []);

  // 原生监听更可靠（不依赖 React 合成事件冒泡到被替换的消息区容器）
  useEffect(() => {
    const el = codeRef.current;
    if (!el) return;
    el.addEventListener("mouseup", onMouseUp);
    return () => el.removeEventListener("mouseup", onMouseUp);
  }, [onMouseUp]);

  function addSelection() {
    if (sel && sel.text) onAddToInput(sel.text);
    window.getSelection()?.removeAllRanges();
    setSel(null);
  }

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        borderBottom: 1,
        borderColor: "divider",
      }}
    >
      {/* 头部：文件名 + 关闭 */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 2,
          py: 0.75,
          bgcolor: "background.paper",
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <CodeIcon sx={{ fontSize: 15, color: "primary.main", flexShrink: 0 }} />
        <Typography
          variant="body2"
          fontWeight={600}
          noWrap
          sx={{ flex: 1, fontFamily: "var(--mui-fontFamilies-monospace)", fontSize: "0.8rem" }}
          title={path}
        >
          {path || ""}
        </Typography>
        {data && !data.binary && (
          <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.62rem", flexShrink: 0 }}>
            {lineCount} 行 · {fmtBytes(data.size)}
          </Typography>
        )}
        <Tooltip title="关闭">
          <IconButton size="small" onClick={onClose} sx={{ color: "text.secondary" }}>
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* 代码区 */}
      <Box
        ref={codeRef}
        sx={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          bgcolor: "#0d1117",
        }}
      >
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : error ? (
          <Box sx={{ p: 3, textAlign: "center" }}>
            <Typography variant="body2" color="error.main">读取失败：{error}</Typography>
          </Box>
        ) : data && data.binary ? (
          <Box sx={{ p: 3, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              二进制文件（{fmtBytes(data.size)}），无法预览
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: "flex", minWidth: "max-content", fontFamily: "var(--mui-fontFamilies-monospace)" }}>
            {/* 行号列 */}
            <Box
              component="span"
              aria-hidden
              sx={{
                userSelect: "none",
                flexShrink: 0,
                textAlign: "right",
                px: 1.5,
                py: "14px",
                borderRight: "1px solid rgba(247,247,242,0.08)",
                color: "#484f58",
                fontSize: "13px",
                lineHeight: "1.625",
                width: gutterWidth(lineCount),
                minWidth: gutterWidth(lineCount),
              }}
            >
              {Array.from({ length: lineCount }, (_, i) => (
                <Box key={i} component="span" sx={{ display: "block" }}>
                  {i + 1}
                </Box>
              ))}
            </Box>
            {/* 高亮代码 */}
            <Box
              component="pre"
              sx={{
                m: 0,
                p: "14px 16px",
                fontSize: "13px",
                lineHeight: "1.625",
                fontFamily: "var(--mui-fontFamilies-monospace)",
                color: "#e6edf3",
                "& code.hljs": { background: "transparent", padding: 0, fontFamily: "inherit" },
              }}
            >
              <code className="hljs" dangerouslySetInnerHTML={{ __html: highlighted }} />
            </Box>
          </Box>
        )}

        {/* 框选工具条 */}
        {sel && (
          <Box
            sx={{
              position: "absolute",
              left: sel.x,
              top: sel.y + 6,
              zIndex: 50,
              transform: "translateX(-50%)",
            }}
          >
            <Button
              size="small"
              variant="contained"
              onClick={addSelection}
              startIcon={<AddToInputIcon sx={{ fontSize: 14 }} />}
              sx={{
                borderRadius: "8px",
                textTransform: "none",
                fontWeight: 600,
                fontSize: "0.72rem",
                boxShadow: 3,
                whiteSpace: "nowrap",
              }}
            >
              添加到输入框
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
}
