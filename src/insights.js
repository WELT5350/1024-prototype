import {
  evaluateCompany,
  inspectEvidence,
  DECISIONS,
  SUBJECTS,
  USAGES,
  RELATIONS,
  CRITERIA,
  uid,
} from './model.js';

const snapshot = (company, asOf) => {
  const result = evaluateCompany(company, asOf);
  return {
    suggestion: result.suggestion,
    factCount: result.factCount,
    sourceReady: result.sourceReady,
    manualDecision: company.decision,
    handoff: company.handoff,
  };
};
const display = (key, value) => {
  if (key === 'supports')
    return (
      [...value]
        .sort()
        .map((id) => CRITERIA.find((item) => item.id === id)?.label || id)
        .join('、') || '未标注'
    );
  if (typeof value === 'boolean') return value ? '是' : '否';
  return (
    { identity: SUBJECTS, usage: USAGES, relationship: RELATIONS }[key]?.[value] ||
    value ||
    '未记录'
  );
};
function change(batch, company, values, labels, action, detail, mutate) {
  const fields = Object.entries(labels).flatMap(([key, label]) => {
    const before = display(key, values.before?.[key] ?? (key === 'supports' ? [] : ''));
    const after = display(key, values.after[key]);
    return before === after ? [] : [{ label, before, after }];
  });
  if (!fields.length) return null;
  const before = snapshot(company, batch.asOf);
  mutate();
  Object.assign(company, {
    decision: null,
    reviewedAt: null,
    reviewReason: '',
    handoff: null,
    feedback: '',
  });
  const comparison = { before, after: snapshot(company, batch.asOf), fields };
  const event = {
    id: uid('log'),
    companyId: company.id,
    action,
    at: new Date().toISOString(),
    detail: `${detail}；${before.manualDecision ? '旧人工结论及交接已撤回，请重新确认' : '等待人工确认'}。`,
    comparison,
  };
  batch.events.push(event);
  return event;
}
export function applyEvidenceChange(batch, companyId, item, origin = '核实证据') {
  const company = batch.companies.find((row) => row.id === companyId);
  if (!company) throw new Error('企业不存在。');
  const index = company.evidence.findIndex((row) => row.id === item.id);
  return change(
    batch,
    company,
    { before: company.evidence[index], after: item },
    {
      kind: '来源类型',
      title: '来源标题',
      date: '发布日期',
      collectedAt: '采集日期',
      url: '原文链接',
      quote: '原文摘录',
      supports: '支撑项',
      entityMatch: '主体对应',
      dateConflict: '日期冲突',
    },
    'evidence',
    `${origin} ${item.id}`,
    () => {
      if (index < 0) company.evidence.push(structuredClone(item));
      else company.evidence[index] = structuredClone(item);
    },
  );
}
export function applyProfileChange(batch, companyId, fields) {
  const company = batch.companies.find((row) => row.id === companyId);
  if (!company) throw new Error('企业不存在。');
  const labels = {
    scene: '业务场景',
    identity: '主体状态',
    usage: '业务用途',
    relationship: '服务关系',
  };
  const next = Object.fromEntries(
    Object.keys(labels).map((key) => [key, fields[key] ?? company[key]]),
  );
  return change(
    batch,
    company,
    { before: company, after: next },
    labels,
    'profile',
    '核实企业画像',
    () => Object.assign(company, next),
  );
}
export function buildHandoffCard(company, asOf) {
  const result = evaluateCompany(company, asOf);
  const ids = [...new Set(result.facts.filter((item) => item.pass).flatMap((item) => item.proof))];
  const references = ids.map((id) => {
    const evidence = company.evidence.find((item) => item.id === id);
    const state = inspectEvidence(evidence, asOf);
    return `${id}（${state.usable ? '来源有效' : state.issues.join('、')}）`;
  });
  const usage = result.facts.find((item) => item.id === 'usage').pass;
  const business = `${company.name} · ${company.scene || '场景未知'}${usage ? '（人工标注的原文支撑）' : '（人工录入，模型业务待核）'}`;
  const evidence = references.length
    ? `${references.join('；')}；规则建议：${DECISIONS[result.suggestion]}，人工结论：${DECISIONS[company.decision] || '未确认'}。`
    : '尚无与该企业对应的业务支撑原文；规则建议仅供核查。';
  const gaps = result.missing.map((item) => item.label).join('、');
  const next = `${gaps ? `先核实${gaps}；` : '核实实际接入方式与采购意愿；'}${company.relationship === 'private' ? '确认私有部署的服务适配；' : ''}用量、预算、采购时间均未知，需后续人工确认。`;
  return { business, evidence, next };
}
export function handoffText(company, asOf) {
  const card = buildHandoffCard(company, asOf);
  const oneLine = (value) => value.replace(/[\r\n]+/g, ' ');
  return `业务：${oneLine(card.business)}\n依据：${oneLine(card.evidence)}\n下一步：${oneLine(card.next)}`;
}
