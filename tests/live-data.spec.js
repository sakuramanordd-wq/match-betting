import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createDataSync } from '../scripts/live-data.mjs';
import { createDataServer } from '../scripts/data-server.mjs';

const snapshot = JSON.parse(readFileSync(new URL('../match-data.json', import.meta.url)));
const history = JSON.parse(readFileSync(new URL('../forecast-history.json', import.meta.url)));

test('minute refresh updates data without losing filters and keeps last success on failure', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-30T10:45:00+08:00') });
  let requests = 0;
  const updated = structuredClone(snapshot);
  updated.fetchedAt = '2026-09-30T03:41:00Z';
  await page.route('**/data-snapshot.json', route => {
    requests++;
    if (requests === 3) return route.fulfill({ status: 503 });
    return route.fulfill({ json: { snapshot: requests === 1 ? snapshot : updated, forecastHistory: history, autoSync: true, syncFailed: false } });
  });
  await page.goto('/match-betting/');
  await expect(page.locator('#updated-at')).toContainText('每分钟同步');
  await page.getByRole('tab', { name: '历史场次' }).click();
  await page.locator('#event-select').selectOption('2025-national');
  await page.locator('#date-select').selectOption('2025-10-01');
  await page.evaluate(() => { window.refreshMarker = 'preserved'; });
  await page.clock.fastForward(60_000);
  await expect(page.locator('#updated-at')).toContainText('11:41');
  await expect(page.locator('#event-select')).toHaveValue('2025-national');
  await expect(page.locator('#date-select')).toHaveValue('2025-10-01');
  expect(await page.evaluate(() => window.refreshMarker)).toBe('preserved');
  await page.clock.fastForward(60_000);
  await expect(page.locator('#updated-at')).toContainText('更新失败，保留旧数据');
  await expect(page.locator('#updated-at')).toContainText('11:41');
  await page.clock.fastForward(60_000);
  await expect(page.locator('#updated-at')).toContainText('每分钟同步');
});

test('refresh waits for modal close and then applies latest snapshot', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-30T10:45:00+08:00') });
  let requests = 0;
  await page.route('**/data-snapshot.json', route => {
    requests++;
    return route.fulfill({ json: { snapshot: { ...snapshot, fetchedAt: requests === 1 ? snapshot.fetchedAt : '2026-09-30T03:42:00Z' }, forecastHistory: history, autoSync: true } });
  });
  await page.goto('/match-betting/');
  await expect(page.locator('#updated-at')).toContainText('每分钟同步');
  await page.getByRole('button', { name: '查看详细计算' }).click();
  await page.clock.fastForward(60_000);
  expect(requests).toBe(1);
  await expect(page.locator('#modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#updated-at')).toContainText('11:42');
  await expect(page.getByRole('button', { name: '查看详细计算' })).toBeFocused();
});

test('automatic source sync skips overlapping work and retains successful data on errors', async () => {
  let tick;
  let complete;
  let calls = 0;
  const sync = createDataSync({
    logger: { info() {}, warn() {} },
    setTimer(callback, delay) { expect(delay).toBe(60_000); tick = callback; return 1; },
    clearTimer() {},
    runSync: () => { calls++; return new Promise((resolve, reject) => { complete = { resolve, reject }; }); },
  });
  sync.start();
  expect(calls).toBe(1);
  await tick(); expect(calls).toBe(1);
  const before = sync.read().snapshot.fetchedAt;
  complete.reject(new Error('source unavailable'));
  await new Promise(resolve => setImmediate(resolve));
  expect(sync.read().syncFailed).toBe(true);
  expect(sync.read().snapshot.fetchedAt).toBe(before);
  const retry = tick(); expect(calls).toBe(2);
  complete.resolve(); await retry;
  expect(sync.read().syncFailed).toBe(false);
  sync.stop(); await tick(); expect(calls).toBe(2);
});

test('online data API permits Pages origin and provides a noncached snapshot', async () => {
  const data = { snapshot, forecastHistory: history, autoSync: true, syncFailed: false };
  let started = false, stopped = false;
  const server = createDataServer({ dataSync: { read: () => data, start() { started = true; }, stop() { stopped = true; } } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${base}/data-snapshot.json`, { headers: { Origin: 'https://sakuramanordd-wq.github.io' } });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://sakuramanordd-wq.github.io');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.json()).snapshot.fetchedAt).toBe(snapshot.fetchedAt);
    expect((await fetch(`${base}/data-snapshot.json`, { headers: { Origin: 'https://other.example' } })).status).toBe(403);
    expect((await fetch(`${base}/data-snapshot.json`, { method: 'POST' })).status).toBe(405);
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
    expect(started).toBe(true);
  } finally { await new Promise(resolve => server.close(resolve)); }
  expect(stopped).toBe(true);
});
