import snapshot from './match-data.json';
import forecastHistory from './forecast-history.json';
import { historicalRecords } from './prediction.js';
export { snapshot, forecastHistory };
export { predictSlot, backtest, predictionSide } from './prediction.js';
export const sideName = side => ({ red: '左红', blue: '右蓝' })[side] || '原表未填写';
// 按北京时间排期选择最近开始的时段；时间不推断赛果。
export function currentSlot(event, now = Date.now()) {
  return event.slots.findLast(slot => Date.parse(slot.startsAt) <= now) || event.slots[0];
}
export function latestEvent(events, now = Date.now()) {
  return events.find(event => Date.parse(event.slots[0].startsAt) <= now) || events.at(-1);
}
export function resultCounts(event) {
  return { red: event.slots.filter(s => s.result === 'red').length, blue: event.slots.filter(s => s.result === 'blue').length };
}

// 只使用本场之前的已知结果，避免把本场或未来赛果计入权重。
export function judgmentStats(event, slot, events = [event]) {
  const history = historicalRecords(events, slot);
  const records = slot.records.map(record => {
    const stats = history.get(record.name) || { correct: 0, total: 0 };
    const rate = stats.total ? stats.correct / stats.total : null;
    // 加入 2 次命中 / 4 次样本的平滑先验，降低少量样本的极端权重。
    return { ...record, ...stats, rate, sourceSummary: event.summaries?.find(summary => summary.name === record.name) || null, weight: (stats.correct + 2) / (stats.total + 4) };
  });
  const red = records.filter(record => record.side === 'red').length;
  const redWeight = records.filter(record => record.side === 'red').reduce((sum, record) => sum + record.weight, 0);
  const weight = records.reduce((sum, record) => sum + record.weight, 0);
  return { records, red, blue: records.length - red, redShare: records.length ? red / records.length : null, weightedRedShare: weight ? redWeight / weight : null };
}
