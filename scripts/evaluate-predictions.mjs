import { readFile } from 'node:fs/promises';
import { backtest } from '../prediction.js';

const snapshot = JSON.parse(await readFile(new URL('../match-data.json', import.meta.url), 'utf8'));
const history = JSON.parse(await readFile(new URL('../forecast-history.json', import.meta.url), 'utf8'));
const report = backtest(snapshot.events, Date.now());
const rate = (correct, total) => total ? `${(correct / total * 100).toFixed(2)}%` : '暂无有效样本';
const verified = history.forecasts.filter(item => item.side && item.result);
const correct = verified.filter(item => item.side === item.result).length;
console.log(JSON.stringify({
  同步时间: snapshot.fetchedAt,
  已收录排期: snapshot.events.reduce((sum, event) => sum + event.slots.length, 0),
  历史回放: { 已知赛果: report.eligible, 加权命中: report.correct, 加权有效场次: report.total, 加权命中率: rate(report.correct, report.total), 未预测: report.skipped, 多数判断命中: report.majorityCorrect, 多数判断有效场次: report.majorityTotal, 多数判断命中率: rate(report.majorityCorrect, report.majorityTotal), 同样本场次: report.pairedTotal, 同样本加权命中: report.pairedCorrect, 同样本多数命中: report.pairedMajorityCorrect, 同样本提升百分点: report.pairedTotal ? (report.pairedCorrect - report.pairedMajorityCorrect) / report.pairedTotal * 100 : null },
  真实留档: { 已验证: verified.length, 命中: correct, 命中率: rate(correct, verified.length), 待赛果: history.forecasts.filter(item => item.side && !item.result).length },
  说明: '历史回放仅使用更早场次的赛果；原表无判断填写时间，回放不能替代真实留档验证。',
}, null, 2));
