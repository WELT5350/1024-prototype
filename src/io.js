import {
  SOURCE_TYPES,
  CRITERIA,
  SUBJECTS,
  USAGES,
  RELATIONS,
  DECISIONS,
  SCHEMA_VERSION,
  uid,
  safeUrl,
  dateValue,
  validateBatch,
  evaluateCompany,
} from './model.js';
export const HEADERS = [
  '企业名称',
  '去重标识',
  '地区',
  '业务场景',
  '主体状态',
  '业务用途',
  '服务关系',
  '来源类型',
  '来源标题',
  '发布日期',
  '采集日期',
  '原文链接',
  '原文摘录',
  '支撑项',
  '主体对应',
  '日期冲突',
];
export function parseCsv(input) {
  const source = input.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [],
    cell = '',
    quoted = false,
    afterQuote = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
        afterQuote = true;
      } else cell += char;
    } else if (char === '"') {
      if (cell || afterQuote) throw new Error('CSV 引号格式不正确。');
      quoted = true;
    } else if (char === ',' || char === '\n' || char === '\r') {
      row.push(cell);
      cell = '';
      afterQuote = false;
      if (char !== ',') {
        if (row.some((value) => value.trim())) rows.push(row);
        row = [];
        if (char === '\r' && source[i + 1] === '\n') i++;
      }
    } else {
      if (afterQuote) throw new Error('CSV 引号后出现多余字符。');
      cell += char;
    }
  }
  if (quoted) throw new Error('CSV 中存在未闭合的引号。');
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}
export function csvCell(value) {
  let valueString = String(value ?? '');
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(valueString)) valueString = `'${valueString}`;
  return `"${valueString.replace(/"/g, '""')}"`;
}
export function toCsv(rows) {
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}
export function templateCsv() {
  return toCsv([
    HEADERS,
    [
      '示例企业（虚构）',
      'DEMO-NEW',
      '杭州',
      '会议纪要助手',
      'verified',
      'application',
      'api',
      '官网',
      '产品介绍',
      '2026-10-20',
      '2026-10-24',
      'https://example.com/demo-new',
      '该虚构企业使用外部模型服务生成会议纪要，运营主体已对应。',
      'identity|usage|fit',
      '是',
      '否',
    ],
  ]);
}
export function importCsv(input, original) {
  const rows = parseCsv(input);
  if (rows.length < 2) throw new Error('请至少提供一行数据，首行使用模板表头。');
  if (rows.length > 2001) throw new Error('一次最多导入 2000 条证据。');
  const header = rows.shift();
  if (
    header.length !== HEADERS.length ||
    new Set(header).size !== header.length ||
    HEADERS.some((name) => !header.includes(name))
  )
    throw new Error('表头不正确，请下载 CSV 模板。');
  const batch = structuredClone(original);
  let added = 0,
    duplicate = 0;
  rows.forEach((values, index) => {
    const fail = (message) => {
      throw new Error(`第 ${index + 2} 行：${message}`);
    };
    if (values.length !== header.length) fail('列数与表头不一致。');
    const entry = Object.fromEntries(header.map((name, i) => [name, values[i].trim()]));
    if (!entry.企业名称 || !entry.去重标识) fail('企业名称和去重标识必填。');
    if (!SUBJECTS[entry.主体状态] || !USAGES[entry.业务用途] || !RELATIONS[entry.服务关系])
      fail('核查状态值不正确，请参考模板。');
    if (!SOURCE_TYPES.includes(entry.来源类型) || !entry.来源标题 || !entry.原文摘录)
      fail('来源类型、标题与原文必填。');
    if (entry.发布日期 && !dateValue(entry.发布日期))
      fail('发布日期必须是有效 YYYY-MM-DD 日期，或留空待核。');
    if (entry.采集日期 && !dateValue(entry.采集日期))
      fail('采集日期必须是有效 YYYY-MM-DD 日期，或留空待核。');
    if (entry.原文链接 && !safeUrl(entry.原文链接))
      fail('链接必须为 http/https，不接受可执行协议。');
    if (!['是', '否'].includes(entry.主体对应) || !['是', '否'].includes(entry.日期冲突))
      fail('主体对应和日期冲突只能填写“是”或“否”。');
    const supports = entry.支撑项 ? entry.支撑项.split('|') : [];
    if (supports.some((key) => !CRITERIA.some((rule) => rule.id === key)))
      fail('支撑项仅支持 identity|usage|trace|fit。');
    let company = batch.companies.find((item) => item.key === entry.去重标识);
    if (
      company &&
      (company.name !== entry.企业名称 ||
        company.identity !== entry.主体状态 ||
        company.usage !== entry.业务用途 ||
        company.relationship !== entry.服务关系)
    )
      fail('同一标识的企业名称或核查状态冲突，请在详情页核实后导入。');
    if (!company) {
      company = {
        id: uid('company'),
        name: entry.企业名称,
        key: entry.去重标识,
        region: entry.地区,
        scene: entry.业务场景,
        identity: entry.主体状态,
        usage: entry.业务用途,
        relationship: entry.服务关系,
        owner: '',
        decision: null,
        reviewedAt: null,
        reviewReason: '',
        handoff: null,
        feedback: '',
        evidence: [],
      };
      batch.companies.push(company);
    }
    const item = {
      id: uid('evidence'),
      kind: entry.来源类型,
      title: entry.来源标题,
      date: entry.发布日期,
      collectedAt: entry.采集日期,
      url: entry.原文链接,
      quote: entry.原文摘录,
      supports,
      entityMatch: entry.主体对应 === '是',
      dateConflict: entry.日期冲突 === '是',
    };
    if (
      company.evidence.some(
        (old) =>
          old.url === item.url &&
          old.quote === item.quote &&
          old.date === item.date &&
          old.title === item.title,
      )
    ) {
      duplicate++;
      return;
    }
    company.evidence.push(item);
    added++;
    if (company.reviewedAt) {
      company.decision = null;
      company.reviewedAt = null;
      company.reviewReason = '';
      company.handoff = null;
      company.feedback = '';
      batch.events.push({
        id: uid('log'),
        companyId: company.id,
        action: 'evidence',
        at: new Date().toISOString(),
        detail: '导入了新证据，已撤回旧核查与交接状态，需要重新确认。',
      });
    }
  });
  return { batch: validateBatch(batch), added, duplicate };
}
export function exportReviews(batch) {
  return toCsv([
    [
      '批次',
      '观察日',
      '企业',
      '去重标识',
      '业务场景',
      '人工结论',
      '核查依据',
      '核查时间',
      '负责人',
      '模拟交接状态',
      '交接说明',
    ],
    ...batch.companies.map((company) => [
      batch.name,
      batch.asOf,
      company.name,
      company.key,
      company.scene,
      DECISIONS[company.decision] || '未核查',
      company.reviewReason,
      company.reviewedAt || '',
      company.owner,
      company.handoff === 'accepted'
        ? '模拟接收'
        : company.handoff === 'returned'
          ? '退回补证'
          : '未交接',
      company.feedback,
    ]),
  ]);
}
export function evidencePack(batch, company) {
  const check = evaluateCompany(company, batch.asOf);
  const plain = (value) =>
    String(value)
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
  return `# 线索交接包 · ${company.name}\n\n> 演示原型。内置资料为虚构样本；本地核查不代表线上评分、采购意愿或商机。\n\n批次：${batch.name}\n\n观察日：${batch.asOf}\n\n业务场景：${company.scene}\n\n人工结论：${DECISIONS[company.decision] || '未核查'}\n\n判断依据：\n${plain(company.reviewReason || '尚未填写')}\n\n负责人：${company.owner || '未指定'}\n\n交接：${company.handoff === 'accepted' ? '模拟接收' : company.handoff === 'returned' ? '退回补证' : '未交接'}\n\n交接说明：\n${plain(company.feedback || '尚未填写')}\n\n## 标准核查\n\n${check.checks.map((item) => `- ${item.pass ? '有依据' : '待核实'}：${item.label}（${item.proof.join('、') || '暂无有效证据'}）`).join('\n')}\n\n## 来源与原文\n\n${company.evidence.map((item) => `### ${item.id} · ${item.kind} · ${item.title}\n\n发布日期：${item.date || '未知'}；采集日期：${item.collectedAt || '未知'}\n\n原始链接（仅作引用，不嵌入加载）：\n${plain(item.url || '待补')}\n\n${plain(item.quote)}\n`).join('\n')}\n## 待补事项\n\n${check.missing.map((item) => `- ${item.label}：${item.detail}`).join('\n') || '四项已齐；仍需后续人工核实真实采购意愿与预算。'}\n`;
}
export const STORAGE_KEY = 'evidence-desk.v1';
export function loadBatch(storage, fallback) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return { batch: raw ? validateBatch(JSON.parse(raw)) : fallback(), error: '' };
  } catch {
    return {
      batch: fallback(),
      error:
        '已有本地数据无法读取，当前暂用演示批次，尚未覆盖原数据。请先下载原始存储备份，或明确重置。',
    };
  }
}
export function saveBatch(storage, batch) {
  const checked = validateBatch(batch);
  storage.setItem(STORAGE_KEY, JSON.stringify(checked));
  return checked;
}
export function parseBackup(source) {
  let input;
  try {
    input = JSON.parse(source);
  } catch {
    throw new Error('JSON 文件不完整或格式错误。');
  }
  if (input.version !== SCHEMA_VERSION) throw new Error('备份版本不支持。');
  return validateBatch(input);
}
