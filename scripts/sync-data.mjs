// 只读提取公开共享表，不保存会话、账号或协作者信息。
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const sourceUrl = 'https://www.kdocs.cn/l/cris3KItpMwO';
const definitions = [
  { id: '2026-national', title: '2026 国庆', year: 2026, resultRow: '26国庆结果' },
  { id: '2026-spring', title: '2026 春节', year: 2026, resultRow: '26春节结果' },
  { id: '2025-national', title: '2025 国庆', year: 2025, resultRow: '25周年结果' },
  { id: '2025-spring', title: '2025 春节', year: 2025, resultRow: '25春节结果' },
];
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(sourceUrl);
  await page.waitForFunction(() => window.APP?.sheetLoaded);
  const events = [];
  for (const [index, definition] of definitions.entries()) {
    // activate 仅切换访客本地视图，不执行表格编辑命令。
    await page.evaluate(index => window.APP.workbook._worksheets._sheets[index].activate(), index);
    await page.waitForFunction(index => Boolean(window.APP.workbook._worksheets._sheets[index].getCellString(0, 49)), index);
    await page.waitForTimeout(1000);
    const source = await page.evaluate(index => {
      const sheet = window.APP.workbook._worksheets._sheets[index];
      return { name: sheet.getName(), rows: Array.from({ length: 40 }, (_, row) => Array.from({ length: 50 }, (_, col) => sheet.getCellString(row, col) || '')) };
    }, index);
    const resultIndex = source.rows.findIndex(row => row[0].trim() === definition.resultRow);
    if (resultIndex < 1) throw new Error(`找不到结果行：${definition.resultRow}`);
    const side = value => ({ '左红': 'red', '右蓝': 'blue' })[value.trim()] || null;
    const slots = source.rows[0].slice(1).map((label, offset) => {
      const date = label.match(/^(\d+)月(\d+)日(\d+)点场$/);
      if (!date) throw new Error(`场次标题异常：${label}`);
      const col = offset + 1;
      return { id: `${definition.id}-${col}`, label, startsAt: `${definition.year}-${date[1].padStart(2, '0')}-${date[2].padStart(2, '0')}T${date[3].padStart(2, '0')}:00:00+08:00`, result: side(source.rows[resultIndex][col]), records: source.rows.slice(1, resultIndex).filter(row => row[0].trim() && side(row[col])).map(row => ({ name: row[0].trim(), side: side(row[col]) })) };
    });
    events.push({ ...definition, sourceSheet: source.name, slots });
  }
  await writeFile(new URL('../match-data.json', import.meta.url), JSON.stringify({ sourceUrl, sourceTitle: '2026国庆对弈竞猜汇总（尽量准时版', fetchedAt: new Date().toISOString(), events }, null, 2) + '\n');
  console.log(`已同步 ${events.length} 个活动、${events.reduce((n, event) => n + event.slots.length, 0)} 场。`);
} finally { await browser.close(); }
