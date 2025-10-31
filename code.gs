function doGet(e) {
  Logger.log(JSON.stringify(e));

  // Xử lý yêu cầu từ ESP32 (có tham số sts và uid)
  if (e.parameter && (e.parameter.sts || e.parameter.uid)) {
    var result = 'OK';
    if (!e.parameter) return ContentService.createTextOutput('No_Parameters');

    var sheetId = '1zQ2Cxxvhc95xlGDSlFFu9T_HkWmyepzu6LM39UiOMxc';
    var sheetUserData = SpreadsheetApp.openById(sheetId).getSheetByName('Data');
    var sheetAttendance = SpreadsheetApp.openById(sheetId).getSheetByName('Attendance');

    var stsVal = '', uidVal = '';
    for (var param in e.parameter) {
      var value = stripQuotes(e.parameter[param]);
      if (param === 'sts') stsVal = value;
      if (param === 'uid') uidVal = value;
    }

    // Chế độ đăng ký UID (reg)
    if (stsVal === 'reg') {
      if (checkUID(sheetId, 'Data', 1, uidVal)) {
        return ContentService.createTextOutput('OK,regErr01');
      }
      var lastRow = findLastRow(sheetId, 'Data', 'A');
      sheetUserData.getRange('A' + (lastRow + 1)).setValue(uidVal); // Lưu UID vào cột A
      return ContentService.createTextOutput('OK,R_Successful');
    }

    // Chế độ điểm danh (atc)
    if (stsVal === 'atc') {
      var uidIndex = findUID(sheetId, 'Data', 1, uidVal);
      if (uidIndex === -1) return ContentService.createTextOutput('OK,atcErr01');

      var userName = sheetUserData.getRange('B' + (uidIndex + 2)).getValue(); // Name ở cột B
      var position = sheetUserData.getRange('E' + (uidIndex + 2)).getValue(); // Position ở cột E
      var currDate = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy');
      var currTime = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'HH:mm:ss');
      var data = sheetAttendance.getDataRange().getDisplayValues();
      var enterData = 'time_in', numRow;

      if (data.length > 1) {
        for (var i = 0; i < data.length; i++) {
          if (data[i][0] === uidVal && data[i][3] === currDate) { // UID ở cột 0, Date ở cột 3
            if (data[i][5] === '') {
              enterData = 'time_out';
              numRow = i + 1;
              break;
            }
            enterData = 'finish';
          }
        }
      }

      if (enterData === 'time_in') {
        sheetAttendance.insertRows(2);
        sheetAttendance.getRange('A2').setValue(uidVal);       // UID
        sheetAttendance.getRange('B2').setValue(userName);     // Name
        sheetAttendance.getRange('C2').setValue(position);     // Position
        sheetAttendance.getRange('D2').setValue(currDate);     // Date
        sheetAttendance.getRange('E2').setValue(currTime);     // Time In
        SpreadsheetApp.flush();
        return ContentService.createTextOutput(`OK,TI_Successful,${uidVal},${userName},${position},${currDate},${currTime},N/A`); // Time Out mặc định là "N/A"
      }

      if (enterData === 'time_out') {
        sheetAttendance.getRange('F' + numRow).setValue(currTime); // Time Out
        return ContentService.createTextOutput(`OK,TO_Successful,${uidVal},${userName},${position},${data[numRow-1][3]},${data[numRow-1][4]},${currTime}`); 
      }

      if (enterData === 'finish') return ContentService.createTextOutput('OK,atcInf01');
    }
  }

  // Xử lý yêu cầu từ Web
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function globalVariables() {
  return {
    spreadsheetId: '1zQ2Cxxvhc95xlGDSlFFu9T_HkWmyepzu6LM39UiOMxc',
    dataRange: 'Data!A2:H',
    idRange: 'Data!A2:A',
    lastCol: 'H',
    insertRange: 'Data!A1:H1',
    sheetID: '0'
  };
}

function processForm(formObject) {
  var vars = globalVariables();
  if (formObject.RecId && checkID(formObject.RecId)) {
    updateData(getFormValues(formObject), vars.spreadsheetId, getRangeByID(formObject.RecId));
  } else {
    appendData(getFormValues(formObject), vars.spreadsheetId, vars.insertRange);
  }
  return getAllData();
}

function getFormValues(formObject) {
  return [[
    formObject.RecId || '',
    formObject.name,
    formObject.email,
    formObject.telp,
    formObject.position,
    formObject.birthday,
    formObject.city,
    new Date().toLocaleDateString('vi-VN')
  ]];
}

function appendData(values, spreadsheetId, range) {
  var valueRange = Sheets.newRowData();
  valueRange.values = values;
  Sheets.Spreadsheets.Values.append(valueRange, spreadsheetId, range, { valueInputOption: 'RAW' });
}

function readData(spreadsheetId, range) {
  var result = Sheets.Spreadsheets.Values.get(spreadsheetId, range);
  return result.values || [];
}

function updateData(values, spreadsheetId, range) {
  var valueRange = Sheets.newValueRange();
  valueRange.values = values;
  Sheets.Spreadsheets.Values.update(valueRange, spreadsheetId, range, { valueInputOption: 'RAW' });
}

function deleteData(ID) {
  var startIndex = getRowIndexByID(ID);
  if (startIndex === -1) throw new Error('ID không tồn tại: ' + ID);
  var deleteRange = {
    sheetId: globalVariables().sheetID,
    dimension: 'ROWS',
    startIndex: startIndex,
    endIndex: startIndex + 1
  };
  Sheets.Spreadsheets.batchUpdate({ requests: [{ deleteDimension: { range: deleteRange } }] }, globalVariables().spreadsheetId);
  return getAllData();
}

function checkID(ID) {
  var idList = readData(globalVariables().spreadsheetId, globalVariables().idRange).flat();
  return idList.includes(ID.toString());
}

function getRangeByID(id) {
  var idList = readData(globalVariables().spreadsheetId, globalVariables().idRange);
  for (var i = 0; i < idList.length; i++) {
    if (id.toString() === idList[i][0].toString()) {
      return 'Data!A' + (i + 2) + ':' + globalVariables().lastCol + (i + 2);
    }
  }
  return null;
}

function getRecordById(id) {
  if (id && checkID(id)) return readData(globalVariables().spreadsheetId, getRangeByID(id));
  return null;
}

function getRowIndexByID(id) {
  var idList = readData(globalVariables().spreadsheetId, globalVariables().idRange);
  for (var i = 0; i < idList.length; i++) {
    if (id.toString() === idList[i][0].toString()) return parseInt(i + 1);
  }
  return -1;
}

function getAllData() {
  return readData(globalVariables().spreadsheetId, globalVariables().dataRange);
}

function getAttendanceData() {
  return readData(globalVariables().spreadsheetId, 'Attendance!A2:F');
}

function getDropdownListCity(range) {
  return readData(globalVariables().spreadsheetId, range);
}

function getLatestIdFromSheet() {
  var ids = readData(globalVariables().spreadsheetId, globalVariables().idRange);
  return ids.length > 0 ? ids[ids.length - 1][0] : '';
}

function getNewHtml(e) {
  return HtmlService.createTemplateFromFile('Index').evaluate().getContent();
}

// Hàm hỗ trợ cho ESP32
function stripQuotes(value) {
  return value.replace(/^["']|['"]$/g, '');
}

function findLastRow(idSheet, nameSheet, column) {
  var sheet = SpreadsheetApp.openById(idSheet).getSheetByName(nameSheet);
  var lastRow = sheet.getLastRow();
  var range = sheet.getRange(column + lastRow);
  return range.getValue() !== '' ? lastRow : range.getNextDataCell(SpreadsheetApp.Direction.UP).getRow();
}

function findUID(idSheet, nameSheet, columnIndex, searchString) {
  var sheet = SpreadsheetApp.openById(idSheet).getSheetByName(nameSheet);
  var values = sheet.getRange(2, columnIndex, sheet.getLastRow()).getValues();
  return values.findIndex(searchString) || -1;
}

function checkUID(idSheet, nameSheet, columnIndex, searchString) {
  var sheet = SpreadsheetApp.openById(idSheet).getSheetByName(nameSheet);
  var values = sheet.getRange(2, columnIndex, sheet.getLastRow()).getValues();
  var index = values.findIndex(searchString);
  return index !== -1; // Xóa dòng ghi thông báo
}

Array.prototype.findIndex = function(search) {
  if (!search) return -1;
  for (var i = 0; i < this.length; i++) {
    if (this[i].toString().indexOf(search) > -1) return i;
  }
  return -1;
};