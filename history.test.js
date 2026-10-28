import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAllocation } from './calculator.js';
import { HISTORY_KEY, changeHistory, createRecord, isValidDate, localDate, loadHistory, saveHistory, sortHistory } from './history.js';

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function plan() { return calculateAllocation([{ name: 'S&P 500', current: 800, target: 60 }, { name: 'Bonds', current: 200, target: 40 }], 100); }
function record(id = 'deposit-1', date = '2026-10-28') { return createRecord(plan(), date, id, '2026-10-28T10:00:00Z'); }

test('records the exact amounts for all lanes as an independent snapshot', () => {
  const result = plan(); const saved = createRecord(result, '2026-10-28', 'one');
  assert.deepEqual(saved.lanes, [{ name: 'S&P 500', amountCents: 0 }, { name: 'Bonds', amountCents: 10000 }]);
  assert.equal(saved.totalCents, 10000);
  result.rows[1].name = 'Renamed'; result.rows[1].purchaseCents = 1;
  assert.equal(saved.lanes[1].name, 'Bonds'); assert.equal(saved.lanes[1].amountCents, 10000);
});
test('new browser history is empty and saved deposits survive a reload', () => {
  const store = storage(); assert.deepEqual(loadHistory(store), []);
  const saved = record(); saveHistory(store, [saved]); assert.deepEqual(loadHistory(store), [saved]);
});
test('sorts by deposit date, then recording time, without changing the input', () => {
  const oldest = record('old', '2026-10-01'); const newest = record('new', '2026-10-29');
  const second = { ...newest, id: 'second', createdAt: '2026-10-28T11:00:00Z' };
  const input = [oldest, newest, second];
  assert.deepEqual(sortHistory(input).map(r => r.id), ['second', 'new', 'old']);
  assert.equal(input[0], oldest);
});
test('calendar dates validate strictly, including leap years', () => {
  for (const date of ['2026-02-29', '2026-02-31', '2026-13-01', '2026-1-01', '', 'not a date']) assert.equal(isValidDate(date), false);
  assert.equal(isValidDate('2024-02-29'), true);
  assert.equal(localDate(new Date(2026, 9, 28, 0, 5)), '2026-10-28');
  assert.throws(() => createRecord(plan(), '2026-02-31', 'invalid'));
});
test('rejects zero deposits and mismatched or fractional currency', () => {
  assert.throws(() => createRecord({ depositCents: 0, rows: [{ name: 'A', purchaseCents: 0 }] }, '2026-10-28', 'zero'));
  assert.throws(() => createRecord({ depositCents: 100, rows: [{ name: 'A', purchaseCents: 90 }] }, '2026-10-28', 'bad'));
  assert.throws(() => createRecord({ depositCents: 1.5, rows: [{ name: 'A', purchaseCents: 1.5 }] }, '2026-10-28', 'bad'));
});
test('deleting and restoring a deposit persists the exact original record', () => {
  const store = storage(); const a = record('one'); const b = record('two');
  saveHistory(store, [a, b]); saveHistory(store, loadHistory(store).filter(r => r.id !== a.id));
  assert.deepEqual(loadHistory(store), [b]);
  saveHistory(store, [...loadHistory(store), a]);
  assert.equal(loadHistory(store).find(r => r.id === a.id).totalCents, a.totalCents);
});
test('unreadable history is preserved and duplicate IDs are rejected', () => {
  const store = storage(); store.setItem(HISTORY_KEY, '{broken json');
  assert.throws(() => loadHistory(store)); assert.equal(store.getItem(HISTORY_KEY), '{broken json');
  store.setItem(HISTORY_KEY, JSON.stringify({ version: 1, records: [{ ...record(), totalCents: 2 }] }));
  assert.throws(() => loadHistory(store));
  assert.throws(() => saveHistory(store, [record(), record()]));
});
test('storage failures propagate without falsely reporting a successful write', () => {
  const store = { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Quota'); } };
  assert.throws(() => loadHistory(store), /Blocked/);
  assert.throws(() => saveHistory(store, [record()]), /Quota/);
});

test('recording or deleting from another tab retains deposits added since the page loaded', () => {
  const store = storage();
  changeHistory(store, { add: [record('first-tab')] });
  changeHistory(store, { add: [record('second-tab')] });
  changeHistory(store, { remove: ['first-tab'] });
  assert.deepEqual(loadHistory(store).map(r => r.id), ['second-tab']);
});
