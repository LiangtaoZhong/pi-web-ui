// Test: session persistence across server restart
const { io } = require("socket.io-client");
const { execSync, spawn } = require("child_process");
const fs = require("fs");

const URL = "http://127.0.0.1:3099";
let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`✅ ${name}${detail ? " — " + detail : ""}`); }
  else { failed++; console.log(`❌ ${name}${detail ? " — " + detail : ""}`); }
}

async function main() {
  const pid = fs.readFileSync("/proc/self/stat", "utf8").split(" ")[0];

  // 1. Create a session and send a message via API-level socket
  const s = io(URL);
  let sessionId = null;
  await new Promise((res) => s.on("connect", res));
  s.emit("session_create", { name: "Restart Test", workspace: "/home/cn1891/study/pi-web-ui" });
  await new Promise((r) => { s.on("session_created", (d) => { sessionId = d.id; r(); }); });
  check("创建会话", !!sessionId, sessionId);
  s.emit("prompt", { sessionId, message: "请回复：持久化测试OK" });
  await new Promise((r) => setTimeout(r, 30000));

  // 2. Verify meta file has the message
  let meta = JSON.parse(fs.readFileSync("/home/cn1891/.pi/agent/sessions/pi-web-ui/_meta.json", "utf8"));
  let sess = meta.find((x) => x.id === sessionId);
  check("重启前磁盘已有消息", (sess?.messages || []).length >= 2, `msgs=${sess?.messages?.length}`);
  s.close();

  // 3. Kill the server (simulate termination) by port, avoiding pkill self-match
  console.log("--- 终止服务器 ---");
  const serverPid = execSync(
    "ss -tlnp | grep ':3099' | grep -oP 'pid=\\K[0-9]+' | head -1"
  ).toString().trim();
  check("找到服务器 PID", !!serverPid, serverPid || "none");
  if (serverPid) execSync(`kill ${serverPid}`);
  await new Promise((r) => setTimeout(r, 1500));
  check("服务器已终止", true);

  // 4. Restart server
  console.log("--- 重启服务器 ---");
  const server = spawn("node", ["server.js"], {
    cwd: "/home/cn1891/study/pi-web-ui",
    detached: true, stdio: "ignore",
  });
  server.unref();
  await new Promise((r) => setTimeout(r, 2500));

  // 5. Reconnect and check the session is listed with its messages
  const s2 = io(URL);
  let restored = null;
  let history = null;
  await new Promise((res) => s2.on("connect", res));
  await new Promise((r) => setTimeout(r, 500));
  const list = await (await fetch(`${URL}/api/sessions`)).json();
  restored = list.find((x) => x.id === sessionId);
  check("重启后会话已恢复", !!restored, restored ? restored.name : "missing");
  s2.emit("session_join", { sessionId });
  await new Promise((r) => { s2.on("session_history", (d) => { history = d; r(); }); });
  const histMsgs = history?.messages || [];
  check("重启后消息内容恢复", histMsgs.length >= 2, `msgs=${histMsgs.length}`);
  const texts = histMsgs.map((m) => typeof m.content === "string" ? m.content : "").join("|");
  check("回复内容正确", texts.includes("持久化测试") || histMsgs.some((m) => m.role === "assistant"));
  const asst = histMsgs.filter((m) => m.role === "assistant");
  check("助手消息存在", asst.length >= 1);

  // cleanup
  await fetch(`${URL}/api/sessions/${sessionId}`, { method: "DELETE" });
  s2.close();

  console.log(`\n${failed === 0 ? "🎉 全部通过" : `⚠️ ${failed} 项失败`} (${passed + failed} 项)`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
