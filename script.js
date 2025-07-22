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
    "",           // 無底色
    "#f44336",    // 鮮紅（Red）
    "#ff9800",    // 橘色（Orange）
    "#ffeb3b",    // 黃色（Yellow）
    "#4caf50",    // 綠色（Green）
    "#00bcd4",    // 青色（Cyan）
    "#2196f3",    // 藍色（Blue）
    "#3f51b5",    // 靛色（Indigo）
    "#9c27b0",    // 紫色（Purple）
    "#795548",    // 棕色（Brown）
];
const idMap = new Map();

let tasks = [];
let fileHandle = null;
let currentFilename = "tasks.json";
let downloadBtn = null;
let today;

// 2. File I/O: open, save & toast
function checkFileSystemSupport() {
    const controls = document.getElementById("controls");
    controls.innerHTML = "";

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
    sortDates(); updateLastCompleted(tasks);

    const payload = {
        tasks,
        holidays: Array.from(holidayDates)
    };

    const w = await fileHandle.createWritable();
    await w.write(JSON.stringify(payload, null, 2));
    await w.close();
    showToast("已儲存");
}

async function downloadFile() {
    sortDates();
    updateLastCompleted(tasks);

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

function showToast(msg = "已儲存") {
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2000);
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
                task.completionDates.sort();
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
function diffDays(task, d) {
    const last = parseDate(task.lastCompleted);
    const next = new Date(last);
    next.setDate(last.getDate() + task.intervalDays);
    return Math.ceil((next - parseDate(d)) / dayMS);
}
function generateDates(before = 15, after = 15) {
    const arr = [];
    const base = today.getTime();
    for (let i = -before; i <= after; i++) {
        arr.push(new Date(base + i * dayMS));
    }
    return arr;
}
function updateLastCompleted(taskList) {
    const now = today.getTime();

    taskList.forEach(task => {
        const past = (task.completionDates || [])
            .map(ds => parseDate(ds).getTime())
            .filter(t => t <= now);

        task.lastCompleted = past.length
            ? formatDate(new Date(Math.max(...past)))
            : farFuture;

        if (task.children?.length) {
            updateLastCompleted(task.children);
        }
    });
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
function openTaskEditor(task, parentArray = null) {
    document.querySelector("#task-editor")?.remove();

    const editor = document.createElement("div");
    editor.id = "task-editor";
    editor.className = "task-editor";
    editor.innerHTML = `
    <label>任務名稱：</label>
    <input type="text" id="edit-title" value="${task.title || ""}">

    <label>週期（天）：</label>
    <input type="number" id="edit-interval" value="${task.intervalDays || 7}">

    <label>底色：</label>
    <div class="color-swatches">
      ${colors.map(c => `
        <button class="swatch ${task.bgColor === c ? 'selected' : ''}"
                style="background:${c || 'transparent'}"
                data-color="${c}" title="${c || '無'}"></button>
      `).join("")}
    </div>

    <div class="editor-buttons">
      <button id="save-task">儲存</button>
      <button id="cancel-task">取消</button>
      ${!parentArray ? `<button id="delete-task">刪除任務</button>` : ""}
    </div>
  `;
    document.body.appendChild(editor);

    // 選色行為
    editor.querySelectorAll(".swatch").forEach(btn => {
        btn.onclick = () => {
            editor.querySelectorAll(".swatch").forEach(b => b.classList.remove("selected"));
            btn.classList.add("selected");
            task.bgColor = btn.dataset.color || null;
        };
    });

    // 儲存
    editor.querySelector("#save-task").onclick = () => {
        task.title = editor.querySelector("#edit-title").value.trim() || "（未命名）";
        task.intervalDays = +editor.querySelector("#edit-interval").value || 0;

        if (parentArray) parentArray.push(task);

        saveFile();
        refreshAll();
        editor.remove();
    };

    editor.querySelector("#cancel-task").onclick = () => editor.remove();

    // 刪除（僅編輯時提供）
    if (!parentArray) {
        editor.querySelector("#delete-task").onclick = () => {
            if (confirm("確定要刪除這個任務？")) {
                const path = findTaskPath(task);
                const { parent, index } = getTaskByPath(path);
                parent.splice(index, 1);
                saveFile();
                refreshAll();
                editor.remove();
            }
        };
    }
}
function newTask() {
    return {
        id: Date.now().toString(),
        title: "",
        intervalDays: 0,
        lastCompleted: farFuture,
        completionDates: [],
        collapsed: true,
        children: []
    };
}
// 3c. Initialize
function refreshAll() {
    today = parseDate(new Date());
    updateLastCompleted(tasks);
    buildIdMap(tasks);
    renderTreeRoot();
    renderCalendar();
}

// 4a. Render task tree
function renderTreeRoot() {
    treeRoot.innerHTML = "";

    renderTree(tasks, treeRoot);

    const rootAddBtn = document.createElement("button");
    rootAddBtn.className = "add-root-task-btn";
    rootAddBtn.textContent = "➕ 新增任務";
    rootAddBtn.onclick = () => {
        const t = newTask();
        openTaskEditor(t, tasks);

        saveFile();
        refreshAll();
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
        titleSpan.textContent = task.title;

        const ctr = document.createElement("span");
        ctr.className = "controls";
        ctr.innerHTML = `
      <button class="edit-btn" title="編輯任務">🛠️</button>
      <button class="add-child-btn" title="新增子任務">➕</button>`;

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
            refreshAll();
        }
    });

    parentEl.appendChild(ul);
}

// 4b. Render calendar grid
function renderCalendar() {
    const dates = generateDates();
    const dsArr = dates.map(formatDate);
    const todayStr = formatDate(today);

    // header
    dateHead.innerHTML = "";
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
    calBody.innerHTML = "";
    const bodyFrag = document.createDocumentFragment();
    flattenTasks(tasks).forEach(task => {
        const tr = document.createElement("tr");
        tr.style.background = task.bgColor || "transparent";

        const compSet = new Set(task.completionDates || []);
        const lastTime = parseDate(task.lastCompleted).getTime();
        const todayTime = today.getTime();

        dsArr.forEach(ds => {
            const td = document.createElement("td");
            const currT = parseDate(ds).getTime();

            if (compSet.has(ds)) {
                td.classList.add(currT <= todayTime ? "done-past" : "done-future");
                td.textContent = currT <= todayTime ? "✔︎" : "🕒";
            }
            else if (currT <= lastTime) {
                td.classList.add("normal");
                td.textContent = ".";
            }
            else {
                const diff = diffDays(task, ds);
                td.classList.add(diff >= 0 ? "pending" : "overdue");
                td.textContent = String(Math.abs(diff));
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

// 5. Event delegation & init
document.addEventListener("DOMContentLoaded", checkFileSystemSupport);

dateHead.addEventListener("click", e => {
    const th = e.target.closest("th[data-date]");
    if (!th) return;

    const ds = th?.dataset?.date;
    if (!ds) return;

    if (holidayDates.has(ds)) holidayDates.delete(ds);
    else holidayDates.add(ds);

    refreshAll();
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
        refreshAll();
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

    // 修正 lastCompleted：僅更新今天以前的完成記錄
    if (found.completionDates.length) {
        const valid = found.completionDates
            .map(str => {
                const [y, m, d] = str.split("-").map(Number);
                return new Date(y, m - 1, d);
            })
            .filter(d => d <= today);

        if (valid.length) {
            const latest = valid.sort((a, b) => b - a)[0];
            found.lastCompleted = formatDate(latest);
        } else {
            found.lastCompleted = farFuture;
        }
    } else {
        found.lastCompleted = farFuture;
    }

    await saveFile();
    refreshAll();
});