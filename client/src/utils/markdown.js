// Simple markdown-to-HTML (zero dependencies)
export function parseMarkdown(text) {
  if (!text) return "";
  let html = escape(text);

  // Fenced code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const escaped = escape(code.trim());
    return `<pre><code class="${lang}">${escaped}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  // Bold / italic
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  // Headers
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  // Blockquote
  html = html.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");
  // HR
  html = html.replace(/^---$/gm, "<hr>");
  // Lists
  html = html.replace(/^[\-\*] (.+)$/gm, "<li>$1</li>");
  html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  // Paragraphs
  html = html.replace(/\n\n+/g, "</p><p>");
  if (!/^<[hu]/.test(html) && !html.startsWith("<pre") && !html.startsWith("<blockquote")) {
    html = "<p>" + html + "</p>";
  }
  return html;
}

export function escape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
