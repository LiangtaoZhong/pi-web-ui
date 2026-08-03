# Pi Web UI

基于 **React 19 + Vite + Material UI 9** 的 [Pi Coding Agent](https://github.com/badlogic/pi-coding-agent) Web 聊天界面，后端为 Express + Socket.IO，通过 `pi --mode rpc` 子进程与 Pi 交互。

## ✨ 功能

- 💬 **AI 对话**：流式输出，支持 markdown / 富文本渲染（代码块高亮 + 一键复制、表格、任务列表）
- 🧠 **思考过程**：默认折叠、低调展示；思考中/执行工具时显示循环动画
- 🛠️ **工具调用**：bash 等工具调用折叠展示，带执行状态（运行中/成功/出错）与实时输出
- 📁 **工作区选择**：内置文件浏览器，随时切换会话工作区
- 📚 **会话管理**：创建、重命名、删除、切换会话
- 💾 **持久化**：消息实时落盘，页面刷新、服务器重启后均可恢复（含流式中间态）
- 🧩 **Skills & MCP 管理**：页面上直接安装/删除 Skill，增删 MCP 服务器（`~/.pi/agent/mcp.json`）
- 🎨 **明暗主题**：一键切换，自动记忆
- 🖼️ **图片支持**：Ctrl+V 粘贴图片随消息发送
- 🤖 **模型切换**：会话内直接切换可用模型

## 🚀 快速开始

```bash
npm install            # 安装后端依赖
cd client && npm install   # 安装前端依赖

# 生产模式（构建 + 启动）
npm start

# 开发模式（热更新）
# 终端 1: npm run dev:server   # Express + Socket.IO, http://localhost:3099
# 终端 2: npm run dev:client   # Vite dev server, http://localhost:5173 (代理到 3099)
```

默认监听 `http://127.0.0.1:3099`（仅本机）。如需对外暴露：`HOST=0.0.0.0 PORT=3099 npm start`。

> ⚠️ 安全提示：服务无鉴权，`prompt`/`steer` 可驱动 Pi 执行任意命令，请勿暴露到不受信任的网络。

## 🧪 测试

```bash
npm test   # 端到端测试：创建会话 → 真实对话（含 bash 工具）→ 验证无重复/持久化/安全防护
```

其他测试脚本见 `test/`（含服务器重启恢复验证）。

## 🗂️ 架构

```
server.js                  Express + Socket.IO 后端
├── Pi RPC 子进程管理       spawn pi --mode rpc，JSONL 事件转发
├── 会话持久化              ~/.pi/agent/sessions/pi-web-ui/_meta.json
├── REST API               /api/sessions, /api/browse, /api/skills, /api/mcp, /api/restart
└── WebSocket              会话/对话/模型控制事件
client/                    React 19 + Vite + MUI 9 前端
├── src/components/        Sidebar / ChatArea / MessageBubble / Markdown /
│                          FileBrowser / SkillsMcpDialog / Toast
└── 构建产物 → public/      由 server.js 直接托管
```

## 🔧 数据位置

| 数据 | 位置 |
|---|---|
| 会话元数据 + 消息 | `~/.pi/agent/sessions/pi-web-ui/_meta.json` |
| 会话文件（Pi 侧） | `~/.pi/agent/sessions/pi-web-ui/<workspace>/<id>.jsonl` |
| Skills | `~/.pi/agent/skills/` |
| MCP 配置 | `~/.pi/agent/mcp.json` |
