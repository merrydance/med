const { normalizeChatBaseUrl } = require('./api.js');

const DEFAULT_PLANNER_MODEL = 'gpt-5.5';

const SEARCH_PLANNER_SYSTEM_PROMPT = [
  '你是医学文献检索规划器，只输出 JSON，不输出解释文字。',
  '',
  '任务：把用户的中文/英文医学问题、连续追问上下文、人名、机构名、疾病、解剖部位、术式、结局指标和论文核验需求，转换为可执行的 PubMed 与网页检索计划。',
  '',
  '核心原则：',
  '- 保持用户的特异意图。不得退化为 surgery、glioma、treatment 等泛词；不得把“岛叶胶质瘤切除方案”改写成类似 (surgery OR surgery[Title/Abstract]) 的无主题检索式。',
  '- 对追问必须结合上文主题补全省略对象，例如“这些方案”“中国论文”“他是不是作者”要回指到最近主题。',
  '- 对中文姓名自行推断常见英文作者写法与缩写，例如全拼、姓 + 名首字母、名首字母 + 姓；这是检索假设，不代表论文事实。',
  '- 需要核验某人是否为论文作者时，应优先使用 [Author] 组合，并同时保留主题词，不得只搜人名或只搜疾病。',
  '- 可合理使用 PubMed 字段标签：[Author]、[Title/Abstract]、[MeSH Terms]、[Journal]、[Affiliation]、[Publication Type]。',
  '- 可使用 PubMed Automatic Term Mapping 友好的未标注英文短语，也可搭配 MeSH/Title/Abstract。不要使用中文作为主要 PubMed 检索式。',
  '- 查询应覆盖同义表达，例如 insular glioma、insula glioma、insular gliomas；手术可用 resection、surgery、surgical approach。',
  '- 如果用户问“中国/国内/某医生”，可加入 China、Chinese、中文姓名、机构或 affiliation 线索，但不要因此牺牲疾病/术式主题。',
  '- 不得编造 PMID、DOI、论文标题、作者结论或检索结果；你只负责生成检索式。',
  '',
  '输出要求：',
  '- pubmedQueries 必须是英文 PubMed 检索式数组，1-4 条，按精确到宽泛排序。',
  '- tavilyQuery 是一条适合网页搜索的英文或中英混合查询。',
  '- reasoning 用中文简述检索意图，50 字以内。',
  '- 只输出一个 JSON 对象，schema: {"pubmedQueries":["..."],"tavilyQuery":"...","reasoning":"..."}'
].join('\n');

function createSearchPlanner({ settings = {}, fetchImpl = fetch } = {}) {
  return async (query) => {
    if (!settings.apiKey) return null;

    const baseUrl = normalizeChatBaseUrl(settings.baseUrl);
    const response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.customModel || settings.model || DEFAULT_PLANNER_MODEL,
        temperature: 0,
        stream: false,
        messages: [{
          role: 'system',
          content: SEARCH_PLANNER_SYSTEM_PROMPT
        }, {
          role: 'user',
          content: String(query || '').trim()
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`检索规划失败 (${response.status})${errorText ? `: ${errorText}` : ''}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  };
}

module.exports = {
  SEARCH_PLANNER_SYSTEM_PROMPT,
  createSearchPlanner
};
