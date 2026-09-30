import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:4173', browserName: 'chromium' },
  webServer: { command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --base=/match-betting/', env: { LOCAL_AUTO_SYNC: '0' }, url: 'http://127.0.0.1:4173/match-betting/', reuseExistingServer: !process.env.CI },
});
