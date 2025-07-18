﻿// 1. DOM nodes & global state
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
    a.download = "tasks.json";
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

        // 如果是該層級最後一個任務，插入 spacer
        if (index === data.length - 1 && visible) {
            list.push({ isSpacer: true });
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

function refreshAll() {
    today = parseDate(new Date());
    treeRoot.innerHTML = "";
    renderTree(tasks, treeRoot);
    renderCalendar();
}


// 4a. Render task tree
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
      <button class="color-trigger" title="設定底色" style="background:${task.bgColor || "transparent"}">🎨</button>
      <button class="edit-btn" title="編輯名稱與週期">✏️</button>
      <button class="delete-btn" title="刪除">❌</button>
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
            filter: ".add-row", // 排除 .add-row
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

    const addLi = document.createElement("li");
    addLi.className = "add-row";
    addLi.dataset.path = path.join(",");
    const addBtn = document.createElement("button");
    addBtn.className = "add-sibling-tail-btn";
    addBtn.textContent = "➕";
    addBtn.title = "新增同級任務";
    addLi.appendChild(addBtn);
    ul.appendChild(addLi);

    parentEl.appendChild(ul);
}
function showColorPicker(triggerBtn, task) {
    const existing = document.getElementById("color-popup");
    if (existing) existing.remove(); // 清除其他視窗

    const popup = document.createElement("div");
    popup.id = "color-popup";
    popup.className = "color-popup";
    colors.forEach(c => {
        const btn = document.createElement("button");
        btn.className = "color-option";
        btn.style.background = c || "transparent";
        if (task.bgColor === c) btn.classList.add("selected");
        btn.title = c || "無底色";
        btn.onclick = () => {
            task.bgColor = c || null;
            popup.remove();
            saveFile();
            refreshAll();
        };
        popup.appendChild(btn);
    });

    document.body.appendChild(popup);

    // 對齊按鈕位置（絕對定位）
    const rect = triggerBtn.getBoundingClientRect();
    popup.style.top = `${rect.bottom + window.scrollY}px`;
    popup.style.left = `${rect.left + window.scrollX}px`;
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

        if (task.isSpacer) {
            const spacerTd = document.createElement("td");
            spacerTd.className = "spacer-row";
            spacerTd.colSpan = dates.length;
            tr.appendChild(spacerTd);
            calBody.appendChild(tr);
            return;
        }

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
                td.className = "outdate"; td.textContent = "-";
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

// helper: generate date range
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
document.addEventListener("DOMContentLoaded", () => {
    checkFileSystemSupport();
    //refreshAll();
});

treeRoot.addEventListener("click", e => {
    const btn = e.target.closest("button");
    const li = btn?.closest(".task-node, .add-row");
    if (!btn || !li) return;

    const path = (li.dataset.path || "")
        .split(",").filter(s => s).map(n => +n);
    let ref = tasks;
    path.forEach(i => ref = ref[i].children);

    // add child
    if (btn.matches(".add-child-btn")) {
        const { task } = getTaskByPath(path);
        const t = prompt("子任務名稱？");
        if (t) {
            task.children ||= [];
            task.children.push({
                id: Date.now().toString(),
                title: t.trim(),
                intervalDays: 7,
                lastCompleted: farFuture,
                completionDates: [],
                collapsed: false,
                children: []
            });
        }
    }

    // edit
    if (btn.matches(".edit-btn")) {
        const { task } = getTaskByPath(path);
        const n = prompt("修改名稱？", task.title);
        if (n) task.title = n.trim();
        const v = prompt("修改週期？", task.intervalDays);
        const iv = +v; if (!isNaN(iv) && iv > 0) task.intervalDays = iv;
    }

    // delete
    if (btn.matches(".delete-btn")) {
        const { parent, index } = getTaskByPath(path);
        if (confirm("刪除？")) parent.splice(index, 1);
    }

    // color trigger
    if (btn.matches(".color-trigger")) {
        const { task } = getTaskByPath(path);
        showColorPicker(btn, task);
    }

    // add sibling
    if (btn.matches(".add-sibling-tail-btn")) {
        const t = prompt("任務名稱？");
        if (t) ref.push({
            id: Date.now().toString(),
            title: t.trim(),
            intervalDays: 7,
            lastCompleted: farFuture,
            completionDates: [],
            collapsed: false,
            children: []
        });
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