// Step 1: create a session + send a message, print the session id for later steps
const { io } = require("socket.io-client");
const fs = require("fs");

const URL = "http://127.0.0.1:3099";
const s = io(URL);
let sessionId = null;
const outFile = process.argv[2] || "/tmp/restart-test-sid.txt";

s.on("connect", () => {
  s.emit("session_create", { name: "Restart Test", workspace: "/home/cn1891/study/pi-web-ui" });
});
s.on("session_created", (d) => {
  sessionId = d.id;
  s.emit("prompt", { sessionId, message: "请只回复：持久化测试OK（不要用工具）" });
});
s.on("pi_event", (ev) => {
  if (ev.type === "agent_settled") {
    setTimeout(() => {
      fs.writeFileSync(outFile, sessionId);
      console.log("SESSION_ID=" + sessionId);
      s.close();
      process.exit(0);
    }, 1000);
  }
});
s.on("pi_error", (d) => { console.error("ERR", d.error); process.exit(1); });
setTimeout(() => { console.error("TIMEOUT"); process.exit(1); }, 60000);
