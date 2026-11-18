import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 150000,
  expect: { timeout: 10000 },
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3002', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: 'npm run build && PORT=3002 PLAYTEST_DIR=./test-results/playtest-logs node server/index.js',
    url: 'http://127.0.0.1:3002/api/health',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
