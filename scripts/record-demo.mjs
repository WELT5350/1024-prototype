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
async function cleanShot(path, fullPage = false) {
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await pause(350);
  await page.screenshot({
    path,
    fullPage,
    style: '#recording-caption, #toast { visibility: hidden !important; }',
  });
}
try {
  await page.goto('http://127.0.0.1:4173');
  await expect(page.getByRole('heading', { name: '先看证据，再做判断。' })).toBeVisible();
  await cleanShot('demo/workspace.png');
  await caption(
    '线索证据台 · 把名单变成同事接得住的线索',
    '本次使用虚构企业和原文。业务、支撑依据、下一步，浓缩成可以带走的三行卡。',
  );
  await pause(6000);
  await page.getByRole('button', { name: /澄野数据（虚构）/ }).click();
  await cleanShot('demo/missing-source.png');
  await caption(
    '有业务原文，只缺日期，为什么不能显示成零？',
    '三项原文支撑保留，来源有效性单独待核。缺证据不等于没有需求，缺日期也不能直接交接。',
  );
  await pause(7000);
  await page.getByRole('button', { name: '原文引用', exact: true }).click();
  await caption(
    '先看原文，判断有出处',
    '这段招聘职责说明知识库问答与外部模型接入；日期没有取得就保持未知，不擅自填入今天。',
  );
  await pause(5000);
  await page.getByRole('button', { name: '关闭对话框', exact: true }).click();
  await page.getByRole('button', { name: '按核查项填写草稿' }).click();
  await page.getByRole('button', { name: '保存核查结论', exact: true }).click();
  await page.getByRole('button', { name: '核实 / 编辑', exact: true }).click();
  await page.getByLabel('发布日期（未知可留空）', { exact: true }).fill('2026-10-18');
  await page.getByLabel('采集日期', { exact: true }).fill('2026-10-24');
  await caption(
    '演示补录已核实的日期',
    '来源由人工核实；程序只检查填写的数据。保存真实变更会撤回旧人工结论与交接。',
  );
  await pause(5000);
  await page.getByRole('button', { name: '保存证据并重新核查', exact: true }).click();
  await cleanShot('demo/comparison.png');
  await caption(
    '补证以后，能解释建议为什么变了',
    '原文支撑仍然是 3/3，改变的是来源有效性。规则建议从待核实变为候选，人工结论需要重新确认。',
  );
  await pause(7000);
  await page
    .getByRole('region', { name: '补证前后对照' })
    .getByRole('button', { name: '查看字段变化', exact: true })
    .click();
  await expect(page.getByRole('dialog').locator('.comparison-fields article')).toHaveCount(2);
  await cleanShot('demo/field-diff.png');
  await caption(
    '不是一句“已更新”，而是能核对的字段变化',
    '只有发布日期和采集日期变化。修改前、修改后以及人工撤回情况都能查看，备份恢复后仍保留。',
  );
  await pause(6000);
  await page.getByRole('button', { name: '关闭对话框', exact: true }).click();
  await page.getByRole('button', { name: '按核查项填写草稿' }).click();
  await page.getByRole('button', { name: '保存核查结论', exact: true }).click();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  const cardDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载文本 ↓', exact: true }).click();
  await (await cardDownload).saveAs('.work/recording/handoff-card.txt');
  await caption(
    '业务、依据、下一步：三行就能交给同事',
    '带原文编号和人工状态，可以复制或下载。用量、预算、采购时间没有采集，就明确写未知。',
  );
  await pause(7000);
  await page.getByRole('button', { name: '模拟交接', exact: true }).click();
  await page.getByLabel('接手负责人', { exact: true }).fill('演示同事 A');
  await expect(page.getByLabel('交接说明', { exact: true })).toContainText('预算、采购时间均未知');
  await caption(
    '交接卡直接带入说明，减少重复整理',
    '指定演示接手人后保存本地模拟记录，不会发送消息或写入 CRM。候选仍不等于商机。',
  );
  await pause(5000);
  await page.getByRole('button', { name: '确认模拟接收', exact: true }).click();
  await page.getByRole('button', { name: /青禾设计（虚构）/ }).click();
  await page.getByRole('button', { name: '按核查项填写草稿' }).click();
  await caption(
    '会使用 AI 工具，不自动算模型采购需求',
    '只有工具技能时保留暂缓；私有部署需核实适配，代招需核实主体。多几个关键词不会自动变成候选。',
  );
  await pause(6000);
  await page.getByRole('button', { name: '保存核查结论', exact: true }).click();
  await page.getByRole('button', { name: '导入线索', exact: true }).click();
  await page
    .locator('#csv-file')
    .setInputFiles({ name: 'demo.csv', mimeType: 'text/csv', buffer: Buffer.from(templateCsv()) });
  await page.getByRole('button', { name: '确认保存到本机', exact: true }).click();
  await page.getByRole('button', { name: '批次进度', exact: true }).click();
  await expect(page.getByText('未连接，结果未知', { exact: true })).toBeVisible();
  await cleanShot('demo/progress.png', true);
  await caption(
    '同一批次，同一个分母',
    'CSV 在本机校验、合并、去重。批次状态可交叉，不能相乘为漏斗；新增商机没有连接，保留未知。',
  );
  await pause(6000);
  await page.getByRole('button', { name: '澄野数据（虚构）', exact: true }).click();
  const packDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出本家证据包', exact: true }).click();
  await (await packDownload).saveAs('.work/recording/evidence-pack.md');
  await cleanShot('demo/review.png', true);
  await caption(
    '来源可回看，修改可对照，交接能带走',
    '原型不调用大模型，也不自动核验真假。AI 用于开发与验证；实际商业价值仍需真实用户试用。',
  );
  await pause(6000);
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'zh-CN',
  });
  const phone = await mobile.newPage();
  await phone.goto('http://127.0.0.1:4173');
  await phone.getByRole('button', { name: /澄野数据（虚构）/ }).click();
  await phone.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await phone.screenshot({
    path: 'demo/mobile.png',
    fullPage: true,
    style: '#toast { visibility: hidden !important; }',
  });
  await mobile.close();
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(
    '.work/recording/state.json',
    await page.evaluate(() => localStorage.getItem('evidence-desk.v1')),
  );
  const video = page.video();
  await context.close();
  await copyFile(await video.path(), '.work/recording/evidence-desk.webm');
  console.log('Demo recorded: .work/recording/evidence-desk.webm');
} finally {
  await browser.close();
}
