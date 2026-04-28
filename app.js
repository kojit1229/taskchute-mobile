/* =====================================================
 * タスクシュート Mobile - PWA アプリ (v3 タブUI)
 * - タスク/ルーティン/予定をタブ切替
 * - 一覧はコンパクト表示（タスク名 + 時間のみ）
 * - タップで詳細モーダル → 全項目編集可能
 * ===================================================== */

'use strict';

// ---- 状態管理 ----
const State = {
  data: null,
  edits: [],
  currentDate: '',
  activeTab: 'tasks',           // 'tasks' | 'routines' | 'plans'
  taskEditTarget: null,
  planEditTarget: null
};

const STORAGE_KEY = 'taskchute_mobile_state_v5';

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
      activeTab: State.activeTab,
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
    if (p.activeTab) State.activeTab = p.activeTab;
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
          '別日のデータを読み込むと現在の変更が失われる可能性があります。\n\n読み込みますか？'
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
    showToast('ファイルを書き出しました');
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
  // === Last-Write-Wins: 編集時に updated_at を新しい値で記録 ===
  const now = nowISO();
  data.updated_at = now;

  // 編集対象のアイテム自体の updated_at も更新（次回書き出しで反映される）
  if (State.data) {
    if (action === 'task_update' || action === 'task_check' ||
        action === 'task_start' || action === 'task_comment') {
      const taskId = data.task_id;
      const seg = data.segment_index || 0;
      const tasks = State.data.tasks || [];
      const target = tasks.find(t =>
        t.task_id === taskId && (t.segment_index || 0) === seg
      );
      if (target) {
        target.updated_at = now;
      }
    } else if (action === 'plan_update') {
      const planId = data.id || data.plan_id;
      const plans = State.data.plans || [];
      const target = plans.find(p => p.id === planId);
      if (target) {
        target.updated_at = now;
      }
    } else if (action === 'routine_check') {
      const rid = data.routine_id;
      const oidx = data.order_index || 0;
      const routines = State.data.routines || [];
      const target = routines.find(r =>
        r.routine_id === rid && (r.order_index || 0) === oidx
      );
      if (target) {
        target.updated_at = now;
      }
    }
  }

  State.edits.push({ timestamp: now, action: action, data: data });
  saveToStorage();
  render();
}

// ---- タブ切替 ----
function setupTabs() {
  $$('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      State.activeTab = tab;
      saveToStorage();
      render();
    });
  });
}

function applyActiveTab() {
  $$('.tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === State.activeTab);
  });
  $('#panel-tasks').hidden = State.activeTab !== 'tasks';
  $('#panel-incomplete').hidden = State.activeTab !== 'incomplete';
  $('#panel-routines').hidden = State.activeTab !== 'routines';
  $('#panel-plans').hidden = State.activeTab !== 'plans';
}

// ---- レンダリング ----
function render() {
  if (!State.data) {
    $('#welcome').hidden = false;
    $('#tabs').hidden = true;
    $('#main').hidden = true;
    $('#footer').hidden = true;
    $('#date-label').textContent = '—';
    $('#sync-status').textContent = '';
    $('#sync-status').classList.remove('loaded');
    return;
  }

  $('#welcome').hidden = true;
  $('#tabs').hidden = false;
  $('#main').hidden = false;
  $('#date-label').textContent = formatDate(State.currentDate);
  $('#sync-status').textContent = '読込済';
  $('#sync-status').classList.add('loaded');

  // タブ件数更新
  const tasks = getTasksWithEdits();
  const routines = getRoutinesWithEdits();
  const plans = getPlansWithEdits();
  const incomplete = getIncompleteTasksWithEdits();
  const tasksDone = tasks.filter(t => t.completed).length;
  const routinesDone = routines.filter(r => r.done).length;
  $('#tab-tasks-count').textContent = `${tasksDone}/${tasks.length}`;
  $('#tab-incomplete-count').textContent = `${incomplete.length}`;
  $('#tab-routines-count').textContent = `${routinesDone}/${routines.length}`;
  $('#tab-plans-count').textContent = `${plans.length}`;

  applyActiveTab();
  renderTasks(tasks);
  renderIncomplete(incomplete);
  renderRoutines(routines);
  renderPlans(plans);

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

// ---- タスク描画（コンパクト） ----
function renderTasks(tasks) {
  const list = $('#tasks-list');
  list.innerHTML = '';
  if (tasks.length === 0) {
    list.innerHTML = '<div class="empty-state">タスクがありません</div>';
    return;
  }
  tasks.forEach(t => list.appendChild(buildTaskRow(t)));
}

function buildTaskRow(task) {
  const row = document.createElement('div');
  row.className = 'item' + (task.completed ? ' checked' : '');

  // チェック
  const chk = document.createElement('button');
  chk.className = 'item-check' + (task.completed ? ' checked' : '');
  chk.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTaskChecked(task);
  });
  row.appendChild(chk);

  // 時刻（実績優先）
  const time = document.createElement('div');
  const hasActual = task.start_time && task.end_time;
  time.className = 'item-time' + (hasActual ? ' has-actual' : '');
  const s = hasActual ? task.start_time : (task.plan_start || '');
  const e = hasActual ? task.end_time : (task.plan_end || '');
  time.textContent = s && e ? `${s}-${e}` : (s || '--:--');
  row.appendChild(time);

  // タスク名
  const name = document.createElement('div');
  name.className = 'item-name';
  name.textContent = task.task_name || '(無題)';
  // エネルギーマーク
  if (task.charge > 0) {
    const m = document.createElement('span');
    m.className = 'energy-mark charge';
    m.textContent = '⚡' + (task.charge > 1 ? task.charge : '');
    name.appendChild(m);
  }
  if (task.discharge > 0) {
    const m = document.createElement('span');
    m.className = 'energy-mark discharge';
    m.textContent = '⚡' + (task.discharge > 1 ? task.discharge : '');
    name.appendChild(m);
  }
  // タグ表示
  if (task.tags && task.tags.length > 0) {
    const tagWrap = document.createElement('span');
    tagWrap.className = 'item-tags';
    task.tags.forEach(t => {
      const tg = document.createElement('span');
      tg.className = 'tag-badge';
      tg.style.backgroundColor = tagBgColor(t);
      tg.style.color = tagFgColor(t);
      tg.textContent = t;
      tagWrap.appendChild(tg);
    });
    name.appendChild(tagWrap);
  }
  row.appendChild(name);

  // ›
  const arrow = document.createElement('div');
  arrow.className = 'item-action';
  arrow.textContent = '›';
  row.appendChild(arrow);

  // 行クリックで詳細
  row.addEventListener('click', (ev) => {
    if (ev.target === chk) return;  // チェックボタンは除外
    openTaskModalForEdit(task);
  });
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
  $('#btn-task-delete').hidden = true;
  $('#task-completed').checked = false;
  $('#task-name').value = '';
  $('#task-plan-start').value = '';
  $('#task-plan-end').value = '';
  $('#task-actual-start').value = '';
  $('#task-actual-end').value = '';
  $('#task-estimate').value = '';
  $('#task-category').value = '';
  $('#task-tags').value = '';
  $('#task-charge').value = '0';
  $('#task-discharge').value = '0';
  $('#task-comment').value = '';
  $('#modal-task').hidden = false;
  setTimeout(() => $('#task-name').focus(), 100);
}

function openTaskModalForEdit(task) {
  State.taskEditTarget = task;
  $('#task-modal-title').textContent = 'タスク詳細';
  $('#btn-task-delete').hidden = false; // 削除ボタンを表示 (2パターン削除に対応)
  $('#task-completed').checked = !!task.completed;
  $('#task-name').value = task.task_name || '';
  $('#task-plan-start').value = task.plan_start || '';
  $('#task-plan-end').value = task.plan_end || '';
  $('#task-actual-start').value = task.start_time || '';
  $('#task-actual-end').value = task.end_time || '';
  $('#task-estimate').value = task.estimate || '';
  $('#task-category').value = task.category || '';
  $('#task-tags').value = (task.tags || []).join(', ');
  $('#task-charge').value = String(task.charge || 0);
  $('#task-discharge').value = String(task.discharge || 0);
  $('#task-comment').value = task.comment || '';
  $('#modal-task').hidden = false;
}

function saveTaskFromModal() {
  const name = $('#task-name').value.trim();
  if (!name) { alert('タスク名を入力してください'); return; }
  const tagsStr = $('#task-tags').value;
  const tags = tagsStr.split(',').map(t => t.trim()).filter(t => t);
  const values = {
    task_name: name,
    completed: $('#task-completed').checked,
    plan_start: $('#task-plan-start').value,
    plan_end: $('#task-plan-end').value,
    start_time: $('#task-actual-start').value,
    end_time: $('#task-actual-end').value,
    estimate: $('#task-estimate').value,
    category: $('#task-category').value,
    tags: tags,
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
    if (JSON.stringify(values.tags) !== JSON.stringify(t.tags || [])) changed.tags = values.tags;
    if (values.charge !== (t.charge || 0)) changed.charge = values.charge;
    if (values.discharge !== (t.discharge || 0)) changed.discharge = values.discharge;
    if (values.comment !== (t.comment || '')) changed.comment = values.comment;

    // 完了状態も差分で記録
    const completedChanged = values.completed !== !!t.completed;

    if (Object.keys(changed).length === 0 && !completedChanged) {
      $('#modal-task').hidden = true;
      return;
    }

    if (Object.keys(changed).length > 0) {
      Object.assign(t, changed);
      addEdit('task_update', {
        task_id: t.task_id || '',
        segment_index: t.segment_index || 0,
        task_name: t.task_name,
        fields: changed
      });
    }
    if (completedChanged) {
      t.completed = values.completed;
      addEdit('task_check', {
        task_id: t.task_id || '',
        segment_index: t.segment_index || 0,
        task_name: t.task_name,
        completed: t.completed
      });
    }

    $('#modal-task').hidden = true;
    showToast('保存しました');
  } else {
    addEdit('task_add', values);
    $('#modal-task').hidden = true;
    showToast('追加しました');
  }
}

// ---- ルーティン ----
function renderRoutines(routines) {
  const list = $('#routines-list');
  list.innerHTML = '';
  if (routines.length === 0) {
    list.innerHTML = '<div class="empty-state">ルーティンがありません</div>';
    return;
  }
  routines.forEach(r => list.appendChild(buildRoutineRow(r)));
}

function buildRoutineRow(r) {
  const row = document.createElement('div');
  row.className = 'item' + (r.done ? ' checked' : '');

  // アイコン丸
  const iconEl = document.createElement('div');
  iconEl.className = 'item-icon';
  iconEl.style.background = r.color || '#E1BEE7';
  iconEl.textContent = r.icon || '•';
  row.appendChild(iconEl);

  // 時刻
  const time = document.createElement('div');
  time.className = 'item-time';
  time.textContent = r.start_time || '--:--';
  row.appendChild(time);

  // 名前
  const name = document.createElement('div');
  name.className = 'item-name';
  name.textContent = r.name || '(無題)';
  if (r.charge > 0) {
    const m = document.createElement('span');
    m.className = 'energy-mark charge';
    m.textContent = '⚡' + (r.charge > 1 ? r.charge : '');
    name.appendChild(m);
  }
  if (r.discharge > 0) {
    const m = document.createElement('span');
    m.className = 'energy-mark discharge';
    m.textContent = '⚡' + (r.discharge > 1 ? r.discharge : '');
    name.appendChild(m);
  }
  row.appendChild(name);

  // チェック
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
function renderPlans(plans) {
  const list = $('#plans-list');
  list.innerHTML = '';
  if (plans.length === 0) {
    list.innerHTML = '<div class="empty-state">予定はありません</div>';
    return;
  }
  plans.forEach(p => list.appendChild(buildPlanRow(p)));
}

function buildPlanRow(p) {
  const row = document.createElement('div');
  row.className = 'item';

  // アイコン
  const icon = document.createElement('div');
  icon.className = 'item-icon';
  icon.style.background = p.color || '#B3E5FC';
  icon.textContent = '📋';
  row.appendChild(icon);

  // 時刻
  const time = document.createElement('div');
  const hasActual = p.actual_start && p.actual_end;
  time.className = 'item-time' + (hasActual ? ' has-actual' : '');
  const s = hasActual ? p.actual_start : (p.plan_start || '');
  const e = hasActual ? p.actual_end : (p.plan_end || '');
  time.textContent = s && e ? `${s}-${e}` : (s || '--:--');
  row.appendChild(time);

  // タイトル
  const name = document.createElement('div');
  name.className = 'item-name';
  name.textContent = p.title || '(無題)';
  if (p.charge > 0) {
    const m = document.createElement('span');
    m.className = 'energy-mark charge';
    m.textContent = '⚡' + (p.charge > 1 ? p.charge : '');
    name.appendChild(m);
  }
  if (p.discharge > 0) {
    const m = document.createElement('span');
    m.className = 'energy-mark discharge';
    m.textContent = '⚡' + (p.discharge > 1 ? p.discharge : '');
    name.appendChild(m);
  }
  row.appendChild(name);

  const arrow = document.createElement('div');
  arrow.className = 'item-action';
  arrow.textContent = '›';
  row.appendChild(arrow);

  row.addEventListener('click', () => openPlanModalForEdit(p));
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
  $('#plan-tags').value = '';
  $('#plan-charge').value = '0';
  $('#plan-discharge').value = '0';
  $('#plan-comment').value = '';
  $('#modal-plan').hidden = false;
  setTimeout(() => $('#plan-title').focus(), 100);
}

function openPlanModalForEdit(plan) {
  State.planEditTarget = plan;
  $('#plan-modal-title').textContent = '予定詳細';
  $('#plan-title').value = plan.title || '';
  $('#plan-start').value = plan.plan_start || '';
  $('#plan-end').value = plan.plan_end || '';
  $('#plan-actual-start').value = plan.actual_start || '';
  $('#plan-actual-end').value = plan.actual_end || '';
  $('#plan-label').value = plan.label || '';
  $('#plan-category').value = plan.category || '';
  $('#plan-tags').value = (plan.tags || []).join(', ');
  $('#plan-charge').value = String(plan.charge || 0);
  $('#plan-discharge').value = String(plan.discharge || 0);
  $('#plan-comment').value = plan.comment || '';
  $('#modal-plan').hidden = false;
}

function savePlanFromModal() {
  const title = $('#plan-title').value.trim();
  if (!title) { alert('タイトルを入力してください'); return; }
  const tagsStr = $('#plan-tags').value;
  const tags = tagsStr.split(',').map(t => t.trim()).filter(t => t);
  const values = {
    title: title,
    plan_start: $('#plan-start').value,
    plan_end: $('#plan-end').value,
    actual_start: $('#plan-actual-start').value,
    actual_end: $('#plan-actual-end').value,
    label: $('#plan-label').value,
    category: $('#plan-category').value,
    tags: tags,
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
    if (JSON.stringify(values.tags) !== JSON.stringify(p.tags || [])) changed.tags = values.tags;
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
    showToast('保存しました');
  } else {
    addEdit('plan_add', values);
    $('#modal-plan').hidden = true;
    showToast('追加しました');
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
        tags: e.data.tags || [],
        comment: e.data.comment || '',
        charge: e.data.charge || 0,
        discharge: e.data.discharge || 0,
        completed: !!e.data.completed,
        started: false,
        _is_pending: true
      });
    } else if (e.action === 'task_update') {
      const target = tasks.find(t =>
        (e.data.task_id && t.task_id === e.data.task_id &&
          (t.segment_index || 0) === (e.data.segment_index || 0)) ||
        (!e.data.task_id && t.task_name === e.data.task_name)
      );
      if (target && e.data.fields) Object.assign(target, e.data.fields);
    } else if (e.action === 'task_check') {
      const target = tasks.find(t =>
        (e.data.task_id && t.task_id === e.data.task_id &&
          (t.segment_index || 0) === (e.data.segment_index || 0)) ||
        (!e.data.task_id && t.task_name === e.data.task_name)
      );
      if (target) target.completed = !!e.data.completed;
    }
  });
  tasks.sort((a, b) => (a.plan_start || '99:99').localeCompare(b.plan_start || '99:99'));
  return tasks;
}

function getRoutinesWithEdits() {
  if (!State.data) return [];
  const routines = State.data.routines.map(r => ({ ...r }));
  State.edits.forEach(e => {
    if (e.action === 'routine_check') {
      const target = routines.find(r =>
        r.routine_id === e.data.routine_id &&
        (r.order_index || 0) === (e.data.order_index || 0)
      );
      if (target) target.done = !!e.data.done;
    }
  });
  return routines;
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
        tags: e.data.tags || [],
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

// ---- ボタン ----
function setupModals() {
  $('#btn-add-task').addEventListener('click', openTaskModalForAdd);
  $('#btn-task-save').addEventListener('click', saveTaskFromModal);
  $('#btn-task-delete').addEventListener('click', openDeleteChoiceForCurrentTask);
  $('#btn-add-plan').addEventListener('click', openPlanModalForAdd);
  $('#btn-plan-save').addEventListener('click', savePlanFromModal);
  // 削除ダイアログ
  $('#btn-delete-day-only').addEventListener('click', () => deleteCurrentTask('day_only'));
  $('#btn-delete-all').addEventListener('click', () => deleteCurrentTask('all'));
  $('#btn-delete-cancel').addEventListener('click', () => {
    $('#modal-delete-choice').hidden = true;
  });
}

function setupModalClose() {
  $$('[data-action="close-modal"]').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.modal').hidden = true;
    });
  });
}

// ====================================================
// タグ機能 (色生成)
// ====================================================
const TAG_PALETTE = [
  ['#fce4ec', '#c2185b'],  // ピンク
  ['#e8eaf6', '#3949ab'],  // インディゴ
  ['#e3f2fd', '#1565c0'],  // ブルー
  ['#e0f7fa', '#00838f'],  // シアン
  ['#e0f2f1', '#00695c'],  // ティール
  ['#e8f5e9', '#2e7d32'],  // グリーン
  ['#fff3e0', '#e65100'],  // オレンジ
  ['#ede7f6', '#5e35b1'],  // パープル
];

function tagHash(tagName) {
  if (!tagName) return 0;
  let h = 0;
  for (let i = 0; i < tagName.length; i++) {
    h = ((h << 5) - h) + tagName.charCodeAt(i);
    h = h & h;
  }
  return Math.abs(h);
}

function tagBgColor(tagName) {
  return TAG_PALETTE[tagHash(tagName) % TAG_PALETTE.length][0];
}

function tagFgColor(tagName) {
  return TAG_PALETTE[tagHash(tagName) % TAG_PALETTE.length][1];
}

// ====================================================
// 未完了タスク一覧
// ====================================================
function getIncompleteTasksWithEdits() {
  if (!State.data) return [];
  const incomplete = (State.data.incomplete_tasks || []).map(t => ({ ...t }));
  // 当日タスクシュートに登録済み (= edits の task_add) のものは除外する
  const todayTaskNames = new Set();
  const todayTasks = getTasksWithEdits();
  todayTasks.forEach(t => {
    if (t.task_name) todayTaskNames.add(t.task_name.trim());
  });
  return incomplete.filter(t => !todayTaskNames.has((t.task_name || '').trim()));
}

function renderIncomplete(items) {
  const list = $('#incomplete-list');
  list.innerHTML = '';
  if (!items || items.length === 0) {
    list.innerHTML = '<div class="empty-state">未完了タスクはありません</div>';
    return;
  }
  items.forEach(t => list.appendChild(buildIncompleteRow(t)));
}

function buildIncompleteRow(item) {
  const row = document.createElement('div');
  row.className = 'item incomplete-item';

  // タップ → 今日に追加
  const addBtn = document.createElement('button');
  addBtn.className = 'item-add-btn';
  addBtn.textContent = '+';
  addBtn.title = '今日のタスクシュートに追加';
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    addIncompleteToToday(item);
  });
  row.appendChild(addBtn);

  // タスク名
  const name = document.createElement('div');
  name.className = 'item-name';
  let prefix = '';
  if (item.tag === '今日の予定') prefix = '[今日] ';
  else if (item.tag === 'start_date 未設定') prefix = '[未設定] ';
  else if (item.is_this_week_tactic) prefix = '🎯 ';
  name.textContent = prefix + (item.task_name || '(無題)');
  // タグバッジ
  if (item.tags && item.tags.length > 0) {
    const tagWrap = document.createElement('span');
    tagWrap.className = 'item-tags';
    item.tags.forEach(t => {
      const tg = document.createElement('span');
      tg.className = 'tag-badge';
      tg.style.backgroundColor = tagBgColor(t);
      tg.style.color = tagFgColor(t);
      tg.textContent = t;
      tagWrap.appendChild(tg);
    });
    name.appendChild(tagWrap);
  }
  row.appendChild(name);

  // メタ情報 (登録経過 / 期日)
  const meta = document.createElement('div');
  meta.className = 'item-meta';
  const parts = [];
  if (item.due_date) {
    parts.push(`期日:${item.due_date}`);
  }
  if (item.reg_days_ago && item.reg_days_ago > 0) {
    parts.push(`${item.reg_days_ago}日前`);
  }
  meta.textContent = parts.join(' · ');
  row.appendChild(meta);

  return row;
}

function addIncompleteToToday(item) {
  // 編集として task_add を発行
  const values = {
    task_name: item.task_name,
    task_id: item.task_id || '',
    completed: false,
    plan_start: '',
    plan_end: '',
    start_time: '',
    end_time: '',
    estimate: '',
    category: item.category || '',
    tags: item.tags || [],
    charge: 0,
    discharge: 0,
    comment: '',
    from_incomplete: true
  };
  addEdit('task_add', values);
  showToast(`「${item.task_name}」を今日に追加しました`);
}

// ====================================================
// 削除2パターン
// ====================================================
function openDeleteChoiceForCurrentTask() {
  if (!State.taskEditTarget) return;
  const t = State.taskEditTarget;
  $('#delete-choice-message').textContent = `「${t.task_name || '(無題)'}」をどう削除しますか?`;
  $('#modal-delete-choice').hidden = false;
}

function deleteCurrentTask(mode) {
  const t = State.taskEditTarget;
  if (!t) return;
  if (mode === 'day_only') {
    addEdit('task_delete_day', {
      task_id: t.task_id || '',
      segment_index: t.segment_index || 0,
      task_name: t.task_name
    });
    showToast('今日のタスクシュートから外しました');
  } else if (mode === 'all') {
    if (!confirm('タスクそのものを完全削除します。WBS や全日付の履歴からも削除されます。よろしいですか?')) {
      return;
    }
    addEdit('task_delete_all', {
      task_id: t.task_id || '',
      task_name: t.task_name
    });
    showToast('タスクそのものを削除しました');
  }
  $('#modal-delete-choice').hidden = true;
  $('#modal-task').hidden = true;
  State.taskEditTarget = null;
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
  setupTabs();
  setupModals();
  setupModalClose();
  registerSW();
  if (loadFromStorage()) {
    populateSelects();
    render();
  } else {
    render();
  }
}

document.addEventListener('DOMContentLoaded', init);
