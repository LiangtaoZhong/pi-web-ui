import { useState, useEffect, useRef, useMemo, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import { Box, Typography, IconButton, Tooltip, CircularProgress, Button } from "@mui/material";
import {
  Close as CloseIcon,
  InsertComment as AddToInputIcon,
  Code as CodeIcon,
} from "@mui/icons-material";
import hljs from "highlight.js";
import "highlight.js/styles/github.css";

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

// ── 代码面板：memo 隔离，setSel 重渲染时此面板完全不动，保证选区不丢失 ──
const CodePane = memo(function CodePane({ data, highlighted, lineCount }) {
  return (
    <Box sx={{ display: "flex", minWidth: "max-content", fontFamily: "var(--mui-fontFamilies-monospace)" }}>
      {/* 行号列 */}
      <Box
        component="span"
        aria-hidden
        sx={(theme) => {
          const dark = theme.palette.mode === "dark";
          return {
            userSelect: "none",
            flexShrink: 0,
            textAlign: "right",
            px: 1.5,
            py: "14px",
            borderRight: dark ? "1px solid rgba(247,247,242,0.1)" : "1px solid rgba(30,30,29,0.1)",
            color: dark ? "#6e6e68" : "#a8a8a1",
            fontSize: "13px",
            lineHeight: "1.625",
            width: gutterWidth(lineCount),
            minWidth: gutterWidth(lineCount),
          };
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
        sx={(theme) => {
          const dark = theme.palette.mode === "dark";
          return {
            m: 0,
            p: "14px 16px",
            fontSize: "13px",
            lineHeight: "1.625",
            fontFamily: "var(--mui-fontFamilies-monospace)",
            color: dark ? "#F7F7F2" : "#141413",
            "& code.hljs": {
              background: "transparent",
              padding: 0,
              fontFamily: "inherit",
              color: dark ? "#F7F7F2" : "#141413",
            },
          };
        }}
      >
        <code className="hljs" dangerouslySetInnerHTML={{ __html: highlighted }} />
      </Box>
    </Box>
  );
});

// ── 文件查看器 ──────────────────────────────────────────────────────────────
export default function FileViewer({ path, onClose, onAddToInput }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sel, setSel] = useState(null); // {x, y} 按钮位置（鼠标释放处）
  const selRef = useRef(null); // {x, y, text} 选中文本（不依赖易失的 DOM 选区）
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

  // ── 框选检测：document 级 mouseup（兼容框选时鼠标在容器外释放）──────
  const onMouseUp = useCallback((e) => {
    // 点击“添加到输入框”按钮自身时，不清理选区/状态
    if (e.target && e.target.closest && e.target.closest("[data-sel-toolbar]")) return;
    const selObj = window.getSelection();
    if (!selObj || selObj.isCollapsed) {
      selRef.current = null;
      setSel(null);
      return;
    }
    const text = selObj.toString();
    if (!text || text.trim().length === 0) {
      selRef.current = null;
      setSel(null);
      return;
    }
    const container = codeRef.current;
    if (!container || !container.contains(selObj.anchorNode)) {
      selRef.current = null;
      setSel(null);
      return;
    }
    // 记录选中文本 + 按钮位置 = 鼠标左键释放处（viewport 坐标）
    selRef.current = { x: e.clientX, y: e.clientY, text };
    setSel({ x: e.clientX, y: e.clientY });
  }, []);

  // 监听 document 的 mouseup，兼容框选时鼠标在容器外释放
  useEffect(() => {
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, [onMouseUp]);

  function addSelection() {
    const ref = selRef.current;
    if (ref && ref.text) onAddToInput(ref.text);
    selRef.current = null;
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

      {/* 代码区（背景跟随 Claude 亮/暗主题） */}
      <Box
        ref={codeRef}
        sx={(theme) => {
          const dark = theme.palette.mode === "dark";
          return {
            position: "relative",
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            bgcolor: dark ? "#1F1F1E" : "#FFFFFF",
            // 暗色下用 github-dark 色板覆盖高亮 token
            ...(dark && {
              "& .hljs-keyword, & .hljs-selector-tag, & .hljs-title, & .hljs-section": { color: "#ff7b72" },
              "& .hljs-string, & .hljs-attr, & .hljs-template-tag, & .hljs-regexp": { color: "#a5d6ff" },
              "& .hljs-comment, & .hljs-quote": { color: "#8b949e", fontStyle: "italic" },
              "& .hljs-number, & .hljs-literal, & .hljs-symbol, & .hljs-variable": { color: "#79c0ff" },
              "& .hljs-built_in, & .hljs-type, & .hljs-params": { color: "#ffa657" },
              "& .hljs-title.function_, & .hljs-function .hljs-title": { color: "#d2a8ff" },
              "& .hljs-meta, & .hljs-selector-class, & .hljs-selector-id": { color: "#79c0ff" },
              "& .hljs-doctag, & .hljs-name, & .hljs-attribute": { color: "#7ee787" },
              "& .hljs-emphasis": { fontStyle: "italic" },
              "& .hljs-strong": { fontWeight: 600 },
            }),
          };
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
          <CodePane data={data} highlighted={highlighted} lineCount={lineCount} />
        )}

        {/* 框选工具条：渲染到 document.body（portal），避免插入代码区 DOM 导致选区丢失；fixed 定位在鼠标释放处 */}
        {sel &&
          createPortal(
            <Box
              data-sel-toolbar
              sx={{
                position: "fixed",
                left: sel.x,
                top: sel.y + 10,
                zIndex: 9999,
                transform: "translateX(-50%)",
              }}
            >
              <Button
                size="small"
                variant="contained"
                onClick={addSelection}
                onMouseDown={(e) => e.preventDefault()}
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
            </Box>,
            document.body
          )}
      </Box>
    </Box>
  );
}
