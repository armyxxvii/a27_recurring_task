// 1. DOM nodes & global state
const treeRoot = document.getElementById("task-tree-root");
const calTable = document.getElementById("calendar-table");
const dateHead = document.getElementById("date-header");
const calBody = document.getElementById("calendar-body");
const toast = document.getElementById("save-toast");

const holidayDates = new Set();
const farFuture = "2700-02-27";
const dayMS = 1000 * 60 * 60 * 24;
const colors = [
    "",            // 無底色
    "#b3b3ff",     // 靛紫／輕柔
    "#b0c4de",     // 藍灰／輕柔
    "#fff1a8",     // 沙黃／輕柔
    "#e1bee7",     // 藕色／輕柔
    "#ffe6cc",     // 橘茶／輕柔
    "#bbbbbb",     // 中性灰
    "#5c6bc0",     // 靛紫／溫和
    "#607d8b",     // 藍灰／溫和
    "#fdd835",     // 沙黃／溫和
    "#ab47bc",     // 藕色／溫和
    "#ffb74d",     // 橘茶／溫和
];
const idMap = new Map();

let tasks = [];
let fileHandle = null;
let currentFilename = "tasks.json";
let downloadBtn = null;
let today;
let calendarStartDate = null;
let calendarEndDate = null;


// 2. File I/O: open, save & toast
function checkFileSystemSupport() {
    const controls = document.getElementById("controls");
    clearChildren(controls);

    if (window.showOpenFilePicker) {
        const openBtn = document.createElement("button");
        openBtn.textContent = "開啟任務 JSON";
        openBtn.onclick = openFile;
        controls.appendChild(openBtn);
    } else {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = inputFile;
        controls.appendChild(input);

        downloadBtn = document.createElement("button");
        downloadBtn.textContent = "下載任務檔";
        downloadBtn.onclick = downloadFile;
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
    let data = JSON.parse(text || "[]");

    const headerTitle = document.querySelector("header h1");
    if (headerTitle) {
        headerTitle.textContent = file.name;
    }

    if (data.calendarRange) {
        calendarStartDate = data.calendarRange.start ? parseDate(data.calendarRange.start) : null;
        document.getElementById("calendar-start").value = data.calendarRange.start;
        calendarEndDate = data.calendarRange.end ? parseDate(data.calendarRange.end) : null;
        document.getElementById("calendar-end").value = data.calendarRange.end;
    }

    if (Array.isArray(data)) {
        tasks = data;
        holidayDates.clear();
    } else {
        tasks = Array.isArray(data.tasks) ? data.tasks : [];
        holidayDates.clear();
        (data.holidays || []).forEach(d => holidayDates.add(d));
    }

    currentFilename = file.name || currentFilename;
    refreshAll();
    showToast("已載入");
}
async function saveFile() {
    if (!fileHandle) return;
    sortDates();

    const payload = {
        tasks,
        holidays: Array.from(holidayDates),
        calendarRange: {
            start: calendarStartDate ? formatDate(calendarStartDate) : null,
            end: calendarEndDate ? formatDate(calendarEndDate) : null
        }
    };

    const w = await fileHandle.createWritable();
    await w.write(JSON.stringify(payload, null, 2));
    await w.close();

    refreshAll();
    showToast("已儲存");
}
async function downloadFile() {
    sortDates();

    const payload = {
        tasks,
        holidays: Array.from(holidayDates)
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = currentFilename.endsWith(".json")
        ? currentFilename
        : `${currentFilename}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("已下載");
}

// 3a. Date
function formatDate(d) {
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}
function parseDate(input) {
    if (input instanceof Date) {
        return new Date(input.getFullYear(), input.getMonth(), input.getDate());
    }
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
            if (task.children?.length) {
                recurSort(task.children);
            }
        });
    }
    recurSort(tasks);
}
function isToday(d) {
    return formatDate(d) === formatDate(today);
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
    const startInput = document.getElementById("calendar-start").value;
    const endInput = document.getElementById("calendar-end").value;

    calendarStartDate = startInput ? parseDate(startInput) : null;
    calendarEndDate = endInput ? parseDate(endInput) : null;

    saveFile();
}

// 3b. Tasks
function buildIdMap(list) {
    idMap.clear();
    const stack = [...list];

    while (stack.length) {
        const task = stack.pop();
        idMap.set(task.id, task);
        if (task.children?.length) {
            stack.push(...task.children);
        }
    }
}
function flattenTasks(data, parentPath = [], visible = true) {
    const list = [];

    data.forEach(task => {
        const path = [...parentPath, task.title];

        if (visible) {
            list.push({ ...task, fullTitle: path.join(" / ") });
        }

        const showChildren = !task.collapsed;
        if (task.children?.length) {
            list.push(...flattenTasks(task.children, path, showChildren));
        }
    });
    return list;
}
function getTaskByPath(path) {
    let ref = tasks;
    // path: [0,2,1] 代表 tasks[0].children[2].children[1]
    for (let i = 0; i < path.length - 1; i++) {
        ref = ref[path[i]].children;
    }
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
    return null; // 沒找到
}
function newTask() {
    return {
        id: Date.now().toString(),
        title: "",
        intervalDays: 0,
        bgColor: "",
        completionDates: [],
        collapsed: true,
        children: []
    };
}

// 3c. Window
function openTaskEditor(task, parentArray = null) {
    document.querySelector("#task-editor")?.remove();

    const editor = document.createElement("div");
    editor.id = "task-editor";
    editor.className = "task-editor";

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
    const swatchContainer = createColorSwatches(task.bgColor, (btn, color) => {
        swatchContainer.querySelectorAll(".swatch").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        task.bgColor = color || "";
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

    // 組合
    editor.append(labelTitle, inputTitle, labelInterval, inputInterval, labelColor, swatchContainer, editorButtons);
    document.body.appendChild(editor);

    saveBtn.onclick = () => {
        task.title = inputTitle.value.trim() || "（未命名）";
        task.intervalDays = +inputInterval.value || 0;
        if (parentArray) parentArray.push(task);
        saveFile();
        editor.remove();
    };
    cancelBtn.onclick = () => editor.remove();
    if (!parentArray) {
        editor.querySelector("#delete-task").onclick = () => {
            if (confirm("確定要刪除這個任務？")) {
                const path = findTaskPath(task);
                const { parent, index } = getTaskByPath(path);
                parent.splice(index, 1);
                saveFile();
                editor.remove();
            }
        };
    }
}
function createColorSwatches(selectedColor, onClick) {
    const container = document.createElement("div");
    container.className = "color-swatches";
    colors.forEach(c => {
        const btn = document.createElement("button");
        btn.className = "swatch" + (selectedColor === c ? " selected" : "");
        btn.style.background = c || "transparent";
        btn.dataset.color = c;
        btn.title = c || "無";
        btn.onclick = () => onClick(btn, c);
        container.appendChild(btn);
    });
    return container;
}
function showToast(msg = "已儲存") {
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2000);
}

// 4a. Render
function refreshAll() {
    today = parseDate(new Date());
    buildIdMap(tasks);
    renderTreeRoot();
    renderCalendar();
}
function clearChildren(parent) {
    while (parent.firstChild) parent.removeChild(parent.firstChild);
}

// 4b. Render task tree
function renderTreeRoot() {
    clearChildren(treeRoot);

    renderTree(tasks, treeRoot);

    const rootAddBtn = document.createElement("button");
    rootAddBtn.className = "add-root-task-btn";
    rootAddBtn.textContent = "➕ 新增任務";
    rootAddBtn.onclick = () => {
        const t = newTask();
        openTaskEditor(t, tasks);
        saveFile();
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
        line.style.background = task.bgColor || "transparent";

        const toggleBtn = document.createElement("button");
        toggleBtn.className = "toggle-btn";
        toggleBtn.innerHTML = `${task.collapsed ? "⯈" : "⯆"}`;

        const hasChildren = Array.isArray(task.children) && task.children.length > 0;
        if (!hasChildren) {
            toggleBtn.disabled = true;
            task.collapsed = true;
        }

        const titleSpan = document.createElement("span");
        titleSpan.className = "task-title";
        titleSpan.textContent = `(${task.intervalDays}) ${task.title}`;

        const ctr = document.createElement("span");
        ctr.className = "controls";
        const editBtn = document.createElement("button");
        editBtn.className = "edit-btn";
        editBtn.title = "編輯任務";
        editBtn.textContent = "🛠️";
        const addChildBtn = document.createElement("button");
        addChildBtn.className = "add-child-btn";
        addChildBtn.title = "新增子任務";
        addChildBtn.textContent = "➕";
        ctr.append(editBtn, addChildBtn);

        line.append(toggleBtn, titleSpan, ctr);
        li.appendChild(line);

        if (task.children?.length && !task.collapsed) {
            renderTree(task.children, li, [...path, i]);
        }

        ul.appendChild(li);
    });

    new Sortable(ul, {
        animation: 150,
        handle: ".task-title",
        onEnd(evt) {
            const li = evt.item.closest(".task-node");
            const parentPath = li.dataset.path.split(",").map(n => +n);
            const { parent } = getTaskByPath(parentPath);

            const moved = parent.splice(evt.oldIndex, 1)[0];
            parent.splice(evt.newIndex, 0, moved);

            saveFile();
        }
    });

    parentEl.appendChild(ul);
}

// 4c. Render calendar grid
function renderCalendar() {
    clearChildren(dateHead);
    clearChildren(calBody);

    const dates = generateDates();
    const dsArr = dates.map(formatDate);
    const todayStr = formatDate(today);

    // header
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

    // body
    const bodyFrag = document.createDocumentFragment();
    flattenTasks(tasks).forEach(task => {
        const tr = document.createElement("tr");
        tr.style.background = task.bgColor || "transparent";
        const compDates = (task.completionDates || []).map(parseDate);

        dsArr.forEach(ds => {
            const td = document.createElement("td");
            const currDate = parseDate(ds);

            // 找到當前日期之前最新的完成日
            const prevCompDate = compDates.find(d => d <= currDate) || null;

            if (compDates.some(d => formatDate(d) === formatDate(currDate))) {
                // 當前日期是完成日
                td.classList.add(currDate <= today ? "done-past" : "done-future");
                td.textContent = currDate <= today ? "✔︎" : "🕒";
            } else if (prevCompDate) {
                // 當前日期之前有完成日
                const diff = diffDays(task, prevCompDate, currDate);
                td.classList.add(diff >= 0 ? "pending" : "overdue");
                td.textContent = String(Math.abs(diff));
            } else {
                // 當前日期在第一個完成日之前
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

// 5. Event delegation
document.addEventListener("DOMContentLoaded", checkFileSystemSupport);

dateHead.addEventListener("click", e => {
    const th = e.target.closest("th[data-date]");
    if (!th) return;

    const ds = th?.dataset?.date;
    if (!ds) return;

    if (holidayDates.has(ds)) holidayDates.delete(ds);
    else holidayDates.add(ds);

    saveFile();
});

treeRoot.addEventListener("click", e => {
    const li = e.target.closest(".task-node");
    if (!li) return;

    const path = li.dataset.path.split(",").map(Number);
    const { task } = getTaskByPath(path);
    let modified = false;

    if (e.target.matches(".toggle-btn")) {
        task.collapsed = !task.collapsed;
        modified = true;
    }
    else if (e.target.matches(".add-child-btn")) {
        if (!Array.isArray(task.children)) {
            task.children = [];
        }
        openTaskEditor(newTask(), task.children);
    }
    else if (e.target.matches(".edit-btn")) {
        openTaskEditor(task);
    }

    if (modified) {
        saveFile();
    }
});

calTable.addEventListener("click", async e => {
    const td = e.target.closest("td[data-id]");
    if (!td) return;

    const { id, date } = td.dataset;

    const found = idMap.get(id);
    if (!found) return;

    // 切換完成狀態
    const i = found.completionDates.indexOf(date);
    if (i >= 0) {
        found.completionDates.splice(i, 1);
    } else {
        found.completionDates.push(date);
    }

    await saveFile();
});