import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemo } from '../src/seed.js';
import {
  evaluateCompany,
  inspectEvidence,
  reviewCompany,
  handoffCompany,
  validateBatch,
} from '../src/model.js';
import { applyEvidenceChange, applyProfileChange, handoffText } from '../src/insights.js';
import {
  parseCsv,
  templateCsv,
  importCsv,
  toCsv,
  exportReviews,
  evidencePack,
  parseBackup,
} from '../src/io.js';

test('缺日期保留三项原文支撑，只把来源列为缺口；补日期不增加事实数', () => {
  const b = createDemo();
  const company = b.companies[1];
  const before = evaluateCompany(company, b.asOf);
  assert.equal(before.factCount, 3);
  assert.equal(before.sourceReady, false);
  assert.deepEqual(
    before.missing.map((item) => item.id),
    ['trace'],
  );
  assert.deepEqual(inspectEvidence(company.evidence[0], b.asOf).issues, [
    '发布日期待补',
    '采集日期待补',
  ]);
  const event = applyEvidenceChange(b, company.id, {
    ...company.evidence[0],
    date: '2026-10-18',
    collectedAt: b.asOf,
  });
  const after = evaluateCompany(company, b.asOf);
  assert.equal(after.factCount, 3);
  assert.equal(after.complete, true);
  assert.equal(event.comparison.before.suggestion, 'verify');
  assert.equal(event.comparison.after.suggestion, 'candidate');
  assert.deepEqual(
    event.comparison.fields.map((field) => field.label),
    ['发布日期', '采集日期'],
  );
});
test('新官网不能替过期的唯一API来源续期，仍禁止交接', () => {
  const b = createDemo();
  const c = b.companies[4];
  c.evidence.push({
    ...createDemo().companies[0].evidence[0],
    id: 'fresh-site',
    supports: ['identity', 'usage'],
  });
  const result = evaluateCompany(c, b.asOf);
  assert.equal(result.factCount, 3);
  assert.equal(result.sourceReady, false);
  assert.equal(result.complete, false);
  assert.deepEqual(result.facts.find((item) => item.id === 'fit').currentProof, []);
  reviewCompany(b, c.id, 'candidate', '人工仍保留为候选待核');
  assert.throws(() => handoffCompany(b, c.id, 'accepted', '同事', '请核实采购需求'), /完整依据/);
});
test('主体错配不能保留该企业原文支撑；来源问题会完整列出', () => {
  const b = createDemo();
  const c = b.companies[5];
  assert.equal(evaluateCompany(c, b.asOf).factCount, 0);
  const ev = { ...c.evidence[0], date: '', collectedAt: '', url: '', dateConflict: true };
  assert.equal(inspectEvidence(ev, b.asOf).issues.length, 5);
});
test('实际变更撤回人工判断与交接；无变化和支撑项换序保留结论', () => {
  const b = createDemo();
  const c = b.companies[0];
  reviewCompany(b, c.id, 'candidate', '原文与来源均已齐全');
  handoffCompany(b, c.id, 'accepted', '同事', '请确认业务使用规模');
  assert.equal(
    applyEvidenceChange(b, c.id, {
      ...c.evidence[0],
      supports: [...c.evidence[0].supports].reverse(),
    }),
    null,
  );
  assert.equal(applyProfileChange(b, c.id, { scene: c.scene }), null);
  assert.equal(c.handoff, 'accepted');
  assert.equal(b.events.length, 2);
  const event = applyEvidenceChange(b, c.id, { ...c.evidence[0], title: '已核实的新标题' });
  assert.equal(event.comparison.before.manualDecision, 'candidate');
  assert.equal(event.comparison.before.handoff, 'accepted');
  assert.equal(c.decision, null);
  assert.equal(c.handoff, null);
  assert.equal(b.events.length, 3);
});
test('画像与CSV使用同一变更对照；重复导入不增事件', () => {
  const b = createDemo();
  const c = b.companies[0];
  const event = applyProfileChange(b, c.id, { relationship: 'private' });
  assert.equal(event.comparison.after.suggestion, 'verify');
  assert.equal(event.comparison.fields[0].after, '私有部署待适配');
  const first = importCsv(templateCsv(), b);
  const second = importCsv(templateCsv(), first.batch);
  assert.equal(first.batch.events.at(-1).comparison.after.factCount, 3);
  assert.equal(first.batch.events.length, second.batch.events.length);
  const rows = parseCsv(templateCsv());
  rows[1][12] += '第二条原文';
  assert.ok(importCsv(toCsv(rows), first.batch).batch.events.at(-1).comparison);
});
test('旧备份兼容，新对照可往返；非法快照拒绝', () => {
  const b = createDemo();
  reviewCompany(b, 'C02', 'verify', '日期仍需补充核实');
  assert.equal(parseBackup(JSON.stringify(b)).events[0].comparison, undefined);
  applyEvidenceChange(b, 'C02', { ...b.companies[1].evidence[0], date: '2026-10-18' });
  assert.deepEqual(validateBatch(b), parseBackup(JSON.stringify(b)));
  b.events.at(-1).comparison.after.factCount = 4;
  assert.throws(() => validateBatch(b), /快照/);
});
test('三行卡包含编号、来源状态、人工结论和未知项，CSV与证据包一致', () => {
  const b = createDemo();
  const c = b.companies[1];
  c.scene += '\n第二行';
  const card = handoffText(c, b.asOf);
  assert.equal(card.split('\n').length, 3);
  for (const expected of ['E03', '发布日期待补', '人工结论：未确认', '用量、预算、采购时间均未知'])
    assert.ok(card.includes(expected));
  assert.match(handoffText(b.companies[2], b.asOf), /模型业务待核/);
  assert.match(handoffText(b.companies[3], b.asOf), /私有部署的服务适配/);
  assert.match(evidencePack(b, c), /三行交接卡/);
  assert.match(exportReviews(b), /三行卡-下一步/);
});

test('文字刚好等于空值显示文案，仍按实际字段识别变更', () => {
  const b = createDemo();
  const c = b.companies[0];
  c.scene = '';
  const event = applyProfileChange(b, c.id, { scene: '未记录' });
  assert.ok(event);
  assert.equal(c.scene, '未记录');
});
