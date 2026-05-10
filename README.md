# Yunwu (Med AI Assistant)

## 安装与运行指南

### 1. 安装依赖

在项目根目录安装 Electron 主进程依赖，再安装前端依赖：
```bash
npm install
npm --prefix frontend install
```

### 2. 开发模式

一条命令启动 Vite + Electron：
```bash
npm run dev
```

开发模式下 Electron 会加载 `http://localhost:5173`，支持前端 HMR。

### 3. 本地启动生产前端

```bash
npm start
```

该命令会先执行 `npm run build:frontend`，再让 Electron 加载 `dist-frontend/index.html`。

### 4. 构建安装包

```bash
npm run build
```

构建完成后会在 `dist/` 下生成 Windows 安装包。

### 5. 配置
*   构建完成后，会生成一个 `.exe` 安装文件，双击进行自动安装。
*   打开应用后，会跳转到设置窗口（若未弹出，点击左下角的**设置**图标即可配置）。
*   填写以下配置并点击**保存**：
    *   **Base URL**: 中转站
    *   **API Key**: 你的模型服务 Key
    *   **Tavily 搜索 Key**: 可选；留空时联网搜索仅使用 PubMed。

### 6. 功能说明
*   **联网搜索**：如果需要使用联网搜索功能，请确保在工具栏中打开相应的工具。
*   **文档分析**：可单选或多选上传 PDF/TXT/MD 文档。PDF 会优先尝试调用本机 `docling` 进行高级 Markdown/表格解析；如果未安装、解析超时或失败，会自动回退到 `pdf-parse` 兼容解析，并在上传区显示明确提示。
*   **多文件队列**：一次选择多个文档时，上传区会显示每个文件的等待、解析中、完成、失败/回退状态，避免用户误以为软件卡住。
*   **长文档 RAG**：当上传文档较长时，会先在本地切块并检索最相关片段，再发送给模型，避免整篇文档超出上下文。
*   **本地会话库**：历史会话保存在 Electron `userData/data/neuro_data.db` 的 SQLite 数据库中。
*   **配置诊断**：设置保存到 Electron `userData/data/settings.json`，设置页提供“测试连接”按钮，用于区分 API Key 缺失、HTTP 认证/模型错误和网络错误。

#### 可选：安装 Docling 高级解析

Docling 是可选增强，不安装也能上传 PDF，只是会使用兼容解析。若要启用高级 PDF 版面和表格解析，请确保系统命令行可执行 `docling`：

```bash
pip install docling
docling --version
```

首次使用可能会下载本地解析模型，耗时取决于网络和机器性能。扫描件 OCR/VLM 高精度模式暂未默认启用。当前默认 Docling 等待时间为 30 秒，超时会自动回退到兼容解析；如需做离线验收，可设置 `YUNWU_DOCLING_TIMEOUT_MS=300000` 临时放宽到 5 分钟。

#### 文档解析评测

将真实医学 PDF 放入一个本地目录后，可以生成解析评测记录：

```bash
npm run eval:docs -- /path/to/pdf-folder
```

评测结果写入 `reports/document-eval/*.jsonl`，只保存解析器、耗时、警告、字符数、表格行数和文本预览，不保存全文。

### 7. 当前试用版边界

当前版本可用于医生内部试用基础聊天、文档纯文本分析、PubMed/可信医学域名检索和本地历史会话保存。

暂未纳入本试用版：
*   高级 PDF 版面/表格解析的真实医学论文样本验收。
*   长文献本地 RAG 的真实几百页指南样本验收。
*   PMC 开放全文抓取。
*   多文献 Meta-analysis 自动结构化提取与制表。
*   影像/DICOM 多模态能力。

以上内容作为下一版增强项推进。

### 8. 验证命令

```bash
npm test
npm run lint:frontend
npm run build:frontend
```
