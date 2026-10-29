const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { Pool } = require('pg');

const scrypt = promisify(crypto.scrypt);
const root = __dirname;
const dataDir = path.join(root, 'data');
const usersFile = path.join(dataDir, 'users.json');
const accountsDir = path.join(dataDir, 'accounts');
const port = Number(process.env.PORT || 3000);
const sessions = new Map();
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5 }) : null;
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon' };

function send(res, status, value, type = 'application/json; charset=utf-8', extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extraHeaders });
  res.end(type.startsWith('application/json') ? JSON.stringify(value) : value);
}
function readUsers() {
  try { return JSON.parse(fs.readFileSync(usersFile, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
function saveUsers(users) {
  fs.mkdirSync(dataDir, { recursive: true });
  const temp = `${usersFile}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(users, null, 2), { mode: 0o600 });
  fs.renameSync(temp, usersFile);
}
async function findUserByEmail(email) {
  if (pool) return (await pool.query('SELECT id, name, email, salt, password_hash AS "passwordHash" FROM smarterp_users WHERE email = $1', [email])).rows[0] || null;
  return readUsers().find(user => user.email === email) || null;
}
async function findUserById(id) {
  if (pool) return (await pool.query('SELECT id, name, email FROM smarterp_users WHERE id = $1', [id])).rows[0] || null;
  return readUsers().find(user => user.id === id) || null;
}
async function createUser(user) {
  if (pool) {
    await pool.query('INSERT INTO smarterp_users (id, name, email, salt, password_hash, created_at) VALUES ($1, $2, $3, $4, $5, $6)', [user.id, user.name, user.email, user.salt, user.passwordHash, user.createdAt]);
    return;
  }
  const users = readUsers();
  users.push(user);
  saveUsers(users);
}
function parseCookies(header = '') {
  const result = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    try { result[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim()); } catch {}
  }
  return result;
}
function cookieOptions(req) {
  const secure = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted;
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure ? '; Secure' : ''}`;
}
async function sessionUser(req) {
  const token = parseCookies(req.headers.cookie).smarterp_session;
  const session = token && sessions.get(token);
  if (!session || session.expiresAt < Date.now()) return null;
  const user = await findUserById(session.userId);
  if (!user) sessions.delete(token);
  return user;
}
async function requireUser(req, res) {
  const user = await sessionUser(req);
  if (!user) { send(res, 401, { error: 'Please sign in to continue.' }); return null; }
  return user;
}
function stateFile(userId) { return path.join(accountsDir, `${userId}.json`); }
async function readState(userId) {
  if (pool) return (await pool.query('SELECT state FROM smarterp_workspaces WHERE user_id = $1', [userId])).rows[0]?.state || null;
  try { return JSON.parse(fs.readFileSync(stateFile(userId), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function saveState(userId, value) {
  if (pool) {
    await pool.query('INSERT INTO smarterp_workspaces (user_id, state, updated_at) VALUES ($1, $2::jsonb, NOW()) ON CONFLICT (user_id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()', [userId, JSON.stringify(value)]);
    return;
  }
  fs.mkdirSync(accountsDir, { recursive: true });
  const file = stateFile(userId), temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(temp, file);
}
function readBody(req, limit = 32000) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > limit) { reject(new Error('Request is too large.')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(new Error('Please send valid JSON.')); }
    });
    req.on('error', reject);
  });
}
function publicUser(user) { return { id: user.id, name: user.name, email: user.email }; }
function setSession(user, req, res) {
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, { userId: user.id, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 });
  res.setHeader('Set-Cookie', `smarterp_session=${encodeURIComponent(token)}; ${cookieOptions(req)}`);
}
async function initializeDatabase() {
  if (!pool) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS smarterp_users (
    id text PRIMARY KEY,
    name text NOT NULL,
    email text NOT NULL UNIQUE,
    salt text NOT NULL,
    password_hash text NOT NULL,
    created_at timestamptz NOT NULL
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS smarterp_workspaces (
    user_id text PRIMARY KEY REFERENCES smarterp_users(id) ON DELETE CASCADE,
    state jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT NOW()
  )`);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/api/health' && req.method === 'GET') return send(res, 200, { ok: true, service: 'SmartERP API' });

    if (url.pathname === '/api/auth/me' && req.method === 'GET') {
      const user = await sessionUser(req);
      return user ? send(res, 200, { user: publicUser(user) }) : send(res, 401, { error: 'Sign in required.' });
    }
    if (url.pathname === '/api/auth/register' && req.method === 'POST') {
      const body = await readBody(req);
      const name = String(body.name || '').trim().slice(0, 80);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (name.length < 2) return send(res, 400, { error: 'Enter your name (at least 2 characters).' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return send(res, 400, { error: 'Enter a valid email address.' });
      if (password.length < 8 || password.length > 200) return send(res, 400, { error: 'Password must be at least 8 characters.' });
      if (await findUserByEmail(email)) return send(res, 409, { error: 'An account with this email already exists. Sign in instead.' });
      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = (await scrypt(password, salt, 64)).toString('hex');
      const user = { id: crypto.randomUUID(), name, email, salt, passwordHash, createdAt: new Date().toISOString() };
      try { await createUser(user); }
      catch (error) { if (error.code === '23505') return send(res, 409, { error: 'An account with this email already exists. Sign in instead.' }); throw error; }
      setSession(user, req, res);
      return send(res, 201, { user: publicUser(user) });
    }
    if (url.pathname === '/api/auth/login' && req.method === 'POST') {
      const body = await readBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const user = await findUserByEmail(email);
      const candidate = await scrypt(password, user?.salt || 'invalid-account-salt', 64);
      const expected = user ? Buffer.from(user.passwordHash, 'hex') : Buffer.alloc(64);
      if (!user || !crypto.timingSafeEqual(candidate, expected)) return send(res, 401, { error: 'Email or password is incorrect.' });
      setSession(user, req, res);
      return send(res, 200, { user: publicUser(user) });
    }
    if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
      const token = parseCookies(req.headers.cookie).smarterp_session;
      if (token) sessions.delete(token);
      res.setHeader('Set-Cookie', `smarterp_session=; ${cookieOptions(req)}; Max-Age=0`);
      return send(res, 200, { signedOut: true });
    }
    if (url.pathname === '/api/state' && (req.method === 'GET' || req.method === 'PUT')) {
      const user = await requireUser(req, res);
      if (!user) return;
      if (req.method === 'GET') return send(res, 200, { state: await readState(user.id) });
      const payload = await readBody(req, 2_000_000);
      if (!payload || typeof payload !== 'object' || !payload.company || !Array.isArray(payload.customers) || !Array.isArray(payload.suppliers) || !Array.isArray(payload.items) || !Array.isArray(payload.vouchers)) return send(res, 400, { error: 'Invalid SmartERP state.' });
      await saveState(user.id, payload);
      return send(res, 200, { saved: true });
    }
  } catch (error) {
    console.error('Request failed:', error.message);
    if (!res.headersSent) send(res, 500, { error: 'SmartERP could not complete that request. Please try again.' });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed.' });
  let requestedPath;
  try { requestedPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname); }
  catch { return send(res, 400, 'Bad request', 'text/plain; charset=utf-8'); }
  const file = path.resolve(root, `.${requestedPath}`);
  if (!file.startsWith(`${root}${path.sep}`) && file !== path.join(root, 'index.html')) return send(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
  fs.readFile(file, (error, content) => {
    if (error) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : content);
  });
});

initializeDatabase().then(() => server.listen(port, '0.0.0.0', () => console.log(`SmartERP listening on ${port}`))).catch(error => {
  console.error('Could not initialize database:', error.message);
  process.exit(1);
});
