import { execFile } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { access, mkdir, open, readdir, readFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDataSync, projectRoot } from './live-data.mjs';
import { comparable, githubRepository, checkDeployment, cycleMessage } from './deployment-status.mjs';

const exec = promisify(execFile);
const dataFiles = ['match-data.json', 'forecast-history.json'];

export function createPublisher({ repoUrl, workDir, branch = 'main', syncData, shouldPublish = () => true, logger = () => {}, deploymentCheck = checkDeployment, retryDeployment = false, rerun = (repository, runId) => exec('gh', ['run', 'rerun', String(runId), '--repo', repository], { timeout: 30_000 }) }) {
  if (resolve(workDir) === resolve(projectRoot)) throw new Error('发布副本不能使用当前开发目录。');
  const repository = githubRepository(repoUrl);
  const retriedRuns = new Set();
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
    logger('检查发布副本。');
    try { await access(join(workDir, '.git')); }
    catch {
      await mkdir(workDir, { recursive: true });
      if ((await readdir(workDir)).length) throw new Error('发布目录非空且不是 Git 副本，请换一个空目录。');
      logger('首次创建独立发布副本。');
      await exec('git', ['clone', '--single-branch', '--branch', branch, repoUrl, workDir], { timeout: 120_000 });
    }
    // 副本只承载同步数据；保留上次失败后尚未推送的预测留档。
    const seed = createDataSync({ dataDir: workDir, enabled: false }); seed.stop();
    await commitData();
    logger('拉取远端更新。');
    await git(['pull', '--rebase', 'origin', branch]);
    logger('开始抓取原表和对弈风向（https://yysrank.com/dyjc.html），并更新预测留档。');
    if (syncData) await syncData(workDir);
    else await exec(process.execPath, [join(projectRoot, 'scripts/sync-data.mjs')], { cwd: projectRoot, env: { ...process.env, DATA_DIR: workDir }, timeout: 120_000 });
    const snapshot = JSON.parse(await readFile(join(workDir, 'match-data.json'), 'utf8'));
    logger(`原表同步成功，抓取时间：${snapshot.fetchedAt}；检查实际数据差异。`);
    if (snapshot.wind?.syncFailed) logger('对弈风向抓取失败，保留上次快照，下轮重试。');
    else if (snapshot.wind?.fetchedAt) logger(`对弈风向同步成功，抓取时间：${snapshot.wind.fetchedAt}；内容变化纳入发布检查。`);
    if (!shouldPublish()) { logger('收到停止请求，本轮不推送。'); return { published: false, stopped: true }; }
    await commitData();
    const { stdout } = await git(['rev-list', '--count', `origin/${branch}..HEAD`]);
    const published = Number(stdout.trim()) > 0;
    if (published) {
      logger(`发现 ${stdout.trim()} 个待推送提交，开始推送 ${branch}。`);
      await git(['push', 'origin', `HEAD:${branch}`]);
    }
    const sha = (await git(['rev-parse', 'HEAD'])).stdout.trim();
    logger(`检查当前提交 ${sha.slice(0, 7)} 的 Pages 部署与线上快照。`);
    const deployment = await deploymentCheck({ repository, branch, sha,
      snapshot: JSON.parse(await readFile(join(workDir, 'match-data.json'), 'utf8')),
      history: JSON.parse(await readFile(join(workDir, 'forecast-history.json'), 'utf8')) });
    if (retryDeployment && deployment.state === 'failed' && !retriedRuns.has(deployment.runId) && shouldPublish()) {
      retriedRuns.add(deployment.runId);
      try {
        await rerun(repository, deployment.runId);
        deployment.state = 'pending';
        deployment.message = '已请求重新部署已有提交，等待下轮核验；未创建数据提交。';
      } catch {
        deployment.message += ' 重新部署请求失败，请检查 gh 安装、登录及 Actions 权限，或在上述链接点击 Re-run all jobs。';
      }
    }
    return { published, deployment };
  };
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('用法：npm run publish:watch [-- --once] [--retry-deploy]\n默认每 1 分钟同步、检查数据差异并核验 Pages 上线状态；--retry-deploy 使用已登录的 gh 重跑失败流程（每个流程本进程最多一次），有变化才推送，首次立即执行。需要 Git 推送权限和 Chromium。\n使用独立 .local-publisher 副本，不提交当前开发目录。\n可设置 PUBLISH_WORKDIR、PUBLISH_INTERVAL_MINUTES、PUBLISH_BRANCH、PUBLISH_LOG_FILE（默认 .local-publisher.log）。');
    return;
  }
  const minutes = Number(process.env.PUBLISH_INTERVAL_MINUTES || 1);
  if (!Number.isFinite(minutes) || minutes < 1) throw new Error('发布间隔必须至少为 1 分钟。');
  const workDir = resolve(process.env.PUBLISH_WORKDIR || join(projectRoot, '.local-publisher'));
  const branch = process.env.PUBLISH_BRANCH || 'main';
  const logPath = resolve(process.env.PUBLISH_LOG_FILE || join(projectRoot, '.local-publisher.log'));
  await mkdir(resolve(logPath, '..'), { recursive: true });
  const log = (message, error = false) => {
    const timestamp = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' });
    const line = `[${timestamp} +08:00] ${message}`;
    appendFileSync(logPath, `${line}\n`);
    (error ? console.error : console.log)(line);
  };
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
  let cycle = 0;
  let stage = '';
  const publish = createPublisher({ repoUrl: stdout.trim(), workDir, branch, retryDeployment: process.argv.includes('--retry-deploy'), shouldPublish: () => !stopped, logger: message => { stage = message; log(`第 ${cycle} 轮：${message}`); } });
  const tick = () => {
    if (stopped) return;
    if (running) { log(`第 ${cycle} 轮仍在执行，跳过本次定时触发，避免重叠。`); return; }
    cycle += 1;
    const started = Date.now();
    log(`第 ${cycle} 轮开始。`);
    running = publish().then(result => {
      log(`第 ${cycle} 轮完成，耗时 ${((Date.now() - started) / 1000).toFixed(1)} 秒：${cycleMessage({ ...result, stopped })}`, result.deployment?.state === 'failed');
      if (process.argv.includes('--once') && ['failed', 'unknown'].includes(result.deployment?.state)) process.exitCode = 1;
    }).catch(error => {
      // 不记录子进程完整输出，避免 Git URL、认证或访客信息进入日志。
      log(`第 ${cycle} 轮失败，耗时 ${((Date.now() - started) / 1000).toFixed(1)} 秒；阶段：${stage}；退出码：${error.code ?? '未知'}；信号：${error.signal ?? '无'}。保留上次线上版本，下个周期重试。`, true);
      if (process.argv.includes('--once')) process.exitCode = 1;
    }).finally(() => { running = null; if (stopped) finish(); });
  };
  const stop = () => { log('收到停止信号，等待当前轮结束。'); stopped = true; clearInterval(timer); if (!running) finish(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    log(`服务启动，PID ${process.pid}；每 ${minutes} 分钟同步并检查，首次立即执行；日志：${logPath}；Ctrl+C 停止。`);
    tick();
    if (process.argv.includes('--once')) await running;
    else { timer = setInterval(tick, minutes * 60_000); await done; }
  } finally { clearInterval(timer); await lock.close(); await rm(lockPath); log('服务已停止，发布锁已释放。'); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
