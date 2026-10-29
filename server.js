const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const dataFile = path.join(root, 'data', 'state.json');
const port = Number(process.env.PORT || 3000);
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon' };

function readState() {
  try { return JSON.parse(fs.readFileSync(dataFile, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function send(res, status, value, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(type.startsWith('application/json') ? JSON.stringify(value) : value);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/health' && req.method === 'GET') return send(res, 200, { ok: true, service: 'SmartERP API' });
  if (url.pathname === '/api/state' && req.method === 'GET') {
    try { return send(res, 200, { state: readState() }); }
    catch { return send(res, 500, { error: 'Could not read application data.' }); }
  }
  if (url.pathname === '/api/state' && req.method === 'PUT') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 2_000_000) req.destroy(); });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        if (!payload || typeof payload !== 'object' || !payload.company || !Array.isArray(payload.customers) || !Array.isArray(payload.suppliers) || !Array.isArray(payload.items) || !Array.isArray(payload.vouchers)) return send(res, 400, { error: 'Invalid SmartERP state.' });
        fs.mkdirSync(path.dirname(dataFile), { recursive: true });
        const tempFile = `${dataFile}.tmp`;
        fs.writeFileSync(tempFile, JSON.stringify(payload, null, 2));
        fs.renameSync(tempFile, dataFile);
        return send(res, 200, { saved: true });
      } catch { return send(res, 400, { error: 'Request must contain valid JSON.' }); }
    });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed.' });
  const requestedPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = path.resolve(root, `.${requestedPath}`);
  if (!file.startsWith(`${root}${path.sep}`) && file !== path.join(root, 'index.html')) return send(res, 403, { error: 'Forbidden.' });
  fs.readFile(file, (error, content) => {
    if (error) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : content);
  });
});

server.listen(port, '0.0.0.0', () => console.log(`SmartERP listening on ${port}`));

