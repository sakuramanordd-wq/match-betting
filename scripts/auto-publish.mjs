import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdir, open, readdir, readFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDataSync, projectRoot } from './live-data.mjs';

const exec = promisify(execFile);
const dataFiles = ['match-data.json', 'forecast-history.json'];
const comparable = data => JSON.stringify(data, (key, value) => key === 'fetchedAt' ? undefined : value && !Array.isArray(value) && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);

export function createPublisher({ repoUrl, workDir, branch = 'main', syncData, shouldPublish = () => true }) {
  if (resolve(workDir) === resolve(projectRoot)) throw new Error('发布副本不能使用当前开发目录。');
  const git = args => exec('git', args, { cwd: workDir, timeout: 120_000 });
  const commitData = async () => {
    const staged = (await git(['diff', '--cached', '--name-only'])).stdout.trim();
    if (staged && staged.split('\n').some(name => !dataFiles.includes(name))) throw new Error('发布副本中存在非数据修改，请使用专用空目录。');
    let changed = false;
    const tracked = [];
    for (const name of dataFiles) {
      const current = JSON.parse(await readFile(join(workDir, name), 'utf8'));
      let previous;
      try { previous = JSON.parse((await git(['show', `HEAD:${name}`])).stdout); tracked.push(name); }
      catch { changed = true; continue; }
      if (comparable(current) !== comparable(previous)) changed = true;
    }
    if (!changed) {
      // 不让仅抓取时间的修改阻碍下轮 pull，也不为它创建提交。
      if (tracked.length) await git(['restore', '--source=HEAD', '--staged', '--worktree', '--', ...tracked]);
      return false;
    }
    await git(['add', '--', ...dataFiles]);
    await git(['-c', 'user.name=Match data sync', '-c', 'user.email=data-sync@users.noreply.github.com', 'commit', '-m', 'data: refresh source snapshot and verify forecasts']);
    return true;
  };
  return async () => {
    try { await access(join(workDir, '.git')); }
    catch {
      await mkdir(workDir, { recursive: true });
      if ((await readdir(workDir)).length) throw new Error('发布目录非空且不是 Git 副本，请换一个空目录。');
      await exec('git', ['clone', '--single-branch', '--branch', branch, repoUrl, workDir], { timeout: 120_000 });
    }
    // 副本只承载同步数据；保留上次失败后尚未推送的预测留档。
    const seed = createDataSync({ dataDir: workDir, enabled: false }); seed.stop();
    await commitData();
    await git(['pull', '--rebase', 'origin', branch]);
    if (syncData) await syncData(workDir);
    else await exec(process.execPath, [join(projectRoot, 'scripts/sync-data.mjs')], { cwd: projectRoot, env: { ...process.env, DATA_DIR: workDir }, timeout: 120_000 });
    if (!shouldPublish()) return { published: false };
    await commitData();
    const { stdout } = await git(['rev-list', '--count', `origin/${branch}..HEAD`]);
    if (Number(stdout.trim()) === 0) return { published: false };
    await git(['push', 'origin', `HEAD:${branch}`]);
    return { published: true };
  };
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('用法：npm run publish:watch [-- --once]\n默认每 1 分钟同步并检查数据差异，有变化才推送，首次立即执行。需要 Git 推送权限和 Chromium。\n使用独立 .local-publisher 副本，不提交当前开发目录。\n可设置 PUBLISH_WORKDIR、PUBLISH_INTERVAL_MINUTES、PUBLISH_BRANCH。');
    return;
  }
  const minutes = Number(process.env.PUBLISH_INTERVAL_MINUTES || 1);
  if (!Number.isFinite(minutes) || minutes < 1) throw new Error('发布间隔必须至少为 1 分钟。');
  const workDir = resolve(process.env.PUBLISH_WORKDIR || join(projectRoot, '.local-publisher'));
  const branch = process.env.PUBLISH_BRANCH || 'main';
  const { stdout } = await exec('git', ['remote', 'get-url', 'origin'], { cwd: projectRoot });
  await mkdir(resolve(workDir, '..'), { recursive: true });
  const lockPath = `${workDir}.lock`;
  const lock = await open(lockPath, 'wx').catch(() => { throw new Error('发布服务已运行或遗留锁文件；确认无服务运行后再清理发布副本旁的 .lock 文件。'); });
  await lock.writeFile(String(process.pid));
  let stopped = false;
  let timer;
  let running;
  let finish;
  const done = new Promise(resolve => { finish = resolve; });
  const publish = createPublisher({ repoUrl: stdout.trim(), workDir, branch, shouldPublish: () => !stopped });
  const tick = () => {
    if (running || stopped) return;
    running = publish().then(result => console.log(result.published ? '数据已推送，等待 GitHub Pages 发布完成。' : '没有实际数据变化，跳过发布。')).catch(() => {
      console.error('同步或推送失败；保留上次线上版本，下个周期重试。请检查原表访问、Git 推送权限及发布副本状态。');
      if (process.argv.includes('--once')) process.exitCode = 1;
    }).finally(() => { running = null; if (stopped) finish(); });
  };
  const stop = () => { stopped = true; clearInterval(timer); if (!running) finish(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    console.log(`每 ${minutes} 分钟同步并发布，首次立即执行；Ctrl+C 停止。`);
    tick();
    if (process.argv.includes('--once')) await running;
    else { timer = setInterval(tick, minutes * 60_000); await done; }
  } finally { clearInterval(timer); await lock.close(); await rm(lockPath); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
