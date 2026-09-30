export const windSourceUrl = 'https://yysrank.com/dyjc.html';

// 与来源页面一致：北京时间最近的偶数整点之后发布的判断。
export function windStats(wind, now = Date.now()) {
  const cutoff = Math.floor((now + 8 * 3600_000) / (2 * 3600_000)) * 2 * 3600_000 - 8 * 3600_000;
  const records = (wind?.records || []).filter(item => Date.parse(item.postedAt) > cutoff && Date.parse(item.postedAt) <= now);
  const red = records.filter(item => item.side === 'red').length;
  const blue = records.filter(item => item.side === 'blue').length;
  const total = red + blue;
  return { cutoff, records, red, blue, total, share: total ? red / total : null, direction: !total ? null : red === blue ? 'tie' : red > blue ? 'red' : 'blue' };
}

export function parseWindResponse(payload, fetchedAt) {
  if (payload?.success !== true || !Array.isArray(payload.data)) throw new Error('风向数据格式异常');
  const records = payload.data.map(item => {
    if (!item || typeof item.name !== 'string' || !Number.isFinite(Date.parse(item.posted_at))) throw new Error('风向记录格式异常');
    return { name: item.name, side: ['red', 'blue'].includes(item.predict_winner) ? item.predict_winner : null, postedAt: item.posted_at, match: typeof item.match === 'string' ? item.match : '' };
  }).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || a.postedAt.localeCompare(b.postedAt));
  return { sourceUrl: windSourceUrl, fetchedAt, syncFailed: false, records };
}
