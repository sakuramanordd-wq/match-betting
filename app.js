import { snapshot, forecastHistory, replaceSnapshot, sideName, currentSlot, latestEvent, judgmentStats, backtest, predictionSide } from './data.js';
const $ = selector => document.querySelector(selector);
let latest = latestEvent(snapshot.events);
let syncStatus = '每分钟检查更新';
let refreshInProgress = false;
let mode = 'current';
let event = latest;
let selectedSlotId = null;
const percent = value => value === null ? '—' : `${(value * 100).toFixed(1)}%`;
const evaluationCache = new Map();
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
  selectedSlotId = null;
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
function recordTable(stats) {
  const wrapper = node('div', 'record-table-wrap');
  const table = node('table', 'record-table');
  table.setAttribute('aria-label', '本场各方判断与历史命中率');
  const head = node('thead', ''); const titles = node('tr', '');
  const columns = [
    ['name', '记录者'], ['side', '本场选择'], ['wins', '胜场'], ['losses', '败场'],
    ['winRate', '胜率'], ['total', '总场次'], ['weight', '本场前评估分'],
  ];
  const body = node('tbody', '');
  let sortKey = 'weight'; let ascending = false;
  const value = (record, key) => {
    if (key === 'name') return record.name;
    if (key === 'side') return sideName(record.side);
    if (key === 'weight') return record.weight;
    const text = (record.sourceSummary?.[key] || '').trim().replace(/[,，]/g, '').replace(/[%％]$/, '');
    return text && /^[-+]?\d+(?:\.\d+)?$/.test(text) ? Number(text) : null;
  };
  const renderRows = () => {
    const records = [...stats.records];
    if (sortKey) records.sort((a, b) => {
      const left = value(a, sortKey); const right = value(b, sortKey);
      if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1;
      const comparison = typeof left === 'string' ? left.localeCompare(right, 'zh-CN') : left - right;
      return ascending ? comparison : -comparison;
    });
    body.replaceChildren(...records.map(record => {
      const row = node('tr', '');
      row.append(node('td', '', record.name), node('td', `side-${record.side}`, sideName(record.side)), ...['wins', 'losses', 'winRate', 'total'].map(key => node('td', 'source-stat', record.sourceSummary?.[key] || '—')), node('td', 'evaluation-score', (record.weight * 100).toFixed(1)));
      return row;
    }));
  };
  for (const [key, label] of columns) {
    const title = node('th', ''); title.scope = 'col'; title.setAttribute('aria-sort', key === sortKey ? 'descending' : 'none');
    const button = node('button', 'sort-button', `${label} ${key === sortKey ? '↓' : '↕'}`); button.type = 'button';
    button.setAttribute('aria-label', `${label}，点击升序排序`);
    button.addEventListener('click', () => {
      ascending = sortKey === key ? !ascending : !['wins', 'losses', 'winRate', 'total', 'weight'].includes(key);
      sortKey = key;
      for (const [index, [columnKey, columnLabel]] of columns.entries()) {
        const th = titles.children[index]; const active = columnKey === sortKey;
        th.setAttribute('aria-sort', active ? ascending ? 'ascending' : 'descending' : 'none');
        th.firstChild.textContent = `${columnLabel} ${active ? ascending ? '↑' : '↓' : '↕'}`;
        const nextAscending = active ? !ascending : !['wins', 'losses', 'winRate', 'total', 'weight'].includes(columnKey);
        th.firstChild.setAttribute('aria-label', `${columnLabel}，点击${nextAscending ? '升序' : '降序'}排序`);
      }
      renderRows();
    });
    button.setAttribute('aria-label', `${label}，点击${key === sortKey || ['name', 'side'].includes(key) ? '升序' : '降序'}排序`);
    title.append(button); titles.append(title);
  }
  head.append(titles); renderRows();
  table.append(head, body); wrapper.append(table); return wrapper;
}
function details(slot) {
  const body = node('div', 'modal-body');
  body.append(node('p', '', `原表结果：${sideName(slot.result)}`));
  const stats = judgmentStats(event, slot, snapshot.events);
  body.append(stats.records.length ? recordTable(stats) : node('p', 'empty-history', '本场原表尚无判断记录。'));
  modal(`${event.title} · ${slot.label}`, body);
}
function ratio(title, share, note, className) {
  const panel = node('section', `ratio-panel ${className}`);
  panel.append(node('h3', '', title));
  const values = node('div', 'ratio-values');
  values.append(node('strong', 'side-red', `左红 ${percent(share)}`), node('strong', 'side-blue', `右蓝 ${percent(share === null ? null : 1 - share)}`));
  const bar = node('div', `ratio-bar${share === null ? ' no-data' : ''}`);
  bar.setAttribute('aria-hidden', 'true');
  const red = node('span', 'red-bar'); red.style.width = `${share === null ? 0 : share * 100}%`;
  bar.append(red, node('span', 'blue-bar'));
  panel.append(values, bar, node('p', 'metric-note', note)); return panel;
}
function predictionDetails(slot, stats) {
  const panel = node('section', 'prediction-panel');
  const stored = forecastHistory.forecasts.find(item => item.slotId === slot.id);
  const direction = stored ? stored.side : predictionSide(stats.weightedRedShare);
  const title = slot.result && !stored ? '历史回放倾向' : '本场预测倾向';
  panel.append(node('h3', '', title), node('strong', `prediction-direction side-${direction || 'pending'}`, direction ? sideName(direction) : stats.records.length ? '红蓝持平 · 暂不预测' : '等待本场判断'));
  const outcome = !direction ? '未给出方向，不计入预测命中率。' : !slot.result ? '赛果待更新，预测尚未验证。' : direction === slot.result ? '原表赛果已知 · 判断命中' : '原表赛果已知 · 判断未命中';
  panel.append(node('p', 'prediction-outcome', outcome));
  if (stored) panel.append(node('p', 'formula-note', `首次预测留档：${time(stored.createdAt)}；基于当时 ${stored.judgmentCount} 人判断，方向不随后续赛果改写。`));
  else panel.append(node('p', 'formula-note', slot.result ? '此场未在赛果公布前留档，按当前快照重建历史判断，不算实际预测记录。' : stats.records.length ? '根据本场判断和此前历史表现给出方向；下次同步会保存首次预测。' : '历史数据用于评估记录者；本场尚无红蓝判断，无法生成预测。'));
  const cutoff = Math.min(Date.parse(slot.startsAt), Date.now());
  if (!evaluationCache.has(cutoff)) evaluationCache.set(cutoff, backtest(snapshot.events, cutoff));
  const report = evaluationCache.get(cutoff);
  const evaluation = node('div', 'prediction-evaluation');
  const metric = (label, value, note) => {
    const item = node('div', 'evaluation-item');
    item.append(node('span', '', label), node('strong', '', value), node('small', '', note)); return item;
  };
  const gain = report.pairedTotal ? (report.pairedCorrect - report.pairedMajorityCorrect) / report.pairedTotal * 100 : null;
  evaluation.append(
    metric('此前历史回放命中率', percent(report.total ? report.correct / report.total : null), `${report.correct} / ${report.total} 场 · 未预测 ${report.skipped} 场`),
    metric('多数判断命中率', percent(report.majorityTotal ? report.majorityCorrect / report.majorityTotal : null), `${report.majorityCorrect} / ${report.majorityTotal} 场`),
    metric('相对多数判断提升', gain === null ? '—' : `${gain > 0 ? '+' : ''}${gain.toFixed(1)} 个百分点`, `同一批 ${report.pairedTotal} 场比较`)
  );
  const verified = forecastHistory.forecasts.filter(item => item.side && item.result);
  const hits = verified.filter(item => item.side === item.result).length;
  evaluation.append(metric('留档预测实际命中率', percent(verified.length ? hits / verified.length : null), `${hits} / ${verified.length} 场 · 待赛果 ${forecastHistory.forecasts.filter(item => item.side && !item.result).length} 场`));
  panel.append(evaluation, node('p', 'formula-note', '历史回放按时间顺序，仅用目标场次之前的赛果，跨活动按名字精确匹配。旧表没有判断填写时间，无法证明其都在赛果前填写；回放成绩不等同于实际预测成绩，也不是本场获胜概率。'));
  return panel;
}
function card(slot, featured = false) {
  const article = node('article', `match-card${featured ? ' current-card' : ''}`);
  const head = node('div', 'match-head');
  head.append(node('strong', '', featured ? `${event.title} · ${mode === 'history' ? '历史场次' : selectedSlotId ? '所选场次' : '本场 · 最近排期'}` : slot.label), node('span', `status-label side-${slot.result || 'pending'}`, slot.result ? `结果：${sideName(slot.result)}` : '原表未填写结果'));
  const stats = judgmentStats(event, slot, snapshot.events);
  article.append(head);
  if (featured) {
    article.append(node('h2', 'slot-title', slot.label));
    const metrics = node('div', 'metrics');
    metrics.append(ratio('选择人数比例', stats.redShare, `左红 ${stats.red} 人 · 右蓝 ${stats.blue} 人 · 共 ${stats.records.length} 人`, 'count-ratio'), ratio('历史评估加权比例', stats.weightedRedShare, stats.records.length ? '按每位记录者的历史评估分加权' : '暂无判断，无法计算', 'weighted-ratio'));
    metrics.querySelector('.count-ratio').append(node('p', 'formula-note', '人数比例 = 选择该方的人数 ÷ 本场总判断人数 × 100%'));
    const explanation = node('div', 'formula-explanation');
    explanation.append(
      node('p', 'formula-line', '个人评估分 =（本场前历史命中次数 + 2）÷（本场前历史有效场次 + 4）× 100'),
      node('p', 'formula-line', '该方加权比例 = 选择该方的评估分总和 ÷ 本场全部记录者的评估分总和 × 100%'),
      node('p', 'formula-note', '历史统计所有已收录活动中、本场之前已有明确赛果的判断，按原表名字精确匹配，不合并别名。加 2 和加 4 是为了降低小样本的影响：无历史为 50 分，只命中 1 场为 60 分。'),
      node('p', 'formula-note', '加权比例表示判断倾向，不是获胜概率；如果所有人都选择红方，加权比例也会是红 100%、蓝 0%。')
    );
    const calculationButton = node('button', 'calculation-button', '查看详细计算 ↗');
    calculationButton.addEventListener('click', () => {
      const body = node('div', 'modal-body');
      body.append(explanation.cloneNode(true));
      if (stats.records.length) {
        const redScore = stats.records.filter(record => record.side === 'red').reduce((sum, record) => sum + record.weight * 100, 0);
        const blueScore = stats.records.filter(record => record.side === 'blue').reduce((sum, record) => sum + record.weight * 100, 0);
        const totalScore = redScore + blueScore;
        body.append(
          node('h3', '', '本场代入计算'),
          node('p', '', `红方评估分总和：${redScore.toFixed(2)}；蓝方评估分总和：${blueScore.toFixed(2)}；合计：${totalScore.toFixed(2)}。`),
          node('p', 'side-red', `左红：${redScore.toFixed(2)} ÷ ${totalScore.toFixed(2)} × 100% = ${percent(stats.weightedRedShare)}`),
          node('p', 'side-blue', `右蓝：${blueScore.toFixed(2)} ÷ ${totalScore.toFixed(2)} × 100% = ${percent(1 - stats.weightedRedShare)}`),
          node('p', 'formula-note', '展示数值经过四舍五入，比例使用未舍入的评估分计算。')
        );
      } else body.append(node('p', 'empty-history', '本场暂无判断记录，无法代入计算。'));
      body.append(node('h3', '', '预测与验证口径'), node('p', '', '红方加权比例大于 50% 则倾向红方，小于 50% 则倾向蓝方；持平或没有判断时不预测。历史回放逐场使用更早的赛果，命中率 = 判断命中场数 ÷ 给出方向且已有赛果的场数。与多数判断的提升只比较双方都给出方向的同一批场次。'), node('p', '', '原表没有历史判断的填写时间，回放不能证明预测曾在赛果前作出。同步时会为未出赛果且有判断的场次保存首次预测，之后只更新验证结果。'));
      body.append(predictionDetails(slot, stats));
      modal(`${slot.label} · 详细计算`, body);
    });
    metrics.querySelector('.weighted-ratio').append(node('p', 'formula-note', '加权比例表示判断倾向，不代表获胜概率。'), calculationButton);
    article.append(metrics);
    if (stats.records.length) article.append(recordTable(stats));
    else article.append(node('p', 'empty-history', '本场原表尚无判断记录。'));
    article.append(node('p', 'weight-note', '表格中的胜场、败场、胜率、总场次直接读取原表累计统计，可能包含本场及之后的结果；本场前评估分只使用本场之前的记录。'));
  }
  const bottom = node('div', 'match-bottom');
  bottom.append(node('span', 'match-note', `左红 ${stats.red} 人 / 右蓝 ${stats.blue} 人${stats.redShare === null ? ' · 暂无判断' : ` · 红 ${percent(stats.redShare)} / 蓝 ${percent(1 - stats.redShare)}`}`));
  const button = node('button', 'bet-button', featured ? '查看记录 ↗' : '查看本场 ↗');
  button.addEventListener('click', () => {
    if (featured) details(slot);
    else { selectedSlotId = slot.id; render(); $('#current-match').scrollIntoView({ block: 'start' }); }
  });
  bottom.append(button); article.append(bottom); return article;
}
function render() {
  $('#stat-event').textContent = event.title;
  $('#updated-at').textContent = `同步于 ${time(snapshot.fetchedAt)} · ${syncStatus}`;
  $('#source-detail').textContent = `来源：${snapshot.sourceTitle}。工作表：${event.sourceSheet}。同步时间：${time(snapshot.fetchedAt)}（北京时间）。`;
  const featured = event.slots.find(slot => slot.id === selectedSlotId) || currentSlot(event);
  const outside = Date.now() > Date.parse(event.slots.at(-1).startsAt) + 2 * 60 * 60 * 1000;
  $('#current-match').replaceChildren(card(featured, true), ...(outside && !selectedSlotId ? [node('p', 'current-note', '活动排期已结束，展示最后一个时段。')] : []));
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
$('#event-select').addEventListener('change', () => { event = snapshot.events.find(item => item.id === $('#event-select').value); selectedSlotId = null; dates(); render(); });
$('#date-select').addEventListener('change', render);
$('#history-nav').addEventListener('click', () => selectMode('history'));
$('nav a[href="#arena"]:not(#history-nav)').addEventListener('click', () => selectMode('current'));
$('#rules-button').addEventListener('click', () => {
  const body = node('div', 'modal-body');
  for (const text of ['本站展示公开文档中的活动排期、红蓝结果与各方判断记录，不再提供模拟竞猜。', '场次时间采用北京时间；最近场次按排期选择，不代表实时战斗状态。赛果只读取对应活动的结果行，空白不推断胜负。', '人数比例为本场红蓝判断人数占比；历史评估分 =（命中次数 + 2）÷（有效样本 + 4）× 100，使用已收录各活动、本场之前已知赛果；无历史为 50 分。加权比例为该方评估分之和除以全部评估分之和。平滑处理避免少量样本获得极端权重。记录者按原表名字精确匹配，不合并别名。两种比例都不代表获胜概率。页面为静态快照，请点击「查看原表」核对。', '旧版演示数据已退出展示。旧浏览器竞猜记录保留在本地，不读取、不修改；本站不处理真实货币。']) body.append(node('p', '', text));
  modal('数据说明', body);
});
$('#close-modal').addEventListener('click', () => $('#modal').close());
$('#modal').addEventListener('close', () => returnFocus?.isConnected && returnFocus.focus());
$('#modal').addEventListener('click', e => { if (e.target !== $('#modal')) return; const r = $('#modal').getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) $('#modal').close(); });
selectMode('current');
async function refreshSnapshot() {
  if (refreshInProgress || $('#modal').open) return;
  refreshInProgress = true;
  try {
    const response = await fetch(import.meta.env.VITE_DATA_API_URL || new URL('./data-snapshot.json', document.baseURI), { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error('无法读取快照');
    const data = await response.json();
    const validEvents = Array.isArray(data.snapshot?.events) && data.snapshot.events.length > 0 && data.snapshot.events.every(item =>
      typeof item.id === 'string' && typeof item.title === 'string' && Array.isArray(item.slots) && item.slots.length > 0 && item.slots.every(slot =>
        typeof slot.id === 'string' && Number.isFinite(Date.parse(slot.startsAt)) && [null, 'red', 'blue'].includes(slot.result) && Array.isArray(slot.records) && slot.records.every(record => typeof record.name === 'string' && ['red', 'blue'].includes(record.side))));
    if (!Number.isFinite(Date.parse(data.snapshot?.fetchedAt)) || !validEvents || !Array.isArray(data.forecastHistory?.forecasts)) throw new Error('快照格式异常');
    syncStatus = data.syncFailed ? '更新失败，保留旧数据' : data.autoSync ? '每分钟同步' : '每分钟检查更新';
    // 打开详情时不替换页面，保留当前弹窗数据与关闭后的焦点位置。
    if ($('#modal').open) return;
    if (data.snapshot.fetchedAt !== snapshot.fetchedAt || JSON.stringify(data.forecastHistory) !== JSON.stringify(forecastHistory)) {
      const selectedDate = $('#date-select').value;
      const eventId = event.id;
      const focusedButton = document.activeElement?.closest('.current-card') ? document.activeElement.className : null;
      replaceSnapshot(data.snapshot, data.forecastHistory);
      latest = latestEvent(snapshot.events);
      const events = mode === 'current' ? [latest] : snapshot.events.filter(item => item.id !== latest.id);
      if (!events.length) { selectMode('current'); return; }
      event = events.find(item => item.id === eventId) || events[0];
      options($('#event-select'), events.map(item => [item.id, item.title]), event.id);
      dates();
      if ([...$('#date-select').options].some(option => option.value === selectedDate)) $('#date-select').value = selectedDate;
      if (!event.slots.some(slot => slot.id === selectedSlotId)) selectedSlotId = null;
      evaluationCache.clear();
      render();
      if (focusedButton) [...document.querySelectorAll('.current-card button')].find(button => button.className === focusedButton)?.focus({ preventScroll: true });
    } else $('#updated-at').textContent = `同步于 ${time(snapshot.fetchedAt)} · ${syncStatus}`;
  } catch {
    syncStatus = '更新失败，保留旧数据';
    $('#updated-at').textContent = `同步于 ${time(snapshot.fetchedAt)} · ${syncStatus}`;
  } finally { refreshInProgress = false; }
}
refreshSnapshot();
setInterval(refreshSnapshot, 60_000);
$('#modal').addEventListener('close', refreshSnapshot);
// 切换至新时段时更新置顶，不改变用户选择的活动或日期。
let featuredId = currentSlot(latest).id;
setInterval(() => {
  const nextId = currentSlot(latest).id;
  if (nextId !== featuredId && !$('#modal').open) { featuredId = nextId; if (mode === 'current') render(); }
}, 60_000);
