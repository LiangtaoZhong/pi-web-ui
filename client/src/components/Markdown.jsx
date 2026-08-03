import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Tooltip,
} from "@mui/material";
import {
  ContentCopy as CopyIcon,
  Check as CheckIcon,
} from "@mui/icons-material";

function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <Paper
      variant="outlined"
      sx={{
        position: "relative",
        my: 1,
        bgcolor: "grey.100",
        borderColor: "divider",
        "&:hover .code-copy": { opacity: 1 },
      }}
    >
      <Tooltip title={copied ? "已复制" : "复制"}>
        <IconButton
          className="code-copy"
          size="small"
          onClick={handleCopy}
          sx={{
            position: "absolute",
            top: 4,
            right: 4,
            opacity: 0,
            transition: "opacity .15s",
            bgcolor: "background.paper",
            "&:hover": { bgcolor: "action.hover" },
          }}
        >
          {copied ? (
            <CheckIcon sx={{ fontSize: 14, color: "success.main" }} />
          ) : (
            <CopyIcon sx={{ fontSize: 14 }} />
          )}
        </IconButton>
      </Tooltip>
      {language && (
        <Typography
          variant="caption"
          sx={{
            position: "absolute",
            top: 4,
            left: 8,
            color: "text.disabled",
            fontSize: "0.6rem",
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {language}
        </Typography>
      )}
      <Box
        component="pre"
        sx={{
          m: 0,
          px: 1.5,
          py: language ? 2.5 : 1.5,
          overflow: "auto",
          fontSize: "0.8rem",
          lineHeight: 1.5,
          "& code": {
            fontFamily: "'JetBrains Mono','Fira Code','SF Mono',monospace",
            background: "transparent",
            p: 0,
          },
        }}
      >
        <code>{code}</code>
      </Box>
    </Paper>
  );
}

const Markdown = memo(function Markdown({ text }) {
  return (
    <Box
      className="bub-body"
      sx={{
        "& h1, & h2, & h3": { mt: 1.2, mb: 0.4, fontWeight: 700, lineHeight: 1.3 },
        "& h1": { fontSize: "1.25em" },
        "& h2": { fontSize: "1.12em" },
        "& h3": { fontSize: "1.02em" },
        "& p": { m: 0, mb: 0.4, "&:last-child": { mb: 0 } },
        "& ul, & ol": { my: 0.4, pl: 2.2 },
        "& li": { my: 0.15 },
        "& li > p": { mb: 0 },
        "& a": { color: "primary.main" },
        "& blockquote": {
          borderLeft: 3,
          borderColor: "primary.main",
          pl: 1.5,
          pr: 1,
          py: 0.3,
          my: 0.8,
          color: "text.secondary",
          bgcolor: "action.hover",
          borderRadius: "0 4px 4px 0",
          "& p": { mb: 0 },
        },
        "& table": { borderCollapse: "collapse", width: "100%", my: 0.8, fontSize: "0.82rem" },
        "& th, & td": { border: 1, borderColor: "divider", px: 1, py: 0.4, textAlign: "left" },
        "& th": { bgcolor: "action.hover", fontWeight: 600 },
        "& tr:nth-of-type(2n)": { bgcolor: "action.hover" },
        "& hr": { border: "none", borderTop: 1, borderColor: "divider", my: 1.2 },
        "& code": {
          fontFamily: "'JetBrains Mono','Fira Code','SF Mono',monospace",
          fontSize: "0.78em",
          bgcolor: "action.hover",
          px: 0.4,
          py: 0.1,
          borderRadius: 0.5,
        },
        "& pre": { mb: 0 },
        "& pre code": { bgcolor: "transparent", px: 0, py: 0 },
        "& input[type=checkbox]": { mr: 0.5, accentColor: "primary.main" },
      }}
      components={{
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
      }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text || ""}</ReactMarkdown>
    </Box>
  );
});

export default Markdown;
