import { comparable } from './deployment-status.mjs';

const timeText = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }) + ' +08:00' : '未知';
const counts = slot => {
  if (!slot || !Array.isArray(slot.records)) return null;
  const red = slot.records.filter(record => record.side === 'red').length;
  const blue = slot.records.filter(record => record.side === 'blue').length;
  return { red, blue, total: red + blue };
};
const countText = value => value ? `${value.total} 人（左红 ${value.red} / 右蓝 ${value.blue}）` : '未知（未找到该场次或记录不可读）';

export function currentPredictionMessage(latest, online, now = Date.now()) {
  const event = latest.events?.find(item => Date.parse(item.slots?.[0]?.startsAt) <= now) || latest.events?.at(-1);
  const slot = event?.slots?.findLast(item => Date.parse(item.startsAt) <= now) || event?.slots?.[0];
  if (!slot) return '当前场次预测人数：最新数据无排期，无法比较。';
  const publishedSlot = online?.events?.find(item => item.id === event.id)?.slots?.find(item => item.id === slot.id);
  const newest = counts(slot);
  const published = counts(publishedSlot);
  const judgments = item => item.records.filter(record => ['red', 'blue'].includes(record.side)).map(({ name, side }) => ({ name, side })).sort((a, b) => a.name.localeCompare(b.name) || a.side.localeCompare(b.side));
  const delta = newest && published ? newest.total - published.total : null;
  const comparison = delta === null ? '差额未知，无法比较' : `人数差额 ${delta > 0 ? '+' : ''}${delta}；判断内容${comparable(judgments(slot)) === comparable(judgments(publishedSlot)) ? '一致' : '不同'}`;
  return `当前场次预测人数：${event.title} · ${slot.label}；线上已发布 ${online ? countText(published) : '未知（线上快照读取失败）'}；最新抓取 ${countText(newest)}；${comparison}。线上抓取于 ${timeText(online?.fetchedAt)}；最新抓取于 ${timeText(latest.fetchedAt)}。`;
}

export async function checkCurrentPredictions({ repository, snapshot, now = Date.now(), fetchImpl = fetch }) {
  let online;
  if (repository) {
    try {
      const [owner, name] = repository.split('/');
      const response = await fetchImpl(`https://${owner}.github.io/${name}/data-snapshot.json?prediction-check=${now}`, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error('无法读取线上快照');
      const data = await response.json();
      if (!Array.isArray(data.snapshot?.events)) throw new Error('线上快照结构异常');
      online = data.snapshot;
    } catch { /* 读取失败时人数保持未知，不推断为零。 */ }
  }
  return currentPredictionMessage(snapshot, online, now);
}
