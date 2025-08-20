// === Entry Points ===
function doGet(e) {
    const user = e.parameter.user;
    const action = e.parameter.action;

    if (action === "register") {
        const success = registerUser(user);
        return createJsonResponse({ success });
    }

    const userData = getUserData(user);
    return createJsonResponse(userData);
}

function doPost(e) {
    const payload = JSON.parse(e.postData.contents);
    const user = payload.user;
    const json = JSON.stringify(payload);

    registerUser(user);
    upsertUserData(user, json);

    return createJsonResponse({ status: "OK" });
}

function doOptions(e) {
    const response = ContentService.createTextOutput("");
    return response;
}

// === Core Logic ===
function registerUser(user) {
    if (!user) return false;

    const sheet = getSheet(SHEET_NAMES.USERS);
    const users = getUsers(sheet);

    if (users.includes(user)) return true;

    sheet.appendRow([user]);
    return true;
}

function getUserData(user) {
    const sheet = getSheet(SHEET_NAMES.DATA);
    const row = findRowByUser(sheet, user);

    if (row) {
        const json = sheet.getRange(row, 2).getValue();
        return JSON.parse(json);
    } else {
        return getDefaultUserData();
    }
}

function upsertUserData(user, json) {
    const sheet = getSheet(SHEET_NAMES.DATA);
    const row = findRowByUser(sheet, user);

    if (row) {
        sheet.getRange(row, 2).setValue(json);
    } else {
        sheet.appendRow([user, json]);
    }
}

// === Utilities ===
const SHEET_NAMES = {
    USERS: "users",
    DATA: "data"
};

function getSheet(name) {
    return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function getRange(sheet, startRow = 2, startCol = 1, numCols = 2) {
    if (!sheet) {
        throw new Error("Sheet is null or undefined. Please provide a valid sheet.");
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < startRow) {
        // 返回一個空範圍，避免返回 null
        return sheet.getRange(startRow, startCol, 0, numCols);
    }

    const numRows = lastRow - startRow + 1;
    return sheet.getRange(startRow, startCol, numRows, numCols);
}

function getUsers(sheet) {
    const range = getRange(sheet, 2, 1, 1);
    return range.getNumRows() > 0 ? range.getValues().flat() : [];
}

function findRowByUser(sheet, user) {
    const range = getRange(sheet, 2, 1, 1);
    const finder = range.createTextFinder(user);
    const found = finder.findNext();
    return found ? found.getRow() : null;
}

function getDefaultUserData() {
    return {
        tasks: [],
        lists: [],
        memos: [],
        holidays: [],
        calendarRange: {}
    };
}

function createJsonResponse(data) {
    const response = ContentService.createTextOutput(JSON.stringify(data));
    response.setMimeType(ContentService.MimeType.JSON);
    return response;
}

// === Tests ===
function testFind() {
  const user = "27army";
  const found = registerUser(user);
  const data = getUserData(user);
}
