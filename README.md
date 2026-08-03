# Pi Web UI

基于 **React 19 + Vite + Material UI 9** 的 [Pi Coding Agent](https://github.com/badlogic/pi-coding-agent) Web 聊天界面。后端为 Express + Socket.IO，通过 `pi --mode rpc` 子进程与 Pi 交互。UI 复刻 claude.ai 设计语言：Anthropic Sans / Serif / Mono 品牌字体、Claude 暖色板（亮/暗）、768px 居中阅读列、无气泡的衬线助手消息流、右对齐软气泡用户消息、底部圆角输入框。

## ✨ 功能

- 💬 **AI 对话**：流式输出，markdown / 富文本渲染（代码块 + 一键复制、表格、任务列表）
- 🎨 **Claude 设计系统**：Anthropic Sans/Serif/Mono 字体（自托管 woff2）、Claude 暖色板、768px 阅读列、分隔线风格表格、灰底代码块外壳
- 🧠 **思考过程**：默认折叠的紧凑细条；思考中 / 工具运行时显示循环动画
- 🛠️ **工具调用**：bash 等工具显示为单行工具条（图标 + `$ 命令` + 状态），点击展开参数与输出
- 📁 **工作区选择**：内置文件浏览器，输入框下方快捷切换工作区
- 🗂️ **可折叠侧边栏**：一键收起为窄图标条，会话列表 / 主题 / 新建 / 设置均可展开恢复
- 📁 **侧边栏文件浏览器**：以工作区为根浏览文件/文件夹，支持进入子目录、返回上级、刷新；折叠时也可切换
- 📄 **代码查看器**：点击文件在主界面展示代码（行号 + highlight.js 语法高亮 + 语言识别），下方输入框始终保持在最前
- ✂️ **框选代码**：在代码查看器中框选任意代码（选区高亮保持），浮动工具条显示在鼠标释放位置，一键“添加到输入框”（markdown 代码块）
- 🤖 **让 AI 读取**：右键文件/文件夹，后台通过 RPC bash 将内容注入上下文（下次发送时 AI 自动可读），输入框同步追加 `@路径` 引用直观反馈
- ⌨️ **输入框向上拉伸**：拖拽输入框顶部手柄向上拉升高度（双击还原），底部无多余下划线
- 🧭 **右侧提问导航**：圆角悬浮卡片，鼠标悬停展开历史提问列表，点击跳转对应消息
- 📚 **会话管理**：创建、重命名、删除、切换会话
- 💾 **持久化**：消息实时落盘，页面刷新 / 服务器重启均可恢复（含流式中间态）
- 📊 **上下文状态栏**：底部显示模型 + 上下文窗口占用进度条（百分比一位小数）
- 🧩 **Skills & MCP 管理**：统一设置入口，安装/删除 Skill、增删 MCP 服务器（`~/.pi/agent/mcp.json`）
- ⌨️ **斜杠命令**：输入 `/` 弹出命令面板（extension / skill / prompt 命令，如 `/mcp`、`/run`、`/chain`），支持 ↑↓ 键导航
- 🎨 **明暗主题**：Claude 风格暖色调，一键切换
- 🖼️ **图片支持**：Ctrl+V 粘贴图片随消息发送
- 🤖 **模型切换**：输入框右下角快速切换可用模型

## 🚀 部署

### 环境要求

- Node.js ≥ 18
- 已安装 [Pi Coding Agent](https://github.com/badlogic/pi-coding-agent)（`pi` 命令在 PATH 中）
- Pi 已配置模型凭据（`~/.pi/agent/auth.json`）与模型（`~/.pi/agent/models-store.json`）

### 安装与启动

```bash
git clone git@github.com:LiangtaoZhong/pi-web-ui.git
cd pi-web-ui

npm install                 # 后端依赖
cd client && npm install    # 前端依赖
cd ..

npm start                   # 构建前端 + 启动服务 → http://127.0.0.1:3099
```

> `npm start` 会先执行 `npm run build`（Vite 构建到 `public/`），再启动 Express 服务。
> 默认仅监听 `127.0.0.1`；如需对外暴露：`HOST=0.0.0.0 PORT=3099 npm start`。

### 开发模式（热更新）

```bash
# 终端 1：后端
npm run dev:server          # http://127.0.0.1:3099

# 终端 2：前端（Vite dev server，代理 API 与 WebSocket 到 3099）
npm run dev:client          # http://localhost:5173
```

### 测试

```bash
npm test                    # 端到端测试（需服务器运行 + 模型可用）
```

## 🔒 安全说明

- **API 凭据存储在仓库之外**：Pi 的密钥位于 `~/.pi/agent/auth.json`（已在 `.gitignore` 中排除，请勿提交任何密钥文件）。
- 服务**无鉴权**：`prompt` / `steer` / `extension_ui_response` 可驱动 Pi 执行任意命令，请勿将服务暴露到不受信任的网络。默认绑定 `127.0.0.1`。

## 🗂️ 架构

```
server.js                  Express + Socket.IO 后端
├── Pi RPC 子进程管理        spawn pi --mode rpc，JSONL 事件转发
├── 会话持久化              ~/.pi/agent/sessions/pi-web-ui/_meta.json
├── REST API               /api/sessions, /api/browse(文件+目录), /api/file(读文件),
│                          /api/skills, /api/mcp, /api/restart
└── WebSocket              会话 / 对话 / 模型 / 统计 / read_context(注入上下文)

client/                    React 19 + Vite + MUI 9 前端
├── src/components/        Sidebar(会话/文件 tab) / ChatArea / MessageBubble /
│                          Markdown / FileViewer(代码查看器) / FileBrowserSidebar /
│                          RightNav / FileBrowser / SettingsDialog / Toast
├── src/theme/tokens.js    Claude 设计 token（亮/暗色板、字体栈）
├── src/assets/fonts/      Anthropic Sans / Serif / Mono（自托管 woff2）
└── 构建产物 → public/      由 server.js 托管（不提交 git）
```

## 📦 数据位置

| 数据 | 位置 |
|---|---|
| 会话元数据 + 消息 | `~/.pi/agent/sessions/pi-web-ui/_meta.json` |
| 会话文件（Pi 侧） | `~/.pi/agent/sessions/pi-web-ui/<workspace>/<id>.jsonl` |
| Skills | `~/.pi/agent/skills/` |
| MCP 配置 | `~/.pi/agent/mcp.json` |
| 模型凭据（**勿提交**） | `~/.pi/agent/auth.json` |

## 📜 版本历史

- `v2.3.1` — 修复框选代码：选区高亮在鼠标释放后保持（代码面板 memo 隔离）；工具条 portal 渲染并定位在鼠标释放处；点击按钮可靠插入 markdown 代码块；@引用反馈替代 toast
- `v2.3.0` — 侧边栏文件浏览器（工作区根目录、进入/返回、右键菜单）；主界面代码查看器（行号 + highlight.js 高亮、亮/暗跟随 Claude 主题）；框选代码以 markdown 代码块一键添加到输入框；右键“让 AI 读取”通过 RPC bash 注入上下文，并在输入框追加 `@路径` 引用直观反馈
- `v2.2.1` — 侧边栏可折叠收起为窄条；输入框顶部手柄向上拉伸（双击还原）；右侧提问导航恢复为圆角悬浮卡片（悬停展开）；移除消息内联序号标签
- `v2.2.0` — 迁移 claude.ai 设计系统：Anthropic Sans/Serif/Mono 字体、Claude 暖色板（亮/暗）、768px 阅读列、用户软气泡 + 助手衬线无气泡、分隔线风格表格、灰色代码块外壳、圆角输入框
- `v2.1.0` — Claude 风格 UI、统一设置入口、模型切换在输入框、命令面板键盘导航
- `v2.0.0` — MUI 重构：聊天、工作区、会话 CRUD、持久化、markdown、Skills/MCP 管理
