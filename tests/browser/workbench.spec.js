import { test, expect } from '@playwright/test';
import { templateCsv } from '../../src/io.js';

test('核查、模拟交接、退回、补证、持久化和证据包形成完整流程', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '先看证据，再做判断。' })).toBeVisible();
  await page.getByRole('button', { name: '按核查项填写草稿' }).click();
  await page.getByRole('button', { name: '保存核查结论', exact: true }).click();
  await expect(page.getByRole('heading', { name: '已保存核查结论' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('核查结论', { exact: true })).toHaveValue('candidate');
  await page.getByRole('button', { name: '模拟交接', exact: true }).click();
  await page.getByLabel('接手负责人', { exact: true }).fill('演示同事 A');
  await page.getByLabel('交接说明', { exact: true }).fill('请核实业务使用规模、预算和部署方式');
  await page.getByRole('button', { name: '确认模拟接收', exact: true }).click();
  await expect(page.getByText('已模拟交给 演示同事 A。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '批次进度', exact: true }).click();
  await expect(page.getByText('未连接，结果未知', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '星屿软件（虚构）', exact: true }).click();
  await page.getByRole('button', { name: '退回补证', exact: true }).click();
  await page.getByLabel('需要补什么证据', { exact: true }).fill('请补充业务用量与采购窗口说明');
  await page.getByRole('button', { name: '保存补证任务', exact: true }).click();
  await expect(
    page.getByText('已退回补证：请补充业务用量与采购窗口说明', { exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出本家证据包', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('evidence-pack.md');
  await page.getByRole('button', { name: '补充证据', exact: true }).click();
  await page.getByLabel('来源标题', { exact: true }).fill('新核实的产品说明');
  await page.getByLabel('原文链接', { exact: true }).fill('https://example.com/new-demo');
  await page
    .getByLabel('原文摘录', { exact: true })
    .fill('虚构示例：新产品说明，补充模型使用业务证据。');
  await page.getByRole('button', { name: '保存证据并重新核查', exact: true }).click();
  await expect(page.getByLabel('核查结论', { exact: true })).toHaveValue('');
  await expect(page.getByRole('heading', { name: '新核实的产品说明', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
test('待核实不能交接；仅有技能证据不会成为规则候选', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /澄野数据（虚构）/ }).click();
  await page.getByRole('button', { name: '按核查项填写草稿' }).click();
  await expect(page.getByLabel('核查结论', { exact: true })).toHaveValue('verify');
  await page.getByRole('button', { name: '保存核查结论', exact: true }).click();
  await page.getByRole('button', { name: '模拟交接', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('四项完整依据');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: /青禾设计（虚构）/ }).click();
  await page.getByRole('button', { name: '按核查项填写草稿' }).click();
  await expect(page.getByLabel('核查结论', { exact: true })).toHaveValue('hold');
});
test('导入预览、提交、去重、错误隔离和JSON恢复', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '导入线索', exact: true }).click();
  await page
    .locator('#csv-file')
    .setInputFiles({ name: 'demo.csv', mimeType: 'text/csv', buffer: Buffer.from(templateCsv()) });
  await expect(page.getByRole('heading', { name: '确认导入 CSV', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '确认保存到本机', exact: true }).click();
  await expect(page.getByRole('button', { name: /示例企业（虚构）/ })).toBeVisible();
  await page.getByRole('button', { name: '导入线索', exact: true }).click();
  await page
    .locator('#csv-file')
    .setInputFiles({ name: 'demo.csv', mimeType: 'text/csv', buffer: Buffer.from(templateCsv()) });
  await expect(page.getByText(/本次新增 0 条证据，跳过 1 条重复证据/)).toBeVisible();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '导入线索', exact: true }).click();
  await page
    .locator('#csv-file')
    .setInputFiles({ name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('bad\nwrong') });
  await expect(page.getByRole('status')).toContainText('表头不正确');
  await page.getByRole('button', { name: '关闭对话框', exact: true }).click();
  const saved = await page.evaluate(() => localStorage.getItem('evidence-desk.v1'));
  await page.getByRole('button', { name: /恢复演示批次/ }).click();
  await page.getByRole('button', { name: '确认恢复演示', exact: true }).click();
  await page.getByRole('button', { name: '导入线索', exact: true }).click();
  await page.locator('#json-file').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(saved),
  });
  await page.getByRole('button', { name: '确认保存到本机', exact: true }).click();
  await expect(page.getByRole('button', { name: /示例企业（虚构）/ })).toBeVisible();
});
test('搜索、空状态、移动端与键盘无横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('搜索企业或业务场景', { exact: true }).fill('不存在的企业');
  await expect(page.getByRole('heading', { name: '没有符合条件的企业' })).toBeVisible();
  await page.getByRole('button', { name: '清除筛选', exact: true }).click();
  await expect(page.getByRole('heading', { name: '星屿软件（虚构）', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '补充证据', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
test('存储损坏不静默覆盖，私有工作目录不会由服务暴露', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('evidence-desk.v1', '{broken'));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('尚未覆盖原数据');
  await page.getByRole('button', { name: '按核查项填写草稿' }).click();
  await page.getByRole('button', { name: '保存核查结论', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('evidence-desk.v1'))).toBe('{broken');
  const response = await page.request.get('/.work/rules-09.png');
  expect(response.status()).toBe(404);
  expect((await page.request.get('/.git/config')).status()).toBe(404);
});

test('导入HTML只显示文本，应用不产生外部网络请求', async ({ page }) => {
  const external = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:4173/')) external.push(request.url());
  });
  await page.goto('/');
  const malicious = templateCsv().replace(
    '该虚构企业使用外部模型服务生成会议纪要，运营主体已对应。',
    '<img src=https://example.com/track onerror=alert(1)>',
  );
  await page.getByRole('button', { name: '导入线索', exact: true }).click();
  await page
    .locator('#csv-file')
    .setInputFiles({ name: 'html.csv', mimeType: 'text/csv', buffer: Buffer.from(malicious) });
  await page.getByRole('button', { name: '确认保存到本机', exact: true }).click();
  await page.getByRole('button', { name: /示例企业（虚构）/ }).click();
  await expect(page.locator('blockquote')).toHaveText(
    '<img src=https://example.com/track onerror=alert(1)>',
  );
  expect(await page.locator('blockquote img').count()).toBe(0);
  expect(external).toEqual([]);
});

test('存储配额失败不会显示保存成功，跨标签页更新暂停旧页写入', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '按核查项填写草稿' }).click();
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('存储已满', 'QuotaExceededError');
    };
  });
  await page.getByRole('button', { name: '保存核查结论', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('未保存');
  await expect(page.getByRole('heading', { name: '最后一步，由人判断' })).toBeVisible();
  await page.reload();
  const other = await context.newPage();
  await other.goto('/');
  await other.getByRole('button', { name: '按核查项填写草稿' }).click();
  await other.getByRole('button', { name: '保存核查结论', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('另一个标签页');
  await other.close();
});
