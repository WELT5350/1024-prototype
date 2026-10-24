import {
  AS_OF,
  CRITERIA,
  DECISIONS,
  SUBJECTS,
  USAGES,
  RELATIONS,
  SOURCE_TYPES,
  evaluateCompany,
  inspectEvidence,
  reviewCompany,
  handoffCompany,
  stats,
  escapeHtml as h,
  uid,
  dateValue,
  safeUrl,
  validateBatch,
} from './model.js';
import { createDemo } from './seed.js';
import {
  loadBatch,
  saveBatch,
  STORAGE_KEY,
  importCsv,
  templateCsv,
  parseBackup,
  exportReviews,
  evidencePack,
} from './io.js';

const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const toastBox = document.querySelector('#toast');
let storage;
try {
  storage = window.localStorage;
} catch {
  storage = {
    getItem() {
      throw new Error('unavailable');
    },
    setItem() {
      throw new Error('unavailable');
    },
  };
}
const initial = loadBatch(storage, createDemo);
let batch = initial.batch;
let recoveryError = initial.error;
const ui = { view: 'workspace', selected: batch.companies[0]?.id, filter: 'all', search: '' };
let toastTimer;
const icons = {
  desk: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h4m0 5 2 2 5-6"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  chart: '<path d="M4 4v16h17M9 16v-5m5 5V7m5 9v-3"/>',
  book: '<path d="M12 5v16m0-16C8 2 5 3 2 4v15c4-2 7-1 10 2 3-3 6-4 10-2V4c-3-1-6-2-10 1Z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  down: '<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  check: '<path d="m5 12 4 4L20 5"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  link: '<path d="m10 13 4-4m-5 7-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 1 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0"/>',
  back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
};
const icon = (key) =>
  `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[key] || icons.desk}</svg>`;
function toast(message, error = false) {
  clearTimeout(toastTimer);
  toastBox.textContent = message;
  toastBox.className = `toast show${error ? ' error' : ''}`;
  toastTimer = setTimeout(() => {
    toastBox.className = 'toast';
  }, 5500);
}
function commit(next, message, allowRecovery = false) {
  try {
    if (recoveryError && !allowRecovery)
      throw new Error('请先在顶部恢复提示中备份原始存储，再重置或恢复批次。');
    batch = saveBatch(storage, next);
    recoveryError = '';
    render();
    if (message) toast(message);
    return true;
  } catch (error) {
    toast(`未保存：${error.message} 原有批次未变更。`, true);
    return false;
  }
}
function download(name, content, mime = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const selected = () => batch.companies.find((row) => row.id === ui.selected);
function pill(decision, label) {
  return `<span class="pill ${h(decision || 'unreviewed')}">${h(label || DECISIONS[decision] || '待核查')}</span>`;
}
function visibleCompanies() {
  return batch.companies.filter((company) => {
    const matches =
      ui.filter === 'all' ||
      (ui.filter === 'unreviewed'
        ? !company.reviewedAt
        : ui.filter === 'accepted'
          ? company.handoff === 'accepted'
          : company.decision === ui.filter);
    const query = ui.search.toLocaleLowerCase().trim();
    return (
      matches &&
      (!query ||
        [company.name, company.scene, company.key, company.region]
          .join(' ')
          .toLocaleLowerCase()
          .includes(query))
    );
  });
}
function render() {
  const counts = stats(batch);
  app.innerHTML = `<aside class="sidebar">
    <a href="#workspace" class="brand" data-nav="workspace"><span class="brand-mark">${icon('desk')}</span><span>证据台<small>EVIDENCE DESK</small></span></a>
    <div class="nav-section">工作空间</div>
    <nav aria-label="主导航">
      ${[
        ['workspace', 'grid', '线索核查'],
        ['overview', 'chart', '批次进度'],
        ['rules', 'book', '核查标准'],
      ]
        .map(
          ([view, symbol, title]) =>
            `<button class="nav-item ${ui.view === view ? 'active' : ''}" data-nav="${view}" ${ui.view === view ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${title}</span>${view === 'workspace' ? `<span class="nav-count">${counts.total}</span>` : ''}</button>`,
        )
        .join('')}
    </nav>
    <div class="sidebar-bottom"><span class="tiny-label">本次演示</span><p>一条线索，<br>一份说得清的依据。</p><div class="sidebar-rule"></div><button class="text-button" data-action="reset">恢复演示批次 ${icon('back')}</button><small>仅在本机保存 · 不联网发送</small></div>
  </aside>
  <div class="shell"><header class="topbar"><div class="breadcrumb">工作空间 <span>/</span> <strong>${ui.view === 'workspace' ? '线索核查' : ui.view === 'overview' ? '批次进度' : '核查标准'}</strong></div><div class="topbar-right"><span class="local-status"><i></i> 本机工作区</span><span class="avatar" title="演示操作员">W</span></div></header>
  <main id="main" tabindex="-1">
    <div class="demo-notice"><span>演示模式</span> 内置企业、原文和交接均为虚构样本。导入文件只在本机处理。<button data-action="about">了解边界 ${icon('arrow')}</button></div>
    ${recoveryError ? `<div class="recovery" role="alert"><strong>本地数据需要恢复</strong><p>${h(recoveryError)}</p><button class="button" data-action="raw-backup">下载原始存储</button><button class="button" data-action="import">恢复 JSON 备份</button><button class="text-button" data-action="reset">重置演示</button></div>` : ''}
    <section class="page-heading"><div><div class="eyebrow">${ui.view === 'workspace' ? 'EVIDENCE BEFORE DECISION' : ui.view === 'overview' ? 'ONE BATCH, ONE DENOMINATOR' : 'MAKE THE REASON VISIBLE'}</div><h1>${ui.view === 'workspace' ? '先看证据，再做判断。' : ui.view === 'overview' ? '每一步，都能对上数。' : '把判断依据说清楚。'}</h1><p>${ui.view === 'workspace' ? '把分散的企业资料，整理成下一位同事接得住的线索。' : ui.view === 'overview' ? '只看当前批次。未取得的结果保留未知，不用 0 代替。' : '先核实业务与来源，再决定候选、待核实或暂缓。'}</p></div><div class="heading-actions"><button class="button" data-action="import">${icon('upload')} 导入线索</button><button class="button primary" data-action="backup">${icon('down')} 备份批次</button></div></section>
    <div class="batch-strip"><span class="batch-icon">${icon('desk')}</span><strong>${h(batch.name)}</strong><span class="batch-date">观察日 ${h(batch.asOf)}</span><span class="batch-meta"><b>${counts.total}</b> 家企业 <i>·</i> <b>${counts.evidence}</b> 条证据</span><span class="batch-id">${h(batch.id)}</span></div>
    <div id="view-content">${ui.view === 'workspace' ? workspaceHtml(counts) : ui.view === 'overview' ? overviewHtml(counts) : rulesHtml()}</div>
    <footer class="workspace-footer"><span>证据可追溯，结论可解释。</span><span>Evidence Desk / 1024 Builder Day</span></footer>
  </main></div>`;
  if (ui.view === 'workspace') renderQueueAndDetail();
}
function workspaceHtml(counts) {
  const filters = [
    ['all', '全部', counts.total],
    ['unreviewed', '待核查', counts.total - counts.reviewed],
    ['candidate', '候选', counts.candidate],
    ['verify', '待核实', counts.verify],
    ['hold', '暂缓', counts.hold],
    ['accepted', '已交接', counts.accepted],
  ];
  return `<div class="work-toolbar"><div class="filters" role="group" aria-label="核查状态筛选">${filters.map(([key, label, count]) => `<button data-filter="${key}" class="filter ${ui.filter === key ? 'active' : ''}" aria-pressed="${ui.filter === key}">${label}<span>${count}</span></button>`).join('')}</div><label class="search">${icon('search')}<input id="search" aria-label="搜索企业或业务场景" placeholder="搜索企业、场景或编号" value="${h(ui.search)}" maxlength="200" /></label></div>
  <div class="workspace"><section class="queue" aria-label="企业核查队列"><div class="section-label">企业队列 <span id="queue-count"></span></div><div id="queue-list" class="queue-list"></div><div class="queue-hint">${icon('clock')} 建议逐家核查，先确认缺失项。</div></section><section id="company-detail" aria-label="企业证据与核查详情"></section></div>`;
}
function renderQueueAndDetail() {
  const list = visibleCompanies();
  if (!list.some((row) => row.id === ui.selected)) ui.selected = list[0]?.id;
  document.querySelector('#queue-count').textContent = `${list.length} 条`;
  document.querySelector('#queue-list').innerHTML = list.length
    ? list
        .map((company) => {
          const check = evaluateCompany(company, batch.asOf);
          const complete = check.checks.filter((item) => item.pass).length;
          return `<button class="company-card ${company.id === ui.selected ? 'selected' : ''}" data-company="${h(company.id)}" aria-pressed="${company.id === ui.selected}"><div class="company-card-top"><span class="company-initial">${h(company.name.slice(0, 1))}</span>${pill(company.decision)}${company.handoff === 'returned' ? '<span class="returned-label">退回</span>' : company.handoff === 'accepted' ? '<span class="accepted-label">已交接</span>' : ''}</div><strong>${h(company.name)}</strong><p>${h(company.scene || '业务场景待补')}</p><div class="company-card-bottom"><span>${h(company.region || '地区待补')} <i>·</i> ${company.evidence.length} 条证据</span><span class="mini-coverage" aria-label="${complete} 项有依据，共四项">${check.checks.map((item) => `<i class="${item.pass ? 'filled' : ''}"></i>`).join('')}</span></div></button>`;
        })
        .join('')
    : `<div class="empty"><span class="empty-icon">${icon('search')}</span><h3>没有符合条件的企业</h3><p>换个关键词，或清除状态筛选。</p><button class="button" data-action="clear">清除筛选</button></div>`;
  document.querySelector('#company-detail').innerHTML = selected()
    ? detailHtml(selected())
    : `<div class="detail-empty"><span>${icon('desk')}</span><h2>${batch.companies.length ? '从队列中选择一家公司' : '让第一条线索有据可查'}</h2><p>${batch.companies.length ? '证据、缺失项和人工结论会显示在这里。' : '使用模板导入企业与证据，从一条明确的业务线索开始。'}</p><button class="button" data-action="${batch.companies.length ? 'clear' : 'import'}">${batch.companies.length ? '查看全部企业' : '导入线索 CSV'}</button></div>`;
}
function detailHtml(company) {
  const result = evaluateCompany(company, batch.asOf);
  const relevantEvents = batch.events
    .filter((event) => event.companyId === company.id)
    .slice(-5)
    .reverse();
  return `<div class="detail-heading"><div><div class="detail-overline">${h(company.key)} <span>企业核查单</span></div><h2>${h(company.name)}</h2><p>${h(company.scene || '业务场景待补')}</p></div><button class="icon-text" data-action="profile">核实画像 ${icon('arrow')}</button></div>
  <div class="profile-row"><span>${h(SUBJECTS[company.identity])}</span><span>${h(USAGES[company.usage])}</span><span>${h(RELATIONS[company.relationship])}</span></div>
  <div class="detail-columns"><div class="evidence-column"><div class="section-title"><h3>来源与原文 <span>${company.evidence.length}</span></h3><button class="text-button" data-action="add-evidence">${icon('plus')} 补充证据</button></div>
    <div class="evidence-list">${
      company.evidence
        .map((evidence) => {
          const state = inspectEvidence(evidence, batch.asOf);
          return `<article class="evidence-card" id="evidence-${h(evidence.id)}"><div class="source-heading"><span class="evidence-id">${h(evidence.id)}</span><span class="source-type">${h(evidence.kind)}</span><span class="source-state ${state.usable ? 'ok' : 'warning'}">${state.usable ? '可用于核查' : h(state.problem)}</span></div><h4>${h(evidence.title)}</h4><blockquote>${h(evidence.quote)}</blockquote><div class="source-usage">支撑 ${evidence.supports.length ? evidence.supports.map((key) => h(CRITERIA.find((rule) => rule.id === key)?.label || key)).join(' / ') : '暂无核查项'}</div><div class="source-footer"><span>发布 ${h(evidence.date || '未知')}<br>采集 ${h(evidence.collectedAt || '未知')}</span><button class="source-link" data-source="${h(evidence.id)}">${icon('link')} 原文引用</button><button class="text-button" data-edit-evidence="${h(evidence.id)}">核实 / 编辑</button></div></article>`;
        })
        .join('') ||
      '<div class="empty"><h4>还没有证据</h4><p>补充原文、日期和链接，才能开始判断。</p></div>'
    }</div>
    <div class="evidence-note">原文与链接由人工核实；观察窗口仅供演示，不代表生产评分规则。</div>
    ${relevantEvents.length ? `<section class="history"><div class="section-title"><h3>操作记录</h3><span>最近 ${relevantEvents.length} 条</span></div>${relevantEvents.map((event) => `<div class="history-item"><i></i><div><p>${h(event.detail)}</p><time>${h(new Date(event.at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }))} 北京时间</time></div></div>`).join('')}</section>` : ''}
  </div><aside class="review-column"><section class="check-panel"><div class="panel-eyebrow">核查依据</div><h3>${result.checks.filter((item) => item.pass).length}<small> / 4 项有依据</small></h3><div class="coverage-track">${result.checks.map((item) => `<span class="${item.pass ? 'filled' : ''}"></span>`).join('')}</div><div class="check-items">${result.checks.map((item) => `<div class="check-item"><span class="check-dot ${item.pass ? 'pass' : ''}">${item.pass ? icon('check') : '?'}</span><div><strong>${item.label}</strong><p>${item.pass ? item.detail : `待补：${item.detail}`}</p><div class="proof-links">${item.proof.map((id) => `<button data-proof="${h(id)}" title="定位证据 ${h(id)}">${h(id)} ↗</button>`).join('')}</div></div></div>`).join('')}</div><div class="suggestion"><span>规则建议</span>${pill(result.suggestion)}<p>${h(result.explanation)}</p></div><button class="text-button rules-link" data-nav="rules">查看核查标准 ${icon('arrow')}</button></section>
    <section class="human-panel"><div class="panel-eyebrow">人工确认</div><h3>${company.reviewedAt ? '已保存核查结论' : '最后一步，由人判断'}</h3><p>建议供核查参考。选择结论并留下原因，下一位同事才能接手。</p><form id="review-form"><label>核查结论<select name="decision" aria-label="核查结论"><option value="">请选择结论</option>${Object.entries(
      DECISIONS,
    )
      .map(
        ([key, value]) =>
          `<option value="${key}" ${company.decision === key ? 'selected' : ''}>${value}</option>`,
      )
      .join(
        '',
      )}</select></label><label>判断依据<textarea name="reason" aria-label="判断依据" required minlength="4" maxlength="2000" placeholder="哪条原文支持你的判断？还缺什么？">${h(company.reviewReason)}</textarea></label><button type="button" class="text-button" data-action="fill-reason">按核查项填写草稿</button><button class="button primary full" type="submit">${icon('check')} 保存核查结论</button></form></section>
    <section class="handoff-panel"><div class="section-title"><h3>交接记录</h3><span class="small-tag">本地模拟</span></div><p>${company.handoff === 'accepted' ? `已模拟交给 ${h(company.owner)}。` : company.handoff === 'returned' ? `已退回补证：${h(company.feedback)}` : '核查完成后，指定接手人或退回补证。'}</p><div class="handoff-actions"><button class="button" data-action="handoff">${company.handoff === 'accepted' ? '查看交接' : '模拟交接'}</button><button class="button quiet" data-action="return">退回补证</button></div><button class="text-button" data-action="pack">${icon('down')} 导出本家证据包</button></section>
  </aside></div>`;
}
function overviewHtml(counts) {
  const percent = counts.total ? Math.round((counts.reviewed / counts.total) * 100) : 0;
  const gaps = CRITERIA.map((rule) => ({
    ...rule,
    count: batch.companies.filter(
      (row) => !evaluateCompany(row, batch.asOf).checks.find((item) => item.id === rule.id).pass,
    ).length,
  }));
  return `<div class="overview-grid"><section class="progress-panel"><div class="section-title"><h2>这一批，核查到哪了？</h2><span class="small-tag">${h(batch.asOf)} 快照</span></div><div class="progress-number">${counts.reviewed}<span> / ${counts.total} 家已核查</span><b>${percent}%</b></div><div class="progress-bar"><span style="width:${percent}%"></span></div><div class="progress-legend"><span><i class="dot blue"></i> 已核查 ${counts.reviewed}</span><span><i class="dot"></i> 尚待核查 ${counts.total - counts.reviewed}</span></div><div class="stage-row"><div><span>当前候选</span><strong>${counts.candidate}</strong><small>人工确认的候选企业</small></div><div><span>已模拟接收</span><strong>${counts.accepted}</strong><small>不等于 CRM 写入</small></div><div><span>新增商机</span><strong class="unknown">—</strong><small>未连接，结果未知</small></div></div><button class="button" data-action="export-csv">${icon('down')} 导出核查结果 CSV</button></section>
    <section class="gap-panel"><div class="section-title"><h2>优先补什么？</h2><span>当前批次 / ${counts.total} 家</span></div>${gaps.map((gap) => `<div class="gap-row"><div><span>${gap.label}</span><strong>${gap.count} <small>家待补</small></strong></div><div class="gap-bar"><span style="width:${counts.total ? (gap.count / counts.total) * 100 : 0}%"></span></div></div>`).join('')}<p>一家企业可同时缺多项，不能把这些数量相加当企业总数。</p></section></div>
    <section class="panel results-panel"><div class="section-title"><h2>当前状态明细</h2><button class="text-button" data-nav="workspace">回到队列 ${icon('arrow')}</button></div><div class="table-scroll"><table><thead><tr><th scope="col">企业</th><th scope="col">人工结论</th><th scope="col">依据完整度</th><th scope="col">交接</th><th scope="col">负责人</th></tr></thead><tbody>${batch.companies.map((row) => `<tr><td><button class="table-name" data-company="${h(row.id)}">${h(row.name)}</button><small>${h(row.scene)}</small></td><td>${pill(row.decision)}</td><td>${evaluateCompany(row, batch.asOf).checks.filter((item) => item.pass).length} / 4 项</td><td>${row.handoff === 'accepted' ? '已模拟接收' : row.handoff === 'returned' ? '退回补证' : '未交接'}</td><td>${h(row.owner || '未指定')}</td></tr>`).join('') || '<tr><td colspan="5">当前批次暂无企业。请先导入线索。</td></tr>'}</tbody></table></div></section><div class="method-note"><strong>口径说明</strong><p>此处是同一批次的当前状态，不是连续转化漏斗。补证会撤回旧核查与交接状态，历史记录仍保留。候选、已接收与商机不是同一个业务结果。</p></div>`;
}
function rulesHtml() {
  return `<div class="rules-intro"><div class="rules-mark">${icon('book')}</div><div><h2>四个问题，一份可复核的判断。</h2><p>不为线索打一个看似精确的分数。先把每个结论对应的原文和缺失项找出来。</p></div></div><div class="rule-grid">${CRITERIA.map((rule) => `<article class="rule-card"><span>${icon(rule.id === 'trace' ? 'link' : 'desk')}</span><h3>${rule.label}</h3><p>${rule.detail}。</p><small>${rule.id === 'identity' ? '集团、猎头、外派与实际用工主体分别核实。主体失效先暂缓。' : rule.id === 'usage' ? '具体模型应用或服务任务才提供依据。会用 Cursor、了解 RAG 不等于企业要采购模型。' : rule.id === 'trace' ? '原文、来源链接、发布与采集日期齐全。未来日期、正文冲突、过期或主体不匹配均标待核。' : '区分外部模型服务、私有部署与服务提供方。尚未确认适配时保留待核，不强推为采购需求。'}</small></article>`).join('')}</div><section class="panel rules-table"><h2>建议如何形成</h2><div class="table-scroll"><table><thead><tr><th scope="col">建议</th><th scope="col">本原型采用的条件</th><th scope="col">下一步</th></tr></thead><tbody><tr><td>${pill('candidate')}</td><td>四项都有近期、可追溯、主体对应的依据</td><td>人工确认；不代表已确认预算或购买意愿</td></tr><tr><td>${pill('verify')}</td><td>缺少任一项，或服务适配尚未确认</td><td>列出缺口，补证后重新核查</td></tr><tr><td>${pill('hold')}</td><td>主体失效，或现有业务描述只有技能、工具使用</td><td>暂缓并保留原因；不推断永久无需求</td></tr></tbody></table></div></section><div class="method-note"><strong>演示参数与范围</strong><p>招聘观察窗口 120 天，其他来源 365 天；均相对批次观察日计算。这是本原型的演示参数，不是生产系统配置。多一种来源不会自动加分，也不会自动得到候选结论。人工结论可以与建议不同，但需写明原因；模拟交接仍要求四项依据完整。</p><p>本原型使用确定性规则组织证据，没有调用大模型，也不声称自动理解或验证了原文真假。AI 的作用体现在开发过程，不伪装为已接入的产品能力。</p></div>`;
}
function openDialog(title, body, footer = '') {
  modal.innerHTML = `<div class="modal-heading"><h2 id="modal-title">${h(title)}</h2><button class="icon-button" data-action="close" aria-label="关闭对话框">${icon('close')}</button></div><div class="modal-body">${body}</div>${footer ? `<div class="modal-footer">${footer}</div>` : ''}`;
  if (!modal.open) modal.showModal();
}
function closeDialog() {
  modal.close();
}
function options(map, value) {
  return Object.entries(map)
    .map(
      ([key, label]) =>
        `<option value="${h(key)}" ${value === key ? 'selected' : ''}>${h(label)}</option>`,
    )
    .join('');
}
function importDialog() {
  openDialog(
    '导入线索与证据',
    `<p class="modal-lead">从 CSV 增加企业与证据，或从 JSON 恢复整个批次。</p><div class="import-option"><span>${icon('upload')}</span><div><h3>导入线索 CSV</h3><p>按去重标识合并，同一证据不会重复加入。新增证据后需要重新核查。</p><button class="text-button" data-action="template">先下载带示例的模板 ↗</button></div></div><label class="file-picker">选择 CSV 文件<input type="file" id="csv-file" accept=".csv,text/csv" /></label><details><summary>模板字段与填写说明</summary><p>主体状态：verified / unclear / invalid；业务用途：application / skills / unknown；服务关系：api / private / provider / unknown。</p><p>支撑项可用 identity（主体）、usage（用途）、fit（服务关系），用 | 分隔；这些标记需由人工依据原文填写。日期使用 YYYY-MM-DD；缺少日期可留空待核。最多 500 家企业、2000 条证据、单文件 5 MB。</p></details><div class="import-divider"></div><h3>恢复批次 JSON</h3><p>恢复会替换当前批次。确认前先下载当前备份。</p><button class="text-button" data-action="backup">下载当前批次备份</button><label class="file-picker secondary">选择 JSON 备份<input type="file" id="json-file" accept=".json,application/json" /></label>`,
  );
}
function profileDialog() {
  const company = selected();
  openDialog(
    '核实企业画像',
    `<p>画像由人工核实。修改会撤回旧核查与交接状态，历史记录保留。</p><form id="profile-form"><label>企业名称<input value="${h(company.name)}" readonly /></label><label>业务场景<input name="scene" value="${h(company.scene)}" required maxlength="200" /></label><label>主体状态<select name="identity">${options(SUBJECTS, company.identity)}</select></label><label>业务用途<select name="usage">${options(USAGES, company.usage)}</select></label><label>服务关系<select name="relationship">${options(RELATIONS, company.relationship)}</select></label><button class="button primary full">保存画像并重新核查</button></form>`,
  );
}
function evidenceDialog(evidenceId) {
  const item = selected().evidence.find((row) => row.id === evidenceId);
  openDialog(
    item ? '核实来源与证据' : '补充一条证据',
    `<p>仅记录你已取得并核实的材料。本操作不会联网采集或验证来源。</p><form id="evidence-form" data-evidence-id="${h(item?.id || '')}"><div class="form-row"><label>来源类型<select name="kind">${SOURCE_TYPES.map((kind) => `<option ${item?.kind === kind ? 'selected' : ''}>${kind}</option>`).join('')}</select></label><label>来源标题<input name="title" value="${h(item?.title || '')}" required maxlength="200" /></label></div><div class="form-row"><label>发布日期（未知可留空）<input type="date" name="date" value="${h(item?.date || '')}" /></label><label>采集日期<input type="date" name="collectedAt" value="${h(item?.collectedAt || batch.asOf)}" /></label></div><label>原文链接<input name="url" type="url" value="${h(item?.url || '')}" maxlength="2000" placeholder="https://…（缺失可留空待核）" /></label><label>原文摘录<textarea name="quote" aria-label="原文摘录" required maxlength="5000" rows="5" placeholder="保留能说明业务任务和主体归属的原文。">${h(item?.quote || '')}</textarea></label><fieldset><legend>原文能支持哪些判断？</legend><div class="checkbox-grid">${CRITERIA.filter(
      (rule) => rule.id !== 'trace',
    )
      .map(
        (rule) =>
          `<label><input type="checkbox" name="supports" value="${rule.id}" ${item?.supports.includes(rule.id) ? 'checked' : ''} />${rule.label}</label>`,
      )
      .join(
        '',
      )}</div></fieldset><label class="checkbox"><input name="entityMatch" type="checkbox" ${item?.entityMatch ? 'checked' : ''} />已核实原文属于这家企业</label><label class="checkbox"><input name="dateConflict" type="checkbox" ${item?.dateConflict ? 'checked' : ''} />页面日期与正文存在冲突</label><button class="button primary full">保存证据并重新核查</button></form>`,
  );
}
function handoffDialog(action) {
  const company = selected();
  if (!company.reviewedAt) {
    toast('请先选择结论并保存人工核查。', true);
    return;
  }
  if (
    action === 'accepted' &&
    (company.decision !== 'candidate' || !evaluateCompany(company, batch.asOf).complete)
  ) {
    toast('模拟交接需要候选结论和四项完整依据。可以先退回补证。', true);
    return;
  }
  openDialog(
    action === 'accepted' ? '模拟交接给同事' : '退回补充证据',
    `<div class="simulation-note">这是一条本地模拟记录，不会通知任何人，也不会写入 CRM。</div><form id="handoff-form" data-mode="${action}"><label>企业<input value="${h(company.name)}" readonly /></label><label>${action === 'accepted' ? '接手负责人' : '补证负责人（可留空）'}<input name="owner" value="${h(company.owner)}" maxlength="80" ${action === 'accepted' ? 'required' : ''} placeholder="例如：演示同事 A" /></label><label>${action === 'accepted' ? '交接说明' : '需要补什么证据'}<textarea name="reason" aria-label="${action === 'accepted' ? '交接说明' : '需要补什么证据'}" required minlength="4" maxlength="2000" placeholder="${action === 'accepted' ? '业务用途、证据与下一步需核实的问题。' : '明确缺失项，方便下一位同事继续。'}">${h(company.feedback)}</textarea></label><button class="button primary full">${action === 'accepted' ? '确认模拟接收' : '保存补证任务'}</button></form>`,
  );
}
function invalidateReview(company) {
  company.decision = null;
  company.reviewedAt = null;
  company.reviewReason = '';
  company.handoff = null;
  company.feedback = '';
}
const actions = {
  close: closeDialog,
  clear: () => {
    ui.filter = 'all';
    ui.search = '';
    render();
  },
  import: importDialog,
  template: () => download('evidence-desk-template.csv', templateCsv(), 'text/csv;charset=utf-8'),
  backup: () => {
    download('evidence-desk-backup.json', JSON.stringify(batch, null, 2), 'application/json');
    toast('批次备份已生成。');
  },
  'raw-backup': () => {
    try {
      download('evidence-desk-raw-storage.txt', storage.getItem(STORAGE_KEY) || '');
    } catch {
      toast('浏览器禁止读取存储，无法下载原始内容。', true);
    }
  },
  'export-csv': () =>
    download('evidence-desk-reviews.csv', exportReviews(batch), 'text/csv;charset=utf-8'),
  pack: () =>
    download('evidence-pack.md', evidencePack(batch, selected()), 'text/markdown;charset=utf-8'),
  profile: profileDialog,
  'add-evidence': () => evidenceDialog(),
  handoff: () => handoffDialog('accepted'),
  return: () => handoffDialog('returned'),
  'fill-reason': () => {
    const company = selected();
    const result = evaluateCompany(company, batch.asOf);
    document.querySelector('#review-form [name="decision"]').value = result.suggestion;
    document.querySelector('#review-form [name="reason"]').value =
      `${result.checks.map((item) => `${item.label}：${item.pass ? item.proof.join('、') : '待核实'}`).join('；')}。${result.explanation}`;
    toast('草稿已填写，请核对后保存。');
  },
  about: () =>
    openDialog(
      '这是一个可操作的本地原型',
      '<p>证据台帮助整理原文、展示缺口、记录人工判断和模拟交接。所有内置企业与证据是虚构数据，example.com 链接只是演示引用。</p><p>没有连接大模型、企业数据库、销售、CRM 或邮件。不会联网抓取、验证或发送信息。浏览器存储不等于多人协作数据库，重要操作后请下载 JSON 备份。</p><p>导入的文件只在本机处理。生产使用还需要账号权限、来源验证、审计、服务端存储及合规评估。</p>',
    ),
  reset: () =>
    openDialog(
      '恢复演示批次',
      '<p>这会替换当前工作区的企业、证据和操作记录。请先下载当前批次备份；确认后会另外保留一份旧存储在本机。</p><button class="button" data-action="backup">先下载当前备份</button>',
      '<button class="button" data-action="close">取消</button><button class="button primary" data-action="confirm-reset">确认恢复演示</button>',
    ),
  'confirm-reset': () => {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw) storage.setItem(`${STORAGE_KEY}.previous`, raw);
    } catch {
      toast('旧存储无法备份，未重置。请检查浏览器存储权限。', true);
      return;
    }
    ui.filter = 'all';
    ui.search = '';
    ui.selected = 'C01';
    if (commit(createDemo(), '演示批次已恢复。旧存储保留在本机 previous 备份。', true))
      closeDialog();
  },
};
document.addEventListener('click', (event) => {
  const element = event.target.closest('button,a[data-nav]');
  if (!element) return;
  const { nav, filter, company, action, proof, source, editEvidence } = element.dataset;
  if (nav) {
    event.preventDefault();
    ui.view = nav;
    render();
    window.scrollTo({ top: 0 });
  } else if (filter) {
    ui.filter = filter;
    render();
  } else if (company) {
    ui.selected = company;
    if (ui.view !== 'workspace') {
      ui.filter = 'all';
      ui.search = '';
    }
    ui.view = 'workspace';
    render();
  } else if (proof) {
    const card = document.getElementById(`evidence-${proof}`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.remove('highlight');
      requestAnimationFrame(() => card.classList.add('highlight'));
    }
  } else if (source) {
    const item = selected().evidence.find((row) => row.id === source);
    openDialog(
      '原文引用',
      `<span class="small-tag">${h(item.kind)}</span><h3>${h(item.title)}</h3><blockquote class="source-quote">${h(item.quote)}</blockquote><p class="reference-url">${h(item.url || '链接待补')}</p><p>发布：${h(item.date || '未知')} · 采集：${h(item.collectedAt || '未知')}</p><p>内置 example.com 链接为虚构引用，不能当作真实企业证据。本页不会打开或联网核验来源。</p>`,
    );
  } else if (editEvidence) evidenceDialog(editEvidence);
  else if (action && actions[action]) actions[action]();
});
document.addEventListener('input', (event) => {
  if (event.target.id === 'search') {
    ui.search = event.target.value;
    renderQueueAndDetail();
  }
});
document.addEventListener('submit', (event) => {
  if (!['review-form', 'profile-form', 'evidence-form', 'handoff-form'].includes(event.target.id))
    return;
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  const next = structuredClone(batch);
  const company = next.companies.find((row) => row.id === ui.selected);
  try {
    if (form.id === 'review-form') {
      reviewCompany(next, company.id, data.get('decision'), data.get('reason'));
      commit(next, '人工结论已保存，可继续核查或模拟交接。');
    } else if (form.id === 'handoff-form') {
      handoffCompany(next, company.id, form.dataset.mode, data.get('owner'), data.get('reason'));
      if (
        commit(
          next,
          form.dataset.mode === 'accepted'
            ? '已保存模拟接收记录，没有发送给任何人。'
            : '补证任务已记录。',
        )
      )
        closeDialog();
    } else if (form.id === 'profile-form') {
      for (const key of ['scene', 'identity', 'usage', 'relationship'])
        company[key] = data.get(key).trim();
      invalidateReview(company);
      next.events.push({
        id: uid('log'),
        companyId: company.id,
        action: 'profile',
        at: new Date().toISOString(),
        detail: '核实并修改企业画像，旧结论已撤回，需要重新核查。',
      });
      if (commit(next, '企业画像已保存，请重新核查。')) closeDialog();
    } else {
      const date = data.get('date'),
        collectedAt = data.get('collectedAt'),
        url = data.get('url').trim();
      if ((date && !dateValue(date)) || (collectedAt && !dateValue(collectedAt)))
        throw new Error('日期无效，请填写真实日历日期或留空待核。');
      if (url && !safeUrl(url)) throw new Error('原文链接仅支持 http/https。');
      const item = {
        id: form.dataset.evidenceId || uid('evidence'),
        kind: data.get('kind'),
        title: data.get('title').trim(),
        date,
        collectedAt,
        url,
        quote: data.get('quote').trim(),
        supports: data.getAll('supports'),
        entityMatch: data.get('entityMatch') === 'on',
        dateConflict: data.get('dateConflict') === 'on',
      };
      if (!item.title || !item.quote) throw new Error('标题和原文不能为空。');
      const index = company.evidence.findIndex((row) => row.id === item.id);
      if (index >= 0) company.evidence[index] = item;
      else company.evidence.push(item);
      invalidateReview(company);
      next.events.push({
        id: uid('log'),
        companyId: company.id,
        action: 'evidence',
        at: new Date().toISOString(),
        detail: `${index >= 0 ? '核实更新' : '补充'}证据 ${item.id}，旧结论已撤回，需要重新核查。`,
      });
      if (commit(next, '证据已保存，核查依据已更新。')) closeDialog();
    }
  } catch (error) {
    toast(error.message, true);
  }
});
document.addEventListener('change', async (event) => {
  if (!['csv-file', 'json-file'].includes(event.target.id)) return;
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('文件超过 5 MB，请拆分后再导入。');
    const content = await file.text();
    let next, title, description;
    if (event.target.id === 'csv-file') {
      const result = importCsv(content, batch);
      next = result.batch;
      title = '确认导入 CSV';
      description = `本次新增 ${result.added} 条证据，跳过 ${result.duplicate} 条重复证据。合并后共 ${next.companies.length} 家企业。已有企业新增证据后，旧结论和交接需重新确认。`;
    } else {
      next = parseBackup(content);
      title = '确认恢复批次';
      description = `恢复“${next.name}”，共 ${next.companies.length} 家企业，观察日 ${next.asOf}。此操作会替换当前批次，请先备份。`;
    }
    openDialog(
      title,
      `<p>${h(description)}</p><button class="text-button" data-action="backup">下载当前备份</button>`,
      '<button class="button" data-action="close">取消</button><button class="button primary" id="confirm-import">确认保存到本机</button>',
    );
    modal.querySelector('#confirm-import').addEventListener('click', () => {
      try {
        const raw = storage.getItem(STORAGE_KEY);
        if (raw) storage.setItem(`${STORAGE_KEY}.previous`, raw);
      } catch {
        toast('旧存储备份失败，未导入。', true);
        return;
      }
      ui.filter = 'all';
      ui.search = '';
      ui.selected = next.companies[0]?.id;
      if (commit(next, '批次已保存到本机，未上传任何内容。', true)) closeDialog();
    });
  } catch (error) {
    event.target.value = '';
    toast(`未导入：${error.message}`, true);
  }
});
// Detect another tab's update rather than silently overwriting it.
window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY) {
    recoveryError =
      '另一个标签页修改了同一工作区。请刷新以读取最新数据，或先备份当前批次再恢复；当前写入已暂停。';
    render();
  }
});
// Defensive validation keeps the rendered state subject to the same contract as imported data.
batch = validateBatch(batch);
render();
if (AS_OF !== batch.asOf) document.title = `线索证据台 · ${batch.asOf} 批次`;
