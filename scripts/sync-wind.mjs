import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { parseWindResponse } from '../wind.js';

export async function syncWind(dataDir) {
  const path = join(dataDir, 'match-data.json');
  const snapshot = JSON.parse(await readFile(path, 'utf8'));
  try {
    const response = await fetch('https://yysrank.com/api/dyjc/get', {
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://yysrank.com/dyjc.html' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    snapshot.wind = parseWindResponse(await response.json(), new Date().toISOString());
    console.log('博主风向同步成功。');
  } catch {
    snapshot.wind = { ...snapshot.wind, syncFailed: true };
    console.warn('博主风向同步失败，保留上次快照，下轮重试。');
  }
  await writeFile(`${path}.wind.tmp`, JSON.stringify(snapshot, null, 2) + '\n');
  await rename(`${path}.wind.tmp`, path);
  return snapshot.wind;
}
