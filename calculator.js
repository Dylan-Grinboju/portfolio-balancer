// Currency is represented as integer agorot throughout the calculation.
export const MAX_AMOUNT = 1_000_000_000;
export const MAX_LANES = 50;

export function validatePortfolio(holdings, deposit) {
  const errors = [];
  const validMoney = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_AMOUNT && Math.round(value * 100) / 100 === value;
  if (!validMoney(deposit)) errors.push('Enter a deposit from ₪0 to ₪1,000,000,000, with at most two decimal places.');
  if (!Array.isArray(holdings) || holdings.length === 0 || holdings.length > MAX_LANES) return [...errors, 'Add between 1 and 50 investment lanes.'];
  if (holdings.some(h => typeof h.name !== 'string' || !h.name.trim())) errors.push('Give each lane a name.');
  if (holdings.some(h => !validMoney(h.current))) errors.push('Enter a current value from ₪0 to ₪1,000,000,000 for every lane, with at most two decimal places.');
  if (holdings.some(h => typeof h.target !== 'number' || !Number.isFinite(h.target) || h.target < 0 || h.target > 100 || Math.round(h.target * 100) / 100 !== h.target)) errors.push('Enter a target between 0% and 100% for every lane, with at most two decimal places.');
  else if (holdings.reduce((sum, h) => sum + Math.round(h.target * 100), 0) !== 10000) errors.push('Your target percentages must add up to 100%.');
  return errors;
}

export function calculateAllocation(holdings, deposit) {
  const errors = validatePortfolio(holdings, deposit);
  if (errors.length) throw new Error(errors.join(' '));
  const cents = holdings.map(h => Math.round(h.current * 100));
  const weights = holdings.map(h => Math.round(h.target * 100));
  const depositCents = Math.round(deposit * 100);
  const totalBefore = cents.reduce((sum, value) => sum + value, 0);
  const totalAfter = totalBefore + depositCents;
  let active = weights.map((w, i) => i).filter(i => weights[i] > 0);
  const exact = cents.map(() => 0);
  // Water filling: holdings that already exceed their share receive no new money.
  // Recompute the target mix of the remaining holdings until all purchases are >= 0.
  while (active.length) {
    const pool = depositCents + active.reduce((sum, i) => sum + cents[i], 0);
    const activeWeight = active.reduce((sum, i) => sum + weights[i], 0);
    const next = active.filter(i => pool * weights[i] / activeWeight >= cents[i]);
    if (next.length === active.length) {
      active.forEach(i => { exact[i] = Math.max(0, pool * weights[i] / activeWeight - cents[i]); });
      break;
    }
    active = next;
  }
  const purchases = exact.map(value => Math.floor(value));
  let remainder = depositCents - purchases.reduce((sum, value) => sum + value, 0);
  const ranked = active.slice().sort((a, b) => (exact[b] - purchases[b]) - (exact[a] - purchases[a]) || a - b);
  for (let i = 0; remainder > 0; i++, remainder--) purchases[ranked[i % ranked.length]]++;
  const rows = holdings.map((h, i) => ({
    ...h, purchaseCents: purchases[i], afterCents: cents[i] + purchases[i],
    beforePercent: totalBefore ? cents[i] / totalBefore * 100 : 0,
    afterPercent: totalAfter ? (cents[i] + purchases[i]) / totalAfter * 100 : 0,
    gap: totalAfter ? (cents[i] + purchases[i]) / totalAfter * 100 - h.target : -h.target,
  }));
  // A target is reached within one agora per lane, allowing currency rounding.
  const reached = totalAfter > 0 && rows.every((h, i) => Math.abs(h.afterCents - totalAfter * weights[i] / 10000) <= 1.000001);
  const beforeGap = totalBefore ? holdings.reduce((sum, h, i) => sum + Math.abs(cents[i] / totalBefore * 100 - h.target), 0) / 2 : null;
  const afterGap = totalAfter ? rows.reduce((sum, h) => sum + Math.abs(h.gap), 0) / 2 : null;
  return { rows, depositCents, totalBefore, totalAfter, reached, beforeGap, afterGap };
}
