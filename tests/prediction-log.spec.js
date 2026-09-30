import { test, expect } from '@playwright/test';
import { currentPredictionMessage, checkCurrentPredictions } from '../scripts/prediction-log.mjs';
const now = Date.parse('2026-09-30T13:00:00+08:00');
const slot = (hour, records) => ({ id: `slot-${hour}`, label: `9月30日${hour}点场`, startsAt: `2026-09-30T${hour}:00:00+08:00`, records });
const record = (name, side) => ({ name, side });
const latest = { fetchedAt: '2026-09-30T04:57:00Z', events: [{ id: 'national', title: '2026 国庆', slots: [slot('10', [record('A', 'red')]), slot('12', [record('A', 'blue'), record('B', 'blue')]), slot('14', [record('C', 'red')])] }] };

test('logs current slot counts against the same online slot and detects changes at equal counts', () => {
  const online = structuredClone(latest);
  online.events[0].slots[1].records = [];
  const message = currentPredictionMessage(latest, online, now);
  expect(message).toContain('9月30日12点场');
  expect(message).toContain('线上已发布 0 人（左红 0 / 右蓝 0）');
  expect(message).toContain('最新抓取 2 人（左红 0 / 右蓝 2）');
  expect(message).toContain('人数差额 +2；判断内容不同');
  expect(message).toContain('2026-09-30 12:57:00 +08:00');
  expect(currentPredictionMessage(latest, latest, now)).toContain('人数差额 0；判断内容一致');
  online.events[0].slots[1].records = [record('A', 'red'), record('B', 'blue')];
  expect(currentPredictionMessage(latest, online, now)).toContain('人数差额 0；判断内容不同');
  expect(currentPredictionMessage(latest, latest, now + 3600_000)).toContain('9月30日14点场');
  online.events[0].slots = [];
  expect(currentPredictionMessage(latest, online, now)).toContain('差额未知');
});

test('online counts remain readable during deployment failures and unknown on fetch failure', async () => {
  const args = { repository: 'owner/repo', snapshot: latest, now };
  let requested;
  expect(await checkCurrentPredictions({ ...args, fetchImpl: async url => { requested = url; return { ok: true, json: async () => ({ snapshot: latest }) }; } })).toContain('线上已发布 2 人');
  expect(requested).toContain('prediction-check=');
  for (const fetchImpl of [async () => ({ ok: false }), async () => { throw new Error('offline'); }, async () => ({ ok: true, json: async () => ({}) })]) {
    const message = await checkCurrentPredictions({ ...args, fetchImpl });
    expect(message).toContain('线上已发布 未知');
    expect(message).toContain('最新抓取 2 人');
    expect(message).toContain('差额未知');
  }
});
