import { memo } from "react";
import {
  Box,
  Paper,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress,
} from "@mui/material";
import {
  ExpandMore as ExpandIcon,
  Psychology as ThinkIcon,
  Error as ErrorIcon,
  CheckCircle as DoneIcon,
} from "@mui/icons-material";
import Markdown from "./Markdown";

// Render content blocks array (text / thinking / toolCall)
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
        // Only the last thinking block of a live (streaming) message is "active"
        const thinkingActive = isStreaming && i === content.length - 1;
        elements.push(
          <Accordion
            key={`think-${i}`}
            disableGutters
            sx={{
              my: 0.5,
              bgcolor: "action.hover",
              border: 1,
              borderColor: "divider",
              "&:before": { display: "none" },
              boxShadow: 0,
              borderRadius: 1.5,
              ...(thinkingActive && {
                animation: "thinkPulse 1.8s ease-in-out infinite",
                "@keyframes thinkPulse": {
                  "0%,100%": { opacity: 1 },
                  "50%": { opacity: 0.55 },
                },
              }),
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandIcon sx={{ fontSize: 14, color: "text.disabled" }} />}
              sx={{ minHeight: 32, "& .MuiAccordionSummary-content": { my: 0.25 } }}
            >
              {thinkingActive ? (
                <CircularProgress size={12} thickness={5} sx={{ mr: 0.75, color: "text.disabled" }} />
              ) : (
                <ThinkIcon sx={{ fontSize: 13, mr: 0.5, color: "text.disabled" }} />
              )}
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.65rem" }}>
                思考过程
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0, pb: 1 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.6,
                  fontSize: "0.7rem",
                  opacity: 0.7,
                }}
              >
                {blk.thinking || ""}
              </Typography>
            </AccordionDetails>
          </Accordion>
        );
      } else if (blk.type === "toolCall") {
        const isErr = blk.isError;
        const isRunning = blk.executing;
        const argsStr = blk.arguments
          ? typeof blk.arguments === "string"
            ? blk.arguments
            : JSON.stringify(blk.arguments, null, 2)
          : "";

        // Theme-aware tool card styling
        const toolSx = (theme) => {
          const dark = theme.palette.mode === "dark";
          let bg, border;
          if (isErr) {
            bg = dark ? "rgba(255,92,108,0.1)" : "rgba(230,69,85,0.07)";
            border = dark ? "1px solid rgba(255,92,108,0.25)" : "1px solid rgba(230,69,85,0.25)";
          } else if (isRunning) {
            bg = dark ? "rgba(108,140,255,0.08)" : "rgba(79,110,247,0.07)";
            border = dark ? "1px solid rgba(108,140,255,0.35)" : "1px solid rgba(79,110,247,0.35)";
          } else {
            bg = dark ? "rgba(68,217,168,0.05)" : "rgba(46,175,125,0.05)";
            border = dark ? "1px solid rgba(68,217,168,0.15)" : "1px solid rgba(46,175,125,0.15)";
          }
          return {
            my: 0.5,
            borderRadius: 1.5,
            bgcolor: bg,
            border,
            "&:before": { display: "none" },
            boxShadow: 0,
            ...(isRunning && {
              animation: "toolPulse 1.6s ease-in-out infinite",
              "@keyframes toolPulse": {
                "0%,100%": { borderColor: dark ? "rgba(108,140,255,0.25)" : "rgba(79,110,247,0.25)" },
                "50%": { borderColor: dark ? "rgba(108,140,255,0.8)" : "rgba(79,110,247,0.8)" },
              },
            }),
          };
        };

        elements.push(
          <Accordion key={`tool-${i}`} disableGutters sx={toolSx}>
            <AccordionSummary expandIcon={<ExpandIcon sx={{ fontSize: 14 }} />}>
              {isRunning ? (
                <CircularProgress size={13} thickness={5} sx={{ mr: 0.75, color: "primary.main" }} />
              ) : isErr ? (
                <ErrorIcon sx={{ fontSize: 14, mr: 0.5, color: "error.main" }} />
              ) : (
                <DoneIcon sx={{ fontSize: 14, mr: 0.5, color: "success.main" }} />
              )}
              <Typography
                variant="caption"
                fontWeight={600}
                color={isErr ? "error.main" : isRunning ? "primary.main" : "success.main"}
              >
                {blk.name || "tool"}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              {argsStr && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    fontFamily: "'JetBrains Mono','Fira Code','SF Mono',monospace",
                    fontSize: "0.7rem",
                    mb: 0.5,
                    display: "block",
                  }}
                >
                  {argsStr}
                </Typography>
              )}
              {blk.result && (
                <Paper
                  variant="outlined"
                  sx={(theme) => ({
                    p: 1,
                    maxHeight: 220,
                    overflow: "auto",
                    bgcolor: theme.palette.mode === "dark" ? "#1a1d2e" : "grey.100",
                    borderColor: theme.palette.mode === "dark" ? "#2a2d3e" : "divider",
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
                    {typeof blk.result === "string"
                      ? blk.result
                      : JSON.stringify(blk.result, null, 2)}
                  </Typography>
                </Paper>
              )}
            </AccordionDetails>
          </Accordion>
        );
      }
    }
  });

  flushText();
  return <>{elements}</>;
}

const MessageBubble = memo(function MessageBubble({ msg }) {
  const isUser = msg.role === "user";
  const isStreaming = msg.streaming;

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        animation: "msgIn 0.25s ease",
        "@keyframes msgIn": {
          from: { opacity: 0, transform: "translateY(6px)" },
          to: { opacity: 1, transform: "translateY(0)" },
        },
      }}
    >
      <Paper
        variant="outlined"
        elevation={0}
        sx={{
          maxWidth: "86%",
          px: isUser ? 1.5 : 2,
          py: 1.2,
          borderRadius: isUser ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
          bgcolor: isUser ? "primary.main" : "background.paper",
          color: isUser ? "primary.contrastText" : "text.primary",
          borderColor: isStreaming ? "primary.main" : isUser ? "primary.main" : "divider",
          ...(isStreaming && {
            boxShadow: (theme) => `0 0 0 1px ${theme.palette.primary.main}`,
          }),
          lineHeight: 1.7,
          fontSize: "0.875rem",
          minWidth: 60,
        }}
      >
        {isUser ? (
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {typeof msg.content === "string" ? msg.content : ""}
          </Typography>
        ) : (
          <ContentBlocks content={msg.content} isStreaming={msg.streaming} />
        )}
      </Paper>
    </Box>
  );
});

export default MessageBubble;
