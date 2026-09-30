import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const predictionSource = readFileSync(new URL('../prediction.js', import.meta.url), 'utf8');
const dataSource = readFileSync(new URL('../data.js', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replace(/^export \{.*\}.*;$/gm, '');
const { judgmentStats, predictSlot, backtest, updateForecasts } = await import(`data:text/javascript;base64,${Buffer.from('const initialSnapshot = {}; const initialForecastHistory = { forecasts: [] };\n' + predictionSource + '\n' + dataSource).toString('base64')}`);
const snapshot = JSON.parse(readFileSync(new URL('../match-data.json', import.meta.url)));

test('snapshot contains source results and valid, unique dated slots', () => {
  expect(snapshot.events).toHaveLength(4);
  const ids = new Set();
  for (const event of snapshot.events) {
    expect(event.slots).toHaveLength(49);
    expect(event.summaries.length).toBeGreaterThan(0);
    expect(event.summaries.every(summary => typeof summary.winRate === 'string')).toBe(true);
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
    await expect(page.locator('.count-ratio')).toContainText('左红 100.0%');
    await expect(page.locator('.weighted-ratio')).toContainText('右蓝 0.0%');
    await expect(page.locator('.current-card .record-table tbody tr')).toHaveCount(23);
    const stats = judgmentStats(snapshot.events[0], snapshot.events[0].slots[0], snapshot.events);
    await expect(page.locator('.current-card .evaluation-score').first()).toHaveText((stats.records[0].weight * 100).toFixed(1));
    await expect(page.locator('.current-card .prediction-panel')).toHaveCount(0);
    await expect(page.locator('.current-card .prediction-evaluation')).toHaveCount(0);
    expect(await page.locator('.current-card .metrics > section').evaluateAll(items => items.map(item => item.className))).toEqual(['ratio-panel count-ratio', 'ratio-panel weighted-ratio']);
    const firstSummary = snapshot.events[0].summaries.find(item => item.name === snapshot.events[0].slots[0].records[0].name);
    await expect(page.locator('.current-card .record-table tbody tr').first().locator('.source-stat')).toHaveText([firstSummary.wins || '—', firstSummary.losses || '—', firstSummary.winRate || '—', firstSummary.total || '—']);
    const table = page.locator('.current-card .record-table');
    for (const [column, label] of [[2, '胜场'], [3, '败场'], [4, '胜率'], [5, '总场次'], [6, '本场前评估分']]) {
      for (const direction of ['descending', 'ascending']) {
        await table.getByRole('button', { name: new RegExp(`^${label}，`) }).click();
        await expect(table.locator('th').nth(column)).toHaveAttribute('aria-sort', direction);
        const values = await table.locator('tbody tr').evaluateAll((rows, index) => rows.map(row => {
          const text = row.children[index].textContent.trim().replace(/[,，%％]/g, '');
          return text && /^[-+]?\d+(?:\.\d+)?$/.test(text) ? Number(text) : null;
        }), column);
        const numbers = values.filter(value => value !== null);
        expect(numbers.length).toBeGreaterThan(0);
        expect(values).toEqual([...numbers.slice().sort((a, b) => direction === 'ascending' ? a - b : b - a), ...values.filter(value => value === null)]);
      }
    }
    await table.getByRole('button', { name: /^记录者，/ }).focus();
    await page.keyboard.press('Enter');
    await expect(table.locator('th').first()).toHaveAttribute('aria-sort', 'ascending');
    const names = await table.locator('tbody tr td:first-child').allTextContents();
    expect(names).toEqual(names.slice().sort((a, b) => a.localeCompare(b, 'zh-CN')));
    await table.getByRole('button', { name: /^本场选择，/ }).click();
    await expect(table.locator('th').nth(1)).toHaveAttribute('aria-sort', 'ascending');
    expect(await page.locator('.current-card').evaluate(el => el.getBoundingClientRect().top)).toBeLessThan(300);
    await expect(page.locator('#matches .match-card')).toHaveCount(7);
    await page.getByRole('button', { name: '查看详细计算' }).click();
    await expect(page.locator('#modal-content')).toContainText('个人评估分 =');
    await expect(page.locator('#modal-content')).toContainText('留档预测实际命中率');
    const totalScore = stats.records.reduce((sum, r) => sum + r.weight * 100, 0).toFixed(2);
    await expect(page.locator('#modal-content')).toContainText(`左红：${totalScore} ÷ ${totalScore} × 100% = 100.0%`);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: '查看详细计算' })).toBeFocused();
    await page.locator('.current-card .bet-button').click();
    await expect(page.locator('#modal-content')).toContainText('面灵气喵');
    await page.keyboard.press('Escape');
    await expect(page.locator('.current-card .bet-button')).toBeFocused();
    await page.getByRole('tab', { name: '历史场次' }).click();
    await expect(page.locator('#stat-event')).toHaveText('2026 春节');
    await expect(page.locator('#matches .match-card')).toHaveCount(49);
    await page.locator('#event-select').selectOption('2025-national');
    await expect(page.locator('#stat-event')).toHaveText('2025 国庆');
    await page.locator('#date-select').selectOption('2025-10-01');
    await expect(page.locator('#matches .match-card')).toHaveCount(7);
    await page.locator('#matches button').first().click();
    await expect(page.locator('.current-card')).toContainText('10月1日10点场');
    await page.getByRole('tab', { name: '当前场次' }).click();
    await page.getByRole('button', { name: '数据说明' }).click();
    await expect(page.locator('#modal-content')).toContainText('静态快照');
    await page.getByRole('button', { name: '关闭弹窗' }).click();
    await expect(page.locator('#modal')).not.toBeVisible();
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
  await expect(page.locator('.count-ratio')).toContainText('左红 —');
  await expect(page.locator('.weighted-ratio')).toContainText('右蓝 —');
  await expect(page.locator('.current-card .prediction-panel')).toHaveCount(0);
  await page.locator('.current-card .bet-button').click();
  await expect(page.locator('#modal-content')).toContainText('本场原表尚无判断记录');
  expect(await page.evaluate(() => localStorage.getItem('heian-betting:v1'))).toBe('legacy record');
  await expect(page.locator('#wallet-button, #bet-form')).toHaveCount(0);
});

test('weighted judgments use only earlier known results and keep empty states', () => {
  const slot = (hour, result, records) => ({ startsAt: `2026-09-30T${hour}:00:00+08:00`, result, records });
  const record = (name, side) => ({ name, side });
  const target = slot('16', 'red', [record('A', 'red'), record('B', 'blue'), record('C', 'blue')]);
  const event = { slots: [
    slot('10', 'red', [record('A', 'red'), record('B', 'blue')]),
    slot('12', 'blue', [record('A', 'blue'), record('B', 'blue')]),
    slot('14', null, [record('A', 'red')]), target,
    slot('18', 'blue', [record('A', 'red')]),
  ] };
  const stats = judgmentStats(event, target);
  expect(stats.redShare).toBeCloseTo(1 / 3);
  expect(stats.weightedRedShare).toBeCloseTo(0.4);
  expect(stats.records.map(r => [r.correct, r.total, r.weight])).toEqual([[2, 2, 4 / 6], [1, 2, 0.5], [0, 0, 0.5]]);
  const empty = judgmentStats(event, slot('20', null, []));
  expect(empty.redShare).toBeNull(); expect(empty.weightedRedShare).toBeNull();
  const zero = judgmentStats({ slots: [slot('10', 'red', [record('Z', 'blue')])] }, slot('12', null, [record('Z', 'red')]));
  expect(zero.redShare).toBe(1); expect(zero.weightedRedShare).toBe(1);
  expect(zero.records[0].weight).toBe(0.4);
});

test('prediction learns across events without target or later results and abstains on ties', () => {
  const earlier = { id: 'old', slots: [
    { id: 'a', startsAt: '2025-01-01T10:00:00+08:00', result: 'red', records: [{ name: 'A', side: 'red' }, { name: 'B', side: 'blue' }] },
    { id: 'b', startsAt: '2025-01-01T12:00:00+08:00', result: 'blue', records: [{ name: 'A', side: 'blue' }, { name: 'B', side: 'red' }] },
  ] };
  const target = { id: 'target', startsAt: '2026-01-01T10:00:00+08:00', result: null, records: [{ name: 'A', side: 'red' }, { name: 'B', side: 'blue' }] };
  const later = { id: 'later', startsAt: '2026-01-01T12:00:00+08:00', result: 'blue', records: [{ name: 'A', side: 'red' }] };
  const events = [earlier, { id: 'new', slots: [target, later] }];
  const forecast = predictSlot(events, target);
  expect(forecast.side).toBe('red'); expect(forecast.majoritySide).toBeNull();
  expect(forecast.redShare).toBeCloseTo(2 / 3);
  target.result = 'blue'; later.result = 'red';
  expect(predictSlot(events, target)).toEqual(forecast);
  expect(predictSlot([], target).side).toBeNull();
  expect(predictSlot(events, { ...target, records: [] }).side).toBeNull();
  expect(judgmentStats(events[1], { ...target, records: [{ name: 'A alias', side: 'red' }] }, events).records[0].total).toBe(0);
});

test('backtest compares identical samples and does not count absent or tied judgments', () => {
  const events = [{ slots: [
    { startsAt: '2025-01-01T10:00:00+08:00', result: 'red', records: [] },
    { startsAt: '2025-01-01T12:00:00+08:00', result: 'red', records: [{ name: 'A', side: 'red' }, { name: 'B', side: 'blue' }] },
    { startsAt: '2025-01-01T14:00:00+08:00', result: 'red', records: [{ name: 'A', side: 'red' }] },
    { startsAt: '2025-01-01T16:00:00+08:00', result: null, records: [{ name: 'A', side: 'blue' }] },
  ] }];
  const report = backtest(events);
  expect(report.eligible).toBe(3); expect(report.total).toBe(1); expect(report.correct).toBe(1);
  expect(report.skipped).toBe(2); expect(report.pairedTotal).toBe(1);
  expect(report.pairedCorrect).toBe(report.pairedMajorityCorrect);
  expect(backtest(events, Date.parse(events[0].slots[2].startsAt)).total).toBe(0);
});

test('sync preserves first unresolved forecast and verifies it after result updates', () => {
  const slot = { id: 'new-1', startsAt: '2026-09-30T12:00:00+08:00', result: null, records: [{ name: 'A', side: 'red' }] };
  const events = [{ id: 'new', slots: [slot] }];
  const first = updateForecasts([], events, '2026-09-30T03:00:00Z');
  expect(first).toHaveLength(1); expect(first[0].side).toBe('red');
  slot.records = [{ name: 'A', side: 'blue' }];
  const second = updateForecasts(first, events, '2026-09-30T04:00:00Z');
  expect(second[0].side).toBe('red'); expect(second[0].createdAt).toBe(first[0].createdAt);
  slot.result = 'blue';
  const verified = updateForecasts(second, events, '2026-09-30T05:00:00Z');
  expect(verified[0].side).toBe('red'); expect(verified[0].result).toBe('blue');
  expect(first[0].result).toBeNull();
  expect(updateForecasts([], events, '2026-09-30T05:00:00Z')).toHaveLength(0);
  expect(updateForecasts([], [{ id: 'empty', slots: [{ ...slot, result: null, records: [] }] }], '2026-09-30T05:00:00Z')).toHaveLength(0);
});
