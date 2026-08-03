// Step 3: verify a session created before a server restart is restored
const { io } = require("socket.io-client");
const fs = require("fs");

const URL = "http://127.0.0.1:3099";
const sid = fs.readFileSync(process.argv[2] || "/tmp/restart-test-sid.txt", "utf8").trim();
let passed = 0, failed = 0;
const check = (n, c, d) => { c ? (passed++, console.log(`✅ ${n}${d ? " — " + d : ""}`)) : (failed++, console.log(`❌ ${n}${d ? " — " + d : ""}`)); };

async function main() {
  const list = await (await fetch(`${URL}/api/sessions`)).json();
  const sess = list.find((x) => x.id === sid);
  check("重启后会话已恢复", !!sess, sess ? sess.name : "missing");
  check("消息计数恢复", sess && sess.messageCount >= 2, sess ? `count=${sess.messageCount}` : "-");

  const s = io(URL);
  await new Promise((res) => s.on("connect", res));
  const history = await new Promise((res) => {
    s.on("session_history", res);
    s.emit("session_join", { sessionId: sid });
  });
  const msgs = history?.messages || [];
  check("历史消息恢复", msgs.length >= 2, `msgs=${msgs.length}`);
  check("包含用户消息", msgs.some((m) => m.role === "user" && String(m.content).includes("持久化测试")));
  check("包含助手回复", msgs.some((m) => m.role === "assistant"));
  const userText = msgs.filter((m) => m.role === "user").map((m) => m.content).join("|");
  check("用户消息去重 (仅1条)", msgs.filter((m) => m.role === "user").length === 1, userText);

  // cleanup
  await fetch(`${URL}/api/sessions/${sid}`, { method: "DELETE" });
  s.close();
  console.log(`\n${failed === 0 ? "🎉 全部通过" : `⚠️ ${failed} 项失败`} (${passed + failed} 项)`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
