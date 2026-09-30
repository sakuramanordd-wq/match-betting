export const MODEL_VERSION = 'history-weighted-v1';

export function historicalRecords(events, slot) {
  const history = new Map();
  for (const event of events) for (const previous of event.slots) {
    if (!previous.result || Date.parse(previous.startsAt) >= Date.parse(slot.startsAt)) continue;
    for (const record of previous.records) {
      const stats = history.get(record.name) || { correct: 0, total: 0 };
      stats.total++;
      stats.correct += Number(record.side === previous.result);
      history.set(record.name, stats);
    }
  }
  return history;
}

export function predictionSide(share) {
  if (share === null || Math.abs(share - 0.5) < 1e-10) return null;
  return share > 0.5 ? 'red' : 'blue';
}

export function predictSlot(events, slot) {
  const history = historicalRecords(events, slot);
  let redWeight = 0, totalWeight = 0, red = 0;
  for (const record of slot.records) {
    const stats = history.get(record.name) || { correct: 0, total: 0 };
    const weight = (stats.correct + 2) / (stats.total + 4);
    totalWeight += weight;
    if (record.side === 'red') { red++; redWeight += weight; }
  }
  const redShare = totalWeight ? redWeight / totalWeight : null;
  const majorityShare = slot.records.length ? red / slot.records.length : null;
  return { side: predictionSide(redShare), redShare, majoritySide: predictionSide(majorityShare), judgmentCount: slot.records.length };
}

// 固定规则逐场回放；累计统计列和目标场次之后的结果均不参与。
export function backtest(events, before = Infinity) {
  const summary = { eligible: 0, total: 0, correct: 0, majorityTotal: 0, majorityCorrect: 0, pairedTotal: 0, pairedCorrect: 0, pairedMajorityCorrect: 0, skipped: 0 };
  for (const event of events) for (const slot of event.slots) {
    if (!slot.result || Date.parse(slot.startsAt) >= before) continue;
    summary.eligible++;
    const forecast = predictSlot(events, slot);
    if (forecast.side) { summary.total++; summary.correct += Number(forecast.side === slot.result); }
    else summary.skipped++;
    if (forecast.majoritySide) { summary.majorityTotal++; summary.majorityCorrect += Number(forecast.majoritySide === slot.result); }
    if (forecast.side && forecast.majoritySide) {
      summary.pairedTotal++;
      summary.pairedCorrect += Number(forecast.side === slot.result);
      summary.pairedMajorityCorrect += Number(forecast.majoritySide === slot.result);
    }
  }
  return summary;
}

export function updateForecasts(previous, events, createdAt) {
  const forecasts = previous.map(forecast => ({ ...forecast }));
  for (const event of events) for (const slot of event.slots) {
    const stored = forecasts.find(forecast => forecast.slotId === slot.id);
    if (stored) { stored.result = slot.result; continue; }
    if (slot.result || !slot.records.length) continue;
    const forecast = predictSlot(events, slot);
    forecasts.push({ ...forecast, model: MODEL_VERSION, slotId: slot.id, eventId: event.id, startsAt: slot.startsAt, createdAt, result: null });
  }
  return forecasts;
}
