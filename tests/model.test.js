import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemo } from '../src/seed.js';
import {
  evaluateCompany,
  dateValue,
  reviewCompany,
  handoffCompany,
  stats,
  validateBatch,
  safeUrl,
  escapeHtml,
} from '../src/model.js';
import {
  templateCsv,
  parseCsv,
  importCsv,
  toCsv,
  csvCell,
  parseBackup,
  loadBatch,
  saveBatch,
  STORAGE_KEY,
  evidencePack,
} from '../src/io.js';

test('虚构样本覆盖完整候选、日期缺失、技能、私有化、过期、代招与冲突', () => {
  const batch = createDemo();
  assert.equal(batch.companies.length, 8);
  assert.ok(batch.companies.every((row) => row.name.includes('虚构')));
  assert.deepEqual(
    batch.companies.map((row) => evaluateCompany(row, batch.asOf).suggestion),
    ['candidate', 'verify', 'hold', 'verify', 'verify', 'verify', 'candidate', 'verify'],
  );
});
test('招聘第120天有效、第121天失效，不依赖机器时区', () => {
  const row = createDemo().companies[0];
  row.evidence = [structuredClone(row.evidence[1])];
  row.evidence[0].supports = ['identity', 'usage', 'fit'];
  row.evidence[0].date = '2026-06-26';
  assert.equal(evaluateCompany(row, '2026-10-24').complete, true);
  row.evidence[0].date = '2026-06-25';
  assert.equal(evaluateCompany(row, '2026-10-24').complete, false);
});
test('不同来源数量不加分，一条有效完整证据也能支持四项', () => {
  const row = createDemo().companies[0];
  row.evidence = [row.evidence[0]];
  row.evidence[0].supports = ['identity', 'usage', 'fit'];
  assert.equal(evaluateCompany(row, '2026-10-24').complete, true);
  row.evidence[0].supports = [];
  row.evidence.push({ ...structuredClone(row.evidence[0]), id: 'E-new', kind: '知识产权' });
  assert.equal(evaluateCompany(row, '2026-10-24').complete, false);
});
test('未来日期、采集早于发布、错误日历、主体错配均不能充作证据', () => {
  const base = createDemo().companies[0];
  for (const changes of [
    { date: '2026-10-25' },
    { collectedAt: '2026-10-01' },
    { date: '2026-02-30' },
    { entityMatch: false },
    { url: 'javascript:alert(1)' },
    { quote: ' ' },
  ]) {
    const row = structuredClone(base);
    row.evidence = [{ ...row.evidence[1], supports: ['identity', 'usage', 'fit'], ...changes }];
    assert.equal(evaluateCompany(row, '2026-10-24').complete, false, JSON.stringify(changes));
  }
  assert.equal(dateValue('2026-02-30'), null);
  assert.equal(dateValue('2024-02-29'), Date.parse('2024-02-29T00:00:00Z'));
});
test('人工可以保留与建议不同的结论，但缺依据不能交接', () => {
  const batch = createDemo();
  reviewCompany(batch, 'C02', 'candidate', '有补充材料，暂留候选等待核实');
  assert.equal(batch.companies[1].decision, 'candidate');
  assert.throws(
    () => handoffCompany(batch, 'C02', 'accepted', '演示同事', '请跟进模型采购需求'),
    /四项/,
  );
});
test('交接要求核查、候选、负责人、说明；记录不会重复累加企业', () => {
  const batch = createDemo();
  assert.throws(
    () => handoffCompany(batch, 'C01', 'accepted', '演示同事', '具体交接说明'),
    /先保存/,
  );
  assert.throws(() => reviewCompany(batch, 'C01', 'candidate', '好'), /4/);
  reviewCompany(batch, 'C01', 'candidate', 'E01和E02有具体应用及API接入依据');
  assert.throws(() => handoffCompany(batch, 'C01', 'accepted', '', '具体交接说明'), /负责人/);
  handoffCompany(batch, 'C01', 'accepted', '演示同事 A', '核实业务用量和采购预算');
  handoffCompany(batch, 'C01', 'accepted', '演示同事 A', '补充后续核实说明');
  assert.equal(stats(batch).accepted, 1);
  assert.equal(batch.events.length, 3);
  handoffCompany(batch, 'C01', 'returned', '', '缺少实际预算与使用规模');
  assert.equal(stats(batch).accepted, 0);
  assert.equal(stats(batch).returned, 1);
});
test('重新核查撤回旧交接，操作记录保留', () => {
  const batch = createDemo();
  reviewCompany(batch, 'C01', 'candidate', '原文明确可追溯');
  handoffCompany(batch, 'C01', 'accepted', '同事 A', '下一步核实使用规模');
  reviewCompany(batch, 'C01', 'verify', '发现另有需要确认的主体信息');
  assert.equal(batch.companies[0].handoff, null);
  assert.equal(batch.events.length, 3);
});
test('CSV解析支持BOM、CRLF、引号、逗号、多行与空行', () => {
  assert.deepEqual(parseCsv('\uFEFF"甲,乙","正文\n第二行","他说""好"""\r\n\r\n'), [
    ['甲,乙', '正文\n第二行', '他说"好"'],
  ]);
  assert.throws(() => parseCsv('"未闭合'), /未闭合/);
  assert.throws(() => parseCsv('"a"z,b'), /多余/);
  assert.throws(() => parseCsv('a"b,c'), /引号/);
});
test('CSV模板可导入并去重，第二次不增加记录', () => {
  const first = importCsv(templateCsv(), createDemo());
  assert.equal(first.added, 1);
  assert.equal(first.batch.companies.length, 9);
  const second = importCsv(templateCsv(), first.batch);
  assert.equal(second.added, 0);
  assert.equal(second.duplicate, 1);
  assert.equal(second.batch.companies.length, 9);
});
test('导入错误整批回滚，不影响原批次', () => {
  const original = createDemo();
  const before = JSON.stringify(original);
  const source = parseCsv(templateCsv());
  source.push([...source[1]]);
  source[2][0] = '另一个名称';
  assert.throws(() => importCsv(toCsv(source), original), /冲突/);
  assert.equal(JSON.stringify(original), before);
});
test('导入拒绝错误枚举、畸形日期、可执行链接与过长文本', () => {
  for (const [col, value] of [
    [4, 'bogus'],
    [9, '2026-02-30'],
    [11, 'javascript:alert(1)'],
    [13, 'unknown-key'],
    [14, 'maybe'],
    [12, 'x'.repeat(5001)],
  ]) {
    const source = parseCsv(templateCsv());
    source[1][col] = value;
    assert.throws(() => importCsv(toCsv(source), createDemo()));
  }
});
test('已有企业增加证据撤回核查与交接，保留历史', () => {
  const batch = createDemo();
  reviewCompany(batch, 'C01', 'candidate', '有完整模型使用证据');
  handoffCompany(batch, 'C01', 'accepted', '同事 A', '请核实采购预算与规模');
  const source = parseCsv(templateCsv());
  source[1][0] = batch.companies[0].name;
  source[1][1] = batch.companies[0].key;
  const imported = importCsv(toCsv(source), batch).batch;
  assert.equal(imported.companies[0].decision, null);
  assert.equal(imported.companies[0].handoff, null);
  assert.equal(imported.events.length, 3);
});
test('CSV导出防公式注入，文本HTML转义', () => {
  for (const sample of ['=1+1', '+SUM(A1)', '-1+1', '@SUM(A1)', '\t=HYPERLINK("bad")', '  =1'])
    assert.ok(csvCell(sample).startsWith('"\''));
  assert.equal(csvCell('普通中文'), '"普通中文"');
  assert.equal(escapeHtml('<img onerror="bad">'), '&lt;img onerror=&quot;bad&quot;&gt;');
  assert.equal(safeUrl('https://user:secret@example.com'), '');
});
test('备份只接受有效schema、唯一ID与完整交接，不接受伪造结构', () => {
  assert.deepEqual(parseBackup(JSON.stringify(createDemo())), createDemo());
  assert.throws(() => parseBackup('{bad'), /JSON/);
  for (const mutate of [
    (b) => {
      b.version = 999;
    },
    (b) => {
      b.companies[1].id = b.companies[0].id;
    },
    (b) => {
      b.companies[1].key = b.companies[0].key;
    },
    (b) => {
      b.companies[0].evidence[0].supports = ['bad'];
    },
    (b) => {
      b.companies[0].handoff = 'accepted';
    },
    (b) => {
      b.companies[0].decision = 'candidate';
    },
    (b) => {
      b.events = [{ id: 'x', companyId: 'missing', at: 'today', action: 'review', detail: 'bad' }];
    },
  ]) {
    const b = createDemo();
    mutate(b);
    assert.throws(() => validateBatch(b));
  }
});
test('存储损坏返回明确错误且不覆盖旧数据；写入失败上抛', () => {
  let value = '{broken';
  const storage = {
    getItem: () => value,
    setItem: (_key, data) => {
      value = data;
    },
  };
  const result = loadBatch(storage, createDemo);
  assert.ok(result.error);
  assert.equal(value, '{broken');
  saveBatch(storage, createDemo());
  assert.deepEqual(loadBatch(storage, createDemo).batch, createDemo());
  const denied = {
    getItem() {
      throw new Error('denied');
    },
    setItem() {
      throw new Error('quota');
    },
  };
  assert.ok(loadBatch(denied, createDemo).error);
  assert.throws(() => saveBatch(denied, createDemo()), /quota/);
  assert.equal(STORAGE_KEY, 'evidence-desk.v1');
});
test('证据包包含判断、出处与待补事项，不冒充商机', () => {
  const b = createDemo();
  const pack = evidencePack(b, b.companies[1]);
  assert.match(pack, /未核查/);
  assert.match(pack, /发布日期：未知/);
  assert.match(pack, /待补事项/);
  assert.match(pack, /不代表线上评分/);
});
test('空批次合法，统计为零且不是未知下游成果', () => {
  const b = createDemo();
  b.companies = [];
  assert.equal(validateBatch(b).companies.length, 0);
  assert.equal(stats(b).reviewed, 0);
  assert.equal('opportunities' in stats(b), false);
});
