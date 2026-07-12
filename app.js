const STORAGE_KEYS = {
  webAppUrl: 'expense-tracker:webapp-url',
  lastChannel: 'expense-tracker:last-channel',
  lastCategory: 'expense-tracker:last-category',
  lastSheet: 'expense-tracker:last-sheet',
  cachedSheets: 'expense-tracker:cached-sheets'
};

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const dateInput = document.getElementById('date');
const itemInput = document.getElementById('item');
const amountInput = document.getElementById('amount');
const channelSelect = document.getElementById('channel');
const categorySelect = document.getElementById('category');
const sheetSelect = document.getElementById('sheet');
const noteInput = document.getElementById('note');
const form = document.getElementById('entry-form');
const submitBtn = document.getElementById('submit-btn');
const statusEl = document.getElementById('status');
const urlInput = document.getElementById('webapp-url');
const saveUrlBtn = document.getElementById('save-url-btn');

let sheetTouchedByUser = false;

function getWebAppUrl() {
  return localStorage.getItem(STORAGE_KEYS.webAppUrl) || '';
}

function defaultSheetNameForDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const mon = MONTH_ABBR[d.getMonth()];
  const yy = String(d.getFullYear()).slice(-2);
  return `${mon}, ${yy}`;
}

function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = 'status' + (type ? ' ' + type : '');
}

function todayLocalISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

function populateSheetSelect(sheets) {
  const preferred = defaultSheetNameForDate(dateInput.value);
  const lastUsed = localStorage.getItem(STORAGE_KEYS.lastSheet);
  sheetSelect.innerHTML = '';
  sheets.forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    sheetSelect.appendChild(opt);
  });

  if (!sheetTouchedByUser) {
    if (sheets.includes(preferred)) {
      sheetSelect.value = preferred;
    } else if (lastUsed && sheets.includes(lastUsed)) {
      sheetSelect.value = lastUsed;
    }
  }
}

async function loadSheetList() {
  const url = getWebAppUrl();
  const cached = localStorage.getItem(STORAGE_KEYS.cachedSheets);
  if (cached) {
    populateSheetSelect(JSON.parse(cached));
  }
  if (!url) return;

  try {
    const res = await fetch(url, { method: 'GET' });
    const data = await res.json();
    if (data.success && Array.isArray(data.sheets)) {
      localStorage.setItem(STORAGE_KEYS.cachedSheets, JSON.stringify(data.sheets));
      populateSheetSelect(data.sheets);
    }
  } catch (err) {
    if (!cached) setStatus('無法載入分頁清單，請檢查網路或 Web App 網址', 'error');
  }
}

function restoreStickyFields() {
  const lastChannel = localStorage.getItem(STORAGE_KEYS.lastChannel);
  const lastCategory = localStorage.getItem(STORAGE_KEYS.lastCategory);
  if (lastChannel) channelSelect.value = lastChannel;
  if (lastCategory) categorySelect.value = lastCategory;
}

dateInput.addEventListener('change', () => {
  if (!sheetTouchedByUser) {
    const preferred = defaultSheetNameForDate(dateInput.value);
    if ([...sheetSelect.options].some((o) => o.value === preferred)) {
      sheetSelect.value = preferred;
    }
  }
});

sheetSelect.addEventListener('change', () => {
  sheetTouchedByUser = true;
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = getWebAppUrl();
  if (!url) {
    setStatus('請先在下方「設定」填入 Google Apps Script Web App 網址', 'error');
    return;
  }

  const payload = {
    date: dateInput.value,
    item: itemInput.value.trim(),
    amount: amountInput.value,
    channel: channelSelect.value,
    category: categorySelect.value,
    sheetName: sheetSelect.value,
    note: noteInput.value.trim()
  };

  submitBtn.disabled = true;
  setStatus('送出中…', '');

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.success) {
      setStatus(`已寫入「${payload.sheetName}」分頁 ✓`, 'ok');
      localStorage.setItem(STORAGE_KEYS.lastChannel, payload.channel);
      localStorage.setItem(STORAGE_KEYS.lastCategory, payload.category);
      localStorage.setItem(STORAGE_KEYS.lastSheet, payload.sheetName);
      itemInput.value = '';
      amountInput.value = '';
      noteInput.value = '';
      itemInput.focus();
    } else {
      setStatus('寫入失敗：' + (data.error || '未知錯誤'), 'error');
    }
  } catch (err) {
    setStatus('連線失敗，請稍後再試', 'error');
  } finally {
    submitBtn.disabled = false;
  }
});

saveUrlBtn.addEventListener('click', () => {
  const value = urlInput.value.trim();
  if (!value) return;
  localStorage.setItem(STORAGE_KEYS.webAppUrl, value);
  setStatus('已儲存 Web App 網址', 'ok');
  loadSheetList();
});

function init() {
  dateInput.value = todayLocalISO();
  urlInput.value = getWebAppUrl();
  restoreStickyFields();
  loadSheetList();
}

init();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}
