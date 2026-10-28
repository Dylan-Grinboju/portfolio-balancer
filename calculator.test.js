import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAllocation, validatePortfolio } from './calculator.js';
const lanes = (...pairs) => pairs.map(([current, target], i) => ({ name: `Lane ${i + 1}`, current, target }));

test('large enough deposit reaches targets, correcting market drift', () => {
  const r = calculateAllocation(lanes([700, 60], [300, 40]), 500);
  assert.deepEqual(r.rows.map(h => h.purchaseCents), [20000, 30000]);
  assert.equal(r.reached, true);
});
test('small deposits go to underweight holdings without selling', () => {
  const r = calculateAllocation(lanes([800, 60], [200, 40]), 100);
  assert.deepEqual(r.rows.map(h => h.purchaseCents), [0, 10000]);
  assert.equal(r.reached, false);
});
test('weighted filling with multiple underweight lanes', () => {
  const r = calculateAllocation(lanes([66000, 60], [21000, 25], [13000, 15]), 5000);
  assert.deepEqual(r.rows.map(h => h.purchaseCents), [0, 337500, 162500]);
});
test('new portfolio splits deposit to targets and conserves agorot', () => {
  const r = calculateAllocation(lanes([0, 33.33], [0, 33.33], [0, 33.34]), 0.05);
  assert.deepEqual(r.rows.map(h => h.purchaseCents), [2, 1, 2]);
  assert.equal(r.reached, true);
});
test('zero targets retain holdings but receive no new money', () => {
  const r = calculateAllocation(lanes([500, 0], [100, 100]), 1000);
  assert.deepEqual(r.rows.map(h => h.purchaseCents), [0, 100000]);
  assert.equal(r.reached, false);
});
test('zero deposit and empty portfolio produce finite output', () => {
  const r = calculateAllocation(lanes([0, 60], [0, 40]), 0);
  assert.deepEqual(r.rows.map(h => h.purchaseCents), [0, 0]);
  assert.equal(r.reached, false);
  assert.ok(r.rows.every(h => Number.isFinite(h.afterPercent)));
});
test('rejects bad money, bad targets, unnamed lanes and bad totals', () => {
  for (const [h, d] of [[lanes([100, 60], [200, 30]), 100], [lanes([-1, 100]), 100], [lanes([100, 100]), -1], [lanes([100, 100]), 1.001], [lanes([100, 100]), NaN], [lanes([Infinity, 100]), 1], [lanes([0, 33.333], [0, 66.667]), 1], [[{ name: '', current: 0, target: 100 }], 1]]) {
    assert.ok(validatePortfolio(h, d).length > 0);
    assert.throws(() => calculateAllocation(h, d));
  }
});
test('money and weight limits, single lane and exact cent deposits', () => {
  const r = calculateAllocation(lanes([1e9, 100]), 1e9);
  assert.equal(r.totalAfter, 200000000000);
  assert.equal(r.rows[0].purchaseCents, 100000000000);
  assert.equal(calculateAllocation(lanes([1, 60], [1, 40]), 0.01).depositCents, 1);
});
test('2,000 portfolios preserve deposit, never sell, and improve total percentage drift', () => {
  let seed = 42;
  const random = max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
  for (let trial = 0; trial < 2000; trial++) {
    const count = 1 + random(15);
    const cuts = [0, 10000, ...Array.from({ length: count - 1 }, () => random(10001))].sort((a, b) => a - b);
    const h = Array.from({ length: count }, (_, i) => ({ name: `Lane ${i}`, current: random(100000000) / 100, target: (cuts[i + 1] - cuts[i]) / 100 }));
    const deposit = random(100000000) / 100;
    const r = calculateAllocation(h, deposit);
    assert.equal(r.rows.reduce((sum, row) => sum + row.purchaseCents, 0), Math.round(deposit * 100));
    r.rows.forEach(row => { assert.ok(Number.isSafeInteger(row.purchaseCents) && row.purchaseCents >= 0); if (row.target === 0) assert.equal(row.purchaseCents, 0); });
    if (r.beforeGap !== null) assert.ok(r.afterGap <= r.beforeGap + 100 * count / r.totalAfter + 1e-8);
  }
});
