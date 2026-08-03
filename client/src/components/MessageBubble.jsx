import { memo, useState } from "react";
import {
  Box,
  Paper,
  Typography,
  CircularProgress,
} from "@mui/material";
import {
  ExpandMore as ExpandIcon,
  Psychology as ThinkIcon,
  Error as ErrorIcon,
  CheckCircle as DoneIcon,
} from "@mui/icons-material";
import Markdown from "./Markdown";

// ── 思考过程：紧凑单行细条，点击展开 ────────────────────────────────
function ThinkingBlock({ blk, active }) {
  const [open, setOpen] = useState(false);
  return (
    <Box sx={{ my: 0.5 }}>
      <Box
        component="button"
        onClick={() => setOpen(!open)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          width: "100%",
          px: 1,
          py: 0.3,
          borderRadius: 1,
          cursor: "pointer",
          bgcolor: "action.hover",
          border: 1,
          borderColor: "divider",
          fontFamily: "inherit",
          fontSize: "0.7rem",
          color: "text.disabled",
          textAlign: "left",
          ...(active && {
            animation: "thinkPulse 1.8s ease-in-out infinite",
            "@keyframes thinkPulse": {
              "0%,100%": { opacity: 1 },
              "50%": { opacity: 0.5 },
            },
          }),
        }}
      >
        {active ? (
          <CircularProgress size={11} thickness={5} sx={{ color: "text.disabled", flexShrink: 0 }} />
        ) : (
          <ThinkIcon sx={{ fontSize: 13, color: "text.disabled", flexShrink: 0 }} />
        )}
        <Typography variant="caption" sx={{ fontSize: "0.65rem", color: "text.disabled" }}>
          思考过程
        </Typography>
        <Box sx={{ flex: 1 }} />
        <ExpandIcon
          sx={{
            fontSize: 14,
            color: "text.disabled",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform .2s",
          }}
        />
      </Box>
      {open && (
        <Box
          sx={{
            mt: 0.5,
            px: 1.5,
            py: 0.75,
            bgcolor: "action.hover",
            border: 1,
            borderColor: "divider",
            borderRadius: 1,
            maxHeight: 260,
            overflow: "auto",
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ whiteSpace: "pre-wrap", fontSize: "0.7rem", opacity: 0.75, lineHeight: 1.6 }}
          >
            {blk.thinking || ""}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

// ── 工具调用（bash 等）：紧凑单行工具条，点击展开详情 ───────────────
function ToolCallBlock({ blk }) {
  const [open, setOpen] = useState(false);
  const isErr = blk.isError;
  const isRunning = blk.executing;
  const args = blk.arguments;
  const cmd =
    args && typeof args === "object" && !Array.isArray(args) ? args.command : "";
  const label = cmd ? `$ ${cmd}` : (blk.name || "tool");
  const argsStr = args
    ? typeof args === "string"
      ? args
      : JSON.stringify(args, null, 2)
    : "";
  const resultStr =
    typeof blk.result === "string"
      ? blk.result
      : blk.result
        ? JSON.stringify(blk.result, null, 2)
        : "";

  const statusColor = isErr ? "error.main" : isRunning ? "primary.main" : "success.main";
  const statusText = isErr ? "失败" : isRunning ? "运行中" : "完成";

  return (
    <Box sx={{ my: 0.5 }}>
      <Box
        component="button"
        onClick={() => setOpen(!open)}
        sx={(theme) => {
          const dark = theme.palette.mode === "dark";
          return {
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            width: "100%",
            px: 1,
            py: 0.3,
            borderRadius: 1,
            cursor: "pointer",
            border: 1,
            fontFamily: "inherit",
            fontSize: "0.7rem",
            textAlign: "left",
            color: "text.primary",
            bgcolor: dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
            borderColor: isErr
              ? (dark ? "rgba(255,92,108,0.4)" : "rgba(230,69,85,0.4)")
              : isRunning
                ? (dark ? "rgba(108,140,255,0.5)" : "rgba(79,110,247,0.5)")
                : "divider",
            ...(isRunning && {
              animation: "toolPulse 1.6s ease-in-out infinite",
              "@keyframes toolPulse": {
                "0%,100%": {
                  borderColor: dark ? "rgba(108,140,255,0.3)" : "rgba(79,110,247,0.3)",
                },
                "50%": {
                  borderColor: dark ? "rgba(108,140,255,0.9)" : "rgba(79,110,247,0.9)",
                },
              },
            }),
          };
        }}
      >
        {isRunning ? (
          <CircularProgress size={11} thickness={5} sx={{ color: "primary.main", flexShrink: 0 }} />
        ) : isErr ? (
          <ErrorIcon sx={{ fontSize: 13, color: "error.main", flexShrink: 0 }} />
        ) : (
          <DoneIcon sx={{ fontSize: 13, color: "success.main", flexShrink: 0 }} />
        )}
        <Typography
          variant="caption"
          sx={{
            fontFamily: "'JetBrains Mono','Fira Code','SF Mono',monospace",
            fontSize: "0.7rem",
            fontWeight: 500,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            color: "text.primary",
          }}
        >
          {label}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Typography
          variant="caption"
          sx={{ fontSize: "0.62rem", color: statusColor, flexShrink: 0 }}
        >
          {statusText}
        </Typography>
        <ExpandIcon
          sx={{
            fontSize: 14,
            color: "text.disabled",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform .2s",
            flexShrink: 0,
          }}
        />
      </Box>

      {open && (
        <Box
          sx={{
            mt: 0.5,
            border: 1,
            borderColor: "divider",
            borderRadius: 1,
            overflow: "hidden",
          }}
        >
          {argsStr && (
            <Box sx={{ px: 1.5, py: 0.75, borderBottom: 1, borderColor: "divider" }}>
              <Typography
                variant="caption"
                sx={{
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  fontFamily: "'JetBrains Mono','Fira Code','SF Mono',monospace",
                  fontSize: "0.7rem",
                  color: "text.secondary",
                }}
              >
                {argsStr}
              </Typography>
            </Box>
          )}
          {resultStr && (
            <Box
              sx={(theme) => ({
                px: 1.5,
                py: 0.75,
                maxHeight: 240,
                overflow: "auto",
                bgcolor: theme.palette.mode === "dark" ? "#1a1d2e" : "grey.100",
              })}
            >
              <Typography
                variant="caption"
                sx={{
                  whiteSpace: "pre-wrap",
                  fontFamily: "'JetBrains Mono','Fira Code','SF Mono',monospace",
                  fontSize: "0.72rem",
                  lineHeight: 1.5,
                }}
              >
                {resultStr}
              </Typography>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

// ── 渲染内容块数组 (text / thinking / toolCall) ──────────────────────
function ContentBlocks({ content, isStreaming }) {
  if (!content) return null;
  if (typeof content === "string") return <Markdown text={content} />;
  if (!Array.isArray(content)) return null;

  const elements = [];
  let textBuffer = "";

  function flushText() {
    if (textBuffer.trim()) {
      elements.push(<Markdown key={`t-${elements.length}`} text={textBuffer} />);
      textBuffer = "";
    }
  }

  content.forEach((blk, i) => {
    if (blk.type === "text") {
      textBuffer += (textBuffer ? "\n\n" : "") + (blk.text || "");
    } else {
      flushText();
      if (blk.type === "thinking") {
        const active = isStreaming && i === content.length - 1;
        elements.push(<ThinkingBlock key={`think-${i}`} blk={blk} active={active} />);
      } else if (blk.type === "toolCall") {
        elements.push(<ToolCallBlock key={`tool-${i}`} blk={blk} />);
      }
    }
  });

  flushText();
  return <>{elements}</>;
}

const MessageBubble = memo(function MessageBubble({ msg }) {
  const isUser = msg.role === "user";
  const isStreaming = msg.streaming;

  // Claude-style: assistant messages flow full-width without a bubble;
  // user messages are right-aligned soft bubbles.
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        width: "100%",
        animation: "msgIn 0.25s ease",
        "@keyframes msgIn": {
          from: { opacity: 0, transform: "translateY(6px)" },
          to: { opacity: 1, transform: "translateY(0)" },
        },
      }}
    >
      {isUser ? (
        <Paper
          elevation={0}
          sx={{
            maxWidth: "88%",
            px: 1.5,
            py: 0.9,
            borderRadius: 3,
            bgcolor: "primary.main",
            color: "primary.contrastText",
            lineHeight: 1.7,
            fontSize: "0.875rem",
          }}
        >
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {typeof msg.content === "string" ? msg.content : ""}
          </Typography>
        </Paper>
      ) : (
        <Box
          sx={{
            width: "100%",
            fontSize: "0.925rem",
            lineHeight: 1.75,
            color: "text.primary",
            ...(isStreaming && {
              "& .bub-body": { borderLeft: 2, borderColor: "primary.main", pl: 1.5, ml: -1.5 },
            }),
          }}
        >
          <ContentBlocks content={msg.content} isStreaming={msg.streaming} />
        </Box>
      )}
    </Box>
  );
});

export default MessageBubble;
