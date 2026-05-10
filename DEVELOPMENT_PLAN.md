# 神经外科 AI 科研助手 - 标准化开发任务书 (Production-Ready 详细版)

## 📖 文档说明与工程规范
本文档为该应用从原型迈向生产级产品（Production-Ready）的**深度细化拆解方案**。
所有任务被拆分为**极小粒度、边界清晰、无上下文依赖**的 Task Cards。
**给开发团队的严格要求：**
1. **禁止跨卡片开发**：一人认领一张卡片，必须完全符合该卡片的“验收标准(DoD)”方可提交 PR。
2. **状态与UI彻底分离**：严禁在 UI 组件中直接发起网络请求，所有请求必须通过 Store -> IPC -> Main Process。
3. **主进程为王**：涉及到网络、文件读写、数据库存取的操作，必须全部放在 `main.js`（主进程），渲染进程仅负责展示。

---

## 📅 阶段一：前端工程化与底层架构重构 (P0)

### [Task-1.1] 现代前端框架与 TypeScript 初始化
*   **目标**：彻底告别 Vanilla JS 的面条式代码，建立规范的组件化前端工程。
*   **实现步骤**：
    1. 在根目录外通过 `npm create vite@latest frontend -- --template vue-ts` (或 react-ts) 创建前端子目录。
    2. 配置 `vite.config.ts`：将 `base` 设置为 `./`（以支持 Electron 的 `file://` 协议加载）。
    3. 配置 `vite.config.ts` 的 `build.outDir` 为 `../dist-frontend`。
    4. 调整根目录 `main.js`，让其在生产模式下加载 `dist-frontend/index.html`，开发模式下加载 Vite 本地服务 (如 `http://localhost:5173`)。
*   **验收标准**：
    *   [ ] 执行 `npm run dev` 能拉起带热更新 (HMR) 的 Electron 窗口。
    *   [ ] 生产环境打包后，双击运行正常显示首屏。

### [Task-1.2] 全局状态管理 (Pinia/Zustand) 接入
*   **目标**：消除当前 `app.js` 中泛滥的全局变量 (`settings`, `chats`, `currentChatId`, `isStreaming`)。
*   **实现步骤**：
    1. 建立 `src/store/settingStore.ts`：管理 `baseUrl`, `apiKey`, `model`, `reasoningEffort` 等。
    2. 建立 `src/store/chatStore.ts`：管理 `chats` 列表、`currentChatId`、当前对话的 `messages`。
    3. 建立 `src/store/uiStore.ts`：管理 `isStreaming`, `pendingFile`。
*   **验收标准**：
    *   [ ] 定义好所有的 TypeScript Interface (如 `ChatMessage`, `ChatSession`)。
    *   [ ] 所有的 UI 组件必须通过 Store 订阅数据变更，禁止组件间互相传参（Prop Drilling）。

---

## 📅 阶段二：安全性改造与主进程隔离 (P0)

### [Task-2.1] IPC (进程间通信) 接口定义与安全隔离
*   **目标**：前端（渲染进程）绝对禁止直接调用 `fetch` 访问外网 API，防止 API Key 在浏览器控制台被窃取。
*   **实现步骤**：
    1. 在 `preload.js` 暴露标准的 API：`window.electronAPI = { chat: (args)=>ipcRenderer.invoke('api:chat', args), searchTavily: ... }`。
    2. 在 `main.js` 新增 IPC Handlers，拦截 `api:chat`。
    3. 将原 `app.js` 中的 OpenAI SSE (Server-Sent Events) 请求逻辑、重试逻辑、Tavily/PubMed 请求逻辑全部迁移到 `main.js` 的独立模块中（如 `src-main/api.js`）。
*   **验收标准**：
    *   [ ] 前端按 F12 打开 Network 面板，发起对话时，抓不到任何对外网 (OpenAI/Tavily) 的 HTTP 请求。
    *   [ ] API Key 仅在 `main.js` 内存中流通，绝不传递给前端渲染。

---

## 📅 阶段三：SQLite 本地数据库重构 (P1)
*(重点提示：解决 `chats.json` 在数据量大时读写极慢、极易损坏的致命问题)*

### [Task-3.1] `better-sqlite3` 数据库初始化与表结构设计
*   **目标**：引入本地轻量级关系型数据库，实现支持海量对话的极速存储。
*   **实现步骤**：
    1. 在 `package.json` 安装 `better-sqlite3`。注意配置 Electron 构建以便正确编译 Native Node 模块。
    2. 在 `main.js` 初始化 SQLite 连接，数据库文件存放在 `app.getPath('userData') + '/data/neuro_assistant.db'`。
    3. 编写初始化 SQL 表脚本：
        *   `CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, title TEXT, created_at INTEGER, updated_at INTEGER)`
        *   `CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, chat_id TEXT, role TEXT, content TEXT, created_at INTEGER, FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE)`
*   **验收标准**：
    *   [ ] 应用启动时自动创建 `.db` 文件及对应的表。

### [Task-3.2] JSON 数据迁移与 SQLite CRUD 接口
*   **目标**：保证老用户无缝升级，并提供高效的读写接口。
*   **实现步骤**：
    1. 启动时检测是否存在旧的 `chats.json`。若存在且数据库为空，则解析 JSON 并通过 `INSERT` 批量写入数据库，随后将 `chats.json` 重命名为 `chats.json.bak`。
    2. 在主进程提供 IPC 接口：`db:getChats` (按更新时间倒序), `db:getMessagesByChatId`, `db:createChat`, `db:insertMessage`, `db:deleteChat`。
*   **验收标准**：
    *   [ ] 旧版本的历史聊天记录被完美继承。
    *   [ ] 发送单条消息时，只对 `messages` 表执行单次 `INSERT`，而不需要像以前那样把整个对话历史重新写一遍磁盘。

---

## 📅 阶段四：核心体验与防打断机制 (P1)

### [Task-4.1] 流式输出的智能滚动控制 (防打断防跳动体验)
*   **目标**：彻底解决当前大模型疯狂输出时，用户强制被拖拽到页面底部，无法往回阅读历史内容的严重体验问题。
*   **实现步骤**：
    1. 在 `uiStore` 新增状态 `isUserScrolling` (默认为 false)。
    2. 在消息列表容器 (`.messages-container`) 监听以下四个事件：
        *   `wheel` (鼠标滚轮)
        *   `touchstart` / `touchmove` (触摸板/触屏滑动)
        *   `mousedown` (用户拖拽滚动条)
        *   `keydown` (监听 ArrowUp, ArrowDown, PageUp, PageDown)
    3. **上锁逻辑**：如果在流式输出期间（`isStreaming == true`）触发了上述事件，且判断滚动方向为**向上**，立刻设置 `isUserScrolling = true`。
    4. **条件滚动逻辑**：在接收到主进程通过 `ipcRenderer.on('chat:delta')` 发来的新字符时，仅当 `!isUserScrolling` 时，才执行容器的 `$messages.scrollTop = $messages.scrollHeight`。
    5. **解锁逻辑**：监听容器的 `scroll` 事件，判断如果 `$messages.scrollTop + $messages.clientHeight >= $messages.scrollHeight - 20`（即用户手动滚回了最底部），自动将 `isUserScrolling` 重置为 `false`。
    6. **快捷 UI**：当 `isUserScrolling` 为 true 且在输出中，右下角淡入一个悬浮按钮（图标⬇️，“回到最新”）。点击后强制滚到底部并解锁。
*   **验收标准**：
    *   [ ] 流式输出千字长文时，用户只要向上一滑，页面就立刻定住不动，新文本在不可见的底部继续拼接。
    *   [ ] 点悬浮按钮，瞬间滚到底部并恢复跟踪。

### [Task-4.2] 生产级 Markdown 渲染与安全防护 (XSS)
*   **目标**：支持医学文献中极其常见的长表格、代码高亮，同时杜绝前端执行恶意脚本的可能。
*   **实现步骤**：
    1. 安装依赖：`markdown-it`, `highlight.js`, `dompurify`。
    2. 配置 `markdown-it` 支持 Github-flavored markdown (表格、任务列表)。
    3. 封装 `<MarkdownViewer :content="text" />` 组件。
    4. 渲染管线必须严格执行：`markdown-it(text) -> DOMPurify.sanitize(html) -> v-html`。
*   **验收标准**：
    *   [ ] 渲染多列宽表格时，具备横向滚动条而不撑破页面。
    *   [ ] 输入 `<script>alert('XSS')</script>` 等测试向量被完美清洗，不会弹出警告框。

### [Task-4.3] 医疗级视觉与可读性优化 (Theme & Contrast)
*   **目标**：解决医生群体在长时间（尤其是夜间值班时）盯屏幕产生的视觉疲劳，提高文字与背景的对比度和舒适度。
*   **实现步骤**：
    1. 引入 TailwindCSS (或 CSS Variables) 定义专业的色彩系统 (Design Tokens)。废弃当前过于生硬的对比度颜色。
    2. 设计 **Light Mode (日间模式)**：背景色使用柔和的医疗灰白 (如 `#F8FAFC` 或 `#F9FAFB`)，正文文本使用深灰 (如 `#334155` 或 `#1F2937`) 以降低刺眼感。
    3. 设计 **Dark Mode (夜间/阅片室模式)**：背景色使用深蓝灰 (如 `#0F172A`)，正文使用柔和浅色 (如 `#E2E8F0`)，契合医生在暗室阅片的习惯。
    4. 调整排版：行高 (Line Height) 提升至 `1.6` 到 `1.8`，增大正文基础字号 (如 `15px` 或 `16px`)，确保长时间阅读医学长文献时不累眼。
    5. 在设置中心或侧边栏提供快速的一键切换主题 (Light/Dark/System) 按钮，并将该配置持久化。
*   **验收标准**：
    *   [ ] 可以一键切换深色/浅色模式，且重新启动应用后能记住用户的选择。
    *   [ ] 设计配色通过 WCAG 2.1 AA 级对比度测试，确保在医疗器械屏幕或低亮度显示器下文字依然清晰舒适。

---

## 📅 阶段五：医学专属高级能力 (P2)

### [Task-5.1] 医学论文深度解析升级 (取代 pdf-parse)
*   **目标**：解决目前 `pdf-parse` 只能提取纯文本，遇到双栏论文或复杂数据表格时完全乱码的问题。
*   **实现步骤**：
    1. 彻底移除简陋的 `pdf-parse` 依赖。
    2. 接入支持版面分析 (Layout Analysis) 的现代解析方案。首选接入大模型时代的文档解析服务（如 LlamaParse 或阿里/百度的文档解析 API），次选使用带表格识别的本地库（如 Python 的 `pdfplumber` 或 Node 的 `pdf2json` 进行深度封装）。
    3. 解析后必须保留医学论文中极重要的表格结构，将其转化为 Markdown 表格（`| Header |` 格式）。
*   **验收标准**：
    *   [ ] 能够正确识别带边框或无边框的统计表格，LLM 能够准确回答出表内的精准数据而不产生幻觉。

### [Task-5.2] 长篇医学文献本地 RAG (文本切块检索)
*   **目标**：解决医学指南或论文超过几十页时，一次性传入超出 Token 限制，或模型对长上下文“遗忘”的问题。
*   **实现步骤**：
    1. 将 PDF 文本解析后，根据 `\n\n` 和标点符号，将其切分为 800-1000 字符的 Chunk，每块重叠 (Overlap) 150 字符。
    2. 当开启“文档分析”且文档字数 > 15000 时，不自动合并发送全量文本。
    3. 接收用户提问后，引入轻量纯 JS 版词频检索算法（如 `wink-bm25`）。计算用户问题与所有 Chunk 的 BM25 得分。
    4. 提取 Top 5 得分最高的 Chunk，拼接格式：`文档片段1: ...\n 文档片段2: ...`，附加在系统提示词后。
*   **验收标准**：
    *   [ ] 能够在一本数百页的《神经外科学指南》中，精准回答特定罕见病变的用药剂量，且绝不超 Token。

### [Task-5.2] PubMed Central (PMC) 开放全文抓取
*   **目标**：从“仅能阅读摘要”跃升为“真正能读懂全文的方法学与实验数据”。
*   **实现步骤**：
    1. 升级 `api:searchPubMed` 主进程逻辑。
    2. 在获取 NCBI `esearch` 返回的 PMID 后，调用 `efetch` API，通过 `retmode=xml&rettype=full` 尝试获取包含 PMCID 的全文。
    3. 编写简易 XML 解析逻辑，精准提取 `<sec sec-type="methods">` (方法) 和 `<sec sec-type="results">` (结果) 节点。
    4. 若有全文，优先将全文的方法与结果塞入 LLM 检索上下文。
*   **验收标准**：
    *   [ ] 对于开放获取 (Open Access) 论文，AI 能够回答出未在摘要中提及，但在全文图表或实验步骤中出现的细节。

### [Task-5.3] 批量文献解析与 Meta-Analysis 自动制表
*   **目标**：解决医生撰写综述或 Meta 分析时，手动从几十篇论文中提取数据的枯燥劳动。
*   **实现步骤**：
    1. 前端支持多文件拖拽上传（如一次性拖入 10-20 篇 PDF）。
    2. 主进程引入异步任务队列（Async Queue），逐一调用文档解析模块提取文本，避免内存溢出 (OOM) 和 API 速率限制。
    3. 设计一个专用的“结构化数据提取” Prompt，强制大模型以 JSON 格式输出每篇文献的：`样本量 (N)`, `干预措施`, `对照组`, `随访时长`, `主要结局指标 (Primary Outcome)`, `并发症率`, `P值` 等信息。
    4. 前端接收到各篇文献的 JSON 数据后，使用表格组件（如 Ag-Grid 或简单的 Table）渲染为一个可横向拖拽的文献对比大表。
    5. 增加“导出为 CSV/Excel”的按钮，方便医生下载后直接用于 SPSS 或 R 语言的进一步统计。
*   **验收标准**：
    *   [ ] 能够同时拖入多篇 PDF 论文，界面有清晰的单个文件处理进度条。
    *   [ ] 最终能稳定生成多文献横向对比表格，并且可以一键导出 `.csv` 文件。

---

## 📅 阶段六：终极蓝图：智能工作流与多模态扩展 (P3 商业化优先)
*(注：本阶段为中长期发展规划，将工具升级为“科室级”生产力平台)*

### [Task-6.1] 影像学多模态辅助 (Vision)
*   **目标**：支持上传 MRI、CT 影像截图或 DICOM 文件片段，进行初步的读片辅助分析。
*   **实现步骤**：前端增加图片上传支持，接入 GPT-4o Vision 或专用的医学影像大模型接口，返回病灶位置提示或影像学特征描述。

### [Task-6.2] 本地文献库无缝集成
*   **目标**：打破软件孤岛，直接联动医生现有的文献管理工具。
*   **实现步骤**：在主进程编写解析脚本，直接读取本地 Zotero 或 EndNote 的 SQLite 数据库文件，实现在软件侧边栏直接检索、导入和对话。

### [Task-6.3] 临床病历自动化脱敏与结构化
*   **目标**：解决医生撰写科研病历的耗时痛点，保障患者隐私。
*   **实现步骤**：
    1. 在前端输入框支持粘贴大段杂乱的 HIS 电子病历。
    2. 在发送给云端 LLM 前，通过本地的正则表达式或轻量级本地模型，自动替换掉患者姓名、电话、身份证号等敏感信息（替换为 `[脱敏姓名]`, `[脱敏ID]`）。
    3. 调用大模型将其标准化为：主诉、现病史、既往史、体格检查、辅助检查。

### [Task-6.4] 可视化 Agent 临床工作流
*   **目标**：将常用的多步思考过程固化为一键触发的流水线。
*   **实现步骤**：提供一个“工作流编辑器”。例如“撰写罕见病病例报告”，系统自动依次执行：1. 提取当前病历特征 -> 2. 自动触发 PubMed 搜寻过去 5 年同类病例 -> 3. 自动生成包含 Literature Review 的完整 Draft。

### [Task-6.5] 账号体系与云同步机制
*   **目标**：防止电脑重装导致数据丢失，为跨设备使用和收费服务铺垫。
*   **实现步骤**：引入简单的 JWT 鉴权体系和云端同步 API，定时将本地的 SQLite 数据差量备份至云端。
