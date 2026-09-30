import { snapshot, sideName, currentSlot, latestEvent, resultCounts } from './data.js';
const $ = selector => document.querySelector(selector);
const latest = latestEvent(snapshot.events);
let mode = 'current';
let event = latest;
const time = value => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'medium', timeStyle: 'short', hour12: false }).format(new Date(value));
// 外部表格文字只通过 textContent 渲染。
function node(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function options(select, items, selected) {
  select.replaceChildren(...items.map(([value, label]) => {
    const option = new Option(label, value); option.selected = value === selected; return option;
  }));
}
function dates() {
  const days = [...new Set(event.slots.map(slot => slot.startsAt.slice(0, 10)))];
  options($('#date-select'), [['all', '全部日期'], ...days.map(day => [day, day])], mode === 'current' ? currentSlot(event).startsAt.slice(0, 10) : 'all');
}
function selectMode(nextMode) {
  mode = nextMode;
  $('#history-nav').classList.toggle('active', mode === 'history');
  $('nav a[href="#arena"]:not(#history-nav)').classList.toggle('active', mode === 'current');
  const events = mode === 'current' ? [latest] : snapshot.events.filter(item => item.id !== latest.id);
  event = events[0];
  options($('#event-select'), events.map(item => [item.id, item.title]), event.id);
  document.querySelectorAll('[data-filter]').forEach(tab => { const active = tab.dataset.filter === mode; tab.classList.toggle('selected', active); tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; });
  dates(); render();
}
let returnFocus;
function modal(title, body) {
  returnFocus = document.activeElement;
  $('#modal-content').replaceChildren(node('h2', '', title), body);
  $('#modal-content h2').id = 'modal-title';
  $('#modal').showModal();
}
function details(slot) {
  const body = node('div', 'modal-body');
  body.append(node('p', '', `原表结果：${sideName(slot.result)}`), node('p', 'modal-note', '以下为各记录者填写的判断，不等于赛果或获胜概率。'));
  if (!slot.records.length) body.append(node('p', 'empty-history', '本场原表尚无判断记录。'));
  slot.records.forEach(record => { const row = node('div', 'history-row record-row'); row.append(node('span', '', record.name), node('strong', `side-${record.side}`, sideName(record.side))); body.append(row); });
  modal(`${event.title} · ${slot.label}`, body);
}
function card(slot, featured = false) {
  const article = node('article', `match-card${featured ? ' current-card' : ''}`);
  const head = node('div', 'match-head');
  head.append(node('strong', '', featured ? '最近场次 · 按北京时间排期' : event.title), node('span', `status-label${slot.result ? ' finished' : ''}`, slot.result ? '原表已记录结果' : '结果待更新'));
  const info = node('div', 'slot-info'); info.append(node('h3', '', slot.label), node('strong', `slot-result side-${slot.result || 'pending'}`, sideName(slot.result)));
  const bottom = node('div', 'match-bottom');
  const red = slot.records.filter(record => record.side === 'red').length;
  bottom.append(node('span', 'match-note', `各方判断：左红 ${red} 条 / 右蓝 ${slot.records.length - red} 条`));
  const button = node('button', 'bet-button', '查看记录 ↗'); button.addEventListener('click', () => details(slot)); bottom.append(button);
  article.append(head, info, bottom); return article;
}
function render() {
  const counts = resultCounts(event);
  $('#stat-event').textContent = event.title;
  $('#stat-count').textContent = `${counts.red + counts.blue} / ${event.slots.length} 场`;
  $('#stat-result').textContent = `${counts.red} / ${counts.blue}`;
  $('#updated-at').textContent = `同步于 ${time(snapshot.fetchedAt)}`;
  $('#source-detail').textContent = `来源：${snapshot.sourceTitle}。工作表：${event.sourceSheet}。同步时间：${time(snapshot.fetchedAt)}（北京时间）。`;
  const featured = currentSlot(event);
  const outside = Date.now() > Date.parse(event.slots.at(-1).startsAt) + 2 * 60 * 60 * 1000;
  $('#current-match').replaceChildren(...(mode === 'current' ? [node('p', 'current-note', outside ? '此活动排期已结束，下面展示最后一个时段；待原表新增活动后同步。' : '优先展示最近开始的时段；结果是否公布以原表填写为准。'), card(featured, true)] : []));
  const visible = event.slots.filter(slot => $('#date-select').value === 'all' || slot.startsAt.startsWith($('#date-select').value));
  $('#list-summary').textContent = `${event.title} · ${visible.length} 场 · 已记录 ${visible.filter(slot => slot.result).length} 场结果`;
  $('#matches').replaceChildren(...visible.map(slot => card(slot)));
}
document.querySelectorAll('[data-filter]').forEach(tab => {
  tab.addEventListener('click', () => selectMode(tab.dataset.filter));
  tab.addEventListener('keydown', e => {
    const tabs = [...document.querySelectorAll('[data-filter]')];
    if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) { e.preventDefault(); const next = e.key === 'Home' ? tabs[0] : e.key === 'End' ? tabs.at(-1) : tabs.find(item => item !== tab); next.click(); next.focus(); }
  });
});
$('#event-select').addEventListener('change', () => { event = snapshot.events.find(item => item.id === $('#event-select').value); dates(); render(); });
$('#date-select').addEventListener('change', render);
$('#history-nav').addEventListener('click', () => selectMode('history'));
$('nav a[href="#arena"]:not(#history-nav)').addEventListener('click', () => selectMode('current'));
$('.hero-cta').addEventListener('click', () => selectMode('current'));
$('#rules-button').addEventListener('click', () => {
  const body = node('div', 'modal-body');
  for (const text of ['本站展示公开文档中的活动排期、红蓝结果与各方判断记录，不再提供模拟竞猜。', '场次时间采用北京时间；最近场次按排期选择，不代表实时战斗状态。赛果只读取对应活动的结果行，空白不推断胜负。', '各方判断条数不是支持率或胜率。页面为定期整理的静态快照，原表可能已更新，请点击「查看原表」核对。', '旧版演示数据已退出展示。旧浏览器竞猜记录保留在本地，不读取、不修改；本站不处理真实货币。']) body.append(node('p', '', text));
  modal('数据说明', body);
});
$('#close-modal').addEventListener('click', () => $('#modal').close());
$('#modal').addEventListener('close', () => returnFocus?.isConnected && returnFocus.focus());
$('#modal').addEventListener('click', e => { if (e.target !== $('#modal')) return; const r = $('#modal').getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) $('#modal').close(); });
selectMode('current');
// 切换至新时段时更新置顶，不改变用户选择的活动或日期。
let featuredId = currentSlot(latest).id;
setInterval(() => {
  const nextId = currentSlot(latest).id;
  if (nextId !== featuredId) { featuredId = nextId; if (mode === 'current') render(); }
}, 60_000);
