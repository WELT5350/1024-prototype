export const AS_OF = '2026-10-24';
export const SCHEMA_VERSION = 1;
export const DECISIONS = { candidate: '候选', verify: '待核实', hold: '暂缓' };
export const SUBJECTS = { verified: '主体已对应', unclear: '主体待核', invalid: '主体失效' };
export const USAGES = {
  application: '具体模型任务',
  skills: '仅技能或工具使用',
  unknown: '用途待核',
};
export const RELATIONS = {
  api: '外部模型服务',
  private: '私有部署待适配',
  provider: '服务提供方待辨别',
  unknown: '关系待核',
};
export const CRITERIA = [
  { id: 'identity', label: '主体对应', detail: '原文归属与企业主体一致' },
  { id: 'usage', label: '用途具体', detail: '具体业务任务，不只是技能词' },
  { id: 'trace', label: '来源可追溯', detail: '原文、链接和日期完整且有效' },
  { id: 'fit', label: '服务关系', detail: '模型服务与这项业务存在合理关系' },
];
export const SOURCE_TYPES = ['招聘', '官网', '技术文章', '招投标', '知识产权'];
export function uid(prefix = 'r') {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}
export function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value
    ? parsed
    : null;
}
export function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : '';
  } catch {
    return '';
  }
}
export function inspectEvidence(evidence, asOf) {
  const published = dateValue(evidence.date);
  const collected = dateValue(evidence.collectedAt);
  const today = dateValue(asOf);
  const window = evidence.kind === '招聘' ? 120 : 365;
  let problem = '';
  if (evidence.dateConflict) problem = '日期与正文冲突';
  else if (published === null || collected === null) problem = '日期不完整';
  else if (published > today || collected > today) problem = '日期晚于观察日';
  else if (published > collected) problem = '采集早于发布日期';
  else if (!safeUrl(evidence.url) || !evidence.quote.trim()) problem = '缺原文或有效链接';
  else if (today - published > window * 86400000) problem = '超过演示观察窗口';
  else if (!evidence.entityMatch) problem = '原文主体尚未对应';
  return { usable: !problem, problem, window };
}
export function evaluateCompany(company, asOf) {
  const usable = company.evidence.filter((item) => inspectEvidence(item, asOf).usable);
  const proofFor = (key) =>
    usable.filter((item) => item.supports.includes(key)).map((item) => item.id);
  const ids = Object.fromEntries(CRITERIA.map((rule) => [rule.id, proofFor(rule.id)]));
  const checks = [
    {
      ...CRITERIA[0],
      pass: company.identity === 'verified' && ids.identity.length > 0,
      proof: ids.identity,
    },
    {
      ...CRITERIA[1],
      pass: company.usage === 'application' && ids.usage.length > 0,
      proof: ids.usage,
    },
    { ...CRITERIA[2], pass: usable.length > 0, proof: usable.map((item) => item.id) },
    { ...CRITERIA[3], pass: company.relationship === 'api' && ids.fit.length > 0, proof: ids.fit },
  ];
  const missing = checks.filter((check) => !check.pass);
  const suggestion =
    company.identity === 'invalid' || company.usage === 'skills'
      ? 'hold'
      : missing.length
        ? 'verify'
        : 'candidate';
  const explanation =
    company.identity === 'invalid'
      ? '主体状态失效，先暂缓并保留依据。'
      : company.usage === 'skills'
        ? '目前只证明技能要求或工具使用，尚未证明具体模型业务。'
        : missing.length
          ? `还需核实：${missing.map((item) => item.label).join('、')}。缺证据不等于无需求。`
          : '四项依据已齐，可以人工确认候选；仍未证明采购预算或购买意愿。';
  return { checks, suggestion, missing, explanation, complete: missing.length === 0 };
}
export function reviewCompany(batch, id, decision, reason) {
  const company = batch.companies.find((item) => item.id === id);
  if (!company || !Object.hasOwn(DECISIONS, decision)) throw new Error('请选择有效的核查结论。');
  if (typeof reason !== 'string' || reason.trim().length < 4)
    throw new Error('请写至少 4 个字的判断依据。');
  if (reason.length > 2000) throw new Error('判断依据最多 2000 字。');
  const at = new Date().toISOString();
  company.decision = decision;
  company.reviewReason = reason.trim();
  company.reviewedAt = at;
  company.handoff = null;
  company.feedback = '';
  batch.events.push({
    id: uid('log'),
    companyId: id,
    action: 'review',
    at,
    detail: `人工判为${DECISIONS[decision]}：${reason.trim()}`,
  });
  return batch;
}
export function handoffCompany(batch, id, action, owner, reason) {
  const company = batch.companies.find((item) => item.id === id);
  if (!company || !['accepted', 'returned'].includes(action)) throw new Error('交接操作无效。');
  if (!company.reviewedAt) throw new Error('请先保存人工核查结论。');
  if (typeof reason !== 'string' || reason.trim().length < 4)
    throw new Error('请写至少 4 个字的交接说明或补证项。');
  if (reason.length > 2000 || typeof owner !== 'string' || owner.length > 80)
    throw new Error('交接说明或负责人过长。');
  if (action === 'accepted') {
    if (company.decision !== 'candidate' || !evaluateCompany(company, batch.asOf).complete)
      throw new Error('交接前需要候选结论和四项完整依据。');
    if (!owner.trim()) throw new Error('请填写接手负责人。');
  }
  company.owner = owner.trim();
  company.handoff = action;
  company.feedback = reason.trim();
  batch.events.push({
    id: uid('log'),
    companyId: id,
    action,
    at: new Date().toISOString(),
    detail: `${action === 'accepted' ? '模拟接收' : '退回补证'}${owner.trim() ? ` · ${owner.trim()}` : ''}：${reason.trim()}`,
  });
  return batch;
}
export function stats(batch) {
  const list = batch.companies;
  return {
    total: list.length,
    reviewed: list.filter((item) => item.reviewedAt).length,
    candidate: list.filter((item) => item.decision === 'candidate').length,
    verify: list.filter((item) => item.decision === 'verify').length,
    hold: list.filter((item) => item.decision === 'hold').length,
    accepted: list.filter((item) => item.handoff === 'accepted').length,
    returned: list.filter((item) => item.handoff === 'returned').length,
    evidence: list.reduce((sum, item) => sum + item.evidence.length, 0),
  };
}
export function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
}
const text = (value, max, field) => {
  if (typeof value !== 'string' || value.length > max)
    throw new Error(`${field}格式不正确或过长。`);
  return value;
};
export function validateBatch(input) {
  if (
    !input ||
    input.version !== SCHEMA_VERSION ||
    !dateValue(input.asOf) ||
    !Array.isArray(input.companies) ||
    input.companies.length > 500
  )
    throw new Error('不是受支持的证据台备份，或企业超过 500 家。');
  const used = new Set();
  let evidenceCount = 0;
  const companies = input.companies.map((row) => {
    const id = text(row.id, 100, '企业编号');
    if (!id || used.has(id)) throw new Error('企业编号缺失或重复。');
    used.add(id);
    if (
      !Object.hasOwn(SUBJECTS, row.identity) ||
      !Object.hasOwn(USAGES, row.usage) ||
      !Object.hasOwn(RELATIONS, row.relationship) ||
      (row.decision !== null && !Object.hasOwn(DECISIONS, row.decision))
    )
      throw new Error('企业核查状态无效。');
    if (!Array.isArray(row.evidence) || row.evidence.length > 50)
      throw new Error('每家企业最多 50 条证据。');
    evidenceCount += row.evidence.length;
    const evidenceIds = new Set();
    const evidence = row.evidence.map((item) => {
      const evidenceId = text(item.id, 100, '证据编号');
      if (!evidenceId || evidenceIds.has(evidenceId) || !SOURCE_TYPES.includes(item.kind))
        throw new Error('证据编号或来源类型无效。');
      evidenceIds.add(evidenceId);
      if (
        !Array.isArray(item.supports) ||
        item.supports.some((key) => !CRITERIA.some((rule) => rule.id === key)) ||
        typeof item.entityMatch !== 'boolean' ||
        typeof item.dateConflict !== 'boolean'
      )
        throw new Error('证据核查项无效。');
      return {
        id: evidenceId,
        kind: item.kind,
        title: text(item.title, 200, '来源标题'),
        date: text(item.date, 10, '来源日期'),
        collectedAt: text(item.collectedAt, 10, '采集日期'),
        url: text(item.url, 2000, '链接'),
        quote: text(item.quote, 5000, '原文'),
        supports: [...new Set(item.supports)],
        entityMatch: item.entityMatch,
        dateConflict: item.dateConflict,
      };
    });
    if (![null, 'accepted', 'returned'].includes(row.handoff)) throw new Error('交接状态无效。');
    const result = {
      id,
      name: text(row.name, 200, '企业名称'),
      key: text(row.key, 100, '去重标识'),
      region: text(row.region, 80, '地区'),
      scene: text(row.scene, 200, '业务场景'),
      identity: row.identity,
      usage: row.usage,
      relationship: row.relationship,
      owner: text(row.owner, 80, '负责人'),
      decision: row.decision,
      reviewedAt: row.reviewedAt === null ? null : text(row.reviewedAt, 40, '核查时间'),
      reviewReason: text(row.reviewReason, 2000, '判断依据'),
      handoff: row.handoff,
      feedback: text(row.feedback, 2000, '交接说明'),
      evidence,
    };
    if (!result.name.trim() || !result.key.trim()) throw new Error('企业名称与去重标识不能为空。');
    if (
      result.reviewedAt &&
      (!Number.isFinite(Date.parse(result.reviewedAt)) ||
        !result.decision ||
        result.reviewReason.trim().length < 4)
    )
      throw new Error('核查记录不完整。');
    if (!result.reviewedAt && result.decision) throw new Error('核查结论缺少时间。');
    if (result.handoff && (!result.reviewedAt || result.feedback.trim().length < 4))
      throw new Error('交接记录不完整。');
    if (
      result.handoff === 'accepted' &&
      (result.decision !== 'candidate' ||
        !result.owner ||
        !evaluateCompany(result, input.asOf).complete)
    )
      throw new Error('已接收记录缺少交接准入依据。');
    return result;
  });
  if (new Set(companies.map((row) => row.key)).size !== companies.length)
    throw new Error('企业去重标识重复。');
  if (evidenceCount > 2000 || !Array.isArray(input.events) || input.events.length > 10000)
    throw new Error('备份记录过多。');
  const events = input.events.map((event) => {
    if (
      !used.has(event.companyId) ||
      !Number.isFinite(Date.parse(event.at)) ||
      !['review', 'accepted', 'returned', 'evidence', 'profile'].includes(event.action)
    )
      throw new Error('操作记录无效。');
    return {
      id: text(event.id, 100, '记录编号'),
      companyId: event.companyId,
      action: event.action,
      at: text(event.at, 40, '时间'),
      detail: text(event.detail, 3000, '记录内容'),
    };
  });
  return {
    version: SCHEMA_VERSION,
    id: text(input.id, 100, '批次编号'),
    name: text(input.name, 100, '批次名称'),
    asOf: input.asOf,
    companies,
    events,
  };
}
