import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('缺日期仅缺来源；补证展示真实字段变化与人工撤回，刷新仍保留', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /澄野数据（虚构）/ }).click();
  await expect(page.locator('.check-panel h3')).toHaveText('3 / 3 项原文有支撑');
  await expect(page.locator('.source-gate')).toHaveText('来源有效性：待核实');
  await expect(page.locator('.suggestion')).toContainText('还需核实：来源有效性');
  await page.getByRole('button', { name: '按核查项填写草稿' }).click();
  await page.getByRole('button', { name: '保存核查结论', exact: true }).click();
  await page.getByRole('button', { name: '核实 / 编辑', exact: true }).click();
  await expect(page.getByLabel('采集日期', { exact: true })).toHaveValue('');
  await page.getByLabel('发布日期（未知可留空）', { exact: true }).fill('2026-10-18');
  await page.getByLabel('采集日期', { exact: true }).fill('2026-10-24');
  await page.getByRole('button', { name: '保存证据并重新核查', exact: true }).click();
  const comparison = page.getByRole('region', { name: '补证前后对照' });
  await expect(comparison).toContainText('原文支撑 3/3 → 3/3');
  await expect(comparison).toContainText('来源待核 → 有效');
  await expect(comparison).toContainText('待核实 → 候选');
  await expect(comparison).toContainText('旧人工结论已撤回');
  await expect(page.getByLabel('核查结论', { exact: true })).toHaveValue('');
  await comparison.getByRole('button', { name: '查看字段变化', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.comparison-fields article')).toHaveCount(2);
  await expect(dialog).toContainText('2026-10-18');
  await expect(dialog).toContainText('未记录');
  await page.getByRole('button', { name: '关闭对话框', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: /澄野数据（虚构）/ }).click();
  await expect(page.getByRole('region', { name: '补证前后对照' })).toContainText(
    '原文支撑 3/3 → 3/3',
  );
});

test('三行卡能复制和下载，证据编号、未知项与人工确认状态一致', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByRole('button', { name: /澄野数据（虚构）/ }).click();
  await page.getByRole('button', { name: '复制三行卡', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('已复制');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.split('\n')).toHaveLength(3);
  expect(copied).toContain('E03');
  expect(copied).toContain('发布日期待补');
  expect(copied).toContain('人工结论：未确认');
  expect(copied).toContain('用量、预算、采购时间均未知');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载文本 ↓', exact: true }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe('handoff-card.txt');
  // Windows clipboard normalizes line endings; the content remains the same three lines.
  expect(await readFile(await file.path(), 'utf8')).toBe(copied.replace(/\r\n/g, '\n'));
  await page.getByRole('button', { name: '去人工确认 ↓', exact: true }).click();
  await expect(page.locator('#review-panel')).toBeFocused();
});

test('保存未变更的证据或画像不会撤回结论；移动端三行卡无横向溢出', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '按核查项填写草稿' }).click();
  await page.getByRole('button', { name: '保存核查结论', exact: true }).click();
  await page.getByRole('button', { name: '核实 / 编辑', exact: true }).first().click();
  await page.getByRole('button', { name: '保存证据并重新核查', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('没有字段变化');
  await page.getByRole('button', { name: '核实画像', exact: true }).click();
  await page.getByRole('button', { name: '保存画像并重新核查', exact: true }).click();
  await expect(page.getByLabel('核查结论', { exact: true })).toHaveValue('candidate');
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('evidence-desk.v1')).events.length),
  ).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: '复制三行卡', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('自动复制被拒绝时提供可选择的文本', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    navigator.clipboard.writeText = () => Promise.reject(new Error('denied'));
  });
  await page.getByRole('button', { name: '复制三行卡', exact: true }).click();
  await expect(page.getByLabel('三行交接卡文本', { exact: true })).toContainText(
    '预算、采购时间均未知',
  );
});
