import { test, expect } from '@playwright/test';
import { checkDeployment, cycleMessage, githubRepository } from '../scripts/deployment-status.mjs';

const input = { repository: 'owner/repo', branch: 'main', sha: 'abc123', snapshot: { fetchedAt: 'now', events: [] }, history: { forecasts: [] } };
const run = { id: 42, head_sha: input.sha, head_branch: 'main', status: 'completed', conclusion: 'success' };
function fakeFetch(currentRun, online, status = 200) {
  return async url => ({ ok: status === 200, json: async () => url.includes('api.github.com') ? { workflow_runs: currentRun ? [currentRun] : [] } : online });
}

test('deployment checks exact workflow commit and distinguishes failure, pending and confirmed live data', async () => {
  expect(githubRepository('git@github.com:owner/repo.git')).toBe('owner/repo');
  expect(githubRepository('https://github.com/owner/repo.git')).toBe('owner/repo');
  expect(githubRepository('/tmp/remote.git')).toBeNull();
  const failed = await checkDeployment({ ...input, fetchImpl: fakeFetch({ ...run, conclusion: 'failure' }) });
  expect(failed.state).toBe('failed');
  expect(failed.runId).toBe(42);
  expect(cycleMessage({ published: false, deployment: failed })).toContain('Pages 部署失败');
  expect(cycleMessage({ published: true, deployment: failed })).toContain('数据已推送');
  for (const current of [null, { ...run, head_sha: 'old' }, { ...run, status: 'in_progress' }]) {
    expect((await checkDeployment({ ...input, fetchImpl: fakeFetch(current) })).state).toBe('pending');
  }
  const online = { snapshot: { ...input.snapshot, fetchedAt: 'older' }, forecastHistory: input.history };
  expect((await checkDeployment({ ...input, fetchImpl: fakeFetch(run, online) })).state).toBe('live');
  expect((await checkDeployment({ ...input, fetchImpl: fakeFetch(run, { ...online, snapshot: { events: ['old'] } }) })).state).toBe('pending');
  expect((await checkDeployment({ ...input, fetchImpl: fakeFetch(run, { ...online, forecastHistory: { forecasts: ['old'] } }) })).state).toBe('pending');
  expect((await checkDeployment({ ...input, fetchImpl: fakeFetch(run, online, 403) })).state).toBe('unknown');
});

test('empty source fixture stays independent of later judgments and results', async ({ page }) => {
  const { readFile } = await import('node:fs/promises');
  const snapshot = JSON.parse(await readFile(new URL('../match-data.json', import.meta.url)));
  snapshot.events[0].slots[1].result = null;
  snapshot.events[0].slots[1].records = [{ name: '新增判断', side: 'blue' }];
  await page.clock.install({ time: new Date('2026-09-30T12:45:00+08:00') });
  await page.route('**/data-snapshot.json', route => route.fulfill({ json: { snapshot, forecastHistory: { forecasts: [] } } }));
  await page.goto('/match-betting/');
  await expect(page.locator('.current-card')).toContainText('原表未填写');
  await expect(page.locator('.count-ratio')).toContainText('右蓝 100.0%');
  await expect(page.locator('.current-card .record-table')).toContainText('新增判断');
});
