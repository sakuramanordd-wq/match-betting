import { readFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export function createDataSync({ dataDir = projectRoot, enabled = true, logger = console, runSync, intervalMs = 60_000, setTimer = setInterval, clearTimer = clearInterval } = {}) {
  mkdirSync(dataDir, { recursive: true });
  for (const name of ['match-data.json', 'forecast-history.json']) {
    if (!existsSync(join(dataDir, name))) copyFileSync(join(projectRoot, name), join(dataDir, name));
  }
  const load = () => ({ snapshot: JSON.parse(readFileSync(join(dataDir, 'match-data.json'), 'utf8')), forecastHistory: JSON.parse(readFileSync(join(dataDir, 'forecast-history.json'), 'utf8')) });
  let data = load();
  let syncing = false;
  let failed = false;
  let stopped = false;
  let timer;
  let child;
  const execute = runSync || (() => new Promise((resolve, reject) => {
    child = execFile(process.execPath, ['scripts/sync-data.mjs'], { cwd: projectRoot, env: { ...process.env, DATA_DIR: dataDir }, timeout: 120_000 }, error => error ? reject(error) : resolve());
  }));
  const sync = async () => {
    if (syncing || stopped) return;
    syncing = true;
    try {
      await execute();
      if (stopped) return;
      data = load();
      failed = false;
    } catch {
      // 风向来源独立同步；原表失败时仍可展示已成功抓取的风向。
      try { data = { ...data, snapshot: { ...data.snapshot, wind: load().snapshot.wind } }; } catch {}
      if (!stopped) { failed = true; logger.warn('原表自动同步失败，保留上次成功快照；下个周期重试。'); }
    } finally { syncing = false; }
  };
  return {
    read: () => ({ ...data, autoSync: enabled, syncFailed: failed }),
    start() {
      if (!enabled || timer || stopped) return;
      logger.info('原表自动同步已开启：每分钟一次。');
      timer = setTimer(sync, intervalMs);
      sync();
    },
    stop() { stopped = true; clearTimer(timer); child?.kill(); },
  };
}
