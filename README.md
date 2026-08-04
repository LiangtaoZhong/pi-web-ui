# Pi Web UI

基于 **React 19 + Vite + Material UI** 的 [Pi Coding Agent](https://github.com/badlogic/pi-coding-agent) Web 界面。
后端 Express + Socket.IO，通过 `pi --mode rpc` 与 Pi 交互，UI 复刻 claude.ai 设计语言（亮/暗主题）。

## ✨ 主要功能

- 💬 **AI 对话**：流式输出、markdown 渲染、思考过程折叠、工具调用展示
- 📁 **文件浏览器**：侧边栏浏览工作区，代码查看器带行号 + 语法高亮
- ✂️ **框选代码**：一键以 markdown 代码块加入输入框
- 🤖 **让 AI 读取**：右键文件/文件夹注入上下文，输入框同步追加 `@路径` 引用
- 📚 **会话管理**：创建 / 重命名 / 删除 / 切换，消息持久化，刷新不丢失
- 🧩 **Skills & MCP 管理**、斜杠命令面板（`/mcp`、`/run`、`/chain`）
- 🖼️ **图片粘贴**、模型切换、明暗主题一键切换

## 🚀 构建与启动

环境要求：Node.js ≥ 18、`pi` 命令在 PATH 中、Pi 已配置模型凭据（`~/.pi/agent/auth.json`）。

```bash
git clone git@github.com:LiangtaoZhong/pi-web-ui.git
cd pi-web-ui

npm install                 # 后端依赖
cd client && npm install    # 前端依赖
cd ..
npm start                   # 构建前端 + 启动服务 → http://127.0.0.1:3099
```

> 默认仅监听 `127.0.0.1`；如需对外暴露：`HOST=0.0.0.0 PORT=3099 npm start`。

### 开发模式（热更新）

```bash
npm run dev:server          # 终端 1：后端 → http://127.0.0.1:3099
npm run dev:client          # 终端 2：前端 → http://localhost:5173
```

## 🔒 安全说明

服务**无鉴权**，`prompt` / `steer` 等接口可驱动 Pi 执行任意命令，请勿暴露到不受信任的网络。
Pi 密钥存储在仓库之外（`~/.pi/agent/auth.json`，已 gitignore）。

## 🗂️ 架构

```
server.js        Express + Socket.IO：Pi RPC 子进程、会话持久化、REST API、WebSocket
client/          React 19 + Vite + MUI：Sidebar / ChatArea / MessageBubble / Markdown /
                 FileViewer / FileBrowserSidebar / SettingsDialog 等组件
构建产物 → public/   由 server.js 托管（不提交 git）
```
