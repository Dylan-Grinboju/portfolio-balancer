export const HISTORY_KEY = 'portfolio-balancer-history-v1';

export function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function validRecord(record) {
  return record && typeof record.id === 'string' && record.id.length > 0 &&
    isValidDate(record.date) && typeof record.createdAt === 'string' && Number.isFinite(Date.parse(record.createdAt)) &&
    Number.isSafeInteger(record.totalCents) && record.totalCents > 0 &&
    Array.isArray(record.lanes) && record.lanes.length > 0 && record.lanes.length <= 50 &&
    record.lanes.every(lane => lane && typeof lane.name === 'string' && lane.name.trim().length > 0 && lane.name.length <= 60 && Number.isSafeInteger(lane.amountCents) && lane.amountCents >= 0) &&
    record.lanes.reduce((total, lane) => total + lane.amountCents, 0) === record.totalCents;
}

export function createRecord(result, date, id, createdAt = new Date().toISOString()) {
  const record = { id, date, createdAt, totalCents: result.depositCents, lanes: result.rows.map(row => ({ name: row.name, amountCents: row.purchaseCents })) };
  if (!validRecord(record)) throw new Error('Enter a valid date and a positive deposit.');
  return record;
}

export function sortHistory(records) {
  return [...records].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export function loadHistory(storage) {
  const raw = storage.getItem(HISTORY_KEY);
  if (raw === null) return [];
  const data = JSON.parse(raw);
  if (!data || data.version !== 1 || !Array.isArray(data.records) || !data.records.every(validRecord) || new Set(data.records.map(record => record.id)).size !== data.records.length) throw new Error('Saved history could not be read.');
  return sortHistory(data.records);
}

export function saveHistory(storage, records) {
  if (!records.every(validRecord) || new Set(records.map(record => record.id)).size !== records.length) throw new Error('Invalid deposit history.');
  // Write before updating the interface so a failed write never looks successful.
  storage.setItem(HISTORY_KEY, JSON.stringify({ version: 1, records }));
}

export function changeHistory(storage, { add = [], remove = [] }) {
  // Read fresh so another tab's deposits are retained when this tab writes.
  const removedIds = new Set(remove);
  const next = [...loadHistory(storage).filter(record => !removedIds.has(record.id)), ...add];
  saveHistory(storage, next);
  return sortHistory(next);
}
