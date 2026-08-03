import { memo, useRef, useEffect, useCallback } from "react";
import { parseMarkdown, escape } from "../utils/markdown";

// Render an array of content blocks (text, thinking, toolCall)
function renderBlocks(content) {
  if (!content) return "";
  if (typeof content === "string") return parseMarkdown(content);
  if (!Array.isArray(content)) return "";

  return content
    .map((blk, i) => {
      if (blk.type === "text") return parseMarkdown(blk.text || "");
      if (blk.type === "thinking") {
        return (
          '<details class="think" key="t' +
          i +
          '"><summary>🧠 思考过程</summary><div class="tc">' +
          escape(blk.thinking || "") +
          "</div></details>"
        );
      }
      if (blk.type === "toolCall") {
        const argsStr = blk.arguments
          ? typeof blk.arguments === "string"
            ? blk.arguments
            : JSON.stringify(blk.arguments, null, 2)
          : "";
        const hasRes = blk.result?.content;
        const resText = hasRes ? blk.result.content.map((c) => c.text || "").join("\n") : "";
        const isErr = blk.isError;
        return (
          '<details class="tool" key="tc' +
          i +
          '"' +
          (isErr ? " open" : "") +
          ">" +
          "<summary>" +
          (isErr ? "❌" : "✅") +
          " " +
          escape(blk.name || "tool") +
          "</summary>" +
          '<div class="tb">' +
          (argsStr ? '<div class="ta">' + escape(argsStr) + "</div>" : "") +
          (hasRes ? '<div class="tr">' + escape(resText) + "</div>" : "") +
          "</div></details>"
        );
      }
      return "";
    })
    .join("");
}

const MessageBubble = memo(function MessageBubble({ msg, isStreaming }) {
  const bodyRef = useRef(null);

  // For completed assistant messages, render full blocks
  const html =
    msg.role === "user"
      ? escape(typeof msg.content === "string" ? msg.content : "")
      : renderBlocks(msg.content);

  // Copy code button handler
  const handleClick = useCallback((e) => {
    const btn = e.target.closest(".copy-btn");
    if (!btn) return;
    const code = btn.parentElement?.querySelector("code");
    if (!code) return;
    navigator.clipboard.writeText(code.textContent).then(() => {
      btn.textContent = "已复制!";
      setTimeout(() => {
        btn.textContent = "复制";
      }, 1500);
    });
  }, []);

  useEffect(() => {
    if (!bodyRef.current) return;
    // Add copy buttons to code blocks
    bodyRef.current.querySelectorAll("pre code").forEach((code) => {
      const pre = code.parentElement;
      if (pre.querySelector(".copy-btn")) return;
      const btn = document.createElement("button");
      btn.className = "copy-btn";
      btn.textContent = "复制";
      pre.style.position = "relative";
      pre.appendChild(btn);
    });
  }, [html]);

  return (
    <div className={"msg " + msg.role + (isStreaming ? " streaming" : "")}>
      <div className="bub">
        {msg.role === "user" ? (
          html
        ) : (
          <div
            ref={bodyRef}
            className="bub-body"
            dangerouslySetInnerHTML={{ __html: html }}
            onClick={handleClick}
          />
        )}
      </div>
    </div>
  );
});

export default MessageBubble;
export { renderBlocks };
