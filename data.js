import snapshot from './match-data.json';
export { snapshot };
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
