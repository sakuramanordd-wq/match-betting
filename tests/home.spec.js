import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const snapshot = JSON.parse(readFileSync(new URL('../match-data.json', import.meta.url)));

test('snapshot contains source results and valid, unique dated slots', () => {
  expect(snapshot.events).toHaveLength(4);
  const ids = new Set();
  for (const event of snapshot.events) {
    expect(event.slots).toHaveLength(49);
    for (const slot of event.slots) {
      expect(ids.has(slot.id)).toBe(false); ids.add(slot.id);
      expect(Number.isFinite(Date.parse(slot.startsAt))).toBe(true);
      expect([null, 'red', 'blue']).toContain(slot.result);
      expect(slot.records.every(record => record.name && ['red', 'blue'].includes(record.side))).toBe(true);
    }
  }
  expect(snapshot.events[0].slots[0].result).toBe('red');
  expect(snapshot.events[0].slots[1].result).toBeNull();
  expect(snapshot.events[1].slots.every(slot => slot.result)).toBe(true);
});
for (const width of [390, 1440]) {
  test(`current and historical data, details and layout at ${width}px`, async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-30T10:45:00+08:00') });
    await page.setViewportSize({ width, height: 1000 });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/match-betting/');
    await expect(page.locator('#stat-event')).toHaveText('2026 国庆');
    await expect(page.locator('.current-card')).toContainText('9月30日10点场');
    await expect(page.locator('.current-card')).toContainText('左红');
    await expect(page.locator('#matches .match-card')).toHaveCount(7);
    await page.locator('.current-card button').click();
    await expect(page.locator('#modal-content')).toContainText('面灵气喵');
    await page.keyboard.press('Escape');
    await expect(page.locator('.current-card button')).toBeFocused();
    await page.getByRole('tab', { name: '历史场次' }).click();
    await expect(page.locator('#stat-event')).toHaveText('2026 春节');
    await expect(page.locator('#matches .match-card')).toHaveCount(49);
    await page.locator('#event-select').selectOption('2025-national');
    await expect(page.locator('#stat-event')).toHaveText('2025 国庆');
    await page.locator('#date-select').selectOption('2025-10-01');
    await expect(page.locator('#matches .match-card')).toHaveCount(7);
    await page.getByRole('tab', { name: '当前场次' }).click();
    await page.getByRole('button', { name: '数据说明' }).click();
    await expect(page.locator('#modal-content')).toContainText('静态快照');
    await page.getByRole('button', { name: '关闭弹窗' }).click();
    await page.getByRole('tab', { name: '当前场次' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: '历史场次' })).toHaveAttribute('aria-selected', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/home-${width}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}
test('unfilled results stay unknown and old saved records are preserved', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-30T12:45:00+08:00') });
  await page.addInitScript(() => localStorage.setItem('heian-betting:v1', 'legacy record'));
  await page.goto('/match-betting/');
  await expect(page.locator('.current-card')).toContainText('9月30日12点场');
  await expect(page.locator('.current-card')).toContainText('原表未填写');
  await page.locator('.current-card button').click();
  await expect(page.locator('#modal-content')).toContainText('本场原表尚无判断记录');
  expect(await page.evaluate(() => localStorage.getItem('heian-betting:v1'))).toBe('legacy record');
  await expect(page.locator('#wallet-button, #bet-form')).toHaveCount(0);
});
