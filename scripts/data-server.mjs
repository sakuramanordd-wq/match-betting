import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createDataSync } from './live-data.mjs';

export function createDataServer({ dataSync, allowedOrigins = ['https://sakuramanordd-wq.github.io'] } = {}) {
  const sync = dataSync || createDataSync({ dataDir: process.env.DATA_DIR, enabled: process.env.LOCAL_AUTO_SYNC !== '0' });
  const server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Vary', 'Origin');
    const origin = request.headers.origin;
    if (origin && !allowedOrigins.includes(origin)) {
      response.writeHead(403); response.end('Origin not allowed'); return;
    }
    if (origin) response.setHeader('Access-Control-Allow-Origin', origin);
    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      response.writeHead(204); response.end(); return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.setHeader('Allow', 'GET, HEAD, OPTIONS');
      response.writeHead(405); response.end(); return;
    }
    const path = new URL(request.url, 'http://localhost').pathname;
    if (!['/data-snapshot.json', '/healthz'].includes(path)) {
      response.writeHead(404); response.end(); return;
    }
    const data = sync.read();
    const payload = path === '/healthz' ? { ok: true, fetchedAt: data.snapshot.fetchedAt, syncFailed: data.syncFailed } : data;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(request.method === 'HEAD' ? undefined : JSON.stringify(payload));
  });
  server.once('listening', () => sync.start());
  server.once('close', () => sync.stop());
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 必须在 1–65535 之间');
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://sakuramanordd-wq.github.io').split(',').map(value => value.trim()).filter(Boolean);
  const server = createDataServer({ allowedOrigins });
  server.listen(port, '0.0.0.0', () => console.log(`数据服务监听 ${port}，接口 /data-snapshot.json`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
}
