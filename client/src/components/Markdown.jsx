import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Box,
  IconButton,
  Tooltip,
} from "@mui/material";
import {
  ContentCopy as CopyIcon,
  Check as CheckIcon,
} from "@mui/icons-material";
import { fontMono, claudeTokens } from "../theme/tokens";

// ── Claude 风格代码块：白/灰 50% 底、细边框、8px 圆角、hover 显示复制 ──
function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <Box
      component="div"
      className="claude-code-block"
      sx={(theme) => {
        const dark = theme.palette.mode === "dark";
        return {
          position: "relative",
          my: 1.25,
          borderRadius: "8px",
          border: "1px solid",
          borderColor: dark ? "rgba(247,247,242,0.14)" : "rgba(30,30,29,0.15)",
          bgcolor: dark ? "rgba(247,247,242,0.05)" : "rgba(255,255,255,0.5)",
          overflow: "hidden",
          "&:hover .claude-code-copy": { opacity: 1 },
        };
      }}
    >
      <Tooltip title={copied ? "已复制" : "复制"}>
        <IconButton
          className="claude-code-copy"
          size="small"
          onClick={handleCopy}
          sx={{
            position: "absolute",
            top: 6,
            right: 6,
            opacity: 0,
            transition: "opacity .15s",
            bgcolor: "background.paper",
            borderRadius: "6px",
            "&:hover": { bgcolor: "action.hover" },
            zIndex: 1,
          }}
        >
          {copied ? (
            <CheckIcon sx={{ fontSize: 14, color: "success.main" }} />
          ) : (
            <CopyIcon sx={{ fontSize: 14 }} />
          )}
        </IconButton>
      </Tooltip>
      <Box
        component="pre"
        sx={{
          m: 0,
          p: "14px",
          overflow: "auto",
          fontSize: "14px",
          lineHeight: 1.625,
          fontFamily: fontMono,
          color: "text.primary",
          "& code": { fontFamily: "inherit", background: "transparent", p: 0, fontSize: "inherit" },
        }}
      >
        <code>{code}</code>
      </Box>
      {language && (
        <Box
          component="span"
          sx={{
            position: "absolute",
            top: 7,
            left: 12,
            color: "text.disabled",
            fontSize: "0.65rem",
            fontFamily: fontMono,
            letterSpacing: 0.3,
          }}
        >
          {language}
        </Box>
      )}
    </Box>
  );
}

const Markdown = memo(function Markdown({ text }) {
  const components = {
    code({ className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || "");
      const isBlock = className || String(children).includes("\n");
      const code = String(children).replace(/\n$/, "");
      if (isBlock) {
        return <CodeBlock language={match?.[1] || ""} code={code} />;
      }
      return <code {...props}>{children}</code>;
    },
    a({ href, children }) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    },
  };

  return (
    <Box
      className="bub-body"
      sx={(theme) => {
        const dark = theme.palette.mode === "dark";
        const strongBorder = dark ? "rgba(247,247,242,0.6)" : "rgba(30,30,29,0.6)";
        const weakBorder = dark ? "rgba(247,247,242,0.3)" : "rgba(30,30,29,0.3)";
        return {
          // 助手回复衬线正文
          fontFamily: '"Anthropic Serif", Georgia, "Songti SC", "Noto Serif SC", serif',
          fontSize: "16px",
          lineHeight: 1.5,
          "& a": { color: claudeTokens[dark ? "dark" : "light"].accent000 },
          "& p": { m: "0.4em 0", "&:first-child": { mt: 0 } },
          "& h1, & h2, & h3, & h4": {
            fontFamily: '"Anthropic Serif", Georgia, "Songti SC", "Noto Serif SC", serif',
            fontWeight: 600,
            lineHeight: 1.3,
            mt: "1em",
            mb: "0.35em",
          },
          "& h1": { fontSize: "1.5em" },
          "& h2": { fontSize: "1.25em" },
          "& h3": { fontSize: "1.1em" },
          "& h4": { fontSize: "1em" },
          "& ul, & ol": { my: "0.5em", pl: "1.5em" },
          "& li": { my: "0.15em", pl: "0.5em" },
          "& li::marker": { color: "text.secondary" },
          "& a": { color: claudeTokens[dark ? "dark" : "light"].accent000 },
          "& blockquote": {
            borderLeft: "2px solid",
            borderColor: "divider",
            pl: 1.25,
            pr: 1,
            py: 0.2,
            my: "0.75em",
            color: "text.secondary",
          },
          // 表格：Claude 现代分隔线风格（无竖线、无斑马纹）
          "& table": { borderCollapse: "collapse", width: "100%", my: "0.9em", fontSize: "0.875em" },
          "& th": {
            fontWeight: 600,
            textAlign: "left",
            p: "8px 16px 8px 0",
            borderBottom: `1px solid ${strongBorder}`,
            whiteSpace: "nowrap",
          },
          "& td": {
            p: "8px 16px 8px 0",
            borderBottom: `1px solid ${weakBorder}`,
            verticalAlign: "top",
          },
          "& tr:last-child td": { borderBottom: "none" },
          "& hr": { border: "none", borderTop: "1px solid", borderColor: "divider", my: "1.2em" },
          // 行内代码：灰底暗红字（Claude 风格）
          "& code": {
            fontFamily: fontMono,
            fontSize: "0.9em",
            bgcolor: dark ? "rgba(247,247,242,0.08)" : "rgba(30,30,29,0.05)",
            color: dark ? "hsl(0 98.4% 75.1%)" : "rgb(142, 38, 38)",
            px: "4px",
            py: "1px",
            borderRadius: "6.4px",
            whiteSpace: "pre-wrap",
          },
          "& pre": { mb: 0, "& code": { bgcolor: "transparent", px: 0, py: 0, color: "inherit" } },
          "& input[type=checkbox]": { mr: 0.5, accentColor: "primary.main" },
        };
      }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text || ""}
      </ReactMarkdown>
    </Box>
  );
});

export default Markdown;
