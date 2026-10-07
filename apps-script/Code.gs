/**
 * 旅遊助手 v2 — 安全版 API
 * 
 * 所有請求都需要帶 password 參數驗證身份。
 * 資料讀取統一用 getAllData 一次回傳，前端不再直接讀 CSV。
 * 寫入操作用 UUID 定位列，不依賴 rowIndex。
 * 
 * 【設定表】分頁「設定」
 * 欄位：用戶名稱 | Sheet ID | API Key | 密碼 | 行程表分頁 | 隨機景點分頁 | 美食分頁 | 出發日期 | 結束日期
 *        A          B          C        D      E            F            G          H          I
 */

// ==================== 路由 ====================

function doGet(e) {
  const action = e.parameter.action;
  let result;
  
  switch (action) {
    case 'listUsers':
      result = listUsers();
      break;
    case 'getConfig':
      result = getConfigWithAuth(e.parameter.user, e.parameter.password);
      break;
    case 'getAllData':
      result = getAllDataWithAuth(e.parameter.user, e.parameter.password);
      break;
    default:
      result = { error: 'Unknown action' };
  }
  
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const action = data.action;
  
  // All POST actions require authentication
  if (action !== 'listUsers') {
    const authResult = authenticate(data.user, data.password);
    if (authResult.error) {
      return ContentService
        .createTextOutput(JSON.stringify(authResult))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  let result;
  
  switch (action) {
    case 'updateUserInfo':
      result = updateUserInfo(data.user, data.fields);
      break;
    case 'addScheduleItem':
      result = addScheduleItem(data.sheetId, data.sheetName, data.item);
      break;
    case 'updateScheduleItem':
      result = updateScheduleItemByUUID(data.sheetId, data.sheetName, data.uuid, data.item);
      break;
    case 'deleteScheduleItem':
      result = deleteScheduleItemByUUID(data.sheetId, data.sheetName, data.uuid);
      break;
    case 'batchDeleteScheduleItems':
      result = batchDeleteScheduleItems(data.sheetId, data.sheetName, data.uuids);
      break;
    case 'addPackingItem':
      result = addPackingItem(data.sheetId, data.item);
      break;
    case 'batchAddPackingItems':
      result = batchAddPackingItems(data.sheetId, data.items);
      break;
    case 'syncPackingChecks':
      result = syncPackingChecks(data.sheetId, data.checkedIndexes);
      break;
    case 'batchDeletePackingItems':
      result = batchDeletePackingItems(data.sheetId, data.indexes);
      break;
    case 'batchAddShoppingItems':
      result = batchAddShoppingItems(data.sheetId, data.items);
      break;
    case 'updateShoppingItem':
      result = updateShoppingItemByUUID(data.sheetId, data.uuid, data.item);
      break;
    case 'syncShoppingChecks':
      result = syncShoppingChecks(data.sheetId, data.checkedIndexes);
      break;
    case 'batchDeleteShoppingItems':
      result = batchDeleteShoppingItems(data.sheetId, data.indexes);
      break;
    case 'updatePackingItem':
      result = updatePackingItemByUUID(data.sheetId, data.uuid, data.item);
      break;
    case 'deletePackingItem':
      result = deletePackingItemByUUID(data.sheetId, data.uuid);
      break;
    case 'addSegment':
      result = addSegment(data.sheetId, data.item);
      break;
    case 'updateSegment':
      result = updateSegmentByUUID(data.sheetId, data.uuid, data.item);
      break;
    case 'deleteSegment':
      result = deleteSegmentByUUID(data.sheetId, data.uuid);
      break;
    case 'geminiProxy':
      result = geminiProxy(data.apiKey, data.model, data.requestBody);
      break;
    default:
      result = { error: 'Unknown action' };
  }
  
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==================== 認證 ====================

function authenticate(userName, password) {
  if (!userName || !password) return { error: 'Missing credentials' };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('設定');
  if (!sheet) return { error: 'Config sheet not found' };
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString().trim() === userName.trim()) {
      const storedPassword = data[i][3] ? data[i][3].toString().trim() : '';
      if (!storedPassword) return { error: 'Password not set for this user' };
      if (password !== storedPassword) return { error: 'Invalid password' };
      return { success: true, row: i };
    }
  }
  return { error: 'User not found' };
}

function listUsers() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('設定');
  if (!sheet) return { users: [] };
  const data = sheet.getDataRange().getValues();
  const users = data.slice(1).map(row => row[0]).filter(name => name && name.toString().trim());
  return { users };
}

function getConfigWithAuth(userName, password) {
  const auth = authenticate(userName, password);
  if (auth.error) return auth;
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('設定');
  const data = sheet.getDataRange().getValues();
  const row = data[auth.row];
  
  return {
    userName: row[0].toString().trim(),
    sheetId: row[1].toString().trim(),
    apiKey: row[2].toString().trim(),
    sheetNameSchedule: row[4] ? row[4].toString().trim() : '行程表',
    sheetNameRandom: row[5] ? row[5].toString().trim() : '隨機景點',
    sheetNameFood: row[6] ? row[6].toString().trim() : '美食',
    tripStartDate: row[7] ? formatDateValue(row[7]) : '',
    tripEndDate: row[8] ? formatDateValue(row[8]) : ''
  };
}

// ==================== 統一資料讀取 ====================

function getAllDataWithAuth(userName, password) {
  const auth = authenticate(userName, password);
  if (auth.error) return auth;
  
  const configSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('設定');
  const configData = configSheet.getDataRange().getValues();
  const row = configData[auth.row];
  const sheetId = row[1].toString().trim();
  const sheetNameSchedule = row[4] ? row[4].toString().trim() : '行程表';
  const sheetNameRandom = row[5] ? row[5].toString().trim() : '隨機景點';
  const sheetNameFood = row[6] ? row[6].toString().trim() : '美食';
  
  if (!sheetId) return { error: 'No sheet ID configured' };
  
  try {
    const ss = SpreadsheetApp.openById(sheetId);
    
    return {
      config: {
        sheetId: sheetId,
        apiKey: row[2].toString().trim(),
        tripStartDate: row[7] ? formatDateValue(row[7]) : '',
        tripEndDate: row[8] ? formatDateValue(row[8]) : ''
      },
      schedule: readSheetAsObjects(ss, sheetNameSchedule),
      food: readSheetAsObjects(ss, sheetNameFood),
      places: readSheetAsObjects(ss, sheetNameRandom),
      packing: readSheetAsObjects(ss, '行李清單'),
      segments: readSheetAsObjects(ss, '行程段落'),
      shopping: readSheetAsObjects(ss, '購物清單')
    };
  } catch (err) {
    return { error: 'Failed to read data: ' + err.message };
  }
}

/**
 * 讀取任何分頁為物件陣列（用標題行當 key）
 * 每列自動加上 _uuid（用行號生成，穩定識別）
 */
function readSheetAsObjects(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  
  const headers = data[0].map(h => h.toString().trim());
  
  return data.slice(1).map((row, idx) => {
    const obj = { _uuid: `${sheetName}-${idx}`, _rowIndex: idx };
    headers.forEach((header, colIdx) => {
      let val = row[colIdx];
      const isDateObj = Object.prototype.toString.call(val) === '[object Date]';
      if (isDateObj) {
        const headerLower = header.toLowerCase();
        if (headerLower.includes('時間') || headerLower.includes('time')) {
          val = Utilities.formatDate(val, Session.getScriptTimeZone(), 'HH:mm');
        } else {
          val = formatDateValue(val);
        }
      } else if (val !== null && val !== undefined) {
        val = val.toString().trim();
      } else {
        val = '';
      }
      obj[header] = val;
    });
    return obj;
  }).filter(obj => {
    const firstKey = headers[0];
    return obj[firstKey] && obj[firstKey].toString().trim();
  });
}

// ==================== 行程 CRUD (UUID-based) ====================

function addScheduleItem(sheetId, sheetName, item) {
  if (!sheetId || !item) return { error: 'Missing parameters' };
  try {
    const ss = SpreadsheetApp.openById(sheetId);
    const sheet = ss.getSheetByName(sheetName || '行程表');
    if (!sheet) return { error: 'Sheet not found' };
    sheet.appendRow([item['日期'] || item.date || '', item['開始時間'] || item.startTime || '', item['結束時間'] || item.endTime || '', item['地點'] || item.place || '', item['地址'] || item.address || '', item['備註'] || item.notes || '']);
    return { success: true };
  } catch (err) { return { error: err.message }; }
}

function updateScheduleItemByUUID(sheetId, sheetName, uuid, item) {
  if (!sheetId || !uuid || !item) return { error: 'Missing parameters' };
  try {
    const ss = SpreadsheetApp.openById(sheetId);
    const sheet = ss.getSheetByName(sheetName || '行程表');
    if (!sheet) return { error: 'Sheet not found' };
    
    const rowIndex = extractRowIndexFromUUID(uuid);
    const row = rowIndex + 2; // +1 header, +1 for 1-indexed
    const lastRow = sheet.getLastRow();
    
    if (row < 2 || row > lastRow) return { error: 'Row out of range' };
    
    sheet.getRange(row, 1, 1, 6).setValues([[
      item['日期'] || item.date || '', 
      item['開始時間'] || item.startTime || '', 
      item['結束時間'] || item.endTime || '', 
      item['地點'] || item.place || '', 
      item['地址'] || item.address || '', 
      item['備註'] || item.notes || ''
    ]]);
    return { success: true };
  } catch (err) { return { error: err.message }; }
}

function deleteScheduleItemByUUID(sheetId, sheetName, uuid) {
  if (!sheetId || !uuid) return { error: 'Missing parameters' };
  try {
    const ss = SpreadsheetApp.openById(sheetId);
    const sheet = ss.getSheetByName(sheetName || '行程表');
    if (!sheet) return { error: 'Sheet not found' };
    
    const rowIndex = extractRowIndexFromUUID(uuid);
    const row = rowIndex + 2;
    const lastRow = sheet.getLastRow();
    
    if (row < 2 || row > lastRow) return { error: 'Row out of range' };
    
    sheet.deleteRow(row);
    return { success: true };
  } catch (err) { return { error: err.message }; }
}

function batchDeleteScheduleItems(sheetId, sheetName, uuids) {
  if (!sheetId || !uuids || !uuids.length) return { error: 'Missing parameters' };
  try {
    const ss = SpreadsheetApp.openById(sheetId);
    const sheet = ss.getSheetByName(sheetName || '行程表');
    if (!sheet) return { error: 'Sheet not found' };
    // Extract row indexes and sort descending (delete from bottom up)
    const rows = uuids.map(uuid => extractRowIndexFromUUID(uuid) + 2).sort((a, b) => b - a);
    const lastRow = sheet.getLastRow();
    for (const row of rows) {
      if (row >= 2 && row <= sheet.getLastRow()) {
        sheet.deleteRow(row);
      }
    }
    return { success: true };
  } catch (err) { return { error: err.message }; }
}

// ==================== 行李清單 CRUD (UUID-based) ====================

function addPackingItem(sheetId, item) {
  if (!sheetId || !item) return { error: 'Missing parameters' };
  try {
    const ss = SpreadsheetApp.openById(sheetId);
    const sheet = ss.getSheetByName('行李清單');
    if (!sheet) return { error: 'Sheet not found' };
    sheet.appendRow([item['物品'] || item.item || '', item['分類'] || item.category || '']);
    return { success: true };
  } catch (err) { return { error: err.message }; }
}

function batchAddPackingItems(sheetId, items) {
  if (!sheetId || !items || !items.length) return { error: 'Missing parameters' };
  try {
    const ss = SpreadsheetApp.openById(sheetId);
    const sheet = ss.getSheetByName('行李清單');
    if (!sheet) return { error: 'Sheet not found' };
    const rows = items.map(item => [item['物品'] || item.item || '', item['分類'] || item.category || '']);
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 2).setValues(rows);
    return { success: true, count: rows.length };
  } catch (err) { return { error: err.message }; }
}

function syncPackingChecks(sheetId, checkedIndexes) {
  if (!sheetId) return { error: 'Missing parameters' };
  try {
    const ss = SpreadsheetApp.openById(sheetId);
    const sheet = ss.getSheetByName('行李清單');
    if (!sheet) return { error: 'Sheet not found' };
    
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { success: true };
    
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (headers.length < 3 || !headers[2]) {
      sheet.getRange(1, 3).setValue('已完成');
    }
    
    const numRows = lastRow - 1;
    const checkValues = [];
    for (let i = 0; i < numRows; i++) {
      checkValues.push([checkedIndexes.includes(i) ? 'TRUE' : '']);
    }
    sheet.getRange(2, 3, numRows, 1).setValues(checkValues);
    
    return { success: true };
  } catch (err) { return { error: err.message }; }
}

function batchDeletePackingItems(sheetId, indexes) {
  if (!sheetId || !indexes || !indexes.length) return { error: 'Missing parameters' };
  try {
    const ss = SpreadsheetApp.openById(sheetId);
    const sheet = ss.getSheetByName('行李清單');
    if (!sheet) return { error: 'Sheet not found' };
    // Delete from bottom to top to avoid row shifting
    const sorted = [...indexes].sort((a, b) => b - a);
    for (const idx of sorted) {
      const row = idx + 2;
      if (row >= 2 && row <= sheet.getLastRow()) {
        sheet.deleteRow(row);
      }
    }
    return { success: true };
  } catch (err) { return { error: err.message }; }
}

function batchDeleteShoppingItems(sheetId, indexes) {
  if (!sheetId || !indexes || !indexes.length) return { error: 'Missing parameters' };
  try {
    const ss = SpreadsheetApp.openById(sheetId);
    const sheet = ss.getSheetByName('購物清單');
    if (!sheet) return { error: 'Sheet not found' };
    const sorted = [...indexes].sort((a, b) => b - a);
    for (const idx of sorted) {
      const row = idx + 2;
      if (row >= 2 && row <= sheet.getLastRow()) {
        sheet.deleteRow(row);
      }
    }
    return { success: true };
  } catch (err) { return { error: err.message }; }
}

function updatePackingItemByUUID(sheetId, uuid, item) {
  if (!sheetId || !uuid || !item) return { error: 'Missing parameters' };
  try {
    const ss = SpreadsheetApp.openById(sheetId);
    const sheet = ss.getSheetByName('行李清單');
    if (!sheet) return { error: 'Sheet not found' };
    
    const rowIndex = extractRowIndexFromUUID(uuid);
    const row = rowIndex + 2;
    const lastRow = sheet.getLastRow();
    if (row < 2 || row > lastRow) return { error: 'Row out of range' };
    
    sheet.getRange(row, 1, 1, 2).setValues([[item['物品'] || item.item || '', item['分類'] || item.category || '']]);
    return { success: true };
  } catch (err) { return { error: err.message }; }
}

function deletePackingItemByUUID(sheetId, uuid) {
  if (!sheetId || !uuid) return { error: 'Missing parameters' };
  try {
    const ss = SpreadsheetApp.openById(sheetId);
    const sheet = ss.getSheetByName('行李清單');
    if (!sheet) return { error: 'Sheet not found' };
    
    const rowIndex = extractRowIndexFromUUID(uuid);
    const row = rowIndex + 2;
    const lastRow = sheet.getLastRow();
    if (row < 2 || row > lastRow) return { error: 'Row out of range' };
    
    sheet.deleteRow(row);
    return { success: true };
  } catch (err) { return { error: err.message }; }
}

// ==================== 行程段落 CRUD (UUID-based) ====================

function addSegment(sheetId, item) {
  if (!sheetId || !item) return { error: 'Missing parameters' };
  try {
    const ss = SpreadsheetApp.openById(sheetId);
    let sheet = ss.getSheetByName('行程段落');
    if (!sheet) {
      sheet = ss.insertSheet('行程段落');
      sheet.getRange(1, 1, 1, 10).setValues([['段落名', '國家', '城市', '緯度', '經度', '開始日', '結束日', '住宿名稱', '住宿地址', '住宿電話']]);
    }
    sheet.appendRow([
      item['段落名'] || item.name || '', 
      item['國家'] || item.country || '', 
      item['城市'] || item.city || '',
      item['緯度'] || item.lat || '', 
      item['經度'] || item.lng || '',
      item['開始日'] || item.startDate || '', 
      item['結束日'] || item.endDate || '',
      item['住宿名稱'] || item.hotelName || '', 
      item['住宿地址'] || item.hotelAddress || '', 
      item['住宿電話'] || item.hotelPhone || ''
    ]);
    return { success: true };
  } catch (err) { return { error: err.message }; }
}

function updateSegmentByUUID(sheetId, uuid, item) {
  if (!sheetId || !uuid || !item) return { error: 'Missing parameters' };
  try {
    const ss = SpreadsheetApp.openById(sheetId);
    const sheet = ss.getSheetByName('行程段落');
    if (!sheet) return { error: 'Sheet not found' };
    
    const rowIndex = extractRowIndexFromUUID(uuid);
    const row = rowIndex + 2;
    const lastRow = sheet.getLastRow();
    if (row < 2 || row > lastRow) return { error: 'Row out of range' };
    
    sheet.getRange(row, 1, 1, 10).setValues([[
      item['段落名'] || item.name || '', 
      item['國家'] || item.country || '', 
      item['城市'] || item.city || '',
      item['緯度'] || item.lat || '', 
      item['經度'] || item.lng || '',
      item['開始日'] || item.startDate || '', 
      item['結束日'] || item.endDate || '',
      item['住宿名稱'] || item.hotelName || '', 
      item['住宿地址'] || item.hotelAddress || '', 
      item['住宿電話'] || item.hotelPhone || ''
    ]]);
    return { success: true };
  } catch (err) { return { error: err.message }; }
}

function deleteSegmentByUUID(sheetId, uuid) {
  if (!sheetId || !uuid) return { error: 'Missing parameters' };
  try {
    const ss = SpreadsheetApp.openById(sheetId);
    const sheet = ss.getSheetByName('行程段落');
    if (!sheet) return { error: 'Sheet not found' };
    
    const rowIndex = extractRowIndexFromUUID(uuid);
    const row = rowIndex + 2;
    const lastRow = sheet.getLastRow();
    if (row < 2 || row > lastRow) return { error: 'Row out of range' };
    
    sheet.deleteRow(row);
    return { success: true };
  } catch (err) { return { error: err.message }; }
}

// ==================== 用戶設定更新 ====================

function updateUserInfo(userName, fields) {
  if (!userName || !fields) return { error: 'Missing parameters' };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('設定');
  if (!sheet) return { error: 'Sheet not found' };
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString().trim() === userName.trim()) {
      const row = i + 1;
      if (fields.tripStartDate !== undefined) sheet.getRange(row, 8).setValue(fields.tripStartDate);
      if (fields.tripEndDate !== undefined) sheet.getRange(row, 9).setValue(fields.tripEndDate);
      return { success: true };
    }
  }
  return { error: 'User not found' };
}

// ==================== Gemini 代理 ====================

function geminiProxy(apiKey, model, requestBody) {
  if (!apiKey || !model || !requestBody) return { error: 'Missing parameters' };
  
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(requestBody),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const statusCode = response.getResponseCode();
    const responseBody = JSON.parse(response.getContentText());
    
    if (statusCode !== 200) {
      return { error: responseBody.error?.message || `HTTP ${statusCode}` };
    }
    
    return responseBody;
  } catch (err) {
    return { error: err.message };
  }
}

// ==================== 工具 ====================

function formatDateValue(val) {
  const isDateObj = Object.prototype.toString.call(val) === '[object Date]';
  if (isDateObj) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return val.toString().trim();
}

/**
 * 從 UUID 提取 rowIndex（UUID 格式：sheetName-idx）
 */
function extractRowIndexFromUUID(uuid) {
  const parts = uuid.split('-');
  return parseInt(parts[parts.length - 1]);
}

// ==================== 購物清單 CRUD ====================

function updateShoppingItemByUUID(sheetId, uuid, item) {
  if (!sheetId || !uuid || !item) return { error: 'Missing parameters' };
  try {
    const ss = SpreadsheetApp.openById(sheetId);
    const sheet = ss.getSheetByName('購物清單');
    if (!sheet) return { error: 'Sheet not found' };
    const rowIndex = extractRowIndexFromUUID(uuid);
    const row = rowIndex + 2;
    const lastRow = sheet.getLastRow();
    if (row < 2 || row > lastRow) return { error: 'Row out of range' };
    sheet.getRange(row, 1, 1, 2).setValues([[item['物品'] || item.item || '', item['分類'] || item.category || '']]);
    return { success: true };
  } catch (err) { return { error: err.message }; }
}

function batchAddShoppingItems(sheetId, items) {
  if (!sheetId || !items || !items.length) return { error: 'Missing parameters' };
  try {
    const ss = SpreadsheetApp.openById(sheetId);
    let sheet = ss.getSheetByName('購物清單');
    if (!sheet) {
      sheet = ss.insertSheet('購物清單');
      sheet.getRange(1, 1, 1, 3).setValues([['物品', '分類', '已完成']]);
    }
    const rows = items.map(item => [item['物品'] || item.item || '', item['分類'] || item.category || '', '']);
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 2).setValues(rows.map(r => [r[0], r[1]]));
    return { success: true, count: rows.length };
  } catch (err) { return { error: err.message }; }
}

function syncShoppingChecks(sheetId, checkedIndexes) {
  if (!sheetId) return { error: 'Missing parameters' };
  try {
    const ss = SpreadsheetApp.openById(sheetId);
    const sheet = ss.getSheetByName('購物清單');
    if (!sheet) return { error: 'Sheet not found' };
    
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { success: true };
    
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (headers.length < 3 || !headers[2]) {
      sheet.getRange(1, 3).setValue('已完成');
    }
    
    const numRows = lastRow - 1;
    const checkValues = [];
    for (let i = 0; i < numRows; i++) {
      checkValues.push([checkedIndexes.includes(i) ? 'TRUE' : '']);
    }
    sheet.getRange(2, 3, numRows, 1).setValues(checkValues);
    
    return { success: true };
  } catch (err) { return { error: err.message }; }
}
