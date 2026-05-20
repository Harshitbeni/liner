import { defineConfig, devices } from '@playwright/test';

const apiPort = process.env.LINER_API_PORT ?? '9240';
const uiPort = process.env.LINER_UI_PORT ?? '5180';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${uiPort}`,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `LINER_RPC_MODE=mock LINER_API_PORT=${apiPort} VITE_LINER_API=http://127.0.0.1:${apiPort}/api bun run dev`,
    url: `http://127.0.0.1:${uiPort}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
