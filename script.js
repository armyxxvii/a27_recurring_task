// ===========================
// 1. DOM nodes & global state
// ===========================
const treeRoot = document.getElementById("task-tree-root");
const dateHead = document.getElementById("date-header");
const calendarStart = document.getElementById("calendar-start");
const calendarEnd = document.getElementById("calendar-end");
const calendarBody = document.getElementById("calendar-body");
const toast = document.getElementById("save-toast");
const listRoot = document.getElementById("list-root");
const listContainer = document.getElementById("list-container");
const memoRoot = document.getElementById("memo-root");
const memoList = document.getElementById("memo-list");

const url = "https://script.google.com/macros/s/AKfycbxPcggbgGkQuWVebjOq53HifOJfInpgSDiYnpMfE6oxY_M8PAlBUeclKwnDW5BuxbAO/exec"

const undoStack = [];
const redoStack = [];
const holidayDates = new Set();
const farFuture = "2700-02-27";
const dayMs = 1000 * 60 * 60 * 24;
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
const idMap = new Map();

let tasks = [];
let lists = [];
let memos = [];
let today;
let calendarStartDate = null;
let calendarEndDate = null;
let toggleSortableBtn;
let isSortableEnabled = false;

let currentUser = null;

// ===========================
// 2a. Google Sheets I/O
// ===========================
// 讀取所有資料
async function fetchAllFromGoogleSheet() {
    if (!currentUser) return showLogin();
    showPageDim();
    try {
        const res = await fetch(url + `?user=${encodeURIComponent(currentUser)}`, {
            method: "GET",
            headers: { "Content-Type": "text/plain;charset=utf-8" }
        });
        const data = await res.json();
        tasks = Array.isArray(data.tasks) ? data.tasks : [];
        lists = Array.isArray(data.lists) ? data.lists : [];
        memos = Array.isArray(data.memos) ? data.memos : [];
        holidayDates.clear();
        (data.holidays || []).forEach(d => holidayDates.add(d));
        if (data.calendarRange) {
            calendarStartDate = data.calendarRange.start ? parseDate(data.calendarRange.start) : null;
            calendarEndDate = data.calendarRange.end ? parseDate(data.calendarRange.end) : null;
            calendarStart.value = data.calendarRange.start || "";
            calendarEnd.value = data.calendarRange.end || "";
        }
        refreshAll();
        document.body.classList.remove("unsaved");
        showToast("已從 Google Sheets 讀取");
    } finally {
        hidePageDim();
    }
}
// 儲存所有資料
async function saveAllToGoogleSheet() {
    if (!currentUser) return showLogin();
    showPageDim();
    try {
        lists.forEach(list => {
            if (!list.id) list.id = generateUniqueId();
        });
        sortDates();
        refreshAll();
        const payload = getPayload();
        await fetch(url + `?user=${encodeURIComponent(currentUser)}`, {
            method: "POST",
            body: JSON.stringify(payload),
            headers: { "Content-Type": "text/plain;charset=utf-8" }
        });
        document.body.classList.remove("unsaved");
        showToast("已儲存到 Google Sheets");
    } finally {
        hidePageDim();
    }
}
function getPayload() {
    return {
        user: currentUser,
        holidays: Array.from(holidayDates),
        calendarRange: {
            start: calendarStartDate ? formatDate(calendarStartDate) : null,
            end: calendarEndDate ? formatDate(calendarEndDate) : null
        },
        tasks,
        memos,
        lists
    };
}

// ===========================
// 2b. 撤銷 / 重做
// ===========================
function getCurrentState() {
    return {
        tasks: JSON.parse(JSON.stringify(tasks)),
        lists: JSON.parse(JSON.stringify(lists)),
        memos: JSON.parse(JSON.stringify(memos)),
        holidayDates: new Set(holidayDates),
        calendarStartDate,
        calendarEndDate
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
    tasks = previousState.tasks;
    lists = previousState.lists;
    memos = previousState.memos;
    holidayDates.clear();
    previousState.holidayDates.forEach(date => holidayDates.add(date));
    calendarStartDate = previousState.calendarStartDate;
    calendarEndDate = previousState.calendarEndDate;
    showToast("已撤銷");
    saveAllToGoogleSheet();
}
function redo() {
    if (redoStack.length === 0) {
        showToast("無法重做");
        return;
    }
    const nextState = redoStack.pop();
    undoStack.push(getCurrentState());
    tasks = nextState.tasks;
    lists = nextState.lists;
    memos = nextState.memos;
    holidayDates.clear();
    nextState.holidayDates.forEach(date => holidayDates.add(date));
    calendarStartDate = nextState.calendarStartDate;
    calendarEndDate = nextState.calendarEndDate;
    showToast("已重做");
    saveAllToGoogleSheet();
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
    recurSort(tasks);
}
function diffDays(task, prevCompDate, targetDate) {
    const last = parseDate(prevCompDate);
    const next = new Date(last.getTime() + task.intervalDays * dayMs);
    const target = parseDate(targetDate);
    return Math.ceil((next - target) / dayMs);
}
function generateDates() {
    const result = [];
    const start = calendarStartDate || today;
    const end = calendarEndDate || new Date(start.getTime() + 14 * 86400000);
    let cursor = new Date(start);
    while (cursor <= end) {
        result.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }
    return result;
}
function updateDateRange() {
    execute(() => {
        calendarStartDate = calendarStart.value ? parseDate(calendarStart.value) : null;
        calendarEndDate = calendarEnd.value ? parseDate(calendarEnd.value) : null;
    });
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
            parent.splice(index, 1);
        });
        return true;
    }
    return false;
}
function buildIdMap(list) {
    idMap.clear();
    const stack = [...list];
    while (stack.length) {
        const task = stack.pop();
        idMap.set(task.id, task);
        if (task.children?.length) stack.push(...task.children);
    }
}
function flattenTasks(data, parentPath = [], visible = true) {
    const list = [];
    data.forEach(task => {
        const path = [...parentPath, task.title];
        if (visible) list.push({ ...task, fullTitle: path.join(" / ") });
        const showChildren = !task.collapsed;
        if (showChildren && task.children?.length) {
            list.push(...flattenTasks(task.children, path, showChildren));
        }
    });
    return list;
}
function getTaskByPath(path) {
    let ref = tasks;
    for (let i = 0; i < path.length - 1; i++) ref = ref[path[i]].children;
    return {
        parent: ref,
        index: path[path.length - 1],
        task: ref[path[path.length - 1]]
    };
}
function findTaskPath(target, data = tasks, path = []) {
    for (let i = 0; i < data.length; i++) {
        const t = data[i];
        const currentPath = [...path, i];
        if (t === target) return currentPath;
        if (Array.isArray(t.children)) {
            const childPath = findTaskPath(target, t.children, currentPath);
            if (childPath) return childPath;
        }
    }
    return null;
}
function toggleTaskCollapse(event) {
    const li = event.target.closest(".task-node");
    if (!li) return;
    const path = li.dataset.path.split(",").map(Number);
    const { task } = getTaskByPath(path);
    if (event.target.matches(".toggle-btn")) {
        execute(() => { task.collapsed = !task.collapsed; });
    } else if (event.target.matches(".add-child-btn")) {
        if (!Array.isArray(task.children)) task.children = [];
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
    editor.className = "editor";

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

        if (!options.isNew && typeof options.onDelete === "function") {
            const deleteBtn = document.createElement("button");
            deleteBtn.textContent = "刪除";
            deleteBtn.onclick = () => {
                if (options.onDelete() === true) {
                    editor.remove();
                    hidePageDim();
                }
            };
            editorButtons.append(deleteBtn);
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
        isNew,
        onSave: editor => {
            execute(() => {
                task.title = editor.querySelector("#edit-title").value.trim() || "（未命名）";
                task.intervalDays = +editor.querySelector("#edit-interval").value || 0;
                if (isNew && parentArray) parentArray.push(task);
            });
        },
        onDelete: !isNew ? () => deleteTask(task) : null
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


function showLogin() {
    if (currentUser) {
        renderControls();
        return;
    }
    // 欄位
    const label = document.createElement("label");
    label.textContent = "暱稱（帳號）：";
    const input = document.createElement("input");
    input.type = "text";
    input.id = "login-user";
    input.autofocus = true;
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
                    // 註冊/登入
                    const res = await fetch(url + `?action=register&user=${encodeURIComponent(user)}`, {
                        method: "GET",
                        headers: { "Content-Type": "text/plain;charset=utf-8" }
                    });
                    const data = await res.json();
                    if (data.success) {
                        currentUser = user;
                        renderControls();
                        editor.remove();
                        fetchAllFromGoogleSheet();
                        showToast("登入成功：" + user);
                    } else {
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
    today = parseDate(new Date());
    buildIdMap(tasks);
    renderTreeRoot();
    renderCalendar();
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
    return `list-${Math.random().toString(36).substr(2, 9)}`;
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
    toggleSortableBtn.dataset.enabled = isSortableEnabled ? "true" : "false";
    toggleSortableBtn.textContent = isSortableEnabled ? "禁用排序" : "啟用排序";
}
function toggleSortable() {
    isSortableEnabled = !isSortableEnabled;
    refreshToggleSortableBtn();
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
}

// ===========================
// 4b. Render
// ===========================
function renderControls() {
    const controls = document.getElementById("controls");
    clearChildren(controls);

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
    openBtn.onclick = fetchAllFromGoogleSheet;
    controls.appendChild(openBtn);

    const saveBtn = document.createElement("button");
    saveBtn.title = "儲存到 Google Sheets";
    saveBtn.type = "button";
    createIcon("fa-cloud-arrow-up", saveBtn);
    saveBtn.onclick = saveAllToGoogleSheet;
    controls.appendChild(saveBtn);
}

function renderTreeRoot() {
    clearChildren(treeRoot);
    toggleSortableBtn = document.createElement("button");
    toggleSortableBtn.onclick = () => toggleSortable();
    treeRoot.appendChild(toggleSortableBtn);
    toggleSortableBtn.className = "indent full-width-btn";
    toggleSortableBtn.type = "button";
    refreshToggleSortableBtn();
    renderTree(tasks, treeRoot);
    const rootAddBtn = document.createElement("button");
    rootAddBtn.className = "indent full-width-btn";
    rootAddBtn.textContent = "➕ 新增任務";
    rootAddBtn.type = "button";
    rootAddBtn.onpointerdown = () => {
        const t = newTask();
        openTaskEditor(t, tasks, true);
    };
    treeRoot.appendChild(rootAddBtn);
}
function renderTree(data, parentEl, path = []) {
    const ul = document.createElement("ul");
    ul.className = "task-tree";
    data.forEach((task, i) => {
        const li = document.createElement("li");
        li.className = "task-node " + (task.collapsed ? "collapsed" : "expanded");
        li.dataset.path = [...path, i].join(",");
        const line = createTaskLine(task, [...path, i]);
        li.appendChild(line);
        if (task.children?.length && !task.collapsed) {
            renderTree(task.children, li, [...path, i]);
        }
        ul.appendChild(li);
    });
    ul.sortableInstance = new Sortable(ul, {
        animation: 150,
        handle: ".task-title",
        disabled: !isSortableEnabled,
        onEnd(evt) {
            execute(() => {
                const li = evt.item.closest(".task-node");
                const parentPath = li.dataset.path.split(",").map(n => +n);
                const { parent } = getTaskByPath(parentPath);
                const moved = parent.splice(evt.oldIndex, 1)[0];
                parent.splice(evt.newIndex, 0, moved);
            });
        }
    });
    parentEl.appendChild(ul);
}
function createTaskLine(task, path) {
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
    const editBtn = document.createElement("button");
    editBtn.className = "edit-btn";
    editBtn.title = "編輯任務";
    createIcon("fa-pencil", editBtn);
    const addChildBtn = document.createElement("button");
    addChildBtn.className = "add-child-btn";
    addChildBtn.title = "新增子任務";
    createIcon("fa-baby", addChildBtn);
    ctr.append(editBtn, addChildBtn);

    line.append(toggleBtn, titleSpan, ctr);
    return line;
}

function renderCalendar() {
    clearChildren(dateHead);
    clearChildren(calendarBody);
    const dates = generateDates();
    const dsArr = dates.map(formatDate);
    const todayStr = formatDate(today);
    const headFrag = document.createDocumentFragment();
    dsArr.forEach(ds => {
        const th = document.createElement("th");
        th.textContent = ds.slice(5);
        th.dataset.date = ds;
        th.title = "點擊設定 / 取消休假日";
        if (holidayDates.has(ds)) th.classList.add("holiday");
        if (ds === todayStr) th.classList.add("today");
        headFrag.appendChild(th);
    });
    dateHead.appendChild(headFrag);
    const bodyFrag = document.createDocumentFragment();
    flattenTasks(tasks).forEach(task => {
        const tr = createCalendarRow(task, dsArr, todayStr, colors);
        bodyFrag.appendChild(tr);
    });
    calendarBody.appendChild(bodyFrag);
}
function createCalendarRow(task, dsArr, todayStr, colors) {
    const tr = document.createElement("tr");
    tr.style.background = colors[task.swatchId] || "transparent";
    const compDates = (task.completionDates || []).map(parseDate);

    dsArr.forEach(ds => {
        const td = document.createElement("td");
        const currDate = parseDate(ds);
        const prevCompDate = compDates.find(d => d <= currDate) || null;

        if (compDates.some(d => formatDate(d) === formatDate(currDate))) {
            td.classList.add(currDate <= today ? "done-past" : "done-future");
            createIcon(currDate <= today ? "fa-check" : "fa-paperclip", td);
        } else if (prevCompDate) {
            const diff = diffDays(task, prevCompDate, currDate);
            td.classList.add(diff >= 0 ? "pending" : "overdue");
            td.textContent = String(Math.abs(diff));
        } else {
            td.classList.add("normal");
            td.textContent = ".";
        }

        if (holidayDates.has(ds)) td.classList.add("holiday");
        if (ds === todayStr) td.classList.add("today");

        td.dataset.id = task.id;
        td.dataset.date = ds;
        tr.appendChild(td);
    });

    return tr;
}

function renderMemos() {
    clearChildren(memoList);
    clearChildren(memoRoot);
    const ul = document.createElement("ul");
    ul.id = "memo-list";
    ul.className = "task-tree";
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
    const addBtn = document.createElement("button");
    addBtn.className = "indent full-width-btn";
    addBtn.type = "button";
    addBtn.textContent = "➕ 新增備忘";
    addBtn.onclick = () => openMemoEditor(newMemo(), memos.length, true);
    memoRoot.appendChild(ul);
    memoRoot.appendChild(addBtn);
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
    textSpan.className = "task-title";
    textSpan.style.margin = "3px";

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

    line.append(textSpan, editBtn, deleteBtn);
    li.appendChild(line);

    return li;
}

function renderLists() {
    clearChildren(listContainer);
    clearChildren(listRoot);
    const ul = document.createElement("ul");
    ul.id = "list-container";
    ul.className = "task-tree";
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
    const addBtn = document.createElement("button");
    addBtn.className = "indent full-width-btn";
    addBtn.type = "button";
    addBtn.textContent = "➕ 新增清單";
    addBtn.onclick = () => openListEditor(newList(), true);
    listRoot.appendChild(ul);
    listRoot.appendChild(addBtn);
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
    title.className = "task-title";
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
    titleRow.append(title, btnBar);
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
        td.style.cursor = "pointer";
        td.onclick = () => toggleListItem(list, j);
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
document.addEventListener("DOMContentLoaded", showLogin);
dateHead.addEventListener("click", toggleHoliday);
treeRoot.addEventListener("click", toggleTaskCollapse);
document.getElementById("apply-range-btn").addEventListener("click", updateDateRange);
document.getElementById("calendar-table").addEventListener("click", toggleComplete);