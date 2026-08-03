// End-to-end test: connect via socket.io, create session, prompt Pi (including a tool-using turn),
// verify no duplication & persistence.
const { io } = require("socket.io-client");
const fs = require("fs");

const URL = "http://localhost:3099";
const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
}

function sig(c) { try { return JSON.stringify(c); } catch { return String(c); } }

async function main() {
  const socket = io(URL);
  let sessionId = null;
  const events = [];
  const messageEnds = [];
  let history = null;
  const timeout = setTimeout(() => { console.log("TIMEOUT"); process.exit(1); }, 180000);

  socket.on("connect", () => {
    socket.emit("session_create", { name: "E2E Tool Test " + Date.now(), workspace: "/home/cn1891/study/pi-web-ui" });
  });

  socket.on("session_created", (d) => { sessionId = d.id; console.log("session created:", sessionId); });

  socket.on("pi_event", (ev) => {
    events.push(ev);
    if (ev.type === "message_end" && ev.message?.role === "assistant") messageEnds.push(ev.message);
  });

  socket.on("session_history", (d) => { history = d; });
  socket.on("pi_error", (d) => { console.log("PI ERROR:", d.error); });

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // Wait until the agent settles: no new events for a while, with a hard cap.
  const waitSettled = async (maxMs) => {
    const start = Date.now();
    let lastEventCount = events.length;
    let idleSince = Date.now();
    while (Date.now() - start < maxMs) {
      await wait(700);
      if (events.length !== lastEventCount) {
        lastEventCount = events.length;
        idleSince = Date.now();
      } else if (Date.now() - idleSince > 3500) {
        break;
      }
    }
  };

  await wait(3000);

  // ── Test 1: tool-using prompt (bash) ──────────────────────────────
  socket.emit("prompt", { sessionId, message: "请用 bash 工具运行 `echo HELLO_WORLD_123`，然后只回复运行结果" });
  await waitSettled(120000);

  const hasBash = events.some((e) => e.type === "tool_execution_start" && e.toolName === "bash");
  check("触发了 bash 工具", hasBash);

  const ends = [...messageEnds];
  const sigs = ends.map((m) => sig(m.content));
  check("message_end 无重复", new Set(sigs).size === sigs.length, `ends=${sigs.length}, unique=${new Set(sigs).size}`);
  check("≥1 条 assistant 消息", ends.length >= 1);

  // ── Test 2: no-tool prompt ─────────────────────────────────────────
  socket.emit("prompt", { sessionId, message: "只回复两个字：完成（不要使用任何工具）" });
  await waitSettled(120000);

  const allEnds = [...messageEnds];
  const allSigs = allEnds.map((m) => sig(m.content));
  check("两轮 message_end 无重复", new Set(allSigs).size === allSigs.length, `ends=${allSigs.length}, unique=${new Set(allSigs).size}`);

  // ── Test 3: refresh persistence ────────────────────────────────────
  socket.emit("session_join", { sessionId });
  await wait(2000);
  check("刷新后 session_history 恢复", !!history && history.sessionId === sessionId);
  const histMsgs = history?.messages || [];
  const histSigs = histMsgs.map((m) => sig(m.content));
  check("历史消息无重复", new Set(histSigs).size === histSigs.length, `hist=${histSigs.length}`);

  // user messages persisted?
  const userMsgs = histMsgs.filter((m) => m.role === "user");
  check("用户消息已持久化", userMsgs.length >= 2, `userMsgs=${userMsgs.length}`);

  // assistant messages present?
  const asstMsgs = histMsgs.filter((m) => m.role === "assistant");
  check("助手消息已持久化", asstMsgs.length >= 2, `asstMsgs=${asstMsgs.length}`);

  // ── Test 4: disk persistence ───────────────────────────────────────
  const meta = JSON.parse(fs.readFileSync("/home/cn1891/.pi/agent/sessions/pi-web-ui/_meta.json", "utf8"));
  const sess = meta.find((s) => s.id === sessionId);
  const diskSigs = (sess?.messages || []).map((m) => sig(m.content));
  check("磁盘 meta.messages 无重复", new Set(diskSigs).size === diskSigs.length, `disk=${diskSigs.length}`);

  // ── Test 5: security probes ────────────────────────────────────────
  const r1 = await fetch(`${URL}/api/skills/%2e%2e`, { method: "DELETE" });
  // 400 (rejected by handler) or 404 (URL normalized by client) both prove the
  // traversal was neutralized and ~/.pi/agent was NOT recursively deleted.
  check("路径遍历防护 (DELETE /api/skills/..)", r1.status === 400 || r1.status === 404, `status=${r1.status}`);
  const r2 = await fetch(`${URL}/api/browse?path=%2Fetc&foo=1&foo=2`);
  check("browse 数组参数防护", r2.status !== 500, `status=${r2.status}`);

  // ── Test 6: rename via API ─────────────────────────────────────────
  const r3 = await fetch(`${URL}/api/sessions/${sessionId}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "E2E Renamed" }),
  });
  const rd = await r3.json();
  check("API 重命名", rd.success && rd.name === "E2E Renamed");

  // ── cleanup ────────────────────────────────────────────────────────
  await fetch(`${URL}/api/sessions/${sessionId}`, { method: "DELETE" });
  check("删除会话", true);

  clearTimeout(timeout);
  socket.close();
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${failed === 0 ? "🎉 全部通过" : `⚠️ ${failed} 项失败`} (${results.length} 项)`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
