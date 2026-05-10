# 神经外科 AI 科研助手 - 原子级任务看板 (Task Board)

本文档将宏观架构规划拆解为符合“单一职责原则（SRP）”、无依赖歧义、1-2天内可闭环的**原子级任务卡片（Task Cards）**。
建议开发期间严格按照阶段顺序推进，上一个卡片的 DoD (验收标准) 未全部打勾前，禁止开启下一卡片。

---

## 阶段一：前端工程化与全局状态 (P0)

### [Task-1.1.1] Vite+TS+React 基础脚手架搭建
- **Assignee**: (待认领)
- **依赖任务**: 无
- **涉及范围**: `根目录` (新增前端文件夹)
- **Action**:
  1. 运行 `npm create vite@latest frontend` 初始化项目。
  2. 清理多余的默认模板代码（Logo、Hello组件等）。
  3. 配置基础的 ESLint 和 Prettier。
- **DoD (验收标准)**:
  - [x] 终端进入 `frontend` 目录运行 `npm run dev`，浏览器能够打开白板页面，无控制台报错。
  - [x] 根目录运行 `npm run build:frontend` 可完成 TypeScript + Vite 构建。

### [Task-1.1.2] Electron 主进程路径适配与 Vite 集成
- **Assignee**: (待认领)
- **依赖任务**: Task-1.1.1
- **涉及范围**: `main.js`, `frontend/vite.config.ts`
- **Action**:
  1. 修改 `vite.config.ts` 的 `base` 为 `./`，输出目录指向根目录下的 `dist-frontend`。
  2. 修改 `main.js` 中的 `win.loadURL` 逻辑：根据环境变量（开发环境加载 `http://localhost:5173`，生产环境加载 `dist-frontend/index.html`）。
- **DoD**:
  - [x] 在根目录运行 `npm run dev` 可同时启动 Vite 与 Electron，Electron 加载 `http://localhost:5173`。
  - [x] 根目录运行 `npm start` 会先构建前端，再加载 `dist-frontend/index.html`。

### [Task-1.2.1] Pinia 基础配置与 SettingStore 迁移
- **Assignee**: (待认领)
- **依赖任务**: Task-1.1.2
- **涉及范围**: `frontend/src/store/settingStore.ts`, 设置面板相关组件
- **Action**:
  1. 安装 `pinia` (或 zustand) 并挂载。
  2. 创建 `settingStore.ts`，管理 `baseUrl`, `apiKey`, `model`, `theme` 等原先写在 `app.js` 的全局设置。
  3. 将设置持久化存储（存入 `localStorage` 或通过 IPC 存入主进程配置文件）。
- **DoD**:
  - [x] 修改设置项后，刷新页面数据不丢失。
  - [x] 所有需要读取 `apiKey` 等配置的地方均从 Store 获取。

### [Task-1.2.2] ChatStore 会话与消息状态迁移
- **Assignee**: (待认领)
- **依赖任务**: Task-1.2.1
- **涉及范围**: `frontend/src/store/chatStore.ts`, 侧边栏组件, 消息主视图组件
- **Action**:
  1. 创建 `chatStore.ts`，管理 `chats` (会话列表), `currentChatId`, `currentMessages`。
  2. 实现 `switchChat` 和 `addMessage` 的 Store Action。
  3. 侧边栏和主对话区完全依赖此 Store 渲染。
- **DoD**:
  - [x] 切换侧边栏的会话，主界面的聊天记录立刻响应切换，无延迟或数据混乱。

---

## 阶段二：安全性改造与主进程隔离 (P0)

### [Task-2.1.1] Preload IPC 接口标准化定义
- **Assignee**: (待认领)
- **依赖任务**: 阶段一完成
- **涉及范围**: `preload.js`, `frontend/src/types/env.d.ts`
- **Action**:
  1. 废弃原先随意暴露的 Node API。
  2. 严格定义 `window.electronAPI` 接口，包含 `chat`, `saveSettings`, `getSettings` 等。
  3. 为前端编写完整的 TypeScript 类型声明。
- **DoD**:
  - [x] 前端调用 `window.electronAPI` 时有完整的代码提示，且没有 TS 报错。

### [Task-2.1.2] 大模型请求 (OpenAI SSE) 迁移至主进程
- **Assignee**: (待认领)
- **依赖任务**: Task-2.1.1
- **涉及范围**: `main.js`, 原 `app.js` 网络请求部分
- **Action**:
  1. 将通过 `fetch` 发送的 OpenAI 接口调用彻底从前端移除。
  2. 在 `main.js` 监听 `ipcMain.handle('chat')`，在 Node 环境发起网络请求。
  3. 将 SSE 的数据流通过 `win.webContents.send('chat:delta', chunk)` 发送给前端。
- **DoD**:
  - [x] 发送对话能正常收到大模型回复。
  - [x] **安全红线**：前端浏览器 F12 网络面板中，**绝对抓不到**直接发往 OpenAI 的外网请求。
  - [x] 设置页提供主进程“测试连接”诊断，可区分 API Key 缺失、HTTP 错误和网络错误。

### [Task-2.1.3] 搜索工具 (Tavily/PubMed) 请求迁移
- **Assignee**: (待认领)
- **依赖任务**: Task-2.1.2
- **涉及范围**: `main.js`, `search.js`
- **Action**:
  1. 将外部搜索引擎的 API 请求全部迁移至主进程执行。
  2. 主进程将搜索结果格式化后，作为上下文拼接进给大模型的 Prompt 中。
- **DoD**:
  - [x] 触发联网搜索时，前端依然干净无外网请求，能获得包含最新网页资料的回答。

---

## 阶段三：SQLite 本地数据库重构 (P1)

### [Task-3.1.1] SQLite 基础集成与表结构初始化
- **Assignee**: (待认领)
- **依赖任务**: 阶段一完成
- **涉及范围**: `package.json`, `main.js` (或 `src-main/db.js`)
- **Action**:
  1. 安装并编译 `better-sqlite3`（处理 native binding）。
  2. 在应用 `userData` 目录下建立 `neuro_data.db`。
  3. 执行 `CREATE TABLE` 建表语句（chats 表和 messages 表）。
- **DoD**:
  - [x] 应用冷启动后，能在对应目录下找到 `.db` 文件，且可通过外部 SQLite 查看器确认表结构存在。

### [Task-3.1.2] JSON 数据自动化迁移脚本
- **Assignee**: (待认领)
- **依赖任务**: Task-3.1.1
- **涉及范围**: `src-main/db.js`
- **Action**:
  1. 应用启动时检查旧的 `chats.json` 是否存在且 `chats` 表为空。
  2. 编写脚本读取 JSON，循环 `INSERT` 进数据库，并维护好外键关系。
  3. 迁移完毕将 `chats.json` 重命名备份。
- **DoD**:
  - [x] 启动新版软件，老用户的历史会话完好无损地出现在 SQLite 中。

### [Task-3.1.3] 数据库 CRUD 的 IPC 桥接
- **Assignee**: (待认领)
- **依赖任务**: Task-3.1.2
- **涉及范围**: `main.js`, `frontend/src/store/chatStore.ts`
- **Action**:
  1. 主进程实现并暴露 `db:getChats`, `db:getMessages`, `db:saveMessage`。
  2. 前端 `ChatStore` 改为调用这些 IPC 接口获取和保存数据。
- **DoD**:
  - [x] 前端滚动历史会话列表，消息加载极速且无卡顿。发新消息只会单条 Insert，不再重写整个文件。

---

## 阶段四：核心体验与防打断机制 (P1)

### [Task-4.1.1] 流式输出的滚动锁定逻辑
- **Assignee**: (待认领)
- **依赖任务**: Task-2.1.2
- **涉及范围**: `frontend/src/components/ChatArea.tsx`
- **Action**:
  1. 监听容器的 `wheel`, `touchstart`, `keydown` 等事件。
  2. 如果在流式输出中（`isStreaming=true`）检测到向上滚动，触发锁死状态（停止自动 `$el.scrollTop = $el.scrollHeight`）。
  3. 用户手动滚到底部或点击“直达底部”悬浮按钮时，解除锁定。
- **DoD**:
  - [x] 大模型快速吐字时，用户鼠标往上滚查看刚才的内容，画面立刻定住，不会再被硬生生扯到底部。
  - [x] 提供“回到最新”悬浮按钮，点击后恢复自动跟随。
  - [ ] 仍需在真实 Electron 窗口中手测触摸板、键盘 PageUp/ArrowUp 和长回答场景。

### [Task-4.2.1] 生产级 Markdown 渲染器集成
- **Assignee**: (待认领)
- **依赖任务**: 阶段一完成
- **涉及范围**: `frontend/src/components/MarkdownViewer.tsx`, `frontend/package.json`, `frontend/src/index.css`
- **Action**:
  1. 安装 `markdown-it`, `dompurify`, `highlight.js`。
  2. 严格按 `text -> markdown-it -> dompurify -> html` 管道处理文本。
  3. 增加针对 Table 的 CSS：`overflow-x: auto; display: block;` 以支持医学长表横向滚动。
- **DoD**:
  - [x] 代码块有高亮。
  - [x] 复杂的横向大表格不会撑破页面的宽度。
  - [x] 输入 `<img src=x onerror=alert(1)>` 被 DOMPurify 管线过滤。
  - [x] 已补充自动化渲染/XSS 回归测试。

### [Task-4.3.1] 医疗级双主题 (Dark/Light) 适配
- **Assignee**: (待认领)
- **依赖任务**: Task-1.2.1
- **涉及范围**: 全局 CSS (Tailwind/CSS Variables)
- **Action**:
  1. 建立色彩系统的变量体系。
  2. 实现“阅片室深色模式（Dark）”：背景深蓝灰，字号适中，对比度不刺眼。
  3. 提供 UI 切换开关并存入 `SettingStore`。
- **DoD**:
  - [x] 一键切换 Light/Dark/System，页面颜色平滑过渡，重启应用通过 SettingStore 记住上次的主题选择。
  - [ ] 仍需做 WCAG 对比度抽样和真实长时间阅读走查。

---

## 阶段五：医学专属高级能力 (P2)

> **试用版策略**：阶段五暂不进入当前医生内部试用版，作为下一版增强项推进。当前试用版先覆盖基础聊天、文档纯文本分析、可信来源搜索、SQLite 历史会话和连接诊断。

### [Task-5.1.1] 废弃 pdf-parse 与高级解析引擎集成
- **Assignee**: Codex
- **涉及范围**: `main.js`, `src-main/documentParser.js`, `frontend/src/components/ChatArea.tsx`
- **Action**:
  1. [ ] 卸载 `pdf-parse`。（当前保留为兼容回退，避免医生电脑未安装 Docling 时上传功能不可用）
  2. [x] 接入新的解析引擎：优先调用本机 `docling` CLI 生成 Markdown，失败/超时自动回退到 `pdf-parse`。
  3. [x] 解析返回包含 Markdown、纯文本、解析器来源、回退来源和用户可读警告。
  4. [x] 前端上传时显示明确的解析中、自动回退、解析完成和发送前检索状态，避免用户误以为死机或无效。
- **DoD**:
  - [x] 已补充自动化测试覆盖 Docling Markdown 表格文本保留、Docling 不可用时回退、双解析失败报错和前端解析等待态。
  - [ ] 仍需安装 Docling 后用真实双栏医学论文手测：确认文本顺序和表格结构优于 `pdf-parse`。

### [Task-5.2.1] 本地轻量化 RAG (文本切块与检索)
- **Assignee**: Codex
- **依赖任务**: Task-5.1.1（高级 PDF 解析未完成；当前先对已有纯文本抽取结果启用本地 RAG）
- **涉及范围**: `main.js`, `src-main/rag.js`, `preload.js`, `frontend/src/components/ChatArea.tsx`
- **Action**:
  1. [x] 引入 `wink-bm25` 或相似 JS 本地检索算法。（当前采用零依赖 BM25-like scorer，避免增加打包体积和 native 风险）
  2. [x] 实现长文本分块算法（按段落/换行符切分为 ~1000 字符 chunk，带 overlap）。
  3. [x] 提问时对 chunks 进行得分排序，提取 Top 5 拼接进 Prompt。
- **DoD**:
  - [x] 已补充自动化测试覆盖长文本切块、中文/英文医学词检索、短文档全文模式和长文档 Top-K 片段模式。
  - [ ] 仍需用真实几百页指南手测：在有限 token 内精准找到用药剂量。

### [Task-5.3.1] [前端] 多文件拖拽与 Meta 分析交互界面
- **Assignee**: (待认领)
- **涉及范围**: `frontend/src/components/UploadArea.tsx`, `MetaTable.tsx`
- **Action**:
  1. 支持将多个 PDF 拖拽入解析区。
  2. 显示列队解析的进度条（如：`解析中 2/10...`）。

### [Task-5.3.2] [主进程] Meta 分析并发控制与结构化提取
- **Assignee**: (待认领)
- **依赖任务**: Task-5.3.1, Task-5.1.1
- **涉及范围**: `main.js`
- **Action**:
  1. 设置异步队列并发量控制（避免同时向模型发 20 个请求被封控）。
  2. 编写强格式的 System Prompt 要求 LLM 返回 JSON 格式（样本量, P值, 干预等）。
  3. 组装数据并返回前端。
- **DoD**:
  - [ ] 拖入 5 篇文献，稳定输出包含提取核心数据的横向对比大表，无内存溢出。

### [Task-5.3.3] 表格渲染与数据导出功能
- **Assignee**: (待认领)
- **依赖任务**: Task-5.3.2
- **涉及范围**: `frontend/src/components/MetaTable.tsx`
- **Action**:
  1. 使用表格组件将 JSON 渲染出来。
  2. 实现前端将 JSON 转换为 CSV Blob 并触发下载。
- **DoD**:
  - [ ] 点击“导出”，生成 `.csv` 并可用 Excel 打开。
