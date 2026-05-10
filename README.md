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
*   **文档分析**：可上传 PDF/TXT/MD 文档，当前 PDF 解析仍基于 `pdf-parse`，高级版面解析属于后续 P2 任务。
*   **本地会话库**：历史会话保存在 Electron `userData/data/neuro_data.db` 的 SQLite 数据库中。
*   **配置诊断**：设置保存到 Electron `userData/data/settings.json`，设置页提供“测试连接”按钮，用于区分 API Key 缺失、HTTP 认证/模型错误和网络错误。

### 7. 当前试用版边界

当前版本可用于医生内部试用基础聊天、文档纯文本分析、PubMed/可信医学域名检索和本地历史会话保存。

暂未纳入本试用版：
*   高级 PDF 版面/表格解析。
*   长文献本地 RAG。
*   PMC 开放全文抓取。
*   多文献 Meta-analysis 自动制表。
*   影像/DICOM 多模态能力。

以上内容作为下一版增强项推进。

### 8. 验证命令

```bash
npm test
npm run lint:frontend
npm run build:frontend
```
