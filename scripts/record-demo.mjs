import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { templateCsv } from '../src/io.js';

await mkdir('demo', { recursive: true });
await mkdir('.work/recording', { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {}),
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
  recordVideo: { dir: '.work/recording', size: { width: 1440, height: 960 } },
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const pause = (ms = 3000) => page.waitForTimeout(ms);
// Subtitles are recording overlays only. Business state always changes through the UI.
async function caption(title, body) {
  await page.evaluate(
    ({ title, body }) => {
      let box = document.querySelector('#recording-caption');
      if (!box) {
        box = document.createElement('div');
        box.id = 'recording-caption';
        Object.assign(box.style, {
          position: 'fixed',
          bottom: '18px',
          left: '210px',
          right: '26px',
          zIndex: '999',
          pointerEvents: 'none',
          background: '#182b48f2',
          color: 'white',
          borderRadius: '10px',
          boxShadow: '0 5px 30px #182b4830',
          padding: '14px 22px',
          fontFamily: 'Segoe UI, Microsoft YaHei, sans-serif',
          fontSize: '14px',
          lineHeight: '1.8',
          borderLeft: '4px solid #74d1c6',
        });
        document.body.append(box);
      }
      box.replaceChildren();
      const heading = document.createElement('strong');
      heading.textContent = title;
      const description = document.createElement('div');
      description.textContent = body;
      description.style.color = '#ccd8eb';
      description.style.fontSize = '12px';
      box.append(heading, description);
    },
    { title, body },
  );
}
try {
  await page.goto('http://127.0.0.1:4173');
  await expect(page.getByRole('heading', { name: '先看证据，再做判断。' })).toBeVisible();
  await page.screenshot({ path: 'demo/workspace.png', fullPage: false });
  await caption(
    '线索证据台 · 从一条名单，到一份可复核的交接',
    '本次全部使用虚构企业与证据。名单本身回答不了“为什么值得跟进”。',
  );
  await pause(6000);
  await page.getByRole('button', { name: '原文引用', exact: true }).first().click();
  await caption(
    '先读原文，不用关键词替代需求判断',
    '官网说明产品与主体；招聘职责说明模型 API 接入。来源、日期和原文一起保存。',
  );
  await pause(5000);
  await page.getByRole('button', { name: '关闭对话框', exact: true }).click();
  await page.getByRole('button', { name: 'E02 ↗', exact: true }).first().click();
  await caption(
    '每一项判断，都能回到对应证据',
    '点击证据编号定位原文；四项完整只是值得继续核实，不等于有采购预算。',
  );
  await pause(5000);
  await page.getByRole('button', { name: '按核查项填写草稿' }).click();
  await caption('规则整理依据，人工确认结论', '草稿列出每项支撑证据和缺口，由人核对后保存。');
  await pause(4000);
  await page.getByRole('button', { name: '保存核查结论', exact: true }).click();
  await expect(page.getByRole('heading', { name: '已保存核查结论' })).toBeVisible();
  await page.getByRole('button', { name: '模拟交接', exact: true }).click();
  await page.getByLabel('接手负责人', { exact: true }).fill('演示同事 A');
  await page
    .getByLabel('交接说明', { exact: true })
    .fill('原文已对应；下一步核实模型使用规模、采购预算与部署要求。');
  await caption(
    '把下一步写清楚，同事才接得住',
    '这是本地模拟：指定接手人、留下说明，不会通知销售或写入 CRM。',
  );
  await pause(5000);
  await page.getByRole('button', { name: '确认模拟接收', exact: true }).click();
  await expect(page.getByText('已模拟交给 演示同事 A。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /澄野数据（虚构）/ }).click();
  await page.getByRole('button', { name: '按核查项填写草稿' }).click();
  await page.getByRole('button', { name: '保存核查结论', exact: true }).click();
  await caption(
    '缺证据，保持待核实',
    '这家公司有具体业务原文，但日期缺失。不会把未知当成无需求，也不会强行交接。',
  );
  await pause(5000);
  await page.getByRole('button', { name: '核实 / 编辑', exact: true }).click();
  await page.getByLabel('发布日期（未知可留空）', { exact: true }).fill('2026-10-18');
  await page.getByLabel('采集日期', { exact: true }).fill('2026-10-24');
  await caption('补证后，重新核查', '演示已核实日期的补录。修改证据会撤回旧判断，历史记录仍保留。');
  await pause(4000);
  await page.getByRole('button', { name: '保存证据并重新核查', exact: true }).click();
  await page.getByRole('button', { name: '按核查项填写草稿' }).click();
  await expect(page.getByLabel('核查结论', { exact: true })).toHaveValue('candidate');
  await page.getByRole('button', { name: '保存核查结论', exact: true }).click();
  await page.getByRole('button', { name: '退回补证', exact: true }).click();
  await page
    .getByLabel('需要补什么证据', { exact: true })
    .fill('资料可支持候选；仍需补充业务使用量和采购窗口，方便后续沟通。');
  await caption(
    '接收或退回，都留下可执行的说明',
    '候选不是商机。后续需要补什么，写给下一位同事看。',
  );
  await pause(4000);
  await page.getByRole('button', { name: '保存补证任务', exact: true }).click();
  await page.getByRole('button', { name: /青禾设计（虚构）/ }).click();
  await page.getByRole('button', { name: '按核查项填写草稿' }).click();
  await caption(
    '会用 AI 工具，不等于采购模型服务',
    '这条只有技能要求，规则建议暂缓。不会为了凑数量，把行业词或工具名当需求。',
  );
  await pause(5000);
  await page.getByRole('button', { name: '保存核查结论', exact: true }).click();
  await page.getByRole('button', { name: '导入线索', exact: true }).click();
  await page
    .locator('#csv-file')
    .setInputFiles({ name: 'demo.csv', mimeType: 'text/csv', buffer: Buffer.from(templateCsv()) });
  await caption(
    '批量导入，先校验再确认',
    '按企业标识合并、按证据内容去重。错误整批回滚；文件只在本机处理。',
  );
  await pause(4000);
  await page.getByRole('button', { name: '确认保存到本机', exact: true }).click();
  await page.getByRole('button', { name: '批次进度', exact: true }).click();
  await expect(page.getByText('未连接，结果未知', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'demo/progress.png', fullPage: true });
  await caption(
    '同一个批次，同一个分母',
    '当前已核查、候选与接收可重叠，不能当连续漏斗相乘。新增商机未连接，保留未知。',
  );
  await pause(6000);
  await page.getByRole('button', { name: '星屿软件（虚构）', exact: true }).click();
  const packetDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出本家证据包', exact: true }).click();
  await expect((await packetDownload).suggestedFilename()).toBe('evidence-pack.md');
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await caption(
    '一份证据包，带走原文、依据与下一步',
    '可导出 Markdown、核查 CSV 和完整 JSON 备份。当前是本地可交互原型，商业价值仍需真实用户验证。',
  );
  await pause(6000);
  await page.evaluate(() => document.querySelector('#recording-caption')?.remove());
  await page.screenshot({ path: 'demo/review.png', fullPage: true });
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'zh-CN',
  });
  const phone = await mobile.newPage();
  await phone.goto('http://127.0.0.1:4173');
  await phone.screenshot({ path: 'demo/mobile.png', fullPage: true });
  await mobile.close();
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    '.work/recording/state.json',
    await page.evaluate(() => localStorage.getItem('evidence-desk.v1')),
  );
  const video = page.video();
  await context.close();
  const videoPath = await video.path();
  await copyFile(videoPath, '.work/recording/evidence-desk.webm');
  console.log('Demo recorded: .work/recording/evidence-desk.webm');
} finally {
  await browser.close();
}
