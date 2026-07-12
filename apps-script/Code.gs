/**
 * 記帳 App 後端。部署為 Web App 後，前端會用 GET 取得分頁清單、用 POST 寫入一筆記帳資料。
 * 使用方式請見 README 的部署步驟。
 */

var SUMMARY_SHEET_NAME = '總表';
var SCRIPT_VERSION = 'v4-sort-by-date';

// 開啟試算表時加上「記帳工具」選單，方便一鍵建立新月份分頁
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('記帳工具')
    .addItem('建立新月份分頁（複製舊分頁格式）', 'createNewMonthSheet')
    .addToUi();
}

// 複製指定的舊分頁（保留下拉選單、色塊、公式），清空交易資料列後，
// 用新名稱插入在來源分頁後面，這樣新月份分頁就會跟舊的一樣有完整格式
function createNewMonthSheet() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var templateResp = ui.prompt(
    '建立新月份分頁',
    '請輸入要複製格式的來源分頁名稱（例如：Jun, 26）',
    ui.ButtonSet.OK_CANCEL
  );
  if (templateResp.getSelectedButton() !== ui.Button.OK) return;
  var templateName = templateResp.getResponseText().trim();
  var templateSheet = ss.getSheetByName(templateName);
  if (!templateSheet) {
    ui.alert('找不到分頁：' + templateName);
    return;
  }

  var nameResp = ui.prompt(
    '建立新月份分頁',
    '請輸入新分頁的名稱（例如：Aug, 26）',
    ui.ButtonSet.OK_CANCEL
  );
  if (nameResp.getSelectedButton() !== ui.Button.OK) return;
  var newName = nameResp.getResponseText().trim();
  if (!newName) return;
  if (ss.getSheetByName(newName)) {
    ui.alert('已經有同名分頁了：' + newName);
    return;
  }

  duplicateMonthSheet(ss, templateSheet, newName);
  ui.alert('已建立「' + newName + '」分頁，格式跟「' + templateName + '」一致。');
}

// 複製來源分頁（保留下拉選單、色塊、公式），清空交易資料列後以新名稱插入在來源分頁後面
function duplicateMonthSheet(ss, templateSheet, newName) {
  var newSheet = templateSheet.copyTo(ss);
  newSheet.setName(newName);

  // 清空交易資料（A~F欄），保留表頭、下拉選單設定與統計公式
  var lastRow = newSheet.getLastRow();
  if (lastRow > 1) {
    newSheet.getRange(2, 1, lastRow - 1, 6).clearContent();
  }

  ss.setActiveSheet(newSheet);
  ss.moveActiveSheet(templateSheet.getIndex() + 1);
  return newSheet;
}

var MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
var MONTH_PATTERN = /^([A-Za-z]{3}), (\d{2})$/;

function parseMonthSheetName(name) {
  var m = MONTH_PATTERN.exec(name);
  if (!m) return null;
  var monthIndex = MONTH_ABBR.indexOf(m[1]);
  if (monthIndex === -1) return null;
  return { date: new Date(2000 + Number(m[2]), monthIndex, 1), label: name };
}

// 找出跟目標月份分頁（例如 "Aug, 26"）最接近的既有月份分頁，優先選最近的「之前」月份，
// 作為自動建立新分頁時要複製格式的樣板
function findClosestMonthSheet(ss, targetName) {
  var target = parseMonthSheetName(targetName);
  if (!target) return null;

  var candidates = ss.getSheets()
    .map(function (s) { return { sheet: s, info: parseMonthSheetName(s.getName()) }; })
    .filter(function (c) { return c.info && c.info.label !== targetName; });

  var past = candidates.filter(function (c) { return c.info.date <= target.date; });
  var pool = past.length ? past : candidates;
  if (!pool.length) return null;

  pool.sort(function (a, b) {
    return Math.abs(target.date - a.info.date) - Math.abs(target.date - b.info.date);
  });
  return pool[0].sheet;
}

// 若目標分頁（例如 "Aug, 26"）尚未建立，且名稱符合「月份, 年」的格式，
// 就自動複製最接近的月份分頁來建立它；旅行分頁等自訂名稱無法自動建立，維持原本錯誤訊息
function ensureSheetExists(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) return sheet;
  if (!MONTH_PATTERN.test(sheetName)) return null;

  var template = findClosestMonthSheet(ss, sheetName);
  if (!template) return null;

  return duplicateMonthSheet(ss, template, sheetName);
}

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets()
    .map(function (s) { return s.getName(); })
    .filter(function (name) { return name !== SUMMARY_SHEET_NAME; });

  return ContentService
    .createTextOutput(JSON.stringify({ success: true, sheets: sheets, version: SCRIPT_VERSION }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var sheetName = payload.sheetName;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ensureSheetExists(ss, sheetName);

    if (!sheet) {
      return jsonOutput({ success: false, error: '找不到分頁，且無法自動建立：' + sheetName });
    }
    if (!payload.date || !payload.item || payload.amount === undefined || payload.amount === '') {
      return jsonOutput({ success: false, error: '日期、項目、金額為必填' });
    }

    var targetRow = findFirstEmptyRow(sheet);
    var dateValue = new Date(payload.date + 'T00:00:00');

    sheet.getRange(targetRow, 1, 1, 6).setValues([[
      dateValue,
      payload.item,
      Number(payload.amount),
      payload.channel || '',
      payload.category || '',
      payload.note || ''
    ]]);

    // 沿用該欄目前的日期顯示格式（例如 M/d），避免新的一列格式跑掉
    if (targetRow > 2) {
      var sourceFormat = sheet.getRange(targetRow - 1, 1).getNumberFormat();
      sheet.getRange(targetRow, 1).setNumberFormat(sourceFormat);
    }

    sortDataByDate(sheet, targetRow);

    return jsonOutput({ success: true, sheet: sheetName, row: targetRow });
  } catch (err) {
    return jsonOutput({ success: false, error: String(err) });
  }
}

// 依日期（A欄）把交易資料（A~F欄）由舊到新排序，讓補登較早日期的資料也會自動排到正確位置
function sortDataByDate(sheet, lastDataRow) {
  if (lastDataRow <= 2) return;
  sheet.getRange(2, 1, lastDataRow - 1, 6).sort({ column: 1, ascending: true });
}

// 以「日期」欄（A欄）判斷第一個空白列，避免受 H/I 欄的統計表影響
function findFirstEmptyRow(sheet) {
  var colA = sheet.getRange(1, 1, sheet.getMaxRows(), 1).getValues();
  var lastRow = 0;
  for (var i = 0; i < colA.length; i++) {
    if (colA[i][0] !== '') lastRow = i + 1;
  }
  return lastRow + 1;
}

function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
