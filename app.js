import { calculateAllocation, validatePortfolio, MAX_LANES } from './calculator.js';
import { changeHistory, createRecord, isValidDate, localDate, loadHistory } from './history.js';

const STORAGE_KEY = 'portfolio-balancer-v1';
const colors = ['#3565a5', '#5995bc', '#73899d', '#368e9b', '#84add2', '#4c7892', '#527a83', '#8b9fb4'];
const money = value => new Intl.NumberFormat('en-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const percent = value => `${value.toFixed(2)}%`;
const $ = id => document.getElementById(id);
const starter = { deposit: 5000, holdings: [{ name: 'S&P 500', current: 66000, target: 60 }, { name: 'Global equities', current: 21000, target: 25 }, { name: 'Bonds', current: 13000, target: 15 }], example: true };
let storageAvailable = true;
let model = structuredClone(starter);
let latestResult = null;
let history = [];
let historyReadable = true;
let historyStorageAvailable = true;
let lastRecordedFingerprint = null;
let lastDeletedRecord = null;
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  if (saved && typeof saved.deposit === 'string' && Array.isArray(saved.holdings) && saved.holdings.length > 0 && saved.holdings.length <= MAX_LANES && saved.holdings.every(h => h && typeof h.name === 'string' && h.name.length <= 60 && typeof h.current === 'string' && typeof h.target === 'string')) model = saved;
} catch { storageAvailable = false; }
try { history = loadHistory(localStorage); }
catch {
  historyReadable = false;
  historyStorageAvailable = false;
  $('history-status').textContent = 'History could not be loaded. Existing saved data has been kept.';
}

function numeric(value) { return String(value).trim() === '' ? NaN : Number(value); }
function readInputs() {
  return { deposit: $('deposit').value, holdings: [...$('holdings').children].map(row => ({ name: row.querySelector('.name-input').value, current: row.querySelector('.current-input').value, target: row.querySelector('.target-input').value })), example: model.example };
}
function parsedInputs() {
  return { deposit: numeric(model.deposit), holdings: model.holdings.map(h => ({ name: h.name.trim(), current: numeric(h.current), target: numeric(h.target) })) };
}
function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function dot(index) { const node = make('span', 'color-dot'); node.style.backgroundColor = colors[index % colors.length]; node.setAttribute('aria-hidden', 'true'); return node; }
function renderInputs() {
  $('deposit').value = model.deposit;
  $('holdings').replaceChildren();
  model.holdings.forEach((h, i) => {
    const row = $('holding-template').content.firstElementChild.cloneNode(true);
    row.querySelector('.color-dot').style.backgroundColor = colors[i % colors.length];
    for (const field of ['name', 'current', 'target']) {
      const input = row.querySelector(`.${field}-input`);
      input.value = h[field];
      input.id = `${field}-${i}`;
      input.setAttribute('aria-label', field === 'name' ? `Lane ${i + 1} name` : `${h.name || `Lane ${i + 1}`} ${field === 'current' ? 'current value in shekels' : 'target percent'}`);
      const label = input.parentElement.querySelector('label');
      if (label) label.htmlFor = input.id;
    }
    const remove = row.querySelector('.remove-button');
    remove.setAttribute('aria-label', `Remove ${h.name || `lane ${i + 1}`}`);
    remove.disabled = model.holdings.length === 1;
    remove.addEventListener('click', () => {
      model = readInputs(); model.holdings.splice(i, 1); model.example = false;
      renderInputs(); update();
      ($('holdings').children[Math.min(i, model.holdings.length - 1)]?.querySelector('.name-input') || $('add-holding')).focus();
    });
    $('holdings').append(row);
  });
  $('add-holding').disabled = model.holdings.length >= MAX_LANES;
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(model)); }
  catch { storageAvailable = false; }
  updateSaveStatus();
}
function updateSaveStatus() {
  const saved = storageAvailable && historyStorageAvailable;
  $('save-status').textContent = saved ? 'Saved on this device' : 'Saving unavailable';
  $('save-status').parentElement.classList.toggle('unavailable', !saved);
  $('save-status').title = saved ? 'Your portfolio and history are stored only in this browser.' : 'Keep this page open. Some data could not be saved.';
}
function planFingerprint() {
  return JSON.stringify({ date: $('deposit-date').value, ...parsedInputs() });
}
function updateRecordButton() {
  const recorded = lastRecordedFingerprint !== null && lastRecordedFingerprint === planFingerprint();
  $('record-deposit').disabled = !historyReadable || !latestResult || latestResult.depositCents === 0 || !isValidDate($('deposit-date').value) || recorded;
  $('record-deposit').textContent = recorded ? 'Recorded ✓' : 'Record deposit';
}
function persistHistory(change) {
  try {
    history = changeHistory(localStorage, change);
    historyStorageAvailable = true;
    updateSaveStatus();
    return true;
  } catch {
    historyStorageAvailable = false;
    updateSaveStatus();
    $('history-status').textContent = 'Could not save history. No changes were saved. Browser storage may be full or unavailable.';
    return false;
  }
}
function renderHistory() {
  $('history-list').replaceChildren();
  $('history-empty').hidden = history.length > 0 || !historyReadable;
  $('history-count').textContent = historyReadable ? `${history.length} deposit${history.length === 1 ? '' : 's'}` : 'Unavailable';
  history.forEach((record, index) => {
    const entry = make('details', 'history-entry');
    entry.open = index === 0;
    const summary = make('summary');
    const date = make('time', '', new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${record.date}T12:00:00`)));
    date.dateTime = record.date;
    summary.append(date, make('strong', '', money(record.totalCents / 100)), make('span', 'history-chevron', '⌄'));
    const table = make('table', 'history-table');
    table.append(make('caption', 'visually-hidden', `Deposits by lane on ${date.textContent}`));
    const head = make('thead'); const headings = make('tr');
    for (const label of ['Lane', 'Deposited']) { const th = make('th', '', label); th.scope = 'col'; headings.append(th); }
    head.append(headings); table.append(head);
    const body = make('tbody');
    record.lanes.forEach(lane => { const row = make('tr'); row.append(make('td', '', lane.name), make('td', '', money(lane.amountCents / 100))); body.append(row); });
    table.append(body);
    const remove = make('button', 'text-button delete-entry', 'Delete entry');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Delete deposit of ${money(record.totalCents / 100)} on ${date.textContent}`);
    remove.addEventListener('click', () => {
      if (!persistHistory({ remove: [record.id] })) return;
      lastDeletedRecord = record;
      lastRecordedFingerprint = null;
      $('history-status').textContent = 'Entry deleted.';
      $('undo-delete').hidden = false;
      renderHistory(); updateRecordButton(); $('undo-delete').focus();
    });
    entry.append(summary, table, remove);
    $('history-list').append(entry);
  });
}
function renderResults(result) {
  $('result-deposit').textContent = money(result.depositCents / 100);
  $('future-total').textContent = money(result.totalAfter / 100);
  $('allocations').replaceChildren();
  $('breakdown-rows').replaceChildren();
  result.rows.forEach((h, i) => {
    const allocation = make('div', 'allocation');
    const name = make('div', 'allocation-name'); name.append(dot(i), make('span', '', h.name));
    const amount = make('div', 'allocation-amount');
    amount.append(make('strong', '', money(h.purchaseCents / 100)), make('small', '', h.purchaseCents > 0 ? `${percent(h.purchaseCents / result.depositCents * 100)} of deposit` : 'Skip this time'));
    allocation.append(name, amount); $('allocations').append(allocation);
    const row = make('tr'); const cell = make('td'); cell.append(dot(i), document.createTextNode(h.name)); row.append(cell);
    row.append(make('td', '', percent(h.beforePercent)), make('td', '', percent(h.afterPercent)), make('td', '', percent(h.target)));
    const gap = Math.abs(h.gap) < 0.005 ? 0 : h.gap;
    row.append(make('td', `gap${Math.abs(gap) < 0.01 ? ' close' : ''}`, `${gap > 0 ? '+' : ''}${gap.toFixed(2)} pp`));
    $('breakdown-rows').append(row);
  });
  $('comparison').replaceChildren();
  for (const [label, field] of [['Now', 'beforePercent'], ['After deposit', 'afterPercent'], ['Your target', 'target']]) {
    const row = make('div', 'comparison-row'); const bar = make('div', 'comparison-bar');
    bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', `${label}: ${result.rows.map(h => `${h.name} ${percent(h[field])}`).join(', ')}`);
    result.rows.forEach((h, i) => { const segment = make('span'); segment.style.width = `${h[field]}%`; segment.style.backgroundColor = colors[i % colors.length]; segment.title = `${h.name}: ${percent(h[field])}`; bar.append(segment); });
    row.append(make('span', '', label), bar); $('comparison').append(row);
  }
  let status;
  if (result.depositCents === 0) status = 'Enter a deposit to see your split.';
  else if (result.reached) status = '✓ Target mix reached · rounded to agorot';
  else status = '↗ Closer to target · some lanes remain overweight';
  $('result-status').textContent = status;
  $('copy-plan').disabled = result.depositCents === 0;
  updateRecordButton();
}
function update() {
  model = readInputs();
  $('example-tag').hidden = !model.example;
  const { deposit, holdings } = parsedInputs();
  const sum = holdings.reduce((s, h) => s + (Number.isFinite(h.target) ? Math.round(h.target * 100) : 0), 0) / 100;
  const errors = validatePortfolio(holdings, deposit);
  $('target-total').textContent = `${sum.toLocaleString('en-IL', { maximumFractionDigits: 2 })}% / 100% ${sum === 100 ? '✓' : ''}`;
  $('target-total').classList.toggle('invalid', sum !== 100);
  $('validation').textContent = errors.join(' ');
  $('validation').hidden = errors.length === 0;
  $('result-content').hidden = errors.length > 0;
  $('result-empty').hidden = errors.length === 0;
  $('breakdown').hidden = errors.length > 0;
  latestResult = errors.length ? null : calculateAllocation(holdings, deposit);
  if (latestResult) renderResults(latestResult);
  else updateRecordButton();
  save();
}
$('deposit').addEventListener('input', () => { model.example = false; update(); });
$('holdings').addEventListener('input', event => {
  model.example = false; update();
  if (event.target.classList.contains('name-input')) {
    const row = event.target.closest('.holding-row'); const name = event.target.value.trim() || 'lane';
    row.querySelector('.current-input').setAttribute('aria-label', `${name} current value in shekels`);
    row.querySelector('.target-input').setAttribute('aria-label', `${name} target percent`);
    row.querySelector('.remove-button').setAttribute('aria-label', `Remove ${name}`);
  }
});
$('add-holding').addEventListener('click', () => {
  if (model.holdings.length >= MAX_LANES) return;
  model = readInputs(); model.example = false; model.holdings.push({ name: '', current: '0', target: '0' }); renderInputs(); update();
  $('holdings').lastElementChild.querySelector('.name-input').focus();
});
$('copy-plan').addEventListener('click', async () => {
  if (!latestResult) return;
  const text = [`Deposit plan: ${money(latestResult.depositCents / 100)}`, ...latestResult.rows.map(h => `${h.name}: add ${money(h.purchaseCents / 100)} → ${percent(h.afterPercent)} (target ${percent(h.target)})`), `Portfolio after deposit: ${money(latestResult.totalAfter / 100)}`].join('\n');
  try { await navigator.clipboard.writeText(text); $('copy-feedback').textContent = 'Deposit plan copied.'; $('copy-plan').firstChild.textContent = 'Copied! '; setTimeout(() => { $('copy-plan').firstChild.textContent = 'Copy plan '; }, 2000); }
  catch { $('copy-feedback').textContent = 'Copy is unavailable in this browser. Select the amounts to copy them manually.'; $('copy-plan').firstChild.textContent = 'Select amounts to copy '; }
});
renderInputs();
$('deposit-date').value = localDate();
$('deposit-date').addEventListener('input', updateRecordButton);
$('record-deposit').addEventListener('click', () => {
  if ($('record-deposit').disabled || !latestResult) return;
  const record = createRecord(latestResult, $('deposit-date').value, crypto.randomUUID());
  if (!persistHistory({ add: [record] })) return;
  lastRecordedFingerprint = planFingerprint();
  lastDeletedRecord = null;
  $('undo-delete').hidden = true;
  $('history-status').textContent = `Recorded ${money(record.totalCents / 100)}. Holdings were not changed.`;
  renderHistory(); updateRecordButton();
});
$('undo-delete').addEventListener('click', () => {
  if (!lastDeletedRecord || !persistHistory({ add: [lastDeletedRecord] })) return;
  lastDeletedRecord = null;
  $('undo-delete').hidden = true;
  $('history-status').textContent = 'Entry restored.';
  renderHistory();
  $('history-list').querySelector('summary')?.focus();
});
renderHistory();
update();
