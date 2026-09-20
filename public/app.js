'use strict';

// 街坊库前端逻辑（原生 JS，无构建依赖）
const state = {
  user: null,
  meta: null,
  view: 'tools',
  tools: [],
  neighbors: [],
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ---------------- API ----------------
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* 非 JSON */ }
  if (!res.ok) {
    const err = new Error((data && data.message) || `请求失败（${res.status}）`);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

// ---------------- 登录 / 会话 ----------------
async function init() {
  try {
    const data = await api('/api/auth/me');
    state.user = data.user;
    await enterApp();
  } catch {
    showLogin();
  }
}

function showLogin() {
  $('#login-view').hidden = false;
  $('#app-view').hidden = true;
  api('/api/accounts').then((data) => {
    const box = $('#account-list');
    box.innerHTML = '';
    // 楼长置顶展示
    const ordered = data.accounts.slice().sort((a, b) => (a.role === 'admin' ? -1 : b.role === 'admin' ? 1 : 0));
    for (const acc of ordered) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'account-chip';
      chip.innerHTML = `${acc.username}<span class="chip-role">${acc.role === 'admin' ? '楼长' : `${acc.building}栋${acc.room}`}</span>`;
      chip.addEventListener('click', () => {
        $('#login-username').value = acc.username;
        $('#login-password').value = acc.role === 'admin' ? 'admin123' : '123456';
        $('#login-password').focus();
      });
      box.appendChild(chip);
    }
  }).catch(() => {});
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errBox = $('#login-error');
  errBox.hidden = true;
  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: {
        username: $('#login-username').value.trim(),
        password: $('#login-password').value,
      },
    });
    state.user = data.user;
    await enterApp();
  } catch (err) {
    errBox.textContent = err.status === 401 ? '账号或密码不正确，请检查后重试。' : err.message;
    errBox.hidden = false;
  }
});

$('#logout-btn').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  state.user = null;
  location.reload();
});

async function enterApp() {
  $('#login-view').hidden = true;
  $('#app-view').hidden = false;
  $('#user-name').textContent = state.user.name;
  const roleEl = $('#user-role');
  if (state.user.role === 'admin') {
    roleEl.textContent = '楼长';
    roleEl.className = 'role-badge role-admin';
  } else {
    roleEl.textContent = '普通邻居';
    roleEl.className = 'role-badge role-neighbor';
  }
  $('#btn-new-tool').hidden = state.user.role !== 'admin';
  state.meta = await api('/api/meta');
  fillMetaOptions();
  switchView('tools');
}

// ---------------- 视图切换 ----------------
$$('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});
function switchView(name) {
  state.view = name;
  $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  $('#view-tools').hidden = name !== 'tools';
  $('#view-neighbors').hidden = name !== 'neighbors';
  if (name === 'tools') loadTools();
  else loadNeighbors();
}

// ---------------- 元数据下拉 ----------------
function fillMetaOptions() {
  const cat = $('#filter-category');
  cat.innerHTML = '<option value="">全部品类</option>' +
    state.meta.categories.map((c) => `<option value="${c}">${c}</option>`).join('');
  const stat = $('#filter-status');
  stat.innerHTML = '<option value="">全部状态</option>' +
    state.meta.statuses.map((s) => `<option value="${s.value}">${s.label}</option>`).join('');

  $('#f-category').innerHTML = state.meta.categories.map((c) => `<option value="${c}">${c}</option>`).join('');
  $('#f-status').innerHTML = state.meta.statuses.map((s) => `<option value="${s.value}">${s.label}</option>`).join('');
  $('#f-owner').innerHTML = state.meta.neighbors
    .map((n) => `<option value="${n.id}">${n.name}（${n.building}栋${n.room}）</option>`).join('');
}

// ---------------- 工具档案 ----------------
const STATUS_LABEL = Object.fromEntries(
  // meta 加载前的兜底
  [['available', '可借'], ['reserved', '已预约'], ['lent', '借出'], ['repairing', '维修中'], ['offline', '已下架']]
);
function statusLabel(v) {
  return (state.meta && state.meta.statuses.find((s) => s.value === v) || {}).label || STATUS_LABEL[v] || v;
}

async function loadTools() {
  const params = new URLSearchParams();
  const q = $('#filter-q').value.trim();
  const category = $('#filter-category').value;
  const status = $('#filter-status').value;
  if (q) params.set('q', q);
  if (category) params.set('category', category);
  if (status) params.set('status', status);
  const data = await api('/api/tools?' + params.toString());
  state.tools = data.tools;
  renderTools();
}

function renderTools() {
  const grid = $('#tool-grid');
  $('#tool-count').textContent = `共 ${state.tools.length} 件工具`;
  if (!state.tools.length) {
    grid.innerHTML = '<div class="empty">没有符合条件的工具，试试调整筛选条件。</div>';
    return;
  }
  const isAdmin = state.user.role === 'admin';
  grid.innerHTML = state.tools.map((t) => {
    const safetyTag = t.safetyLevel === 'instruction'
      ? '<span class="tag tag-safety">⚠ 需说明</span>'
      : '<span class="tag tag-normal">普通</span>';
    const ownerLine = isAdmin && t.owner
      ? `${t.owner.name}（${t.owner.building}栋${t.owner.room}）`
      : `${t.ownerBuilding}栋 · 尾号 ${t.ownerPhoneTail}`;
    const adminActions = isAdmin
      ? `<div class="card-actions">
           <button class="btn btn-ghost" data-edit="${t.id}">编辑档案</button>
           ${t.status === 'offline'
             ? `<button class="btn btn-ghost" data-shelf="${t.id}" data-to="available">代为上架</button>`
             : `<button class="btn btn-ghost" data-shelf="${t.id}" data-to="offline">代为下架</button>`}
         </div>`
      : '';
    return `
      <article class="tool-card">
        <div class="tool-card-head">
          <div>
            <div class="tool-name">${escapeHtml(t.name)}</div>
            <div class="tool-id">编号 ${t.id}</div>
          </div>
          <span class="status-badge st-${t.status}">${statusLabel(t.status)}</span>
        </div>
        <div class="tool-meta">
          <span class="tag tag-cat">${escapeHtml(t.category)}</span>
          <span class="tag tag-deposit">押金 ¥${t.deposit} / 次</span>
          ${safetyTag}
        </div>
        <div class="tool-info">
          <span>🕒 可借时段：<b>${escapeHtml(t.availableTime)}</b></span>
        </div>
        ${t.safetyNote ? `<div class="safety-note">⚠ 借用须知：${escapeHtml(t.safetyNote)}</div>` : ''}
        <div class="tool-owner">
          <span>物主：<span class="owner-name">${escapeHtml(ownerLine)}</span></span>
        </div>
        ${adminActions}
      </article>`;
  }).join('');

  grid.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', () => openToolForm(btn.dataset.edit)));
  grid.querySelectorAll('[data-shelf]').forEach((btn) =>
    btn.addEventListener('click', () => quickShelf(btn.dataset.shelf, btn.dataset.to)));
}

let filterTimer;
$('#filter-q').addEventListener('input', () => {
  clearTimeout(filterTimer);
  filterTimer = setTimeout(loadTools, 250);
});
$('#filter-category').addEventListener('change', loadTools);
$('#filter-status').addEventListener('change', loadTools);

$('#btn-new-tool').addEventListener('click', () => openToolForm(null));

function openToolForm(id) {
  const t = id ? state.tools.find((x) => x.id === id) : null;
  $('#tool-form-title').textContent = t ? `编辑工具档案 · ${t.id}` : '登记新工具';
  $('#f-id').value = t ? t.id : '';
  $('#f-name').value = t ? t.name : '';
  $('#f-category').value = t ? t.category : state.meta.categories[0];
  $('#f-deposit').value = t ? t.deposit : '';
  $('#f-owner').value = t ? t.ownerId : state.meta.neighbors[0].id;
  $('#f-time').value = t ? t.availableTime : '';
  $('#f-safety').value = t ? t.safetyLevel : 'normal';
  $('#f-status').value = t ? t.status : 'available';
  $('#f-note').value = t ? t.safetyNote : '';
  toggleNoteField();
  $('#tool-form-error').hidden = true;
  $('#tool-modal').hidden = false;
}
$('#f-safety').addEventListener('change', toggleNoteField);
function toggleNoteField() {
  const need = $('#f-safety').value === 'instruction';
  $('#f-note-wrap').hidden = !need;
  $('#f-note').required = need;
}

$('#tool-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('#f-id').value;
  const payload = {
    name: $('#f-name').value.trim(),
    category: $('#f-category').value,
    deposit: Number($('#f-deposit').value),
    ownerId: $('#f-owner').value,
    availableTime: $('#f-time').value.trim(),
    safetyLevel: $('#f-safety').value,
    safetyNote: $('#f-note').value.trim(),
    status: $('#f-status').value,
  };
  const errBox = $('#tool-form-error');
  try {
    if (id) {
      await api(`/api/tools/${id}`, { method: 'PUT', body: payload });
      toast('档案已更新');
    } else {
      await api('/api/tools', { method: 'POST', body: payload });
      toast('工具已登记入库');
    }
    $('#tool-modal').hidden = true;
    loadTools();
  } catch (err) {
    errBox.textContent = err.status === 403 ? err.message : (err.message || '保存失败');
    errBox.hidden = false;
  }
});

async function quickShelf(id, to) {
  const t = state.tools.find((x) => x.id === id);
  if (!t) return;
  const verb = to === 'offline' ? '下架' : '上架';
  if (!confirm(`确定替物主将「${t.name}」${verb}吗？`)) return;
  try {
    await api(`/api/tools/${id}`, {
      method: 'PUT',
      body: {
        name: t.name, category: t.category, deposit: t.deposit, ownerId: t.ownerId,
        availableTime: t.availableTime, safetyLevel: t.safetyLevel,
        safetyNote: t.safetyNote || '', status: to,
      },
    });
    toast(`已${verb}`);
    loadTools();
  } catch (err) {
    toast(err.message, true);
  }
}

// ---------------- 邻居管理 ----------------
async function loadNeighbors() {
  const data = await api('/api/neighbors');
  state.neighbors = data.neighbors;
  renderNeighbors();
}

function renderNeighbors() {
  const wrap = $('#neighbor-list');
  const rows = state.neighbors.map((n, i) => `
    <div class="nt-row">
      <span class="who-sub">${String(i + 1).padStart(2, '0')}</span>
      <span class="who">${escapeHtml(n.name)}<span class="who-sub"></span></span>
      <span>${n.building}栋 · 门牌已隐藏</span>
      <span class="masked-phone">****${n.phoneTail}</span>
      <span class="who-sub">${n.toolCount} 件工具</span>
      <span class="nt-actions"><button class="btn btn-ghost btn-sm" data-neighbor="${n.id}">查看详情</button></span>
    </div>`).join('');
  wrap.innerHTML = `
    <div class="nt-row nt-head">
      <span>序号</span><span>住户</span><span>楼栋 / 门牌</span><span>联系方式</span><span class="nt-col-tools">共享工具</span><span></span>
    </div>${rows}`;
  wrap.querySelectorAll('[data-neighbor]').forEach((btn) =>
    btn.addEventListener('click', () => openNeighbor(btn.dataset.neighbor)));
}

async function openNeighbor(id) {
  const box = $('#neighbor-detail');
  box.innerHTML = '<p style="text-align:center;color:var(--ink-soft);padding:24px 0;">正在加载…</p>';
  $('#neighbor-modal').hidden = false;
  try {
    const data = await api(`/api/neighbors/${id}`);
    renderNeighborDetail(data.neighbor);
  } catch (err) {
    if (err.status === 403) renderForbidden(err.payload, id);
    else if (err.status === 404) {
      box.innerHTML = '<div class="error-state"><div class="error-icon">🚫</div><h3>档案不存在</h3><p>该住户档案可能已被注销。</p></div>';
    } else {
      box.innerHTML = `<div class="error-state"><div class="error-icon">😵</div><h3>加载失败</h3><p>${escapeHtml(err.message)}</p></div>`;
    }
  }
}

function renderNeighborDetail(n) {
  const selfTag = n.self ? '<span class="tag tag-normal">这是你本人</span>' : '<span class="tag tag-safety">楼长可见 · 完整档案</span>';
  const tools = n.tools.length
    ? n.tools.map((t) => `
        <div class="mini-tool">
          <span>${escapeHtml(t.name)}</span>
          <span class="status-badge st-${t.status}">${statusLabel(t.status)}</span>
        </div>`).join('')
    : '<p class="who-sub" style="margin:4px 0;">暂未共享工具</p>';
  $('#neighbor-detail').innerHTML = `
    <div class="detail-head">
      <div class="detail-avatar">${escapeHtml(n.name.charAt(0))}</div>
      <div>
        <h3>${escapeHtml(n.name)} ${selfTag}</h3>
        <div class="detail-sub">住户编号 ${n.id}</div>
      </div>
    </div>
    <div class="detail-list">
      <div class="detail-item"><span class="k">楼栋门牌</span><span class="v">${n.building}栋 ${n.room}室</span></div>
      <div class="detail-item"><span class="k">联系电话</span><span class="v">${n.phone}</span></div>
      <div class="detail-item"><span class="k">在库共享工具</span><span class="v">${n.toolCount} 件</span></div>
    </div>
    <div class="detail-tools">
      <h4>上架工具清单</h4>
      ${tools}
    </div>
    ${n.self ? '<p class="who-sub" style="margin-top:14px;font-size:12px;">你可以查看本人的完整档案；其他普通邻居的完整联系方式仅楼长可见。</p>' : ''}
  `;
}

// 明确的越权错误态（不是空白页）
function renderForbidden(payload, id) {
  const target = state.neighbors.find((n) => n.id === id);
  const p = payload || {};
  $('#neighbor-detail').innerHTML = `
    <div class="error-state">
      <div class="error-icon">⛔</div>
      <h3>403 · 无权查看完整联系方式</h3>
      <p>${escapeHtml(p.message || '你的身份无权查看该住户的完整门牌与联系方式。')}</p>
      <div class="error-box">
        <span class="code">错误码：${escapeHtml(p.code || 'FORBIDDEN')} · HTTP 403</span>
        <p>${escapeHtml(p.detail || `当前账号为普通邻居，完整联系方式仅楼长可查看。列表中的脱敏信息（楼栋 + 手机尾号 ${target ? target.phoneTail : '****'}）已足够识别邻里身份。`)}</p>
        <p style="margin-top:8px;">如确有借还联络需要，请联系楼长 <strong>周慧敏（3栋502）</strong> 协助对接，平台不会向邻居直接展示他人手机号。</p>
      </div>
      <button class="btn btn-primary" data-close>我知道了</button>
    </div>`;
}

// ---------------- 弹层关闭 ----------------
document.addEventListener('click', (e) => {
  if (e.target.matches('[data-close]')) {
    const modal = e.target.closest('.modal');
    if (modal) modal.hidden = true;
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    $$('.modal').forEach((m) => { m.hidden = true; });
  }
});

// ---------------- 工具函数 ----------------
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
let toastTimer;
function toast(msg, isError = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.style.background = isError ? 'var(--red)' : '#33302b';
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
}

init();
