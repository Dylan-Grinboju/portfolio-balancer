import { calculateAllocation, validatePortfolio, MAX_LANES } from './calculator.js';
import { changeHistory, createRecord, editRecord, isValidDate, localDate, loadHistory, scaleLaneAmounts } from './history.js';

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
let editingHistoryId = null;
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
  $('record-deposit').disabled = editingHistoryId !== null || !historyReadable || !latestResult || latestResult.depositCents === 0 || !isValidDate($('deposit-date').value) || recorded;
  $('record-deposit').textContent = recorded ? 'Recorded ✓' : 'Record deposit';
}
function persistHistory(change, feedback = $('history-status')) {
  try {
    history = changeHistory(localStorage, change);
    historyStorageAvailable = true;
    updateSaveStatus();
    return true;
  } catch (error) {
    if (error.name === 'HistoryConflictError') { feedback.textContent = error.message; return false; }
    historyStorageAvailable = false;
    updateSaveStatus();
    feedback.textContent = 'Could not save history. No changes were saved. Browser storage may be full or unavailable.';
    return false;
  }
}
function renderHistory() {
  $('history-list').replaceChildren();
  $('history-empty').hidden = history.length > 0 || !historyReadable;
  $('history-count').textContent = historyReadable ? `${history.length} deposit${history.length === 1 ? '' : 's'}` : 'Unavailable';
  history.forEach(record => {
    const entry = make('article', 'history-entry');
    const details = make('details', 'history-details');
    const summary = make('summary');
    const date = make('time', '', new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${record.date}T12:00:00`)));
    date.dateTime = record.date;
    const preview = make('span', 'history-preview', record.lanes.map(lane => `${lane.name} ${money(lane.amountCents / 100)}`).join(' · '));
    preview.title = preview.textContent;
    summary.append(date, preview, make('strong', '', money(record.totalCents / 100)), make('span', 'history-chevron', '⌄'));
    const laneList = make('div', 'history-lanes');
    record.lanes.forEach(lane => { const item = make('div', 'history-lane'); item.append(make('span', '', lane.name), make('strong', '', money(lane.amountCents / 100))); laneList.append(item); });
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
    const edit = make('button', 'text-button history-edit', 'Edit'); edit.type = 'button';
    edit.setAttribute('aria-label', `Edit deposit of ${money(record.totalCents / 100)} on ${date.textContent}`);
    edit.addEventListener('click', () => renderHistoryEditor(entry, record));
    details.append(summary, laneList, remove);
    entry.append(details, edit);
    $('history-list').append(entry);
  });
}

function historyAmount(value) {
  const number = String(value).trim() === '' ? NaN : Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1_000_000_000 || Math.round(number * 100) / 100 !== number) throw new Error('Amounts must be between ₪0 and ₪1,000,000,000, with up to two decimal places.');
  return Math.round(number * 100);
}
function setHistoryEditing(id) {
  editingHistoryId = id;
  $('history-list').querySelectorAll('.history-edit, .delete-entry').forEach(button => { button.disabled = id !== null; });
  $('undo-delete').disabled = id !== null;
  updateRecordButton();
}
function renderHistoryEditor(entry, record) {
  setHistoryEditing(record.id);
  entry.replaceChildren(); entry.classList.add('editing');
  const form = make('form', 'history-editor'); form.noValidate = true;
  const top = make('div', 'history-editor-top');
  function field(label, type, value) {
    const wrapper = make('label', 'history-field'); wrapper.append(make('span', '', label));
    const input = make('input'); input.type = type; input.value = value; input.required = true;
    if (type === 'number') { input.min = '0'; input.max = '1000000000'; input.step = '0.01'; input.inputMode = 'decimal'; }
    wrapper.append(input); return { wrapper, input };
  }
  const dateField = field('Date', 'date', record.date);
  const totalField = field('Total · ₪', 'number', (record.totalCents / 100).toFixed(2));
  totalField.input.title = 'Changing the total scales lane amounts proportionally. All-zero lanes split equally.';
  top.append(dateField.wrapper, totalField.wrapper);
  const hint = make('p', 'history-edit-hint', 'Changing total scales lane amounts.');
  const list = make('div', 'history-editor-lanes');
  let draft = record.lanes.map(lane => ({ name: lane.name, amount: (lane.amountCents / 100).toFixed(2) }));
  const feedback = make('p', 'history-edit-feedback'); feedback.setAttribute('role', 'alert');
  const add = make('button', 'text-button', '+ Add lane'); add.type = 'button';
  function readLanes() { return draft.map(lane => ({ name: lane.name.trim(), amountCents: historyAmount(lane.amount) })); }
  function updateTotal() {
    try { totalField.input.value = (readLanes().reduce((sum, lane) => sum + lane.amountCents, 0) / 100).toFixed(2); feedback.textContent = ''; }
    catch (error) { feedback.textContent = error.message; }
  }
  function renderLanes() {
    list.replaceChildren(); add.disabled = draft.length >= MAX_LANES;
    draft.forEach((lane, index) => {
      const row = make('div', 'history-editor-lane');
      const name = field('Lane', 'text', lane.name); name.input.maxLength = 60;
      const amount = field('Amount · ₪', 'number', lane.amount);
      name.input.setAttribute('aria-label', `Lane ${index + 1} name`);
      amount.input.setAttribute('aria-label', `Lane ${index + 1} deposited amount in shekels`);
      name.input.addEventListener('input', () => { draft[index].name = name.input.value; });
      amount.input.addEventListener('input', () => { draft[index].amount = amount.input.value; updateTotal(); });
      const remove = make('button', 'text-button history-remove-lane', '×'); remove.type = 'button'; remove.disabled = draft.length === 1;
      remove.setAttribute('aria-label', `Remove lane ${index + 1}`);
      remove.addEventListener('click', () => {
        draft.splice(index, 1); renderLanes(); updateTotal();
        list.children[Math.min(index, draft.length - 1)].querySelector('input').focus();
      });
      row.append(name.wrapper, amount.wrapper, remove); list.append(row);
    });
  }
  function applyTotal() {
    try {
      const lanes = scaleLaneAmounts(readLanes(), historyAmount(totalField.input.value));
      draft = lanes.map(lane => ({ name: lane.name, amount: (lane.amountCents / 100).toFixed(2) }));
      renderLanes(); feedback.textContent = ''; return true;
    } catch (error) { feedback.textContent = error.message; return false; }
  }
  totalField.input.addEventListener('change', applyTotal);
  add.addEventListener('click', () => {
    if (draft.length >= MAX_LANES) return;
    draft.push({ name: '', amount: '0.00' }); renderLanes(); list.lastElementChild.querySelector('input').focus();
  });
  const actions = make('div', 'history-editor-actions');
  const save = make('button', 'history-save', 'Save'); save.type = 'submit';
  const cancel = make('button', 'text-button', 'Cancel'); cancel.type = 'button';
  cancel.addEventListener('click', () => {
    try { history = loadHistory(localStorage); } catch { /* Keep the current list when storage is unavailable. */ }
    setHistoryEditing(null); renderHistory(); $('history-list').querySelector('.history-edit')?.focus();
  });
  actions.append(save, cancel);
  form.append(top, hint, list, add, feedback, actions);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity() || !applyTotal()) return;
    let updated;
    try { updated = editRecord(record, dateField.input.value, readLanes()); }
    catch (error) { feedback.textContent = error.message; return; }
    if (!persistHistory({ replace: [{ previous: record, updated }] }, feedback)) return;
    lastRecordedFingerprint = null;
    $('history-status').textContent = 'Entry updated.';
    setHistoryEditing(null); renderHistory(); $('history-list').querySelector('.history-edit')?.focus();
  });
  renderLanes(); entry.append(form); dateField.input.focus();
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
