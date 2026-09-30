import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { createDataSync } from './scripts/live-data.mjs';

const readSnapshot = () => ({
  snapshot: JSON.parse(readFileSync(new URL('./match-data.json', import.meta.url), 'utf8')),
  forecastHistory: JSON.parse(readFileSync(new URL('./forecast-history.json', import.meta.url), 'utf8')),
});

function liveData() {
  const attach = server => {
    const enabled = process.env.LOCAL_AUTO_SYNC === '1';
    const sync = createDataSync({ enabled, logger: server.config.logger });
    server.middlewares.use((request, response, next) => {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      if (!pathname.endsWith('/data-snapshot.json')) return next();
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.setHeader('Cache-Control', 'no-store');
      response.end(JSON.stringify(sync.read()));
    });
    sync.start();
    server.httpServer?.once('close', () => sync.stop());
  };
  return {
    name: 'local-live-data',
    configureServer: attach,
    configurePreviewServer: attach,
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'data-snapshot.json', source: JSON.stringify({ ...readSnapshot(), autoSync: false, syncFailed: false }) });
    },
  };
}

export default defineConfig({
  plugins: [liveData()],
  // 同步通过轮询局部更新，避免修改快照触发开发页面整页重载。
  server: { watch: { ignored: ['**/match-data.json', '**/forecast-history.json', '**/*.json.tmp'] } },
});
