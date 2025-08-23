// === Entry Points ===
function doGet(e) {
    const user = e.parameter.user;
    const action = e.parameter.action;
    const month = e.parameter.month;

    if (action === "register") {
        const success = registerUser(user);
        return createJsonResponse({ success });
    }

    if (action === "login") {
        const success = registerUser(user);
        const months = success ? getUserMonths(user) : [];
        return createJsonResponse({ success, months });
    }

    if (action === "getUserData") {
        const userData = getUserData(user, month);
        return createJsonResponse(userData);
    }

    return createJsonResponse({ error: "Invalid action" });
}

function doPost(e) {
    const payload = JSON.parse(e.postData.contents);
    const user = payload.user;
    const month = payload.month;
    const json = payload.data;

    if (!user || !month) {
        return createJsonResponse({ status: "error", message: "缺少必要欄位：user 或 month" });
    }

    upsertUserData(user, month, json);

    return createJsonResponse({ status: "OK" });
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

function getUserData(user, month) {
    const sheet = getSheet(SHEET_NAMES.DATA);
    const row = findOrCreateRow(sheet, user, month);
    const json = sheet.getRange(row, 3).getValue();
    return JSON.parse(json);
}

function upsertUserData(user, month, json) {
    const sheet = getSheet(SHEET_NAMES.DATA);
    const row = findOrCreateRow(sheet, user, month);

    sheet.getRange(row, 3).setValue(json);
}

// === Utilities ===
const SHEET_NAMES = {
    USERS: "users",
    DATA: "data"
};

function getSheet(name) {
    return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function getAllRows(sheet, startRow = 2, numCols = 3) {
    if (!sheet) {
        throw new Error("Sheet is null or undefined. Please provide a valid sheet.");
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < startRow) {
        return [];
    }

    const range = sheet.getRange(startRow, 1, lastRow - startRow + 1, numCols);
    return range.getValues();
}

function findOrCreateRow(sheet, user, month) {
    const rows = getAllRows(sheet);
    for (let i = 0; i < rows.length; i++) {
        if (rows[i][0] === user && rows[i][1] === month) {
            return i + 2;
        }
    }
    const newRow = [user, month, JSON.stringify(getDefaultUserData())];
    sheet.appendRow(newRow);
    return sheet.getLastRow();
}

function getUsers(sheet) {
    const rows = getAllRows(sheet, 2, 1);
    return rows.map(row => row[0]);
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

function getUserMonths(user) {
    const sheet = getSheet(SHEET_NAMES.DATA);
    const rows = getAllRows(sheet);
    const months = rows
        .filter(row => row[0] === user)
        .map(row => row[1]);
    return [...new Set(months)];
}

// === Tests ===
function testRegisterUser() {
    const testUser = "testUser";
    const result = registerUser(testUser);
    Logger.log(`Register User: ${testUser}, Result: ${result}`);
}

function testGetUserData() {
    const testUser = "testUser";
    const testMonth = "y25m08";
    const data = getUserData(testUser, testMonth);
    Logger.log(`Get User Data for ${testUser}, ${testMonth}: ${JSON.stringify(data)}`);
}

function testUpsertUserData() {
    const testUser = "testUser";
    const testMonth = "y25m08";
    const testData = {
        tasks: [{ id: 1, title: "Test Task" }],
        lists: [],
        memos: [],
        holidays: [],
        calendarRange: { start: "2025-08-01", end: "2025-08-31" }
    };
    upsertUserData(testUser, testMonth, JSON.stringify(testData));
    Logger.log(`Upsert User Data for ${testUser}, ${testMonth}: ${JSON.stringify(testData)}`);
}

function testGetUserMonths() {
    const testUser = "testUser";
    const months = getUserMonths(testUser);
    Logger.log(`Get User Months for ${testUser}: ${JSON.stringify(months)}`);
}

function testDuplicateData() {
    const testUser = "testUser";
    const testMonth = "y25m08";
    const testData = {
        "holidays": [],
        "calendarRange": {
            "start": "2025-08-01",
            "end": "2025-08-31"
        },
        "tasks": [
            {
                "id": "1755912276381",
                "title": "（未命名）",
                "intervalDays": 7,
                "swatchId": 8,
                "completionDates": [],
                "collapsed": true,
                "children": []
            }
        ],
        "memos": [
            {
                "text": "（未命名）",
                "swatchId": 8
            }
        ],
        "lists": [
            {
                "id": "list-8wss3kg73",
                "name": "未命名清單",
                "startNumber": 1,
                "endNumber": 10,
                "swatchId": 8,
                "doneNumbers": []
            }
        ]
    };

    // 第一次插入
    upsertUserData(testUser, testMonth, JSON.stringify(testData));
    Logger.log(`Inserted data for ${testUser}, ${testMonth}`);

    // 第二次插入相同的 user 和 month
    upsertUserData(testUser, testMonth, JSON.stringify(testData));
    Logger.log(`Attempted to insert duplicate data for ${testUser}, ${testMonth}`);

    // 檢查 Google Sheet 中是否只有一筆資料
    const sheet = getSheet(SHEET_NAMES.DATA);
    const rows = getAllRows(sheet);
    const duplicates = rows.filter(row => row[0] === testUser && row[1] === testMonth);
    Logger.log(`Number of entries for ${testUser}, ${testMonth}: ${duplicates.length}`);
}

function runAllTests() {
    Logger.log("Running all tests...");
    testRegisterUser();
    testGetUserData();
    testUpsertUserData();
    testGetUserMonths();
    testDuplicateData();
    Logger.log("All tests completed.");
}
