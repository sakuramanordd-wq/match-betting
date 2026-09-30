import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPublisher } from '../scripts/auto-publish.mjs';

const exec = promisify(execFile);

test('publisher skips timestamp-only changes and pushes only data changes in an isolated clone', async () => {
  const root = await mkdtemp(join(tmpdir(), 'match-publish-'));
  const origin = join(root, 'remote.git');
  const seed = join(root, 'seed');
  const workDir = join(root, 'publisher');
  const git = args => exec('git', args, { cwd: seed });
  try {
    await mkdir(seed);
    await exec('git', ['init', '--bare', '--initial-branch=main', origin]);
    await git(['init', '--initial-branch=main']);
    const initial = JSON.parse(await readFile(new URL('../match-data.json', import.meta.url), 'utf8'));
    await writeFile(join(seed, 'match-data.json'), JSON.stringify(initial));
    await writeFile(join(seed, 'forecast-history.json'), JSON.stringify({ version: 1, forecasts: [] }));
    await writeFile(join(seed, 'app.js'), '// unrelated code\n');
    await git(['add', '.']);
    await git(['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'initial']);
    await git(['remote', 'add', 'origin', origin]);
    await git(['push', '-u', 'origin', 'main']);
    const originalHead = (await git(['rev-parse', 'HEAD'])).stdout.trim();
    let changeData = false;
    let ticks = 0;
    const publish = createPublisher({ repoUrl: origin, workDir, syncData: async dir => {
      const snapshot = JSON.parse(await readFile(join(dir, 'match-data.json'), 'utf8'));
      snapshot.fetchedAt = `2026-09-30T04:0${++ticks}:00Z`;
      if (changeData) snapshot.events[0].slots[1].records = [{ name: 'New judgment', side: 'blue' }];
      await writeFile(join(dir, 'match-data.json'), JSON.stringify(snapshot));
    } });
    expect((await publish()).published).toBe(false);
    await git(['fetch', 'origin']);
    expect((await git(['rev-parse', 'origin/main'])).stdout.trim()).toBe(originalHead);
    changeData = true;
    expect((await publish()).published).toBe(true);
    await git(['fetch', 'origin']);
    const changedHead = (await git(['rev-parse', 'origin/main'])).stdout.trim();
    expect(changedHead).not.toBe(originalHead);
    expect((await git(['diff', '--name-only', originalHead, changedHead])).stdout.trim()).toBe('match-data.json');
    expect((await publish()).published).toBe(false);
    await git(['fetch', 'origin']);
    expect((await git(['rev-parse', 'origin/main'])).stdout.trim()).toBe(changedHead);
    expect(await readFile(join(seed, 'app.js'), 'utf8')).toBe('// unrelated code\n');
    expect(JSON.parse(await readFile(join(seed, 'match-data.json'), 'utf8')).fetchedAt).toBe(initial.fetchedAt);
  } finally { await rm(root, { recursive: true, force: true }); }
});
