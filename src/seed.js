import { AS_OF, SCHEMA_VERSION } from './model.js';

const evidence = (id, kind, title, quote, supports, extra = {}) => ({
  id,
  kind,
  title,
  quote,
  supports,
  date: '2026-10-18',
  collectedAt: '2026-10-23',
  url: `https://example.com/synthetic-evidence/${id.toLowerCase()}`,
  entityMatch: true,
  dateConflict: false,
  ...extra,
});
const company = (id, name, region, scene, evidenceList, extra = {}) => ({
  id,
  name,
  key: `DEMO-${id}`,
  region,
  scene,
  identity: 'verified',
  usage: 'application',
  relationship: 'api',
  owner: '',
  decision: null,
  reviewedAt: null,
  reviewReason: '',
  handoff: null,
  feedback: '',
  evidence: evidenceList,
  ...extra,
});
export function createDemo() {
  return {
    version: SCHEMA_VERSION,
    id: 'demo-20261024',
    name: 'AI 应用场景 · 演示批次',
    asOf: AS_OF,
    events: [],
    companies: [
      company('C01', '星屿软件（虚构）', '杭州', '面向研发团队的代码审查助手', [
        evidence(
          'E01',
          '官网',
          '产品介绍 · 代码审查助手',
          '星屿软件研发代码审查助手：结合代码库上下文定位变更风险，由模型生成审查意见，工程师确认后提交。产品由星屿软件独立运营。',
          ['identity', 'usage'],
        ),
        evidence(
          'E02',
          '招聘',
          '模型平台工程师 · 工作职责',
          '负责代码审查产品的外部大模型 API 接入，建立多模型路由、调用失败重试与 Token 成本监控；对接供应商的并发与稳定性方案。',
          ['usage', 'fit'],
        ),
      ]),
      company('C02', '澄野数据（虚构）', '上海', '企业知识库问答与检索', [
        evidence(
          'E03',
          '招聘',
          '应用工程师 · 工作职责',
          '为企业知识库开发检索增强问答，接入外部模型服务，维护检索链路与回答质量评估。',
          ['identity', 'usage', 'fit'],
          { date: '', collectedAt: '' },
        ),
      ]),
      company(
        'C03',
        '青禾设计（虚构）',
        '成都',
        '设计团队内部效率工具',
        [
          evidence(
            'E04',
            '招聘',
            '前端工程师 · 任职要求',
            '熟练使用 Cursor、Copilot 等 AI 工具提升个人开发效率，掌握常见前端框架。岗位未说明建设模型应用或采购模型服务。',
            ['identity'],
          ),
        ],
        { usage: 'skills', relationship: 'unknown' },
      ),
      company(
        'C04',
        '知桥科技（虚构）',
        '苏州',
        '私有知识库与内部智能助手',
        [
          evidence(
            'E05',
            '技术文章',
            '团队实践 · 私有环境知识助手',
            '知桥科技将知识助手部署在客户私有环境中，使用本地开源模型进行文档问答，数据不离开客户环境。尚未说明外部模型 API 使用情况。',
            ['identity', 'usage'],
          ),
        ],
        { relationship: 'private' },
      ),
      company('C05', '雾海网络（虚构）', '北京', '面向开发者的自动测试生成', [
        evidence(
          'E06',
          '招聘',
          '模型应用工程师 · 历史岗位',
          '负责测试用例生成应用，集成模型 API 并优化调用成本。此条是保留的历史招聘，尚未找到近期更新。',
          ['identity', 'usage', 'fit'],
          { date: '2025-11-02', collectedAt: '2026-10-23' },
        ),
      ]),
      company(
        'C06',
        '远汐人才（虚构）',
        '深圳',
        '某客户的智能客服项目',
        [
          evidence(
            'E07',
            '招聘',
            '代客户招聘 · 应用开发',
            '为某客户招聘智能客服应用开发岗位，负责模型 API 接入。发布主体为远汐人才，实际用工方和采购方未披露。',
            ['usage', 'fit'],
            { entityMatch: false },
          ),
        ],
        { identity: 'unclear' },
      ),
      company('C07', '云岚协作（虚构）', '南京', '会议纪要与事项提取', [
        evidence(
          'E08',
          '官网',
          '云岚协作产品说明',
          '云岚协作面向项目团队提供会议纪要和行动事项提取；使用模型服务处理转写文本，人工确认后发送给参会者。运营主体为云岚协作。',
          ['identity', 'usage', 'fit'],
        ),
        evidence(
          'E09',
          '技术文章',
          '调用质量与成本的平衡',
          '模型调用按场景分流：短会议使用低延迟服务，长会议使用长上下文服务；为调用失败设置重试与降级。',
          ['usage', 'fit'],
        ),
      ]),
      company('C08', '岛川智能（虚构）', '武汉', '模型应用业务待核实', [
        evidence(
          'E10',
          '招聘',
          '应用工程师 · 日期冲突样本',
          '正文面向 2023 届毕业生，页面显示 2026 年更新。提及接入模型 API，但原始发布日期无法确认。',
          ['identity', 'usage', 'fit'],
          { dateConflict: true },
        ),
      ]),
    ],
  };
}
