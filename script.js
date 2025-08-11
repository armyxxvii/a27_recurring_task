// ===========================
// 1. DOM nodes & global state
// ===========================
const treeRoot = document.getElementById("task-tree-root");
const dateHead = document.getElementById("date-header");
const calStart = document.getElementById("calendar-start");
const calEnd = document.getElementById("calendar-end");
const calBody = document.getElementById("calendar-body");
const toast = document.getElementById("save-toast");
const listroot = document.getElementById("list-root");
const listContainer = document.getElementById("list-container");
const memoroot = document.getElementById("memo-root");
const memoList = document.getElementById("memo-list");

const undoStack = [];
const redoStack = [];
const holidayDates = new Set();
const farFuture = "2700-02-27";
const dayMS = 1000 * 60 * 60 * 24;
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
let fileHandle = null;
let currentFilename = "tasks.json";
let downloadBtn = null;
let today;
let calendarStartDate = null;
let calendarEndDate = null;
let toggleSortableBtn;
let isSortableEnabled = false;

// ===========================
// 2. File I/O: open, save
// ===========================
function checkFileSystemSupport() {
    const controls = document.getElementById("controls");
    clearChildren(controls);

    if (window.showOpenFilePicker) {
        const openBtn = document.createElement("button");
        openBtn.textContent = "開啟任務 JSON";
        openBtn.type = "button";
        openBtn.onpointerdown = openFile;
        controls.appendChild(openBtn);
    } else {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = inputFile;
        controls.appendChild(input);

        downloadBtn = document.createElement("button");
        downloadBtn.textContent = "下載任務檔";
        downloadBtn.type = "button";
        downloadBtn.onpointerdown = downloadFile;
        downloadBtn.disabled = true;
        controls.appendChild(downloadBtn);
    }
}
async function openFile() {
    [fileHandle] = await window.showOpenFilePicker({
        types: [{ description: "JSON", accept: { "application/json": [".json"] } }]
    });
    const file = await fileHandle.getFile();
    if (file) await loadFile(file);
}
async function inputFile(event) {
    const file = event.target.files[0];
    if (file) {
        currentFilename = file.name;
        await loadFile(file);
        if (downloadBtn) downloadBtn.disabled = false;
    }
}
async function loadFile(file) {
    const text = await file.text();
    let data = JSON.parse(text || "{}");

    const headerTitle = document.querySelector("header h1");
    if (headerTitle) headerTitle.textContent = file.name;

    if (data.calendarRange) {
        calendarStartDate = data.calendarRange.start ? parseDate(data.calendarRange.start) : null;
        calStart.value = data.calendarRange.start;
        calendarEndDate = data.calendarRange.end ? parseDate(data.calendarRange.end) : null;
        calEnd.value = data.calendarRange.end;
    }

    if (Array.isArray(data.tasks)) {
        tasks = data.tasks;
        holidayDates.clear();
        (data.holidays || []).forEach(d => holidayDates.add(d));
    } else {
        tasks = [];
        holidayDates.clear();
    }

    memos = Array.isArray(data.memos) ? data.memos : [];

    // lists: 保持 doneNumbers 為 array
    if (Array.isArray(data.lists)) {
        lists = data.lists.map(list => ({
            ...list,
            doneNumbers: Array.isArray(list.doneNumbers) ? list.doneNumbers : []
        }));
    } else {
        lists = [];
    }

    currentFilename = file.name || currentFilename;
    refreshAll();
    showToast("已載入");
}
async function saveFile() {
    lists.forEach(list => {
        if (!list.id) list.id = generateUniqueId();
    });
    sortDates();
    refreshAll();

    if (fileHandle) {
        const w = await fileHandle.createWritable();
        await w.write(JSON.stringify(getPayload(), null, 2));
        await w.close();
        showToast("已儲存");
    } else showToast("修改未儲存");
}
async function downloadFile() {
    sortDates();
    const blob = new Blob([JSON.stringify(getPayload(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = currentFilename.endsWith(".json") ? currentFilename : `${currentFilename}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("已下載");
}
function getPayload() {
    return {
        tasks,
        holidays: Array.from(holidayDates),
        calendarRange: {
            start: calendarStartDate ? formatDate(calendarStartDate) : null,
            end: calendarEndDate ? formatDate(calendarEndDate) : null
        },
        memos,
        lists
    };
}

// ===========================
// 撤銷 / 重做
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
    saveFile();
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
    saveFile();
}
/** 通用函式：保存狀態、執行功能並保存文件 */
function execute(action) {
    saveState();
    action();
    saveFile();
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
    const next = new Date(last.getTime() + task.intervalDays * dayMS);
    const target = parseDate(targetDate);
    return Math.ceil((next - target) / dayMS);
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
        calendarStartDate = calStart.value ? parseDate(calStart.value) : null;
        calendarEndDate = calEnd.value ? parseDate(calEnd.value) : null;
    });
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
// 3b. Tasks
// ===========================
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
function toggleTaskCollapse(event) {
    const li = event.target.closest(".task-node");
    if (!li) return;
    const path = li.dataset.path.split(",").map(Number);
    const { task } = getTaskByPath(path);
    if (event.target.matches(".toggle-btn")) {
        execute(() => { task.collapsed = !task.collapsed; });
    } else if (event.target.matches(".add-child-btn")) {
        if (!Array.isArray(task.children)) task.children = [];
        openTaskEditor(newTask(), task.children);
    } else if (event.target.matches(".edit-btn")) {
        openTaskEditor(task);
    }
}

// ===========================
// 3c. Memo & List
// ===========================
function deleteMemo(index) {
    if (confirm("確定要刪除這個備忘事項？")) {
        execute(() => { memos.splice(index, 1); });
    }
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
function deleteList(id) {
    execute(() => { lists = lists.filter(list => list.id !== id); });
}

// ===========================
// 3d. Window (Editor)
// ===========================
function openTaskEditor(task, parentArray = null) {
    document.querySelector("#task-editor")?.remove();
    const editor = document.createElement("div");
    editor.id = "task-editor";
    editor.className = "editor";
    // 任務名稱
    const labelTitle = document.createElement("label");
    labelTitle.textContent = "任務名稱：";
    const inputTitle = document.createElement("input");
    inputTitle.type = "text";
    inputTitle.id = "edit-title";
    inputTitle.value = task.title || "";
    // 週期
    const labelInterval = document.createElement("label");
    labelInterval.textContent = "週期（天）：";
    const inputInterval = document.createElement("input");
    inputInterval.type = "number";
    inputInterval.id = "edit-interval";
    inputInterval.value = task.intervalDays || 7;
    // 底色
    const labelColor = document.createElement("label");
    labelColor.textContent = "底色：";
    const swatchContainer = createColorSwatches(task.swatchId, (btn, swatchId) => {
        swatchContainer.querySelectorAll(".swatch").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        task.swatchId = swatchId;
    });
    // 編輯按鈕區
    const editorButtons = document.createElement("div");
    editorButtons.className = "editor-buttons";
    const saveBtn = document.createElement("button");
    saveBtn.id = "save-task";
    saveBtn.textContent = "儲存";
    const cancelBtn = document.createElement("button");
    cancelBtn.id = "cancel-task";
    cancelBtn.textContent = "取消";
    editorButtons.append(saveBtn, cancelBtn);
    if (!parentArray) {
        const deleteBtn = document.createElement("button");
        deleteBtn.id = "delete-task";
        deleteBtn.textContent = "刪除任務";
        editorButtons.append(deleteBtn);
    }
    editor.append(labelTitle, inputTitle, labelInterval, inputInterval, labelColor, swatchContainer, editorButtons);
    document.body.appendChild(editor);
    saveBtn.onpointerdown = () => {
        execute(() => {
            task.title = inputTitle.value.trim() || "（未命名）";
            task.intervalDays = +inputInterval.value || 0;
            if (parentArray) parentArray.push(task);
        });
        editor.remove();
    };
    cancelBtn.onpointerdown = () => editor.remove();
    if (!parentArray) {
        editor.querySelector("#delete-task").onpointerdown = () => {
            if (confirm("確定要刪除這個任務？")) {
                execute(() => {
                    const path = findTaskPath(task);
                    const { parent, index } = getTaskByPath(path);
                    parent.splice(index, 1);
                });
                editor.remove();
            }
        };
    }
}
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
function openMemoEditor(memo, index) {
    document.querySelector(".editor")?.remove();
    const isNew = !memo;
    memo = memo || { text: "", swatchId: 0 };
    const editor = document.createElement("div");
    editor.className = "editor";
    const label = document.createElement("label");
    label.textContent = "備忘內容：";
    const textarea = document.createElement("textarea");
    textarea.value = memo.text;
    textarea.rows = 5;
    textarea.style.width = "100%";
    const labelColor = document.createElement("label");
    labelColor.textContent = "底色：";
    const swatchContainer = createColorSwatches(memo.swatchId, (btn, swatchId) => {
        swatchContainer.querySelectorAll(".swatch").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        memo.swatchId = swatchId;
    });
    const editorButtons = document.createElement("div");
    editorButtons.className = "editor-buttons";
    const saveBtn = document.createElement("button");
    saveBtn.textContent = "儲存";
    saveBtn.onclick = () => {
        execute(() => {
            memo.text = textarea.value.trim() || "（未命名）";
            if (isNew) memos.push(memo);
        });
        editor.remove();
    };
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "取消";
    cancelBtn.onclick = () => editor.remove();
    editorButtons.append(saveBtn, cancelBtn);
    editor.append(label, textarea, labelColor, swatchContainer, editorButtons);
    document.body.appendChild(editor);
}
function openListEditor(list) {
    document.querySelector(".editor")?.remove();
    const isNew = !list;
    list = list || {
        id: generateUniqueId(),
        name: "",
        startNumber: 1,
        endNumber: 10,
        swatchId: 0,
        doneNumbers: []
    };
    const editor = document.createElement("div");
    editor.className = "editor";
    const labelName = document.createElement("label");
    labelName.textContent = "清單名稱：";
    const inputName = document.createElement("input");
    inputName.type = "text";
    inputName.value = list.name;
    const labelStart = document.createElement("label");
    labelStart.textContent = "開始編號：";
    const inputStart = document.createElement("input");
    inputStart.type = "number";
    inputStart.value = list.startNumber;
    const labelEnd = document.createElement("label");
    labelEnd.textContent = "結束編號：";
    const inputEnd = document.createElement("input");
    inputEnd.type = "number";
    inputEnd.value = list.endNumber;
    const labelColor = document.createElement("label");
    labelColor.textContent = "底色：";
    const swatchContainer = createColorSwatches(list.swatchId, (btn, swatchId) => {
        swatchContainer.querySelectorAll(".swatch").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        list.swatchId = swatchId;
    });
    const editorButtons = document.createElement("div");
    editorButtons.className = "editor-buttons";
    const saveBtn = document.createElement("button");
    saveBtn.textContent = "儲存";
    saveBtn.onclick = () => {
        execute(() => {
            list.name = inputName.value.trim() || "未命名清單";
            list.startNumber = +inputStart.value || 1;
            list.endNumber = +inputEnd.value || 10;
            if (isNew) lists.push(list);
        });
        editor.remove();
    };
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "取消";
    cancelBtn.onclick = () => editor.remove();
    editorButtons.append(saveBtn, cancelBtn);
    editor.append(labelName, inputName, labelStart, inputStart, labelEnd, inputEnd, labelColor, swatchContainer, editorButtons);
    document.body.appendChild(editor);
}
function showToast(msg = "已儲存") {
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2000);
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
        openTaskEditor(t, tasks);
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
function renderCalendar() {
    clearChildren(dateHead);
    clearChildren(calBody);
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
        bodyFrag.appendChild(tr);
    });
    calBody.appendChild(bodyFrag);
}
function renderMemos() {
    clearChildren(memoList);
    clearChildren(memoroot);
    const ul = document.createElement("ul");
    ul.id = "memo-list";
    ul.className = "task-tree";
    memos.forEach((memo, index) => {
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
        editBtn.onclick = () => openMemoEditor(memo, index);
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "delete-btn";
        deleteBtn.title = "刪除備忘";
        createIcon("fa-trash", deleteBtn);
        deleteBtn.onclick = () => deleteMemo(index);
        line.append(textSpan, editBtn, deleteBtn);
        li.appendChild(line);
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
    addBtn.onclick = () => openMemoEditor();
    memoroot.appendChild(ul);
    memoroot.appendChild(addBtn);
}
function renderLists() {
    clearChildren(listContainer);
    clearChildren(listroot);
    const ul = document.createElement("ul");
    ul.id = "list-container";
    ul.className = "task-tree";
    lists.forEach((list, index) => {
        const li = document.createElement("li");
        li.className = "task-node";
        li.dataset.index = index;
        const titleRow = createListTitleRow(list);
        li.appendChild(titleRow);
        const tableDiv = createListTable(list);
        li.appendChild(tableDiv);
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
    addBtn.onclick = () => openListEditor();
    listroot.appendChild(ul);
    listroot.appendChild(addBtn);
}
function createListTitleRow(list) {
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
    editBtn.onclick = () => openListEditor(list);
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
document.addEventListener("DOMContentLoaded", checkFileSystemSupport);
dateHead.addEventListener("click", toggleHoliday);
treeRoot.addEventListener("click", toggleTaskCollapse);
document.getElementById("apply-range-btn").addEventListener("click", updateDateRange);
document.getElementById("calendar-table").addEventListener("click", toggleComplete);
document.getElementById("undo-btn").addEventListener("click", undo);
document.getElementById("redo-btn").addEventListener("click", redo);