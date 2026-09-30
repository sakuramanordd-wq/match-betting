import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseWindResponse, windStats } from '../wind.js';

test('wind follows Beijing cutoff, excludes expired/future records and unknown directions', () => {
  const wind = parseWindResponse({ success: true, data: [
    { name: 'old', posted_at: '2026-09-30T09:59:00+08:00', predict_winner: 'blue' },
    { name: 'cutoff', posted_at: '2026-09-30T10:00:00+08:00', predict_winner: 'blue' },
    { name: 'red', posted_at: '2026-09-30T10:01:00+08:00', predict_winner: 'red' },
    { name: 'unknown', posted_at: '2026-09-30T10:02:00+08:00', predict_winner: 'other' },
    { name: 'future', posted_at: '2026-09-30T12:01:00+08:00', predict_winner: 'blue' },
  ] }, '2026-09-30T03:00:00Z');
  const stats = windStats(wind, Date.parse('2026-09-30T11:00:00+08:00'));
  expect(stats.records).toHaveLength(2);
  expect(stats.red).toBe(1); expect(stats.blue).toBe(0); expect(stats.share).toBe(1);
  expect(windStats(wind, Date.parse('2026-09-30T12:00:00+08:00')).share).toBeNull();
  expect(() => parseWindResponse({ success: false, data: [] })).toThrow();
  expect(() => parseWindResponse({ success: true, data: [{ name: 'bad', posted_at: 'invalid' }] })).toThrow();
});

test('wind-only refresh updates separate panel and safely renders blogger details', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-30T10:45:00+08:00') });
  const snapshot = JSON.parse(readFileSync(new URL('../match-data.json', import.meta.url)));
  const history = JSON.parse(readFileSync(new URL('../forecast-history.json', import.meta.url)));
  const wind = parseWindResponse({ success: true, data: [{ name: '<img src=x onerror=alert(1)>', predict_winner: 'blue', posted_at: '2026-09-30T10:10:00+08:00', match: '10点场' }] }, '2026-09-30T02:30:00Z');
  let calls = 0;
  await page.route('**/data-snapshot.json', route => route.fulfill({ json: { snapshot: { ...snapshot, wind: calls++ ? wind : { ...wind, records: [] } }, forecastHistory: history } }));
  await page.goto('/match-betting/');
  await expect(page.locator('.wind-panel')).toContainText('本时段等待预测');
  await page.clock.fastForward(60_000);
  await expect(page.locator('.wind-panel')).toContainText('风向倾向：右蓝');
  await expect(page.locator('.wind-panel')).toContainText('右蓝 100.0%');
  await page.getByRole('button', { name: '查看博主预测' }).click();
  await expect(page.locator('#modal-content')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#modal-content img')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '查看博主预测' })).toBeFocused();
  await page.getByRole('tab', { name: '历史场次' }).click();
  await expect(page.locator('.wind-panel')).toContainText('不随场次筛选切换');
});
