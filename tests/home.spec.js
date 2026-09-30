import { test, expect } from '@playwright/test';
import { initialState, placeBet, settleBets, validateState, STORAGE_KEY } from '../state.js';

test('ledger validates amounts, prevents duplicate bets and settles once', () => {
  let state = initialState();
  for (const amount of [0, 9, 501, 10.5, NaN]) expect(() => placeBet(state, 'HEIAN-001', 'blue', amount)).toThrow();
  expect(() => placeBet(state, 'HEIAN-003', 'red', 100)).toThrow();
  expect(() => placeBet(state, 'HEIAN-001', undefined, 100)).toThrow();
  expect(() => placeBet({ ...state, balance: 20 }, 'HEIAN-001', 'red', 100)).toThrow();
  state = placeBet(state, 'HEIAN-001', 'blue', 100);
  expect(state.balance).toBe(900);
  expect(() => placeBet(state, 'HEIAN-001', 'red', 100)).toThrow();
  state = placeBet(state, 'HEIAN-002', 'blue', 200);
  expect(validateState(state)).toBe(true);
  state = settleBets(state);
  expect(state.balance).toBe(900);
  expect(state.bets.map(b => b.status)).toEqual(['won', 'lost']);
  expect(settleBets(state)).toEqual(state);
  expect(validateState(state)).toBe(true);
  expect(validateState({ ...state, balance: 100000 })).toBe(false);
});

test('bet, reload, settle and reset from the deployed production build', async ({ page }) => {
  await page.goto('/match-betting/');
  await page.getByRole('button', { name: '选择阵容落签' }).first().click();
  await page.getByRole('button', { name: '确认落签' }).click();
  await expect(page.getByRole('alert')).toHaveText('请先选择红方或蓝方。');
  await page.getByRole('button', { name: '青 · 蓝方' }).click();
  await page.getByRole('button', { name: '确认落签' }).click();
  await expect(page.locator('#balance')).toHaveText('900');
  await page.reload();
  await expect(page.locator('#balance')).toHaveText('900');
  await page.getByRole('button', { name: '查看我的竞猜' }).last().click();
  await page.getByRole('button', { name: '模拟结算', exact: true }).click();
  await expect(page.locator('#modal-content')).toContainText('已命中');
  await expect(page.locator('#balance')).toHaveText('1,100');
  await expect(page.getByRole('button', { name: '模拟结算', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '重置体验' }).click();
  await page.getByRole('button', { name: '保留记录' }).click();
  await expect(page.locator('#balance')).toHaveText('1,100');
  await page.getByRole('button', { name: '重置体验' }).click();
  await page.getByRole('button', { name: '确认重置' }).click();
  await expect(page.locator('#balance')).toHaveText('1,000');
  await expect(page.locator('#modal-content')).toContainText('手帖还是空白的');
});

for (const width of [390, 1440]) {
  test(`layout, images, tabs and guides work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/match-betting/');
    await expect(page.locator('.match-card')).toHaveCount(2);
    await expect.poll(() => page.locator('.portrait img').evaluateAll(images => images.every(i => i.complete && i.naturalWidth > 0))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('tab', { name: '已结束' }).click();
    await expect(page.locator('.match-card')).toHaveCount(1);
    await page.getByRole('button', { name: '查看赛果' }).click();
    await expect(page.locator('#modal-content')).toContainText('蓝方胜出');
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: '全部对局' }).click();
    await expect(page.locator('.match-card')).toHaveCount(3);
    await page.locator('[data-guide="0"]').click();
    await expect(page.locator('#modal-content')).toContainText('先找到队伍的节奏');
    await page.getByRole('button', { name: '关闭弹窗' }).click();
    await page.getByRole('tab', { name: '可竞猜' }).click();
    await page.screenshot({ path: `test-results/home-${width}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}

test('invalid saved data recovers safely', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, '{"version":1,"balance":-1,"bets":[]}'), STORAGE_KEY);
  await page.goto('/match-betting/');
  await expect(page.locator('.storage-warning')).toContainText('本地记录格式异常');
  await expect(page.locator('#balance')).toHaveText('1,000');
});

test('blocked storage shows a warning and allows in-memory play', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new Error('storage blocked'); };
  });
  await page.goto('/match-betting/');
  await expect(page.locator('.storage-warning')).toContainText('浏览器无法保存');
  await page.getByRole('button', { name: '选择阵容落签' }).first().click();
  await page.getByRole('button', { name: '赤 · 红方' }).click();
  await page.getByRole('button', { name: '确认落签' }).click();
  await expect(page.locator('#balance')).toHaveText('900');
});
