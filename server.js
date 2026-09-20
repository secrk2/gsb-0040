'use strict';

// 街坊库 —— 邻里工具共享平台
// 零依赖原生 Node.js HTTP 服务：会话认证、工具档案、邻居管理（脱敏 / 403）
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SEED_USERS, SEED_TOOLS } = require('./seed/seed');

const PORT = Number(process.env.PORT || 8107);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

const CATEGORIES = ['电动工具', '手动工具', '梯具', '测量工具', '清洁设备', '园艺工具', '五金搬运', '其他'];
const STATUSES = [
  { value: 'available', label: '可借' },
  { value: 'reserved', label: '已预约' },
  { value: 'lent', label: '借出' },
  { value: 'repairing', label: '维修中' },
  { value: 'offline', label: '已下架' },
];
const STATUS_VALUES = STATUSES.map((s) => s.value);
const SAFETY_LEVELS = {
  normal: { label: '普通工具', desc: '可直接借用' },
  instruction: { label: '需说明工具', desc: '借用前须阅读并确认安全须知' },
};

// ---------------- 数据持久化 ----------------
function initDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(
      DB_FILE,
      JSON.stringify({ users: SEED_USERS, tools: SEED_TOOLS }, null, 2),
      'utf8'
    );
  }
}
let db;
function loadDb() {
  initDb();
  db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
function saveDb() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

// ---------------- 会话 ----------------
// 演示应用：会话保存在内存，Cookie 为 HttpOnly，重启后需重新登录
const sessions = new Map(); // sid -> userId

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}
function currentUser(req) {
  const sid = parseCookies(req).sid;
  if (!sid) return null;
  const userId = sessions.get(sid);
  if (!userId) return null;
  return db.users.find((u) => u.id === userId) || null;
}
function setSessionCookie(res, sid) {
  res.setHeader('Set-Cookie', `sid=${sid}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`);
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
}

// ---------------- 工具函数 ----------------
function sendJson(res, code, body) {
  const json = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(json);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(Object.assign(new Error('请求体过大'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('JSON 格式错误'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}
const maskTail = (phone) => String(phone).replace(/\D/g, '').slice(-4).padStart(4, '*');

function neighborMasked(u, toolCount) {
  return {
    id: u.id,
    name: u.name,
    building: u.building,
    phoneTail: maskTail(u.phone),
    toolCount,
  };
}
function neighborFull(u, viewer, tools) {
  const owned = tools.filter((t) => t.ownerId === u.id);
  return {
    id: u.id,
    name: u.name,
    building: u.building,
    room: u.room,
    phone: u.phone,
    self: viewer.id === u.id,
    toolCount: owned.length,
    tools: owned.map((t) => ({ id: t.id, name: t.name, status: t.status })),
  };
}
function toolToJson(t, viewer) {
  const owner = db.users.find((u) => u.id === t.ownerId);
  const out = {
    id: t.id,
    name: t.name,
    category: t.category,
    deposit: t.deposit,
    availableTime: t.availableTime,
    safetyLevel: t.safetyLevel,
    safetyNote: t.safetyNote,
    status: t.status,
    ownerId: t.ownerId,
    createdAt: t.createdAt,
    // 物主信息默认与列表同样脱敏：楼栋 + 手机尾号；完整物主信息仅随楼长请求下发
    ownerBuilding: owner ? owner.building : null,
    ownerPhoneTail: owner ? maskTail(owner.phone) : null,
  };
  if (viewer && viewer.role === 'admin' && owner) {
    out.owner = { id: owner.id, name: owner.name, building: owner.building, room: owner.room };
  }
  return out;
}

function validateToolPayload(input, { partial = false } = {}) {
  const errors = [];
  const pick = (key) => (input[key] === undefined ? undefined : String(input[key]).trim());
  const name = pick('name');
  const category = pick('category');
  const availableTime = pick('availableTime');
  const safetyLevel = pick('safetyLevel');
  const safetyNote = pick('safetyNote');
  const status = pick('status');
  const ownerId = pick('ownerId');
  const depositRaw = input.deposit;

  if (!partial || name !== undefined) {
    if (!name) errors.push('工具名称不能为空');
    else if (name.length > 40) errors.push('工具名称不能超过 40 字');
  }
  if (!partial || category !== undefined) {
    if (!CATEGORIES.includes(category)) errors.push('品类不合法');
  }
  if (!partial || availableTime !== undefined) {
    if (!availableTime) errors.push('可借时段不能为空');
    else if (availableTime.length > 100) errors.push('可借时段不能超过 100 字');
  }
  if (!partial || safetyLevel !== undefined) {
    if (!SAFETY_LEVELS[safetyLevel]) errors.push('安全等级不合法');
  }
  const level = safetyLevel || undefined;
  if (safetyLevel === 'instruction' || (partial === false && level === 'instruction')) {
    if (!safetyNote) errors.push('「需说明」工具必须填写安全须知');
  }
  if (safetyNote && safetyNote.length > 500) errors.push('安全须知不能超过 500 字');
  if (!partial || status !== undefined) {
    if (!STATUS_VALUES.includes(status)) errors.push('状态不合法');
  }
  if (!partial || ownerId !== undefined) {
    const owner = ownerId && db.users.find((u) => u.id === ownerId && u.role === 'neighbor');
    if (!owner) errors.push('物主必须是已登记的邻居住户');
  }
  if (!partial || depositRaw !== undefined) {
    const deposit = Number(depositRaw);
    if (!Number.isFinite(deposit) || deposit < 0) errors.push('押金必须是不小于 0 的金额');
    else if (deposit > 100000) errors.push('押金金额超出合理范围');
  }
  if (errors.length) {
    const err = new Error(errors.join('；'));
    err.statusCode = 400;
    throw err;
  }
  return { name, category, availableTime, safetyLevel, safetyNote: safetyNote || '', status, ownerId, deposit: Number(depositRaw) };
}

// ---------------- 静态资源 ----------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};
function serveStatic(req, res, urlPath) {
  let rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== PUBLIC_DIR) {
    return sendJson(res, 403, { error: 'FORBIDDEN', message: '禁止访问' });
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // 非 API 路由统一回退到单页应用
      return fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, html) => {
        if (e2) return sendJson(res, 404, { error: 'NOT_FOUND', message: '页面不存在' });
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(html);
      });
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------------- 路由 ----------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  try {
    // ---- 静态资源无需登录（否则登录页本身无法加载） ----
    if (!pathname.startsWith('/api/')) {
      return serveStatic(req, res, pathname);
    }

    // ---- 认证 ----
    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const body = await readBody(req);
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      const user = db.users.find((u) => u.username === username && u.password === password);
      if (!user) {
        return sendJson(res, 401, { error: 'BAD_CREDENTIALS', message: '账号或密码不正确' });
      }
      const sid = crypto.randomBytes(24).toString('hex');
      sessions.set(sid, user.id);
      setSessionCookie(res, sid);
      return sendJson(res, 200, {
        user: { id: user.id, name: user.name, role: user.role, building: user.building, room: user.room },
      });
    }

    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      const sid = parseCookies(req).sid;
      if (sid) sessions.delete(sid);
      clearSessionCookie(res);
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/auth/me' && req.method === 'GET') {
      const user = currentUser(req);
      if (!user) return sendJson(res, 401, { error: 'UNAUTHORIZED', message: '尚未登录' });
      return sendJson(res, 200, {
        user: { id: user.id, name: user.name, role: user.role, building: user.building, room: user.room },
      });
    }

    // 演示用：列出内置账号（不含密码），方便一键填充
    if (pathname === '/api/accounts' && req.method === 'GET') {
      return sendJson(res, 200, {
        accounts: db.users.map((u) => ({
          username: u.username,
          name: u.name,
          role: u.role,
          building: u.building,
          room: u.room,
        })),
      });
    }

    // ---- 以下全部需要登录 ----
    const viewer = currentUser(req);
    if (!viewer) {
      return sendJson(res, 401, { error: 'UNAUTHORIZED', message: '请先登录后再操作' });
    }

    // 枚举（供前端渲染下拉/徽标）
    if (pathname === '/api/meta' && req.method === 'GET') {
      return sendJson(res, 200, {
        categories: CATEGORIES,
        statuses: STATUSES,
        safetyLevels: SAFETY_LEVELS,
        neighbors: db.users.filter((u) => u.role === 'neighbor').map((u) => ({ id: u.id, name: u.name, building: u.building, room: u.room })),
      });
    }

    // ---- 工具档案 ----
    if (pathname === '/api/tools' && req.method === 'GET') {
      let tools = db.tools.slice();
      const q = (url.searchParams.get('q') || '').trim().toLowerCase();
      const category = url.searchParams.get('category');
      const status = url.searchParams.get('status');
      if (q) tools = tools.filter((t) => t.name.toLowerCase().includes(q));
      if (category) tools = tools.filter((t) => t.category === category);
      if (status) tools = tools.filter((t) => t.status === status);
      tools.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return sendJson(res, 200, { tools: tools.map((t) => toolToJson(t, viewer)) });
    }

    if (pathname === '/api/tools' && req.method === 'POST') {
      if (viewer.role !== 'admin') {
        return sendJson(res, 403, { error: 'FORBIDDEN', message: '只有楼长可以登记工具档案（可代邻居登记上架）' });
      }
      const payload = validateToolPayload(await readBody(req));
      const maxNum = db.tools.reduce((m, t) => Math.max(m, parseInt(String(t.id).replace(/\D/g, ''), 10) || 0), 0);
      const tool = {
        id: 'T' + String(maxNum + 1).padStart(3, '0'),
        ...payload,
        createdAt: new Date().toISOString(),
      };
      db.tools.push(tool);
      saveDb();
      return sendJson(res, 201, { tool: toolToJson(tool, viewer) });
    }

    const toolMatch = pathname.match(/^\/api\/tools\/(T\d+)$/);
    if (toolMatch && req.method === 'PUT') {
      if (viewer.role !== 'admin') {
        return sendJson(res, 403, { error: 'FORBIDDEN', message: '只有楼长可以修改工具档案（含代邻居上架、下架、置为维修中）' });
      }
      const tool = db.tools.find((t) => t.id === toolMatch[1]);
      if (!tool) return sendJson(res, 404, { error: 'NOT_FOUND', message: '工具不存在或已被删除' });
      const payload = validateToolPayload(await readBody(req), { partial: false });
      Object.assign(tool, payload);
      saveDb();
      return sendJson(res, 200, { tool: toolToJson(tool, viewer) });
    }

    // ---- 邻居管理 ----
    if (pathname === '/api/neighbors' && req.method === 'GET') {
      // 列表对所有人（含楼长）一律脱敏：仅楼栋 + 手机尾号
      const list = db.users
        .filter((u) => u.role === 'neighbor')
        .map((u) => neighborMasked(u, db.tools.filter((t) => t.ownerId === u.id).length));
      list.sort((a, b) =>
        parseInt(a.building, 10) - parseInt(b.building, 10) ||
        parseInt(a.room, 10) - parseInt(b.room, 10)
      );
      return sendJson(res, 200, { neighbors: list });
    }

    const neighborMatch = pathname.match(/^\/api\/neighbors\/(u\d+)$/);
    if (neighborMatch && req.method === 'GET') {
      const target = db.users.find((u) => u.id === neighborMatch[1] && u.role === 'neighbor');
      if (!target) return sendJson(res, 404, { error: 'NOT_FOUND', message: '邻居档案不存在' });
      // 完整联系方式：仅楼长，或查看本人。普通邻居查看他人 -> 明确 403，不返回空白
      if (viewer.role !== 'admin' && viewer.id !== target.id) {
        return sendJson(res, 403, {
          error: 'FORBIDDEN',
          code: 'CONTACT_PROTECTED',
          message: '权限不足：完整门牌与联系方式仅楼长可查看，邻居只能查看本人完整档案',
          detail: `你当前以普通邻居「${viewer.name}」的身份登录，正在尝试查看「${target.name}」的完整联系方式，该操作已被拒绝。`,
        });
      }
      return sendJson(res, 200, { neighbor: neighborFull(target, viewer, db.tools) });
    }

    if (pathname.startsWith('/api/')) {
      return sendJson(res, 404, { error: 'NOT_FOUND', message: '接口不存在' });
    }
  } catch (err) {
    const code = err.statusCode || 500;
    if (code >= 500) console.error(err);
    return sendJson(res, code, { error: code >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST', message: err.message || '服务器错误' });
  }
});

loadDb();
server.listen(PORT, () => {
  console.log(`街坊库已启动：http://localhost:${PORT}`);
});
