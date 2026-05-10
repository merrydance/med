import { APP_TITLE } from '../constants/app'

interface AboutPanelProps {
  onClose?: () => void
}

const governanceLinks = [
  {
    label: 'WHO LMM 医疗 AI 治理指导',
    href: 'https://www.who.int/news/item/18-01-2024-who-releases-ai-ethics-and-governance-guidance-for-large-multi-modal-models',
  },
  {
    label: 'PubMed Help：Automatic Term Mapping / MeSH 检索机制',
    href: 'https://pubmed.ncbi.nlm.nih.gov/help/',
  },
  {
    label: 'NCBI E-utilities / ESearch 文档',
    href: 'https://www.ncbi.nlm.nih.gov/books/NBK25499/',
  },
  {
    label: 'MeSH 医学主题词体系',
    href: 'https://www.ncbi.nlm.nih.gov/mesh',
  },
]

const openSourceCredits = [
  'Electron',
  'React',
  'Vite',
  'TypeScript',
  'Zustand',
  'better-sqlite3',
  'pdf-parse',
  'markdown-it',
  'DOMPurify',
  'highlight.js',
  'Vitest',
  'Testing Library',
  'ESLint',
]

export function AboutPanel({ onClose }: AboutPanelProps) {
  return (
    <div className="settings-overlay about-overlay">
      <div className="about-header">
        <h2 className="settings-title">关于{APP_TITLE}</h2>
        <button type="button" className="about-close-btn" onClick={onClose}>
          关闭
        </button>
      </div>

      <section className="about-section">
        <h3>测试版说明</h3>
        <p>
          {APP_TITLE} 当前是测试版，用于神经外科科研与临床辅助场景的内部试用。
          它不能替代医生判断、指南原文、院内流程或正式诊疗决策。
        </p>
      </section>

      <section className="about-section">
        <h3>用途及用法</h3>
        <ul>
          <li>可用于神经外科科研选题、文献阅读、研究设计、论文写作和临床问题梳理。</li>
          <li>上传 PDF/TXT/MD 文档后，可以直接围绕文档提问；长文档会自动选取最相关的内容作为回答依据。</li>
          <li>开启联网搜索后，系统会优先检索 PubMed；中文问题会提示并生成辅助检索式，尽量利用 PubMed 的 MeSH/ATM 检索机制。</li>
          <li>系统会尽量在回答中提供 PMID、PubMed 链接和 DOI；如提示证据不足，请优先回到原文继续核验。</li>
          <li>涉及诊疗、用药、手术策略或指南推荐时，请回到原始文献、指南原文和本院规范进行确认。</li>
        </ul>
      </section>

      <section className="about-section">
        <h3>遵循的依据</h3>
        <ul>
          {governanceLinks.map((link) => (
            <li key={link.href}>
              <a href={link.href} target="_blank" rel="noreferrer">
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="about-section">
        <h3>可能风险</h3>
        <ul>
          <li>大模型可能存在幻觉、遗漏、过度概括或引用解释错误。</li>
          <li>PubMed 检索受关键词、MeSH/ATM 映射、排序和数据库收录范围影响，可能漏检重要研究。</li>
          <li>PDF 解析可能丢失表格、图注、脚注、公式或扫描件内容。</li>
          <li>联网搜索结果可能过时、不完整，或受到来源质量影响。</li>
          <li>本工具不应输入可识别患者身份的信息；请遵循本院数据安全和伦理要求。</li>
          <li>药物剂量、适应证、禁忌证、指南推荐和临床路径必须回看原始文献或指南确认。</li>
        </ul>
      </section>

      <section className="about-section">
        <h3>开源组件鸣谢</h3>
        <p>感谢以下开源项目及其维护者：</p>
        <p className="about-credit-list">{openSourceCredits.join(' · ')}</p>
      </section>
    </div>
  )
}
