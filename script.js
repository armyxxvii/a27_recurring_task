// ===========================
// 1. DOM nodes & global state
// ===========================
const titleUser = document.getElementById("title-user");
const titleMonth = document.getElementById("title-month");
const calendarStart = document.getElementById("calendar-start");
const calendarEnd = document.getElementById("calendar-end");
const calendarSelected = document.getElementById("selected-date");
const toast = document.getElementById("save-toast");
const taskRoot = document.getElementById("task-root");
const listRoot = document.getElementById("list-root");
const listContainer = document.getElementById("list-container");
const memoRoot = document.getElementById("memo-root");
const memoList = document.getElementById("memo-list");

const url = "https://script.google.com/macros/s/AKfycbyh1bOMMMIYLZF1o4A_q1UZpRzcqYKi_9ewciRbqp06MIZfgcTqJ-3pWA6utSQWWU_8/exec";

const undoStack = [];
const redoStack = [];
const holidayDates = new Set();
const farFuture = "2700-02-27";
const dayMs = 1000 * 60 * 60 * 24;
const today = parseDate(new Date());
const todayStr = formatDate(today);

const colors = [
    "",         // 無底色
    "#ddf",     // 靛紫／輕柔
    "#cef",     // 藍灰／輕柔
    "#ffd",     // 沙黃／輕柔
    "#fdf",     // 藕色／輕柔
    "#fec",     // 橘茶／輕柔
    "#bbb",     // 中性灰
    "#aad",     // 靛紫／溫和
    "#7bd",     // 藍灰／溫和
    "#dc9",     // 沙黃／溫和
    "#dad",     // 藕色／溫和
    "#fb5",     // 橘茶／溫和
];
const KEYS = {
    LAST_USER: "lastUser",
    LAST_MONTH: "lastMonth"
};
const idMap = new Map();
const rootTask = {
    title: "ROOT",
    path: [0],
    children: []
};

let lists = [];
let memos = [];
let toggleSortableBtn;
let isSortableEnabled = false;
let showOnedayBtn;
let isShowOneday = false;
let toggleTaskListBtn;
let isShowTaskList = false;

let toggleEditLockBtn;
let isEditLocked = true;

let currentUser = null;
let monthData = null;
let currentMonth = null;

// ===========================
// 2a. Google Sheets I/O
// ===========================
// 讀取所有資料
async function fetchDataFromGoogleSheet() {
    if (!currentUser || !currentMonth) {
        showToast("請先登入並選擇月份");
        return showLogin();
    }
    showPageDim();
    try {
        const res = await fetch(url + `?action=getUserData&user=${encodeURIComponent(currentUser)}&month=${encodeURIComponent(currentMonth)}`, {
            method: "GET",
            headers: { "Content-Type": "text/plain;charset=utf-8" }
        });
        const data = await res.json();
        rootTask.children = Array.isArray(data.tasks) ? data.tasks : [];
        lists = Array.isArray(data.lists) ? data.lists : [];
        memos = Array.isArray(data.memos) ? data.memos : [];
        holidayDates.clear();
        (data.holidays || []).forEach(d => holidayDates.add(d));
        if (data.calendarRange) {
            calendarStart.value = data.calendarRange.start || "";
            calendarEnd.value = data.calendarRange.end || "";
        }
        refreshAll();
        document.body.classList.remove("unsaved");
        titleUser.innerText = currentUser;
        titleMonth.innerText = currentMonth;
        showToast("已從 Google Sheets 讀取");
    } catch (error) {
        console.error("讀取資料失敗：", error);
        showToast("讀取資料失敗");
    } finally {
        hidePageDim();
    }
}
// 儲存所有資料
async function saveDataToGoogleSheet() {
    if (!currentUser || !currentMonth) {
        showToast("請先登入並選擇月份");
        return showLogin();
    }

    lists.forEach(list => {
        if (!list.id) list.id = generateUniqueId();
    });
    const data = getCurrentData();
    await uploadDataToGoogleSheet(currentUser, currentMonth, data);
}
async function uploadDataToGoogleSheet(user, month, data) {
    if (!user || !month) {
        showToast("請先登入並選擇月份");
        return showLogin();
    }

    showPageDim();
    const payload = {
        user: user,
        month: month,
        data: JSON.stringify(data)
    };

    try {
        const res = await fetch(url + `?action=upload`, {
            method: "POST",
            body: JSON.stringify(payload),
            headers: { "Content-Type": "text/plain;charset=utf-8" }
        });

        if (res.ok) {
            document.body.classList.remove("unsaved");
            showToast("已成功上傳資料");
        } else {
            showToast("上傳失敗，請稍後再試");
            console.error(res.message);
        }
    } catch (error) {
        console.error("上傳失敗：", error);
        showToast("上傳失敗，請檢查網路連線");
    } finally {
        hidePageDim();
    }
}
function localSave(key, value) {
    localStorage.setItem(key, value);
}
function localLoad(key) {
    return localStorage.getItem(key);
}
function getCurrentData() {
    sortDates();
    refreshAll();
    return {
        holidays: Array.from(holidayDates),
        calendarRange: {
            start: calendarStart.value ? calendarStart.value : null,
            end: calendarEnd.value ? calendarEnd.value : null
        },
        tasks: rootTask.children,
        memos,
        lists
    };
}

// ===========================
// 2b. 產生下一個月資料
// ===========================
async function saveNextMonthData() {
    if (!currentUser || !currentMonth) {
        showToast("請先登入並選擇目前月份");
        return showLogin();
    }
    const nextMonth = getNextKey();
    const data = getNextData();
    await uploadDataToGoogleSheet(currentUser, nextMonth, data);

    // 重新登入並選擇新月份
    currentMonth = nextMonth;
    await fetchDataFromGoogleSheet();
}
function getNextData() {
    sortDates();
    refreshAll();

    const nextMonthRange = generateNextMonthRange(today);
    const clonedTasks = JSON.parse(JSON.stringify(rootTask.children));
    const cleanedTasks = cleanTasks(clonedTasks);

    return {
        holidays: [],
        calendarRange: nextMonthRange,
        tasks: cleanedTasks,
        memos: JSON.parse(JSON.stringify(memos)),
        lists: JSON.parse(JSON.stringify(lists))
    };
}
function cleanTasks(tasks) {
    tasks.forEach(task => {
        if (Array.isArray(task.completionDates) && task.completionDates.length > 0) {
            task.completionDates = [task.completionDates[0]]; // 僅保留最新日期
        }
        if (Array.isArray(task.children)) {
            cleanTasks(task.children); // 遞迴清理子任務
        }
    });
    return tasks;
}
function getNextKey() {
    const year = parseInt(currentMonth.slice(1, 3), 10); // 提取年份
    const month = parseInt(currentMonth.slice(4, 6), 10); // 提取月份

    let nextYear = year;
    let nextMonth = month + 1;

    if (nextMonth > 12) {
        nextMonth = 1;
        nextYear += 1;
    }

    // 返回格式化的 "yYYmMM"
    return `y${String(nextYear).padStart(2, "0")}m${String(nextMonth).padStart(2, "0")}`;
}
function generateNextMonthRange(today) {
    const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const nextMonthEnd = new Date(nextMonthStart.getFullYear(), nextMonthStart.getMonth() + 1, 0);

    return {
        start: formatDate(nextMonthStart),
        end: formatDate(nextMonthEnd)
    };
}

// ===========================
// 2c. 撤銷 / 重做
// ===========================
function getCurrentState() {
    return {
        tasks: JSON.parse(JSON.stringify(rootTask.children)),
        lists: JSON.parse(JSON.stringify(lists)),
        memos: JSON.parse(JSON.stringify(memos)),
        holidayDates: new Set(holidayDates),
        calendarStartDate: calendarStart.value,
        calendarEndDate: calendarEnd.value
    };
}
function saveState() {
    undoStack.push(getCurrentState());
    redoStack.length = 0;
}
function undo() {
    if (undoStack.length === 0) {
        showToast("無法撤銷");
        return;
    }
    const previousState = undoStack.pop();
    redoStack.push(getCurrentState());
    rootTask.children = previousState.tasks;
    lists = previousState.lists;
    memos = previousState.memos;
    holidayDates.clear();
    previousState.holidayDates.forEach(date => holidayDates.add(date));
    calendarStart.value = previousState.calendarStartDate;
    calendarEnd.value = previousState.calendarEndDate;
    showToast("已撤銷");
    refreshAll();
    document.body.classList.add("unsaved");
}
function redo() {
    if (redoStack.length === 0) {
        showToast("無法重做");
        return;
    }
    const nextState = redoStack.pop();
    undoStack.push(getCurrentState());
    rootTask.children = nextState.tasks;
    lists = nextState.lists;
    memos = nextState.memos;
    holidayDates.clear();
    nextState.holidayDates.forEach(date => holidayDates.add(date));
    calendarStart.value = nextState.calendarStartDate;
    calendarEnd.value = nextState.calendarEndDate;
    showToast("已重做");
    refreshAll();
    document.body.classList.add("unsaved");
}
/** 通用函式：保存狀態、執行功能並刷新畫面 */
function execute(action) {
    saveState();
    action();
    refreshAll();
    document.body.classList.add("unsaved");
}

// ===========================
// 3a. Date
// ===========================
function formatDate(d) {
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}
function parseDate(input) {
    if (input instanceof Date) return new Date(input.getFullYear(), input.getMonth(), input.getDate());
    if (typeof input === "string") {
        const [yy, mm, dd] = input.split("-").map(Number);
        return new Date(yy, mm - 1, dd);
    }
    return new Date(input);
}
function sortDates() {
    function recurSort(list) {
        list.forEach(task => {
            if (Array.isArray(task.completionDates)) {
                task.completionDates.sort((a, b) => new Date(b) - new Date(a));
            }
            if (task.children?.length) recurSort(task.children);
        });
    }
    recurSort(rootTask.children);
}
function diffDays(task, prevCompDate, targetDate) {
    const target = parseDate(targetDate);
    const last = parseDate(prevCompDate);
    const next = new Date(last.getTime() + task.intervalDays * dayMs);
    return Math.ceil((next - target) / dayMs);
}
function generateDateStrings() {
    const result = [];
    if (isShowOneday) {
        result.push(calendarSelected.value);
        return result;
    }

    const start = parseDate(calendarStart.value) || today;
    const end = parseDate(calendarEnd.value) || start + 14 * dayMs;
    let cursor = new Date(start);
    while (cursor <= end) {
        result.push(formatDate(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }
    return result;
}

// ===========================
// 3b. Tasks & Calendar
// ===========================
function newTask() {
    return {
        id: Date.now().toString(),
        title: "",
        intervalDays: 0,
        swatchId: 0,
        completionDates: [],
        collapsed: true,
        children: []
    };
}
function deleteTask(task) {
    const path = findTaskPath(task);
    if (!path) return false;
    if (confirm("確定要刪除這個任務？")) {
        execute(() => {
            const { parent, index } = getTaskByPath(path);
            parent.children.splice(index, 1);
        });
        return true;
    }
    return false;
}
function copyTask(task) {
    const path = findTaskPath(task);
    if (!path) return false;
    const { parent } = getTaskByPath(path);
    function deepCopy(obj) {
        const newObj = { ...obj };
        newObj.id = Date.now().toString() + Math.random().toString(36).substring(2, 5);
        if (Array.isArray(obj.children)) {
            newObj.children = obj.children.map(child => deepCopy(child));
        }
        if (Array.isArray(obj.completionDates)) {
            newObj.completionDates = [...obj.completionDates];
        }
        return newObj;
    }
    execute(() => {
        const copied = deepCopy(task);
        parent.children.push(copied);
    });
    return true;
}
function isTaskCompletedOnSelectedDate(task) {
    if (!Array.isArray(task.completionDates)) return false;

    return task.completionDates.some(date => date === calendarSelected.value);
}
function buildIdMap(list) {
    idMap.clear();
    if (!Array.isArray(list)) return;
    const stack = [...list];
    while (stack.length) {
        const task = stack.pop();
        // 檢查 id 是否存在
        if (task && typeof task.id !== "undefined") {
            idMap.set(task.id, task);
        }
        // children 必須是陣列才展開
        if (Array.isArray(task?.children) && task.children.length > 0) {
            stack.push(...task.children);
        }
    }
}
function flattenTasks(data, parentPath = [], visible = true) {
    const list = [];
    data.forEach(task => {
        const path = [...parentPath, task.title];
        if (visible) list.push({ ...task, fullTitle: path.join(" / ") });
        const showChildren = !task.collapsed || isShowOneday;
        if (showChildren && task.children?.length) {
            list.push(...flattenTasks(task.children, path, showChildren));
        }
    });
    return list;
}
function getTaskByPath(path) {
    const result = {
        parent: null,
        index: path[0],
        task: rootTask,
    };

    for (let i = 1; i < path.length; i++) {
        result.parent = result.task;
        result.index = path[i];
        result.task = result.parent.children[result.index];
    }

    //console.log("Getting task by path:", path, "Result:", result); // 調試輸出
    return result;
}
function findTaskPath(target, data = rootTask, path = [0]) {
    const child = data.children;
    for (let i = 0; i < child.length; i++) {
        const t = child[i];
        const currentPath = [...path, i];
        if (t === target) return currentPath;
        if (Array.isArray(t.children)) {
            const childPath = findTaskPath(target, t, currentPath);
            if (childPath) return childPath;
        }
    }
    return null;
}
function onTaskNodeClick(event) {
    const li = event.target.closest(".task-node");
    if (!li) return;
    const path = li.dataset.path.split(",").map(Number);
    const { task } = getTaskByPath(path);

    if (!Array.isArray(task.children)) task.children = [];
    if (event.target.matches(".toggle-btn")) {
        execute(() => { task.collapsed = !task.collapsed; });
    } else if (event.target.matches(".add-child-btn")) {
        openTaskEditor(newTask(), task.children, true);
    } else if (event.target.matches(".edit-btn")) {
        openTaskEditor(task, null, false);
    }
}
function toggleHoliday(event) {
    const th = event.target.closest("th[data-date]");
    if (!th) return;
    const ds = th?.dataset?.date;
    if (!ds) return;
    execute(() => {
        if (holidayDates.has(ds)) holidayDates.delete(ds);
        else holidayDates.add(ds);
    });
}
function toggleComplete(event) {
    const td = event.target.closest("td[data-id]");
    if (!td) return;
    const { id, date } = td.dataset;
    const found = idMap.get(id);
    if (!found) return;
    execute(() => {
        const i = found.completionDates.indexOf(date);
        if (i >= 0) found.completionDates.splice(i, 1);
        else found.completionDates.push(date);
        sortDates();
    });
}

// ===========================
// 3c. Memo & List
// ===========================
function newMemo() {
    return {
        text: "",
        swatchId: 0
    };
}
function deleteMemo(index) {
    if (confirm("確定要刪除這個備忘事項？")) {
        execute(() => { memos.splice(index, 1); });
        return true;
    }
    return false;
}
function newList() {
    return {
        id: generateUniqueId(),
        name: "",
        startNumber: 1,
        endNumber: 10,
        swatchId: 0,
        doneNumbers: []
    };
}
function deleteList(id) {
    if (confirm("確定要刪除這個清單？")) {
        execute(() => { lists = lists.filter(list => list.id !== id); });
        return true;
    }
    return false;
}
function toggleListItem(list, number) {
    execute(() => {
        const idx = list.doneNumbers.indexOf(number);
        if (idx >= 0) list.doneNumbers.splice(idx, 1);
        else list.doneNumbers.push(number);
    });
}
function clearListDone(list) {
    execute(() => { list.doneNumbers = []; });
}

// ===========================
// 3d. Window (Editor)
// ===========================
function createColorSwatches(selectedSwatchId, onpointerdown) {
    const container = document.createElement("div");
    container.className = "color-swatches";
    colors.forEach((color, index) => {
        const btn = document.createElement("button");
        btn.className = "swatch" + (selectedSwatchId === index ? " selected" : "");
        btn.style.background = color || "transparent";
        btn.dataset.swatchId = index;
        btn.title = color || "無";
        btn.type = "button";
        btn.onpointerdown = () => onpointerdown(btn, index);
        container.appendChild(btn);
    });
    return container;
}
/**
* 開啟編輯器視窗。
* @param {Object} options - 編輯器選項。
* @param {string} [options.title] - 編輯器標題。
* @param {HTMLElement[]} options.fields - 欄位元素陣列。
* @param {number} [options.swatchId] - 預設選取的顏色索引。
* @param {function} [options.onSwatchChange] - 顏色選擇變更時的回呼。
* @param {function} options.onSave - 儲存時的回呼，參數為編輯器元素。
* @param {function} [options.onDelete] - 刪除時的回呼。
* @param {boolean} options.isNew - 是否為新增模式。
*/
function openEditor(options) {
    document.querySelector(".editor")?.remove();
    showPageDim();
    const editor = document.createElement("div");
    editor.className = "editor container";

    // 標題（可選）
    if (options.title) {
        const h2 = document.createElement("h2");
        h2.textContent = options.title;
        editor.appendChild(h2);
    }

    // 欄位
    options.fields.forEach(field => editor.appendChild(field));

    // 顏色選擇
    if (typeof options.swatchId !== "undefined") {
        const swatchContainer = createColorSwatches(options.swatchId, (btn, swatchId) => {
            swatchContainer.querySelectorAll(".swatch").forEach(b => b.classList.remove("selected"));
            btn.classList.add("selected");
            options.onSwatchChange(swatchId);
        });
        editor.appendChild(swatchContainer);
    }

    // 按鈕區
    const editorButtons = document.createElement("div");
    editorButtons.className = "editor-buttons";

    if (Array.isArray(options.buttons) && options.buttons.length > 0) {
        // 自訂按鈕模式
        options.buttons.forEach(btnOpt => {
            const btn = document.createElement("button");
            btn.textContent = btnOpt.text;
            btn.type = btnOpt.type || "button";
            btn.onclick = () => btnOpt.onClick(editor);
            editorButtons.appendChild(btn);
        });
    } else {
        // 預設儲存/取消/刪除
        const saveBtn = document.createElement("button");
        saveBtn.textContent = "儲存";
        saveBtn.onclick = () => {
            options.onSave(editor);
            editor.remove();
            hidePageDim();
        };
        editorButtons.append(saveBtn);

        if (typeof options.onDelete === "function") {
            const deleteBtn = document.createElement("button");
            deleteBtn.textContent = "刪除 ";
            deleteBtn.onclick = () => {
                if (options.onDelete() === true) {
                    editor.remove();
                    hidePageDim();
                }
            };
            createIcon("fa-trash-can", deleteBtn);
            editorButtons.append(deleteBtn);
        }

        if (typeof options.onCopy === "function") {
            const copyBtn = document.createElement("button");
            copyBtn.textContent = "複製 ";
            copyBtn.onclick = () => {
                if (options.onCopy() === true) {
                    editor.remove();
                    hidePageDim();
                }
            };
            createIcon("fa-copy", copyBtn);
            editorButtons.append(copyBtn);
        }

        const cancelBtn = document.createElement("button");
        cancelBtn.textContent = "取消";
        cancelBtn.onclick = () => {
            editor.remove();
            hidePageDim();
        };
        editorButtons.append(cancelBtn);
    }

    editor.appendChild(editorButtons);
    document.body.appendChild(editor);
}

function openTaskEditor(task, parentArray, isNew) {
    openEditor({
        title: `${isNew ? "新增" : "編輯"}任務`,
        fields: createTaskFields(task),
        swatchId: task.swatchId,
        onSwatchChange: swatchId => task.swatchId = swatchId,
        onSave: editor => {
            execute(() => {
                task.title = editor.querySelector("#edit-title").value.trim() || "（未命名）";
                task.intervalDays = +editor.querySelector("#edit-interval").value || 0;
                if (parentArray) parentArray.push(task);
            });
        },
        onDelete: !isNew ? () => deleteTask(task) : null,
        onCopy: !isNew ? () => copyTask(task) : null
    });
}
function createTaskFields(task) {
    const labelTitle = document.createElement("label");
    labelTitle.textContent = "任務名稱：";
    const inputTitle = document.createElement("input");
    inputTitle.type = "text";
    inputTitle.id = "edit-title";
    inputTitle.value = task.title || "";
    inputTitle.oninput = () => { task.title = inputTitle.value; };

    const labelInterval = document.createElement("label");
    labelInterval.textContent = "週期（天）：";
    const inputInterval = document.createElement("input");
    inputInterval.type = "number";
    inputInterval.id = "edit-interval";
    inputInterval.value = task.intervalDays || 7;
    inputInterval.oninput = () => { task.intervalDays = +inputInterval.value; };

    return [labelTitle, inputTitle, labelInterval, inputInterval];
}

function openMemoEditor(memo, index, isNew) {
    memo = memo || newMemo();
    openEditor({
        title: `${isNew ? "新增" : "編輯"}備忘`,
        fields: createMemoFields(memo),
        swatchId: memo.swatchId,
        onSwatchChange: swatchId => memo.swatchId = swatchId,
        isNew,
        onSave: editor => {
            execute(() => {
                memo.text = editor.querySelector("textarea").value.trim() || "（未命名）";
                if (isNew) memos.push(memo);
            });
        },
        onDelete: !isNew ? () => deleteMemo(index) : null
    });
}
function createMemoFields(memo) {
    const label = document.createElement("label");
    label.textContent = "備忘內容：";
    const textarea = document.createElement("textarea");
    textarea.value = memo.text;
    textarea.rows = 5;
    textarea.style.width = "100%";
    textarea.oninput = () => { memo.text = textarea.value; };
    return [label, textarea];
}

function openListEditor(list, isNew) {
    list = list || newList();
    openEditor({
        title: `${isNew ? "新增" : "編輯"}清單`,
        fields: createListFields(list),
        swatchId: list.swatchId,
        onSwatchChange: swatchId => list.swatchId = swatchId,
        isNew,
        onSave: editor => {
            execute(() => {
                list.name = editor.querySelector("input[type='text']").value.trim() || "未命名清單";
                list.startNumber = +editor.querySelectorAll("input[type='number']")[0].value || 1;
                list.endNumber = +editor.querySelectorAll("input[type='number']")[1].value || 10;
                if (isNew) lists.push(list);
            });
        },
        onDelete: !isNew ? () => deleteList(list.id) : null
    });
}
function createListFields(list) {
    const labelName = document.createElement("label");
    labelName.textContent = "清單名稱：";
    const inputName = document.createElement("input");
    inputName.type = "text";
    inputName.value = list.name;
    inputName.oninput = () => { list.name = inputName.value; };

    const labelStart = document.createElement("label");
    labelStart.textContent = "開始編號：";
    const inputStart = document.createElement("input");
    inputStart.type = "number";
    inputStart.value = list.startNumber;
    inputStart.oninput = () => { list.startNumber = +inputStart.value; };

    const labelEnd = document.createElement("label");
    labelEnd.textContent = "結束編號：";
    const inputEnd = document.createElement("input");
    inputEnd.type = "number";
    inputEnd.value = list.endNumber;
    inputEnd.oninput = () => { list.endNumber = +inputEnd.value; };

    return [labelName, inputName, labelStart, inputStart, labelEnd, inputEnd];
}


async function showLogin() {
    if (currentUser) {
        refreshAll();
        return;
    }

    const lastUser = localLoad(KEYS.LAST_USER);

    // 欄位
    const label = document.createElement("label");
    label.textContent = "暱稱（帳號）：";
    const input = document.createElement("input");
    input.type = "text";
    input.id = "login-user";
    input.autofocus = true;
    if (lastUser) input.value = lastUser;
    label.appendChild(input);

    openEditor({
        title: "登入 / 建立新帳號",
        fields: [label],
        isNew: true,
        buttons: [
            {
                text: "登入",
                onClick: async (editor) => {
                    const user = input.value.trim();
                    if (!user) {
                        showToast("請輸入暱稱");
                        return;
                    }
                    editor.classList.toggle("hidden", true);
                    // 註冊/登入
                    const res = await fetch(url + `?action=login&user=${encodeURIComponent(user)}`, {
                        method: "GET",
                        headers: { "Content-Type": "text/plain;charset=utf-8" }
                    });
                    const data = await res.json();
                    if (data.success) {
                        currentUser = user;
                        monthData = data;
                        localSave(KEYS.LAST_USER, user);
                        showToast("登入成功：" + user);
                        editor.remove();

                        showMonthSelection();
                    } else {
                        editor.classList.toggle("hidden", false);
                        showToast("登入失敗，請重試");
                    }
                }
            }
        ]
    });

    // 讓 Enter 也能登入
    input.addEventListener("keydown", e => {
        if (e.key === "Enter") {
            // 觸發登入按鈕
            const loginBtn = document.querySelector(".editor .editor-buttons button");
            if (loginBtn) loginBtn.click();
        }
    });
}

async function showMonthSelection() {
    if (!monthData || !monthData.months || monthData.months.length === 0) {
        showToast("無可用的任務月份");
        return;
    }

    const label = document.createElement("label");
    label.textContent = "選擇月份：";
    const select = document.createElement("select");
    select.id = "month-select";
    monthData.months.forEach(month => {
        const option = document.createElement("option");
        option.value = month;
        option.textContent = month;
        select.appendChild(option);
    });
    select.value = localLoad(KEYS.LAST_MONTH) || monthData.months[0];
    label.appendChild(select);

    openEditor({
        title: "選擇任務月份",
        fields: [label],
        buttons: [
            {
                text: "確定",
                onClick: async (editor) => {
                    const selectedMonth = select.value;
                    if (!selectedMonth) {
                        showToast("請選擇月份");
                        return;
                    }

                    localSave(KEYS.LAST_MONTH, selectedMonth);
                    currentMonth = selectedMonth;
                    editor.remove();
                    await fetchDataFromGoogleSheet();

                    calendarSelected.value = todayStr;
                    refreshAll();
                }
            }
        ]
    });
}

function showToast(msg = "已儲存") {
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2000);
}

function showPageDim() {
    if (!document.getElementById("page-dim-overlay")) {
        const overlay = document.createElement("div");
        overlay.id = "page-dim-overlay";
        overlay.className = "page-dim-overlay";
        document.body.appendChild(overlay);
    }
}
function hidePageDim() {
    document.getElementById("page-dim-overlay")?.remove();
}

// ===========================
// 4a. Render utility
// ===========================
function refreshAll() {
    const scrollPositions = new Map();
    document.querySelectorAll("[data-scrollable]").forEach(el => {
        scrollPositions.set(el.id, el.scrollLeft);
    });
    buildIdMap(rootTask.children);
    renderControls();
    renderTasks();
    renderMemos();
    renderLists();
    document.querySelectorAll("[data-scrollable]").forEach(el => {
        if (scrollPositions.has(el.id)) el.scrollLeft = scrollPositions.get(el.id);
    });
    const taskTitles = document.querySelectorAll(".task-title");
    taskTitles.forEach(title => {
        title.style.cursor = isSortableEnabled ? "move" : "default";
    });
}
function generateUniqueId() {
    return `list-${Math.random().toString(36).substring(2, 9)}`;
}
function clearChildren(parent) {
    while (parent.firstChild) parent.removeChild(parent.firstChild);
}
function createIcon(iconClass, parentElement) {
    const icon = document.createElement("i");
    icon.className = `fas ${iconClass}`;
    parentElement.appendChild(icon);
}
function refreshToggleSortableBtn() {
    toggleSortableBtn.classList.toggle("enabled", isSortableEnabled);
    toggleSortableBtn.title = isSortableEnabled ? "禁用排序" : "啟用排序";
}
function toggleSortable() {
    isSortableEnabled = !isSortableEnabled;
    const sortableContainers = document.querySelectorAll(".task-tree");
    sortableContainers.forEach(container => {
        if (container.sortableInstance) {
            container.sortableInstance.option("disabled", !isSortableEnabled);
        }
    });
    const taskTitles = document.querySelectorAll(".task-title");
    taskTitles.forEach(title => {
        title.style.cursor = isSortableEnabled ? "move" : "default";
    });
    refreshToggleSortableBtn();
}

function getOnedayTreeTasks() {
    function dateFilter(tasks) {
        const result = [];
        for (const task of tasks) {
            let filteredChildren = [];
            if (Array.isArray(task.children) && task.children.length > 0) {
                filteredChildren = dateFilter(task.children);
            }

            if (isTaskCompletedOnSelectedDate(task) || filteredChildren.length > 0) {
                result.push({
                    ...task,
                    children: filteredChildren
                });
            }
        }
        return result;
    }

    return dateFilter(rootTask.children);
}
function getOnedayFlatTasks() {
    return flattenTasks(rootTask.children).filter(task => isTaskCompletedOnSelectedDate(task));
}
function getShowTasks() {
    if (!isShowOneday)
        return rootTask.children;

    if (isShowTaskList)
        return getOnedayFlatTasks();
    else
        return getOnedayTreeTasks();
}

function refreshShowOnedayBtn() {
    showOnedayBtn.classList.toggle("enabled", isShowOneday);
    showOnedayBtn.title = isShowOneday ? "顯示全部任務" : "只顯示今日有排程的任務";
}
function refreshToggleTaskListBtn() {
    if (!toggleTaskListBtn) return;
    toggleTaskListBtn.classList.toggle("hidden", !isShowOneday);
    toggleTaskListBtn.classList.toggle("enabled", isShowTaskList);
    toggleTaskListBtn.title = "今日任務清單";
}
function refreshDateInputVisible() {
    calendarStart.classList.toggle("hidden", isShowOneday);
    calendarEnd.classList.toggle("hidden", isShowOneday);
    calendarSelected.classList.toggle("hidden", !isShowOneday);
}
function toggleShowOneday() {
    isShowOneday = !isShowOneday;
    refreshShowOnedayBtn();
    refreshToggleTaskListBtn();
    refreshDateInputVisible();
    refreshAll();
}
function toggleShowTasksList() {
    isShowTaskList = !isShowTaskList;
    refreshToggleTaskListBtn();
    refreshAll();
}

function refreshEditLockBtn() {
    if (!toggleEditLockBtn) return;
    toggleEditLockBtn.innerHTML = "";
    if (isEditLocked) {
        createIcon("fa-lock", toggleEditLockBtn);
        toggleEditLockBtn.classList.toggle("enabled", true);
        toggleEditLockBtn.title = "編輯鎖定（開啟） — 隱藏編輯與新增按鈕，並禁止日曆點擊";
    } else {
        createIcon("fa-lock-open", toggleEditLockBtn);
        toggleEditLockBtn.classList.toggle("enabled", false);
        toggleEditLockBtn.title = "編輯鎖定（關閉） — 允許編輯";
    }
}
function toggleEditLock() {
    isEditLocked = !isEditLocked;
    refreshEditLockBtn();
    refreshAll();
}

// ===========================
// 4b. Render
// ===========================
function renderControls() {
    const controls = document.getElementById("controls");
    clearChildren(controls);

    toggleEditLockBtn = document.createElement("button");
    toggleEditLockBtn.type = "button";
    toggleEditLockBtn.onclick = toggleEditLock;
    refreshEditLockBtn();
    controls.appendChild(toggleEditLockBtn);

    toggleSortableBtn = document.createElement("button");
    refreshToggleSortableBtn();
    toggleSortableBtn.type = "button";
    createIcon("fa-arrows-up-down-left-right", toggleSortableBtn);
    toggleSortableBtn.onclick = toggleSortable;
    controls.appendChild(toggleSortableBtn);

    showOnedayBtn = document.createElement("button");
    showOnedayBtn.type = "button";
    createIcon("fa-calendar-day", showOnedayBtn);
    showOnedayBtn.onclick = toggleShowOneday;
    controls.appendChild(showOnedayBtn);

    toggleTaskListBtn = document.createElement("button");
    toggleTaskListBtn.type = "button";
    createIcon("fa-list", toggleTaskListBtn);
    toggleTaskListBtn.onclick = toggleShowTasksList;
    controls.appendChild(toggleTaskListBtn);

    const undoBtn = document.createElement("button");
    undoBtn.title = "撤銷";
    undoBtn.type = "button";
    createIcon("fa-rotate-left", undoBtn);
    undoBtn.onclick = undo;
    controls.appendChild(undoBtn);

    const redoBtn = document.createElement("button");
    redoBtn.title = "重做";
    redoBtn.type = "button";
    createIcon("fa-rotate-right", redoBtn);
    redoBtn.onclick = redo;
    controls.appendChild(redoBtn);

    const openBtn = document.createElement("button");
    openBtn.title = "從 Google Sheets 讀取資料";
    openBtn.type = "button";
    createIcon("fa-cloud-arrow-down", openBtn);
    openBtn.onclick = showMonthSelection;
    controls.appendChild(openBtn);

    const saveBtn = document.createElement("button");
    saveBtn.title = "儲存到 Google Sheets";
    saveBtn.type = "button";
    createIcon("fa-cloud-arrow-up", saveBtn);
    saveBtn.onclick = saveDataToGoogleSheet;
    controls.appendChild(saveBtn);

    const nextMonthBtn = document.createElement("button");
    nextMonthBtn.title = "產生下個月";
    nextMonthBtn.type = "button";
    createIcon("fa-calendar-plus", nextMonthBtn);
    nextMonthBtn.onclick = saveNextMonthData;
    controls.appendChild(nextMonthBtn);

    refreshShowOnedayBtn();
    refreshToggleTaskListBtn();
    refreshDateInputVisible();
}

function renderTasks() {
    clearChildren(taskRoot);

    const headerRow = document.createElement("tr");
    headerRow.id = "date-header";

    const thead = document.createElement("thead");
    thead.appendChild(headerRow);

    const tbody = document.createElement("tbody");
    tbody.id = "calendar-body";

    const calendarTable = document.createElement("table");
    calendarTable.id = "calendar-table";
    calendarTable.appendChild(thead);
    calendarTable.appendChild(tbody);
    renderCalendar(thead, tbody);

    const treeRoot = document.createElement("div");
    treeRoot.id = "task-tree-root";
    treeRoot.className = "outdent";

    let needRenderCalender = !isShowOneday;
    if (isShowOneday && isShowTaskList) {
        // 平面模式
        const flatTasks = getShowTasks();
        const ul = document.createElement("ul");
        ul.className = "task-tree";
        flatTasks.forEach((task, i) => {
            const li = createTaskNode(task, [i]);
            ul.appendChild(li);
        });
        treeRoot.appendChild(ul);
    } else {
        // 樹狀模式
        renderTree(getShowTasks(), treeRoot);
        needRenderCalender = true;
    }

    const scrollSyncDiv = document.createElement("div");
    scrollSyncDiv.appendChild(treeRoot);
    taskRoot.appendChild(scrollSyncDiv);

    if (needRenderCalender) {
        treeRoot.className = "outdent tree-column";
        scrollSyncDiv.className = "scroll-sync";

        const calendarColumn = document.createElement("div");
        calendarColumn.id = "calendar-column";
        calendarColumn.className = "calendar-column";
        calendarColumn.setAttribute("data-scrollable", "");
        calendarColumn.appendChild(calendarTable);
        scrollSyncDiv.appendChild(calendarColumn);
    }

    if (!isEditLocked) {
        thead.addEventListener("click", toggleHoliday);
        calendarTable.addEventListener("click", toggleComplete);
        treeRoot.addEventListener("click", onTaskNodeClick);
        if (!isShowOneday) {
            const addTaskBtn = document.createElement("button");
            addTaskBtn.className = "full-width-btn";
            addTaskBtn.textContent = "➕ 新增任務";
            addTaskBtn.type = "button";
            addTaskBtn.addEventListener("click", () => openTaskEditor(newTask(), rootTask.children, true));
            taskRoot.appendChild(addTaskBtn);
        }
    }
}
function renderTree(data, parentEl, path = [0]) {
    const ul = document.createElement("ul");
    ul.className = "task-tree";

    data.forEach((task, i) => {
        const nodePath = [...path, i];
        const li = createTaskNode(task, nodePath);
        const needRenderChildren = isShowOneday || !task.collapsed;

        if (task.children?.length > 0 && needRenderChildren) {
            renderTree(task.children, li, nodePath);
        }
        ul.appendChild(li);
    });

    ul.sortableInstance = new Sortable(ul, {
        group: "nested",
        animation: 150,
        fallbackOnBody: true,
        swapThreshold: 0.65,
        handle: ".task-title",
        disabled: !isSortableEnabled,
        onEnd(evt) {
            const fromPath = evt.item.dataset.path.split(",").map(Number);
            const toParentPath = evt.to.parentElement.dataset.path
                ? evt.to.parentElement.dataset.path.split(",").map(Number)
                : [0];

            if (
                toParentPath.length >= fromPath.length &&
                toParentPath.slice(0, fromPath.length).every((v, i) => v === fromPath[i])
            ) {
                showToast("無法將任務拖曳到自己的子孫節點");
                return;
            }

            execute(() => {
                const { parent: fromParent, index: fromIdx, task: movedTask } = getTaskByPath(fromPath);
                const { task: toParent } = getTaskByPath(toParentPath);

                fromParent.children.splice(fromIdx, 1);
                toParent.children.splice(evt.newIndex, 0, movedTask);
            });
        }
    });

    parentEl.appendChild(ul);
}
function createTaskLine(task) {
    const line = document.createElement("div");
    line.className = "task-line";
    line.style.background = colors[task.swatchId] || "transparent";

    const hasChildren = Array.isArray(task.children) && task.children.length > 0;
    const toggleBtn = document.createElement("button");
    toggleBtn.className = "toggle-btn";
    if (hasChildren) {
        createIcon(task.collapsed ? "fa-chevron-right" : "fa-chevron-down", toggleBtn);
    } else {
        createIcon("fa-minus", toggleBtn);
        toggleBtn.disabled = true;
        task.collapsed = true;
    }

    const titleSpan = document.createElement("span");
    titleSpan.className = "task-title";
    titleSpan.innerHTML = `<span class="day-counter">${task.intervalDays}</span> ${task.title}`;

    const ctr = document.createElement("span");
    ctr.className = "controls";
    if (!isEditLocked) {
        const editBtn = document.createElement("button");
        editBtn.className = "edit-btn";
        editBtn.title = "編輯任務";
        createIcon("fa-pencil", editBtn);
        const addChildBtn = document.createElement("button");
        addChildBtn.className = "add-child-btn";
        addChildBtn.title = "新增子任務";
        createIcon("fa-baby", addChildBtn);
        ctr.append(editBtn, addChildBtn);
    }

    line.append(toggleBtn, titleSpan, ctr);
    return line;
}
function createTaskNode(task, path) {
    if (!task || typeof task !== "object") {
        console.error("Invalid task:", task);
        return document.createElement("li");
    }

    const node = document.createElement("li");
    node.className = "task-node " + (task.collapsed ? "collapsed" : "expanded");
    node.dataset.path = path.join(",");
    node.appendChild(createTaskLine(task));

    return node;
}

function renderCalendar(thead, tbody) {
    const dateStrs = generateDateStrings();
    const headFrag = document.createDocumentFragment();
    dateStrs.forEach(ds => {
        const th = document.createElement("th");
        th.textContent = ds.slice(5);
        th.dataset.date = ds;
        th.title = "點擊設定 / 取消休假日";
        if (holidayDates.has(ds)) th.classList.add("holiday");
        if (ds === todayStr) th.classList.add("today");
        headFrag.appendChild(th);
    });
    thead.appendChild(headFrag);

    const bodyFrag = document.createDocumentFragment();
    const flatTasks = flattenTasks(getShowTasks());
    flatTasks.forEach(task => {
        const tr = createCalendarRow(task, dateStrs);
        bodyFrag.appendChild(tr);
    });
    tbody.appendChild(bodyFrag);
}
function createCalendarRow(task, dateRangeStr) {
    const dateRange = (dateRangeStr || []).map(parseDate);
    const compDates = (task.completionDates || []).map(parseDate);
    const tr = document.createElement("tr");
    tr.style.background = colors[task.swatchId] || "transparent";

    dateRange.forEach(workDate => {
        const workDateStr = formatDate(workDate);
        const td = document.createElement("td");

        if (task.completionDates.some(str => str == workDateStr)) {
            td.classList.add(workDate < today ? "done-past" : "done-future");
            createIcon(workDate < today ? "fa-check" : "fa-paperclip", td);
        } else {
            const prevCompDate = compDates.find(date => date <= workDate) || null;
            if (prevCompDate) {
                const diff = diffDays(task, prevCompDate, workDate);
                td.classList.add(diff >= 0 ? "pending" : "overdue");
                td.textContent = String(Math.abs(diff));
            } else {
                td.classList.add("normal");
                td.textContent = ".";
            }
        }

        if (holidayDates.has(workDateStr)) td.classList.add("holiday");
        if (workDateStr === todayStr) td.classList.add("today");

        td.dataset.id = task.id;
        td.dataset.date = workDateStr;
        tr.appendChild(td);
    });

    return tr;
}

function renderMemos() {
    clearChildren(memoRoot);
    const ul = document.createElement("ul");
    ul.id = "memo-list";
    ul.className = "outdent task-tree";
    memos.forEach((memo, index) => {
        const li = createMemoLine(memo, index, colors);
        ul.appendChild(li);
    });
    ul.sortableInstance = new Sortable(ul, {
        animation: 150,
        handle: ".task-title",
        disabled: !isSortableEnabled,
        onEnd(evt) {
            execute(() => {
                const moved = memos.splice(evt.oldIndex, 1)[0];
                memos.splice(evt.newIndex, 0, moved);
            });
        }
    });
    memoRoot.appendChild(ul);

    if (!isEditLocked) {
        const addBtn = document.createElement("button");
        addBtn.className = "full-width-btn";
        addBtn.type = "button";
        addBtn.textContent = "➕ 新增備忘";
        addBtn.onclick = () => openMemoEditor(newMemo(), memos.length, true);
        memoRoot.appendChild(addBtn);
    }
}
function createMemoLine(memo, index, colors) {
    const li = document.createElement("li");
    li.className = "task-node";
    li.dataset.index = index;

    const line = document.createElement("div");
    line.className = "task-line";
    line.style.background = colors[memo.swatchId] || "transparent";

    const textSpan = document.createElement("span");
    textSpan.textContent = memo.text;
    textSpan.className = "task-title memo";
    line.append(textSpan);

    if (!isEditLocked) {
        const editBtn = document.createElement("button");
        editBtn.className = "edit-btn";
        editBtn.title = "編輯備忘";
        createIcon("fa-pencil", editBtn);
        editBtn.onclick = () => openMemoEditor(memo, index, false);
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "delete-btn";
        deleteBtn.title = "刪除備忘";
        createIcon("fa-trash", deleteBtn);
        deleteBtn.onclick = () => deleteMemo(index);
        line.append(editBtn, deleteBtn);
    }
    li.appendChild(line);

    return li;
}

function renderLists() {
    clearChildren(listRoot);
    const ul = document.createElement("ul");
    ul.id = "list-container";
    ul.className = "outdent task-tree";
    lists.forEach((list, index) => {
        const li = createListLine(list, index, colors);
        ul.appendChild(li);
    });
    ul.sortableInstance = new Sortable(ul, {
        animation: 150,
        handle: ".task-title",
        disabled: !isSortableEnabled,
        onEnd(evt) {
            execute(() => {
                const moved = lists.splice(evt.oldIndex, 1)[0];
                lists.splice(evt.newIndex, 0, moved);
            });
        }
    });
    listRoot.appendChild(ul);

    if (!isEditLocked) {
        const addBtn = document.createElement("button");
        addBtn.className = "full-width-btn";
        addBtn.type = "button";
        addBtn.textContent = "➕ 新增清單";
        addBtn.onclick = () => openListEditor(newList(), true);
        listRoot.appendChild(addBtn);
    }
}
function createListLine(list, index, colors) {
    const li = document.createElement("li");
    li.className = "task-node";
    li.dataset.index = index;

    // 標題列
    const titleRow = createListTitle(list);
    li.appendChild(titleRow);

    // 表格
    const tableDiv = createListTable(list);
    li.appendChild(tableDiv);

    return li;
}
function createListTitle(list) {
    const titleRow = document.createElement("div");
    titleRow.className = "task-line";
    const title = document.createElement("span");
    title.textContent = list.name;
    title.className = "task-title memo";
    titleRow.append(title);

    if (!isEditLocked) {
        const btnBar = document.createElement("span");
        btnBar.className = "controls";
        const editBtn = document.createElement("button");
        editBtn.className = "edit-btn";
        editBtn.title = "編輯清單";
        createIcon("fa-pencil", editBtn);
        editBtn.onclick = () => openListEditor(list, false);
        const clearBtn = document.createElement("button");
        clearBtn.className = "clear-btn";
        clearBtn.title = "清除所有完成";
        createIcon("fa-eraser", clearBtn);
        clearBtn.onclick = () => clearListDone(list);
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "delete-btn";
        deleteBtn.title = "刪除清單";
        createIcon("fa-trash", deleteBtn);
        deleteBtn.onclick = () => deleteList(list.id);
        btnBar.append(editBtn, clearBtn, deleteBtn);
        titleRow.append(btnBar);
    }
    return titleRow;
}
function createListTable(list) {
    const tableDiv = document.createElement("div");
    tableDiv.id = list.id;
    tableDiv.className = "calendar-column";
    tableDiv.setAttribute("data-scrollable", "");
    const table = document.createElement("table");
    table.className = "calendar-table";
    table.style.background = colors[list.swatchId] || "transparent";
    const tbody = document.createElement("tbody");
    const trBody = document.createElement("tr");
    for (let j = list.startNumber; j <= list.endNumber; j++) {
        const td = document.createElement("td");
        td.textContent = j;
        td.className = list.doneNumbers.includes(j) ? "done-past" : "normal";
        if (!isEditLocked) {
            td.style.cursor = "pointer";
            td.onclick = () => toggleListItem(list, j);
        }
        trBody.appendChild(td);
    }
    tbody.appendChild(trBody);
    table.appendChild(tbody);
    tableDiv.append(table);
    return tableDiv;
}

// ===========================
// 5. Event delegation
// ===========================
calendarStart.addEventListener("change", refreshAll);
calendarEnd.addEventListener("change", refreshAll);
calendarSelected.addEventListener("change", refreshAll);
document.addEventListener("DOMContentLoaded", showLogin);