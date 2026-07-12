/**
 * 記帳 App 後端。部署為 Web App 後，前端會用 GET 取得分頁清單、用 POST 寫入一筆記帳資料。
 * 使用方式請見 README 的部署步驟。
 */

var SUMMARY_SHEET_NAME = '總表';

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets()
    .map(function (s) { return s.getName(); })
    .filter(function (name) { return name !== SUMMARY_SHEET_NAME; });

  return ContentService
    .createTextOutput(JSON.stringify({ success: true, sheets: sheets }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var sheetName = payload.sheetName;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      return jsonOutput({ success: false, error: '找不到分頁：' + sheetName });
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

    return jsonOutput({ success: true, sheet: sheetName, row: targetRow });
  } catch (err) {
    return jsonOutput({ success: false, error: String(err) });
  }
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
