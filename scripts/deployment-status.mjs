// 公开仓库只读查询，不读取或保存认证信息。
export const comparable = data => JSON.stringify(data, (key, value) => key === 'fetchedAt' ? undefined : value && !Array.isArray(value) && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);

export function githubRepository(url) {
  return url.match(/^(?:git@github\.com:|https:\/\/github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?$/)?.[1] ?? null;
}

export async function checkDeployment({ repository, branch, sha, snapshot, history, fetchImpl = fetch }) {
  if (!repository) return { state: 'unknown', message: '非 GitHub 来源，未检查线上部署。' };
  try {
    const get = async url => {
      const response = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000), cache: 'no-store' });
      if (!response.ok) throw new Error('查询失败');
      return response.json();
    };
    const query = new URLSearchParams({ branch, head_sha: sha, per_page: '1' });
    const data = await get(`https://api.github.com/repos/${repository}/actions/workflows/pages.yml/runs?${query}`);
    const run = data.workflow_runs?.find(item => item.head_sha === sha && item.head_branch === branch);
    if (!run) return { state: 'pending', message: '尚未找到当前提交的 Pages 流程，等待下轮检查。' };
    const url = `https://github.com/${repository}/actions/runs/${run.id}`;
    if (run.status !== 'completed') return { state: 'pending', message: `Pages 发布排队或执行中：${url}` };
    if (run.conclusion !== 'success') return { state: 'failed', runId: run.id, message: `Pages 部署失败（${run.conclusion}），线上可能仍是旧数据：${url}；修复后可重新运行该流程。` };
    const [owner, name] = repository.split('/');
    const online = await get(`https://${owner}.github.io/${name}/data-snapshot.json?commit=${sha}`);
    if (comparable(online.snapshot) !== comparable(snapshot) || comparable(online.forecastHistory) !== comparable(history)) {
      return { state: 'pending', message: `Pages 流程成功，但线上快照尚未匹配当前提交，等待下轮检查：${url}` };
    }
    return { state: 'live', message: `Pages 部署成功，线上快照已核对（${sha.slice(0, 7)}）。` };
  } catch {
    return { state: 'unknown', message: '部署状态查询失败或线上快照无法读取，未确认上线；下轮重试。' };
  }
}

export function cycleMessage(result) {
  if (result.stopped) return '服务正在停止。';
  return `${result.published ? '数据已推送。' : '数据与发布副本一致，无需新提交。'}${result.deployment?.message ?? '未检查线上部署。'}`;
}
