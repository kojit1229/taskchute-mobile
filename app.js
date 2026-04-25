/* =====================================================
 * タスクシュート Mobile - PWA アプリ (v2)
 * 予定/実績時間、カテゴリー、コメント、充電/放電 すべて編集可能
 * ===================================================== */

'use strict';

// ---- 状態管理 ----
const State = {
  data: null,
  edits: [],
  currentDate: '',
  taskEditTarget: null,
  planEditTarget: null
};

const STORAGE_KEY = 'taskchute_mobile_state_v2';

// ---- ユーティリティ ----
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function nowISO() { return new Date().toISOString(); }

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return iso;
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return `${iso.substring(5)} (${days[d.getDay()]})`;
}

function showToast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(showToast._tid);
  showToast._tid = setTimeout(() => { t.hidden = true; }, 2200);
}

// ---- localStorage ----
function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      data: State.data,
      edits: State.edits,
      currentDate: State.currentDate,
      savedAt: nowISO()
    }));
  } catch (e) { console.warn('保存失敗:', e); }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const p = JSON.parse(raw);
    if (p.data) State.data = p.data;
    if (p.edits) State.edits = p.edits;
    if (p.currentDate) State.currentDate = p.currentDate;
    return !!p.data;
  } catch (e) { return false; }
}

// ---- データ読み込み ----
function setupFileLoad() {
  const fileInput = $('#file-input');
  $('#btn-load').addEventListener('click', () => fileInput.click());
  $('#btn-load-welcome').addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (!json.date || !Array.isArray(json.tasks)) {
        throw new Error('データ形式が不正です');
      }
      if (State.edits.length > 0 && State.currentDate !== json.date) {
        const ok = confirm(
          `未送信の変更が ${State.edits.length} 件あります。\n` +
          '新しい日付のデータを読み込むと、現在の変更は無効になる可能性があります。\n\n読み込みますか？'
        );
        if (!ok) { fileInput.value = ''; return; }
      }
      State.data = json;
      State.currentDate = json.date;
      saveToStorage();
      populateSelects();
      render();
      showToast('データを読み込みました');
    } catch (err) {
      alert('読み込みに失敗しました: ' + err.message);
    }
    fileInput.value = '';
  });
}

// ---- カテゴリ/ラベルのセレクト ----
function populateSelects() {
  if (!State.data) return;
  const cats = State.data.categories || [];
  const lbls = State.data.labels || [];

  const makeOpts = (el, defaultText, items) => {
    el.innerHTML = `<option value="">${defaultText}</option>`;
    items.forEach(it => {
      const o = document.createElement('option');
      o.value = it.name;
      o.textContent = it.name;
      el.appendChild(o);
    });
  };
  makeOpts($('#task-category'), '（未分類）', cats);
  makeOpts($('#plan-category'), '（未分類）', cats);
  makeOpts($('#plan-label'), '（なし）', lbls);
}

// ---- 書き出し ----
function setupSave() {
  const doSave = () => {
    if (State.edits.length === 0) { showToast('変更がありません'); return; }
    const payload = {
      device: 'iphone',
      date: State.currentDate,
      created_at: nowISO(),
      edits: State.edits
    };
    const jsonStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const fname = `${State.currentDate}_${stamp}.json`;
    const a = document.createElement('a');
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('ファイルを書き出しました。\n「ファイル」アプリで iCloud/taskchute-sync/edits/ に保存してください');
    setTimeout(() => {
      const ok = confirm('書き出しが完了しました。\n変更ログをクリアしますか？\n（PC 側で取り込み後に「はい」を推奨）');
      if (ok) { State.edits = []; saveToStorage(); render(); }
    }, 500);
  };
  $('#btn-save').addEventListener('click', doSave);
  $('#btn-save-bottom').addEventListener('click', doSave);
}

// ---- 編集ログ追加 ----
function addEdit(action, data) {
  State.edits.push({ timestamp: nowISO(), action: action, data: data });
  saveToStorage();
  render();
}

// ---- レンダリング ----
function render() {
  if (!State.data) {
    $('#welcome').hidden = false;
    $('#panel-tasks').hidden = true;
    $('#panel-routines').hidden = true;
    $('#panel-plans').hidden = true;
    $('#panel-edits').hidden = true;
    $('#footer').hidden = true;
    $('#date-label').textContent = '—';
    $('#sync-status').textContent = '';
    $('#sync-status').classList.remove('loaded');
    return;
  }

  $('#welcome').hidden = true;
  $('#date-label').textContent = formatDate(State.currentDate);
  $('#sync-status').textContent = '読込済';
  $('#sync-status').classList.add('loaded');

  renderTasks();
  renderRoutines();
  renderPlans();
  renderEdits();

  $('#footer').hidden = State.edits.length === 0;

  const badge = $('#edits-badge');
  if (State.edits.length > 0) {
    badge.hidden = false;
    badge.textContent = State.edits.length;
  } else {
    badge.hidden = true;
  }
  $('#edits-count-bottom').textContent = State.edits.length;
}

function renderTasks() {
  const list = $('#tasks-list');
  list.innerHTML = '';
  const tasks = getTasksWithEdits();
  let completed = 0;
  tasks.forEach(t => { if (t.completed) completed++; });
  $('#tasks-count').textContent = `${completed}/${tasks.length}`;

  if (tasks.length === 0) {
    list.innerHTML = '<div class="empty-state">タスクがありません</div>';
  } else {
    tasks.forEach((t, idx) => list.appendChild(buildTaskRow(t, idx)));
  }
  $('#panel-tasks').hidden = false;
}

function buildTaskRow(task, idx) {
  const row = document.createElement('div');
  row.className = 'item' + (task.completed ? ' checked' : '');

  const chk = document.createElement('button');
  chk.className = 'item-check' + (task.completed ? ' checked' : '');
  chk.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTaskChecked(task);
  });
  row.appendChild(chk);

  const body = document.createElement('div');
  body.className = 'item-body';

  const time = document.createElement('div');
  time.className = 'item-time';
  const hasActual = task.start_time && task.end_time;
  const s = hasActual ? task.start_time : (task.plan_start || '');
  const e = hasActual ? task.end_time : (task.plan_end || '');
  const prefix = hasActual ? '実績' : '予定';
  time.textContent = s && e ? `${prefix} ${s} - ${e}` : (s ? `${prefix} ${s}` : '時間未定');
  body.appendChild(time);

  const name = document.createElement('div');
  name.className = 'item-name';
  name.textContent = task.task_name || '(無題)';
  if (task.charge > 0) {
    const b = document.createElement('span');
    b.className = 'energy-badge charge';
    b.textContent = '⚡'.repeat(task.charge);
    name.appendChild(b);
  }
  if (task.discharge > 0) {
    const b = document.createElement('span');
    b.className = 'energy-badge discharge';
    b.textContent = '⚡'.repeat(task.discharge);
    name.appendChild(b);
  }
  body.appendChild(name);

  const comment = document.createElement('div');
  comment.className = 'item-comment' + (task.comment ? '' : ' empty');
  const parts = [];
  if (task.category) parts.push(`#${task.category}`);
  if (task.comment) parts.push(task.comment);
  comment.textContent = parts.join(' ') || 'タップで編集';
  body.appendChild(comment);

  body.addEventListener('click', () => openTaskModalForEdit(task));
  row.appendChild(body);

  const act = document.createElement('div');
  act.className = 'item-action';
  act.textContent = '›';
  row.appendChild(act);

  return row;
}

function toggleTaskChecked(task) {
  task.completed = !task.completed;
  addEdit('task_check', {
    task_id: task.task_id || '',
    segment_index: task.segment_index || 0,
    task_name: task.task_name,
    completed: task.completed
  });
}

// ---- タスクモーダル ----
function openTaskModalForAdd() {
  State.taskEditTarget = null;
  $('#task-modal-title').textContent = 'タスクを追加';
  $('#task-name').value = '';
  $('#task-plan-start').value = '';
  $('#task-plan-end').value = '';
  $('#task-actual-start').value = '';
  $('#task-actual-end').value = '';
  $('#task-estimate').value = '';
  $('#task-category').value = '';
  $('#task-charge').value = '0';
  $('#task-discharge').value = '0';
  $('#task-comment').value = '';
  $('#modal-task').hidden = false;
  setTimeout(() => $('#task-name').focus(), 100);
}

function openTaskModalForEdit(task) {
  State.taskEditTarget = task;
  $('#task-modal-title').textContent = 'タスクを編集';
  $('#task-name').value = task.task_name || '';
  $('#task-plan-start').value = task.plan_start || '';
  $('#task-plan-end').value = task.plan_end || '';
  $('#task-actual-start').value = task.start_time || '';
  $('#task-actual-end').value = task.end_time || '';
  $('#task-estimate').value = task.estimate || '';
  $('#task-category').value = task.category || '';
  $('#task-charge').value = String(task.charge || 0);
  $('#task-discharge').value = String(task.discharge || 0);
  $('#task-comment').value = task.comment || '';
  $('#modal-task').hidden = false;
}

function saveTaskFromModal() {
  const name = $('#task-name').value.trim();
  if (!name) { alert('タスク名を入力してください'); return; }
  const values = {
    task_name: name,
    plan_start: $('#task-plan-start').value,
    plan_end: $('#task-plan-end').value,
    start_time: $('#task-actual-start').value,
    end_time: $('#task-actual-end').value,
    estimate: $('#task-estimate').value,
    category: $('#task-category').value,
    charge: parseInt($('#task-charge').value) || 0,
    discharge: parseInt($('#task-discharge').value) || 0,
    comment: $('#task-comment').value
  };

  if (State.taskEditTarget) {
    const t = State.taskEditTarget;
    const changed = {};
    if (values.task_name !== (t.task_name || '')) changed.task_name = values.task_name;
    if (values.plan_start !== (t.plan_start || '')) changed.plan_start = values.plan_start;
    if (values.plan_end !== (t.plan_end || '')) changed.plan_end = values.plan_end;
    if (values.start_time !== (t.start_time || '')) changed.start_time = values.start_time;
    if (values.end_time !== (t.end_time || '')) changed.end_time = values.end_time;
    if (values.estimate !== (t.estimate || '')) changed.estimate = values.estimate;
    if (values.category !== (t.category || '')) changed.category = values.category;
    if (values.charge !== (t.charge || 0)) changed.charge = values.charge;
    if (values.discharge !== (t.discharge || 0)) changed.discharge = values.discharge;
    if (values.comment !== (t.comment || '')) changed.comment = values.comment;

    if (Object.keys(changed).length === 0) { $('#modal-task').hidden = true; return; }
    Object.assign(t, changed);
    addEdit('task_update', {
      task_id: t.task_id || '',
      segment_index: t.segment_index || 0,
      task_name: t.task_name,
      fields: changed
    });
    $('#modal-task').hidden = true;
    showToast('タスクを更新しました');
  } else {
    addEdit('task_add', values);
    $('#modal-task').hidden = true;
    showToast('タスクを追加しました');
  }
}

// ---- ルーティン ----
function renderRoutines() {
  const list = $('#routines-list');
  list.innerHTML = '';
  const routines = getRoutinesWithEdits();
  let done = 0;
  routines.forEach(r => { if (r.done) done++; });
  $('#routines-count').textContent = `${done}/${routines.length}`;
  if (routines.length === 0) { $('#panel-routines').hidden = true; return; }
  routines.forEach(r => { list.appendChild(buildRoutineRow(r)); });
  $('#panel-routines').hidden = false;
}

function buildRoutineRow(r) {
  const row = document.createElement('div');
  row.className = 'item' + (r.done ? ' checked' : '');

  const iconEl = document.createElement('div');
  iconEl.className = 'item-icon';
  iconEl.style.background = r.color || '#E1BEE7';
  iconEl.textContent = r.icon || '•';
  row.appendChild(iconEl);

  const body = document.createElement('div');
  body.className = 'item-body';

  const time = document.createElement('div');
  time.className = 'item-time';
  time.textContent = r.start_time || '';
  body.appendChild(time);

  const name = document.createElement('div');
  name.className = 'item-name';
  name.textContent = r.name || '(無題)';
  if (r.charge > 0) {
    const b = document.createElement('span');
    b.className = 'energy-badge charge';
    b.textContent = '⚡'.repeat(r.charge);
    name.appendChild(b);
  }
  if (r.discharge > 0) {
    const b = document.createElement('span');
    b.className = 'energy-badge discharge';
    b.textContent = '⚡'.repeat(r.discharge);
    name.appendChild(b);
  }
  body.appendChild(name);
  row.appendChild(body);

  const chk = document.createElement('button');
  chk.className = 'item-check' + (r.done ? ' checked' : '');
  chk.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleRoutineDone(r);
  });
  row.appendChild(chk);
  return row;
}

function toggleRoutineDone(r) {
  r.done = !r.done;
  addEdit('routine_check', {
    routine_id: r.routine_id,
    order_index: r.order_index || 0,
    name: r.name,
    done: r.done
  });
}

// ---- 予定 ----
function renderPlans() {
  const list = $('#plans-list');
  list.innerHTML = '';
  const plans = getPlansWithEdits();
  $('#plans-count').textContent = `${plans.length}`;
  if (plans.length === 0) {
    list.innerHTML = '<div class="empty-state">予定はありません</div>';
  } else {
    plans.forEach(p => { list.appendChild(buildPlanRow(p)); });
  }
  $('#panel-plans').hidden = false;
}

function buildPlanRow(p) {
  const row = document.createElement('div');
  row.className = 'item';

  const icon = document.createElement('div');
  icon.className = 'item-icon';
  icon.style.background = p.color || '#B3E5FC';
  icon.textContent = '📋';
  row.appendChild(icon);

  const body = document.createElement('div');
  body.className = 'item-body';

  const time = document.createElement('div');
  time.className = 'item-time';
  const hasActual = p.actual_start && p.actual_end;
  const s = hasActual ? p.actual_start : (p.plan_start || '');
  const e = hasActual ? p.actual_end : (p.plan_end || '');
  const prefix = hasActual ? '実績' : '予定';
  time.textContent = s && e ? `${prefix} ${s} - ${e}` : (s ? `${prefix} ${s}` : '時間未定');
  body.appendChild(time);

  const name = document.createElement('div');
  name.className = 'item-name';
  name.textContent = p.title || '(無題)';
  if (p.charge > 0) {
    const b = document.createElement('span');
    b.className = 'energy-badge charge';
    b.textContent = '⚡'.repeat(p.charge);
    name.appendChild(b);
  }
  if (p.discharge > 0) {
    const b = document.createElement('span');
    b.className = 'energy-badge discharge';
    b.textContent = '⚡'.repeat(p.discharge);
    name.appendChild(b);
  }
  body.appendChild(name);

  if (p.label || p.category || p.comment) {
    const c = document.createElement('div');
    c.className = 'item-comment';
    const parts = [];
    if (p.label) parts.push(`[${p.label}]`);
    if (p.category) parts.push(`#${p.category}`);
    if (p.comment) parts.push(p.comment);
    c.textContent = parts.join(' ');
    body.appendChild(c);
  }

  body.addEventListener('click', () => openPlanModalForEdit(p));
  row.appendChild(body);
  return row;
}

// ---- 予定モーダル ----
function openPlanModalForAdd() {
  State.planEditTarget = null;
  $('#plan-modal-title').textContent = '予定を追加';
  $('#plan-title').value = '';
  $('#plan-start').value = '';
  $('#plan-end').value = '';
  $('#plan-actual-start').value = '';
  $('#plan-actual-end').value = '';
  $('#plan-label').value = '';
  $('#plan-category').value = '';
  $('#plan-charge').value = '0';
  $('#plan-discharge').value = '0';
  $('#plan-comment').value = '';
  $('#modal-plan').hidden = false;
  setTimeout(() => $('#plan-title').focus(), 100);
}

function openPlanModalForEdit(plan) {
  State.planEditTarget = plan;
  $('#plan-modal-title').textContent = '予定を編集';
  $('#plan-title').value = plan.title || '';
  $('#plan-start').value = plan.plan_start || '';
  $('#plan-end').value = plan.plan_end || '';
  $('#plan-actual-start').value = plan.actual_start || '';
  $('#plan-actual-end').value = plan.actual_end || '';
  $('#plan-label').value = plan.label || '';
  $('#plan-category').value = plan.category || '';
  $('#plan-charge').value = String(plan.charge || 0);
  $('#plan-discharge').value = String(plan.discharge || 0);
  $('#plan-comment').value = plan.comment || '';
  $('#modal-plan').hidden = false;
}

function savePlanFromModal() {
  const title = $('#plan-title').value.trim();
  if (!title) { alert('タイトルを入力してください'); return; }
  const values = {
    title: title,
    plan_start: $('#plan-start').value,
    plan_end: $('#plan-end').value,
    actual_start: $('#plan-actual-start').value,
    actual_end: $('#plan-actual-end').value,
    label: $('#plan-label').value,
    category: $('#plan-category').value,
    charge: parseInt($('#plan-charge').value) || 0,
    discharge: parseInt($('#plan-discharge').value) || 0,
    comment: $('#plan-comment').value,
    color: '#B3E5FC'
  };

  if (State.planEditTarget) {
    const p = State.planEditTarget;
    const changed = {};
    if (values.title !== (p.title || '')) changed.title = values.title;
    if (values.plan_start !== (p.plan_start || '')) changed.plan_start = values.plan_start;
    if (values.plan_end !== (p.plan_end || '')) changed.plan_end = values.plan_end;
    if (values.actual_start !== (p.actual_start || '')) changed.actual_start = values.actual_start;
    if (values.actual_end !== (p.actual_end || '')) changed.actual_end = values.actual_end;
    if (values.label !== (p.label || '')) changed.label = values.label;
    if (values.category !== (p.category || '')) changed.category = values.category;
    if (values.charge !== (p.charge || 0)) changed.charge = values.charge;
    if (values.discharge !== (p.discharge || 0)) changed.discharge = values.discharge;
    if (values.comment !== (p.comment || '')) changed.comment = values.comment;

    if (Object.keys(changed).length === 0) { $('#modal-plan').hidden = true; return; }
    Object.assign(p, changed);
    addEdit('plan_update', {
      title: p.title,
      plan_start: p.plan_start || '',
      fields: changed
    });
    $('#modal-plan').hidden = true;
    showToast('予定を更新しました');
  } else {
    addEdit('plan_add', values);
    $('#modal-plan').hidden = true;
    showToast('予定を追加しました');
  }
}

// ---- 変更ログ描画 ----
function renderEdits() {
  const list = $('#edits-list');
  list.innerHTML = '';
  $('#edits-count').textContent = String(State.edits.length);
  if (State.edits.length === 0) { $('#panel-edits').hidden = true; return; }
  const items = State.edits.slice(-10);
  items.forEach(e => {
    const row = document.createElement('div');
    row.className = 'edit-item';
    const time = e.timestamp.substring(11, 16);
    row.innerHTML =
      `<span class="edit-time">${time}</span>` +
      `<span class="edit-action">${describeAction(e)}</span>`;
    list.appendChild(row);
  });
  $('#panel-edits').hidden = false;
}

function describeAction(edit) {
  const d = edit.data || {};
  switch (edit.action) {
    case 'task_add': return `タスク追加: ${d.task_name}`;
    case 'task_update': return `タスク更新: ${d.task_name}`;
    case 'task_check': return `${d.completed ? '✓' : '□'} ${d.task_name}`;
    case 'task_comment': return `コメント: ${d.task_name}`;
    case 'plan_add': return `予定追加: ${d.title}`;
    case 'plan_update': return `予定更新: ${d.title}`;
    case 'routine_check': return `${d.done ? '✓' : '□'} ${d.name}`;
    default: return edit.action;
  }
}

// ---- 差分適用後のリスト ----
function getTasksWithEdits() {
  if (!State.data) return [];
  const tasks = State.data.tasks.map(t => ({ ...t }));
  State.edits.forEach(e => {
    if (e.action === 'task_add') {
      tasks.push({
        task_id: '', segment_index: 0,
        task_name: e.data.task_name,
        plan_start: e.data.plan_start || '',
        plan_end: e.data.plan_end || '',
        start_time: e.data.start_time || '',
        end_time: e.data.end_time || '',
        estimate: e.data.estimate || '',
        category: e.data.category || '',
        comment: e.data.comment || '',
        charge: e.data.charge || 0,
        discharge: e.data.discharge || 0,
        completed: false, started: false,
        _is_pending: true
      });
    } else if (e.action === 'task_update') {
      const target = tasks.find(t =>
        (e.data.task_id && t.task_id === e.data.task_id &&
          (t.segment_index || 0) === (e.data.segment_index || 0)) ||
        (!e.data.task_id && t.task_name === e.data.task_name)
      );
      if (target && e.data.fields) Object.assign(target, e.data.fields);
    }
  });
  tasks.sort((a, b) => (a.plan_start || '99:99').localeCompare(b.plan_start || '99:99'));
  return tasks;
}

function getRoutinesWithEdits() {
  if (!State.data) return [];
  return State.data.routines.map(r => ({ ...r }));
}

function getPlansWithEdits() {
  if (!State.data) return [];
  const plans = State.data.plans.map(p => ({ ...p }));
  State.edits.forEach(e => {
    if (e.action === 'plan_add') {
      plans.push({
        title: e.data.title,
        label: e.data.label || '',
        category: e.data.category || '',
        plan_start: e.data.plan_start || '',
        plan_end: e.data.plan_end || '',
        actual_start: e.data.actual_start || '',
        actual_end: e.data.actual_end || '',
        charge: e.data.charge || 0,
        discharge: e.data.discharge || 0,
        comment: e.data.comment || '',
        color: e.data.color || '#B3E5FC',
        _is_pending: true
      });
    } else if (e.action === 'plan_update') {
      const target = plans.find(p =>
        p.title === e.data.title && (p.plan_start === e.data.plan_start)
      );
      if (target && e.data.fields) Object.assign(target, e.data.fields);
    }
  });
  plans.sort((a, b) => (a.plan_start || '99:99').localeCompare(b.plan_start || '99:99'));
  return plans;
}

// ---- ボタンセットアップ ----
function setupModals() {
  $('#btn-add-task').addEventListener('click', openTaskModalForAdd);
  $('#btn-task-save').addEventListener('click', saveTaskFromModal);
  $('#btn-add-plan').addEventListener('click', openPlanModalForAdd);
  $('#btn-plan-save').addEventListener('click', savePlanFromModal);
}

function setupModalClose() {
  $$('[data-action="close-modal"]').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.modal').hidden = true;
    });
  });
  $$('.modal').forEach(m => {
    m.addEventListener('click', (e) => {
      if (e.target === m) m.hidden = true;
    });
  });
}

function setupClearEdits() {
  $('#btn-clear-edits').addEventListener('click', () => {
    if (!confirm('記録中の変更をすべて破棄します。よろしいですか？')) return;
    State.edits = [];
    saveToStorage();
    render();
    showToast('変更をクリアしました');
  });
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(err => {
      console.warn('SW登録失敗:', err);
    });
  }
}

function init() {
  setupFileLoad();
  setupSave();
  setupModals();
  setupModalClose();
  setupClearEdits();
  registerSW();
  if (loadFromStorage()) {
    populateSelects();
    render();
  } else {
    render();
  }
}

document.addEventListener('DOMContentLoaded', init);
