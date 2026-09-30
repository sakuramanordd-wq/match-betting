import { matches, shikigami, guides } from './data.js';
import { STORAGE_KEY, initialState, validateState, placeBet, settleBets } from './state.js';
const $ = selector => document.querySelector(selector);
let state = initialState();
let storageAvailable = true;
let recoveryMessage = '';
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const parsed = JSON.parse(saved);
    if (validateState(parsed)) state = parsed;
    else recoveryMessage = '本地记录格式异常，已恢复初始体验。';
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
} catch {
  storageAvailable = false;
  recoveryMessage = '浏览器无法保存本地记录，本次竞猜仅在当前页面有效，刷新后会重置。';
}
if (recoveryMessage) {
  const notice = document.createElement('div');
  notice.className = 'storage-warning'; notice.textContent = recoveryMessage;
  $('main').prepend(notice);
}
function save(next) {
  if (storageAvailable) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
    catch { storageAvailable = false; toast('本地保存失败，当前记录刷新后可能丢失。'); }
  }
  state = next; updateStats(); renderMatches();
}
function syncStorage(event) {
  if (event.key !== STORAGE_KEY) return;
  try {
    const incoming = event.newValue ? JSON.parse(event.newValue) : initialState();
    if (validateState(incoming)) { state = incoming; updateStats(); renderMatches(); }
  } catch { /* 不使用其他标签页中的损坏记录 */ }
}
window.addEventListener('storage', syncStorage);
function refreshStoredState() {
  if (!storageAvailable) return;
  try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); if (validateState(saved)) state = saved; }
  catch { /* 当前页面状态仍然有效 */ }
}
const format = n => n.toLocaleString('zh-CN');
function updateStats() {
  $('#balance').textContent = format(state.balance);
  $('#stat-balance').innerHTML = `${format(state.balance)} <small>枚</small>`;
  $('#stat-count').innerHTML = `${state.bets.length} <small>场</small>`;
  const settled = state.bets.filter(b => b.status !== 'pending');
  $('#stat-rate').innerHTML = settled.length ? `${Math.round(settled.filter(b => b.status === 'won').length / settled.length * 100)}% <small>已结算</small>` : '— <small>待结算</small>';
}
let filter = 'open';
function teamHTML(team, side) {
  return `<div class="team ${side}"><div class="team-title"><h3><span class="team-mark">${side === 'red' ? '赤' : '青'}</span>${team.name}</h3><span class="team-style">${team.style}</span></div><div class="roster">${team.roster.map(id => `<div class="shikigami"><div class="portrait"><img src="./assets/${id}.png" alt="${shikigami[id].name}" loading="lazy"><span class="rarity">${shikigami[id].rarity}</span></div><small title="${shikigami[id].name}">${shikigami[id].name}</small></div>`).join('')}</div></div>`;
}
function renderMatches() {
  const visible = matches.filter(m => filter === 'all' || (filter === 'open' ? m.status === 'open' : m.status === 'finished'));
  $('#matches').innerHTML = visible.map(match => {
    const bet = state.bets.find(b => b.matchId === match.id);
    const finished = match.status === 'finished';
    return `<article class="match-card"><div class="match-head"><div><strong>平安京对弈 · ${match.round}</strong><span class="match-id">#${match.id.slice(-3)}</span></div><span class="status-label ${finished ? 'finished' : ''}">${finished ? '演示赛果已公布' : '开放模拟竞猜'}</span></div><div class="teams">${teamHTML(match.red, 'red')}<div class="vs" aria-label="对阵">VS</div>${teamHTML(match.blue, 'blue')}</div><div class="support"><div class="support-labels"><span>模拟支持率 <b>${match.support}%</b></span><span><b>${100 - match.support}%</b> 模拟支持率</span></div><div class="support-bar" aria-hidden="true"><span style="width:${match.support}%"></span><span></span></div></div><div class="match-bottom"><span class="match-note">${finished ? '演示结果：<strong>蓝方胜出</strong>' : bet ? `已选择<strong>${bet.side === 'red' ? '红方' : '蓝方'} · ${bet.amount} 枚</strong> · ${bet.status === 'pending' ? '待模拟结算' : '已模拟结算'}` : '每场限一次 · <strong>10–500 枚</strong>模拟勾玉'}</span><button class="bet-button" data-match="${match.id}">${finished ? '查看赛果' : bet ? '查看我的竞猜' : '选择阵容落签'} <span>↗</span></button></div></article>`;
  }).join('');
  document.querySelectorAll('[data-match]').forEach(button => button.addEventListener('click', () => openMatch(button.dataset.match)));
}
document.querySelectorAll('[data-filter]').forEach(button => {
  button.addEventListener('click', () => {
    filter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(tab => { const active = tab === button; tab.classList.toggle('selected', active); tab.setAttribute('aria-selected', String(active)); });
    renderMatches();
  });
  button.addEventListener('keydown', event => {
    const tabs = [...document.querySelectorAll('[data-filter]')];
    let next;
    if (event.key === 'ArrowRight') next = tabs[(tabs.indexOf(button) + 1) % tabs.length];
    if (event.key === 'ArrowLeft') next = tabs[(tabs.indexOf(button) + tabs.length - 1) % tabs.length];
    if (event.key === 'Home') next = tabs[0]; if (event.key === 'End') next = tabs.at(-1);
    if (next) { event.preventDefault(); next.click(); next.focus(); }
  });
});
let returnFocus;
function modal(title, html) {
  if (!$('#modal').open) returnFocus = document.activeElement;
  $('#modal-content').innerHTML = `<h2 id="modal-title">${title}</h2>${html}`;
  if (!$('#modal').open) $('#modal').showModal();
}
$('#close-modal').addEventListener('click', () => $('#modal').close());
$('#modal').addEventListener('close', () => { if (returnFocus?.isConnected) returnFocus.focus(); });
$('#modal').addEventListener('click', event => {
  if (event.target !== $('#modal')) return;
  const bounds = $('#modal').getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) $('#modal').close();
});
let toastTimer;
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3500); }
function openMatch(id) {
  refreshStoredState();
  const match = matches.find(m => m.id === id);
  if (match.status === 'finished') {
    modal('第三回 · 演示赛果', '<div class="modal-body"><p>本场预设结果：<strong class="result-win">蓝方胜出</strong>。</p><p>本对局仅用于展示结束状态，无法参与竞猜。该赛果不来自真实游戏对战，也不代表阵容的实际强弱。</p></div>'); return;
  }
  if (state.bets.some(b => b.matchId === id)) { openHistory(); return; }
  modal(`${match.round} · 落下胜负之签`, `<p class="modal-note">选择看好的一方。本场阵容、支持率与赛果均为模拟数据。</p><form id="bet-form"><div class="choice-grid"><button type="button" class="choice" data-side="red" aria-pressed="false">赤 · 红方 / ${match.red.style}</button><button type="button" class="choice" data-side="blue" aria-pressed="false">青 · 蓝方 / ${match.blue.style}</button></div><label class="amount-label" for="amount">投入模拟勾玉 <span>· 可用 ${format(state.balance)} 枚</span></label><input id="amount" class="amount-input" type="number" min="10" max="500" step="1" value="100" inputmode="numeric" required aria-describedby="bet-error amount-help"><div class="amount-presets">${[50, 100, 200, 500].map(n => `<button type="button" data-amount="${n}">${n} 枚</button>`).join('')}</div><p class="modal-note" id="amount-help">每场限一次。命中时返还投入的 2 倍（包含本金），未命中则不返还。赛果为预设演示，提交后可在我的竞猜中模拟结算。</p><p id="bet-error" class="form-error" role="alert"></p><button class="primary full-width" type="submit">确认落签 <span>→</span></button></form>`);
  let side;
  document.querySelectorAll('[data-side]').forEach(button => button.addEventListener('click', () => { side = button.dataset.side; document.querySelectorAll('[data-side]').forEach(b => b.setAttribute('aria-pressed', String(b === button))); }));
  document.querySelectorAll('[data-amount]').forEach(button => button.addEventListener('click', () => { $('#amount').value = button.dataset.amount; }));
  $('#bet-form').addEventListener('submit', event => {
    event.preventDefault();
    try { refreshStoredState(); save(placeBet(state, id, side, Number($('#amount').value))); $('#modal').close(); toast('落签成功，已保存至我的竞猜。'); }
    catch (error) { $('#bet-error').textContent = error.message; }
  });
}
function openHistory() {
  refreshStoredState(); updateStats();
  const pending = state.bets.filter(b => b.status === 'pending');
  modal('我的竞猜', `<p class="modal-note">当前余额 ${format(state.balance)} 枚 · ${storageAvailable ? '记录保存在当前浏览器，不跨设备同步。' : '当前浏览器无法保存，刷新后可能重置。'}</p>${state.bets.length ? state.bets.map(bet => {
    const match = matches.find(m => m.id === bet.matchId);
    return `<article class="history-item"><div class="history-row"><strong>${match.round} · ${bet.side === 'red' ? '红方' : '蓝方'}</strong><span class="${bet.status === 'won' ? 'result-win' : bet.status === 'lost' ? 'result-loss' : ''}">${bet.status === 'pending' ? '待模拟结算' : bet.status === 'won' ? '已命中' : '未命中'}</span></div><div class="history-row"><span>投入 ${bet.amount} 枚${bet.status === 'won' ? ` · 已返还 ${bet.amount * 2} 枚` : ''}</span><time>${new Date(bet.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</time></div></article>`;
  }).join('') : '<div class="empty-history">手帖还是空白的。<br>去竞猜大厅，为你的判断落下第一枚签吧。</div>'}<div class="history-actions">${pending.length ? '<button id="settle-button" class="primary">模拟结算</button>' : ''}<button id="reset-button" class="secondary">重置体验</button></div><p class="modal-note">模拟结算使用预设赛果，无实时比赛接入。重置会清空本机记录，并恢复 1,000 枚模拟勾玉。</p>`);
  $('#settle-button')?.addEventListener('click', () => { refreshStoredState(); save(settleBets(state)); openHistory(); toast('模拟结算完成，可查看本次结果。'); });
  $('#reset-button').addEventListener('click', () => {
    modal('重置当前体验？', '<div class="modal-body"><p>当前浏览器中的竞猜记录将被清空，模拟勾玉恢复为 1,000 枚。</p></div><div class="history-actions"><button id="cancel-reset" class="secondary">保留记录</button><button id="confirm-reset" class="primary">确认重置</button></div>');
    $('#cancel-reset').addEventListener('click', openHistory);
    $('#confirm-reset').addEventListener('click', () => { save(initialState()); openHistory(); toast('已开启新的竞猜体验。'); });
  });
}
['#history-nav', '#history-overview', '#wallet-button'].forEach(selector => $(selector).addEventListener('click', openHistory));
$('#rules-button').addEventListener('click', () => modal('竞猜规则', '<div class="modal-body"><p>初始拥有 1,000 枚模拟勾玉。选择任一开放对局的红方或蓝方，每场可提交一次，投入 10–500 枚整数勾玉，不得超过余额。</p><p>提交时扣除投入数量。在「我的竞猜」点击「模拟结算」后，预设胜方的竞猜将返还投入数量的 2 倍（含本金），未命中的竞猜不返还。重复结算不会重复发放勾玉。</p><p>所有比赛数据和赛果均为演示数据，支持率不是实际胜率。页面无实时比赛接入，不提供充值、提现或真实货币交易。</p><p>记录保存在当前浏览器。清理网站数据会丢失记录，点击「重置体验」可重新开始。</p></div>'));
document.querySelectorAll('[data-guide]').forEach(button => button.addEventListener('click', () => { const guide = guides[Number(button.dataset.guide)]; modal(guide.title, `<div class="modal-body">${guide.content}</div>`); }));
function updateNavigation() { document.querySelectorAll('a.nav-link').forEach(a => a.classList.toggle('active', a.getAttribute('href') === (location.hash === '#guide' ? '#guide' : '#arena'))); }
window.addEventListener('hashchange', updateNavigation);
updateNavigation(); updateStats(); renderMatches();
