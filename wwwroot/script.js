document.addEventListener('DOMContentLoaded', () => {
	// — Cached DOM nodes —
	const $form = document.getElementById('task-form');
	const $name = document.getElementById('task-name');
	const $interval = document.getElementById('interval-days');
	const $header = document.getElementById('date-header');
	const $body = document.getElementById('calendar-body');

	// — State & Storage —
	let tasks = JSON.parse(localStorage.getItem('tasks')) || [];
	const save = () => localStorage.setItem('tasks', JSON.stringify(tasks));

	// — Helpers —
	const range = (center, before = 15, after = 15) => {
		const arr = [];
		for (let i = -before; i <= after; i++) {
			const d = new Date(center);
			d.setDate(center.getDate() + i);
			arr.push(d);
		}
		return arr;
	};
	const fmt = d => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
	const isoDate = d => d.toISOString().slice(0, 10);
	const isDone = (t, date) => t.completionDates.includes(date);
	const diffDays = (t, d) => {
		const next = new Date(t.lastCompleted);
		next.setDate(next.getDate() + t.intervalDays);
		return Math.ceil((next - d) / (1000 * 60 * 60 * 24));
	};

	// — Rendering —
	function render() {
		const today = new Date();
		const dates = range(today);

		// header
		$header.innerHTML = [
			'<th>任務</th><th>功能</th>',
			...dates.map(d => `<th>${fmt(d)}</th>`)
		].join('');

		// body
		$body.innerHTML = tasks.map(task => {
			const buttons = `
			<button class="icon-btn move-btn"   data-id="${task.id}" title="向下">⬇️</button>
			<button class="icon-btn edit-btn"   data-id="${task.id}" title="修改">✏️</button>
			<button class="icon-btn delete-btn" data-id="${task.id}" title="刪除">🗑️</button>
			`;
			const cells = dates.map(d => {
				const date = isoDate(d);
				if (isDone(task, date)) {
					return `<td class="done" data-task-id="${task.id}" data-date="${date}">✅</td>`;
				}
				if (date <= task.lastCompleted) {
					return `<td class="outdate" data-task-id="${task.id}" data-date="${date}">-</td>`;
				}
				const diff = diffDays(task, d);
				if (diff >= 0) {
					return `<td class="pending" data-task-id="${task.id}" data-date="${date}">⏳${diff}</td>`;
				} else {
					return `<td class="overdue" data-task-id="${task.id}" data-date="${date}">💥${-diff}</td>`;
				}
			}).join('');

			return `
				<tr>
					<td class="task-cell">${task.title}</td>
					<td class="action-cell">${buttons}</td>
					${cells}
				</tr>`;
		}).join('');
	}

	// — Event Listeners —

	// Add new task
	$form.addEventListener('submit', e => {
		e.preventDefault();
		const title = $name.value.trim();
		const interval = parseInt($interval.value, 10);
		if (!title || interval < 1) return;

		const today = new Date().toISOString().slice(0, 10);
		tasks.push({
			id: Date.now().toString(),
			title,
			intervalDays: interval,
			lastCompleted: today,
			completionDates: []
		});

		save();
		$name.value = '';
		$interval.value = '';
		render();
	});

	// Delegate all button & cell clicks
	$body.addEventListener('click', e => {
		const btn = e.target;
		const id = btn.dataset.id;

		// Move down
		if (btn.matches('.move-btn')) {
			const idx = tasks.findIndex(t => t.id === id);
			if (idx >= 0 && idx < tasks.length - 1) {
				tasks.splice(idx + 1, 0, ...tasks.splice(idx, 1));
				save(); render();
			}
			return;
		}

		// Edit
		if (btn.matches('.edit-btn')) {
			const task = tasks.find(t => t.id === id);
			if (!task) return;
			const t = prompt('修改任務名稱：', task.title);
			if (t?.trim()) task.title = t.trim();
			const n = prompt('修改週期天數：', task.intervalDays);
			const iv = parseInt(n, 10);
			if (!isNaN(iv) && iv > 0) task.intervalDays = iv;
			save(); render();
			return;
		}

		// Delete
		if (btn.matches('.delete-btn')) {
			tasks = tasks.filter(t => t.id !== id);
			save(); render();
			return;
		}

		// Toggle completion
		const td = e.target.closest('td');
		if (td?.dataset.taskId && td.dataset.date) {
			const { taskId, date } = td.dataset;
			const task = tasks.find(t => t.id === taskId);
			const i = task.completionDates.indexOf(date);
			i >= 0 ? task.completionDates.splice(i, 1)
				: task.completionDates.push(date);
			if (task.completionDates.length) {
				task.lastCompleted = [...task.completionDates].sort().pop();
			}
			save(); render();
		}
	});

	// Initial render
	render();
});