// Serve a saved extraction report locally without copying test assets into the app.
// Usage: node scripts/evals/serve-universal-report.mjs <report-folder> [port]
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

if (!process.argv[2]) throw new Error('Provide a saved report folder.');
const root = await fs.realpath(path.resolve(process.argv[2]));
await fs.access(path.join(root, 'index.html'));
const port = Number(process.argv[3] || 8765);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid port.');
const types = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const insideRoot = file => file === root || file.startsWith(root + path.sep);

const server = http.createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const candidate = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!insideRoot(candidate)) throw new Error('Outside report');
    const file = await fs.realpath(candidate);
    const type = types[path.extname(file).toLowerCase()];
    if (!insideRoot(file) || !type) throw new Error('Unsupported report asset');
    const bytes = await fs.readFile(file);
    response.writeHead(200, { 'Content-Type': type, 'Content-Length': bytes.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Report file not found');
  }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Universal extraction report: http://127.0.0.1:${port}/`));
