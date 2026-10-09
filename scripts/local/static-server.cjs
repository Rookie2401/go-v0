// Local testing only: a static file server for the built apps (directory → index.html; CORS and private-network headers for localhost).
const http = require('http'); const fs = require('fs'); const path = require('path');
const root = require('path').resolve(process.argv[2]); const port = Number(process.argv[3] || 5199);
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-private-network': 'true', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': '*', 'cache-control': 'no-store' };
const types = { '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.epub': 'application/epub+zip', '.wav': 'audio/wav', '.txt': 'text/plain; charset=utf-8' };
http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  let target = p; if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
  if (!target.startsWith(root) || !fs.existsSync(target)) { res.writeHead(404, cors); res.end('not found'); return; }
  const p2 = target;
  res.writeHead(200, { 'content-type': types[path.extname(p2)] || 'application/octet-stream', ...cors });
  fs.createReadStream(p2).pipe(res);
}).listen(port, () => console.log('serving', root, 'on', port));
