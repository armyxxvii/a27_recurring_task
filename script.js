// 1. DOM nodes & global state
const openBtn = document.getElementById("open-file-btn");
const treeRoot = document.getElementById("task-tree-root");
const calTable = document.getElementById("calendar-table");
const dateHead = document.getElementById("date-header");
const calBody = document.getElementById("calendar-body");
const toast = document.getElementById("save-toast");
const farFuture = "2700-02-27";
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

let tasks = [];
let fileHandle = null;
let currentFilename = "tasks.json";
let today;

// 2. File I/O: open, save & toast
function checkFileSystemSupport() {
    const supported = !!window.showOpenFilePicker;
    const controls = document.getElementById("controls");
    controls.innerHTML = "";

    if (supported) {
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

        const saveBtn = document.createElement("button");
        saveBtn.textContent = "下載任務檔";
        saveBtn.onclick = downloadFile;
        controls.appendChild(saveBtn);
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
    if (file) await loadFile(file);
}

async function loadFile(file) {
    currentFilename = file.name;
    const text = await file.text();
    tasks = text.trim() ? JSON.parse(text) : [];
    refreshAll();
    showToast("已載入任務");
}

async function saveFile() {
    if (!fileHandle) return;

    sortDates();

    const w = await fileHandle.createWritable();
    await w.write(JSON.stringify(tasks, null, 2));
    await w.close();
    showToast("已儲存");
}

async function downloadFile() {
    sortDates();

    const json = JSON.stringify(tasks, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = currentFilename || "tasks.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast("已下載任務檔");
}

function showToast(msg = "已儲存") {
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2000);
}

// 3. Date utils & flatten tasks
function formatDate(d) {
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}

/**
 * parseDate
 *  - 如果传进来的是 Date，就归零时分秒
 *  - 如果是字串 "YYYY-MM-DD"，拆分后用本地时区建构
 *  - 其它类型，则让 Date 构造器去处理
 */
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
    return d.getFullYear() === today.getFullYear()
        && d.getMonth() === today.getMonth()
        && d.getDate() === today.getDate();
}

function diffDays(task, d) {
    // 用 parseDate 取出正确的本地日期
    const last = parseDate(task.lastCompleted);
    const next = new Date(last);
    next.setDate(last.getDate() + task.intervalDays);

    const current = parseDate(d);
    return Math.ceil((next - current) / (1000 * 60 * 60 * 24));
}

function flattenTasks(data, parentPath = [], visible = true) {
    const list = [];

    data.forEach((task, index) => {
        const path = [...parentPath, task.title];

        if (visible) {
            list.push({ ...task, fullTitle: path.join(" / "), isSpacer: false });
        }

        const showChildren = !task.collapsed;
        if (task.children?.length) {
            list.push(...flattenTasks(task.children, path, showChildren));
        }
    });
    return list;
}

// 根據 path 陣列找到對應的任務以及父陣列
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
        task.intervalDays = +editor.querySelector("#edit-interval").value || 7;

        // 如果是新增任務（有 parentArray），就加入資料陣列
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

function refreshAll() {
    today = parseDate(new Date());
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
        toggleBtn.innerHTML = `<span>${task.collapsed ? "⯈" : "⯆"}</span>`;

        const hasChildren = Array.isArray(task.children) && task.children.length > 0;
        if (!hasChildren) {
            toggleBtn.disabled = true;
            task.collapsed = true;
        } else {
            toggleBtn.onclick = () => {
                task.collapsed = !task.collapsed;
                saveFile();
                refreshAll();
            };
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

        new Sortable(ul, {
            animation: 150,
            handle: ".task-title", // 或其他控制區域
            onEnd(evt) {
                const li = evt.item.closest(".task-node");
                const parentPath = li.dataset.path.split(",").map(n => +n);
                const { parent } = getTaskByPath([...parentPath]);

                const moved = parent.splice(evt.oldIndex, 1)[0];
                parent.splice(evt.newIndex, 0, moved);

                saveFile();
                refreshAll();
            }
        });
    });

    parentEl.appendChild(ul);
}

// 4b. Render calendar grid
function renderCalendar() {
    const dates = generateDates();
    // header
    dateHead.innerHTML = "";
    dates.forEach(d => {
        const th = document.createElement("th");
        th.textContent = formatDate(d).slice(5);
        if (isToday(d)) th.classList.add("today");
        dateHead.appendChild(th);
    });

    // body
    calBody.innerHTML = "";
    flattenTasks(tasks).forEach(task => {
        const tr = document.createElement("tr");
        tr.style.background = task.bgColor || "transparent";

        const lastDate = parseDate(task.lastCompleted);
        dates.forEach(d => {
            const ds = formatDate(d);
            const current = parseDate(ds);
            const td = document.createElement("td");

            if (task.completionDates?.includes(ds)) {
                if (d <= today) {
                    td.className = "done-past"; td.textContent = "✔︎";
                } else {
                    td.className = "done-future"; td.textContent = "🕒";
                }
            } else if (current <= lastDate) {
                td.className = "normal"; td.textContent = ".";
            } else {
                const diff = diffDays(task, ds);
                if (diff >= 0) {
                    td.className = "pending"; td.textContent = diff;
                } else {
                    td.className = "overdue"; td.textContent = -diff;
                }
            }

            td.dataset.id = task.id;
            td.dataset.date = ds;
            tr.appendChild(td);
        });
        calBody.appendChild(tr);
    });
}
function generateDates(before = 15, after = 15) {
    const arr = [];
    for (let i = -before; i <= after; i++) {
        const d = parseDate(today);
        d.setDate(today.getDate() + i);
        arr.push(d);
    }
    return arr;
}

// 5. Event delegation & init
document.addEventListener("DOMContentLoaded", checkFileSystemSupport);

treeRoot.addEventListener("click", e => {
    const btn = e.target.closest("button");
    const li = btn?.closest(".task-node, .add-row");
    if (!btn || !li) return;

    const path = (li.dataset.path || "")
        .split(",").filter(s => s).map(n => +n);
    let ref = tasks;
    path.forEach(i => ref = ref[i].children);
    const { task, parent, index } = getTaskByPath(path);

    // add child
    if (btn.matches(".add-child-btn")) {
        const t = newTask();
        openTaskEditor(t, task.children);
    }

    // edit
    if (btn.matches(".edit-btn")) {
        openTaskEditor(task);
    }

    saveFile();
    refreshAll();
});

calTable.addEventListener("click", async e => {
    const td = e.target.closest("td[data-id]");
    if (!td) return;

    const { id, date } = td.dataset;

    // 遞迴尋找原始任務物件
    let found = null;
    function findById(list) {
        for (const task of list) {
            if (task.id === id) {
                found = task;
                return;
            }
            if (task.children?.length) findById(task.children);
        }
    }
    findById(tasks);
    if (!found) return;

    // ✔︎ 切換完成狀態
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
            found.lastCompleted = farFuture; // 沒有有效的完成記錄，重置為遠未來
        }
    } else {
        found.lastCompleted = farFuture; // 沒有記錄，重置為遠未來
    }

    await saveFile();
    refreshAll();
});