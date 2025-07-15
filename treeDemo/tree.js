document.addEventListener("DOMContentLoaded", () => {
    const rootEl = document.getElementById("task-tree-root");

    // 載入或初始化任務資料
    let tasks = JSON.parse(localStorage.getItem("taskTree")) || [];

    function save() {
        localStorage.setItem("taskTree", JSON.stringify(tasks));
    }

    function getTaskByPath(path) {
        let ref = tasks;
        for (let i = 0; i < path.length - 1; i++) {
            ref = ref[path[i]].children;
        }
        return {
            parent: ref,
            index: path[path.length - 1],
            task: ref[path[path.length - 1]]
        };
    }

    function renderTree(data, parentEl, path = []) {
        const ul = document.createElement("ul");
        ul.className = "task-tree";

        data.forEach((task, idx) => {
            const li = document.createElement("li");
            li.className = "task-node";
            li.dataset.path = [...path, idx].join(",");
            li.classList.add(task.collapsed ? "collapsed" : "expanded");

            // 展開/收合按鈕
            const toggleBtn = document.createElement("button");
            toggleBtn.className = "toggle-btn";
            toggleBtn.innerHTML = task.children?.length
                ? `<span class="chevron">▶</span>`
                : "";
            toggleBtn.onclick = () => {
                task.collapsed = !task.collapsed;
                save();
                refresh();
            };

            // 任務標題
            const titleSpan = document.createElement("span");
            titleSpan.className = "task-title";
            titleSpan.textContent = task.title;

            // 子任務控制按鈕
            const controls = document.createElement("span");
            controls.className = "controls";
            controls.innerHTML = `
        <button class="edit-btn"    title="編輯任務">✏️</button>
        <button class="delete-btn"  title="刪除任務">🗑️</button>
        <button class="add-child-btn" title="新增子任務">➕</button>
      `;

            const line = document.createElement("div");
            line.className = "task-line";
            line.append(toggleBtn, titleSpan, controls);
            li.appendChild(line);

            // 遞迴渲染子任務
            if (task.children?.length && !task.collapsed) {
                renderTree(task.children, li, [...path, idx]);
            }

            ul.appendChild(li);
        });

        // 每層底部新增同層任務按鈕
        const addRow = document.createElement("li");
        addRow.className = "add-row";
        addRow.dataset.path = path.join(",");
        const addBtn = document.createElement("button");
        addBtn.className = "add-sibling-tail-btn";
        addBtn.textContent = "➕";
        addBtn.title = path.length === 0 ? "新增最上層任務" : "新增子任務";
        addRow.appendChild(addBtn);
        ul.appendChild(addRow);

        parentEl.appendChild(ul);

        // 同層拖曳排序
        Sortable.create(ul, {
            animation: 150,
            handle: ".task-title",
            onEnd: e => {
                const from = e.oldIndex;
                const to = e.newIndex;
                const pathStr = ul.parentElement?.dataset.path || "";
                const layerPath = pathStr === ""
                    ? []
                    : pathStr.split(",").map(n => parseInt(n));
                let ref = tasks;
                for (const i of layerPath) {
                    ref = ref[i].children;
                }
                const moved = ref.splice(from, 1)[0];
                ref.splice(to, 0, moved);
                save();
                refresh();
            }
        });
    }

    function refresh() {
        rootEl.innerHTML = "";
        renderTree(tasks, rootEl);
    }

    // 事件委派：處理所有按鈕
    rootEl.addEventListener("click", e => {
        const btn = e.target.closest("button");
        const li = btn?.closest(".task-node, .add-row");
        if (!btn || !li) return;

        const pathStr = li.dataset.path || "";
        const path = pathStr === ""
            ? []
            : pathStr.split(",").map(n => parseInt(n));

        let ref = tasks;
        for (const i of path) {
            ref = ref[i].children;
        }

        // 新增子任務
        if (btn.classList.contains("add-child-btn")) {
            const { task } = getTaskByPath(path);
            const title = prompt("輸入子任務名稱：");
            if (title?.trim()) {
                task.children ||= [];
                task.children.push({
                    id: Date.now().toString(),
                    title: title.trim(),
                    collapsed: false,
                    children: []
                });
                save();
                refresh();
            }
        }

        // 底部新增同層任務
        if (btn.classList.contains("add-sibling-tail-btn")) {
            const title = prompt("輸入任務名稱：");
            if (title?.trim()) {
                ref.push({
                    id: Date.now().toString(),
                    title: title.trim(),
                    collapsed: false,
                    children: []
                });
                save();
                refresh();
            }
        }

        // 編輯任務
        if (btn.classList.contains("edit-btn")) {
            const { task } = getTaskByPath(path);
            const newTitle = prompt("修改任務名稱：", task.title);
            if (newTitle?.trim()) {
                task.title = newTitle.trim();
                save();
                refresh();
            }
        }

        // 刪除任務
        if (btn.classList.contains("delete-btn")) {
            const { parent, index } = getTaskByPath(path);
            if (confirm("確定刪除任務？")) {
                parent.splice(index, 1);
                save();
                refresh();
            }
        }
    });

    refresh();
});