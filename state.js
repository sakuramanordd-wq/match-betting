import { matches } from './data.js';
export const STORAGE_KEY = 'heian-betting:v1';
export const initialState = () => ({ version: 1, balance: 1000, bets: [] });
export function validateState(state) {
  if (!state || state.version !== 1 || !Number.isSafeInteger(state.balance) || state.balance < 0 || !Array.isArray(state.bets) || state.bets.length > matches.length) return false;
  const ids = new Set();
  for (const bet of state.bets) {
    const match = matches.find(m => m.id === bet.matchId && m.status === 'open');
    if (!match || ids.has(bet.matchId) || !['red', 'blue'].includes(bet.side) || !Number.isInteger(bet.amount) || bet.amount < 10 || bet.amount > 500 || !['pending', 'won', 'lost'].includes(bet.status) || !Number.isFinite(Date.parse(bet.createdAt))) return false;
    if (bet.status !== 'pending' && bet.status !== (bet.side === match.winner ? 'won' : 'lost')) return false;
    ids.add(bet.matchId);
  }
  return state.balance === 1000 + state.bets.reduce((sum, bet) => sum - bet.amount + (bet.status === 'won' ? bet.amount * 2 : 0), 0);
}
export function placeBet(state, matchId, side, amount) {
  const match = matches.find(m => m.id === matchId);
  if (!match || match.status !== 'open') throw new Error('本场已结束，不能竞猜。');
  if (state.bets.some(b => b.matchId === matchId)) throw new Error('本场已落签，请到我的竞猜查看。');
  if (!['red', 'blue'].includes(side)) throw new Error('请先选择红方或蓝方。');
  if (!Number.isInteger(amount) || amount < 10 || amount > 500) throw new Error('请输入 10–500 之间的整数勾玉。');
  if (amount > state.balance) throw new Error('模拟勾玉不足，请调整数量。');
  return { ...state, balance: state.balance - amount, bets: [...state.bets, { matchId, side, amount, status: 'pending', createdAt: new Date().toISOString() }] };
}
export function settleBets(state) {
  let payout = 0;
  const bets = state.bets.map(bet => {
    if (bet.status !== 'pending') return bet;
    const won = matches.find(m => m.id === bet.matchId).winner === bet.side;
    if (won) payout += bet.amount * 2;
    return { ...bet, status: won ? 'won' : 'lost' };
  });
  return { ...state, balance: state.balance + payout, bets };
}
