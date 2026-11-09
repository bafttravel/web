import { defineConfig } from '@playwright/test';

export default defineConfig({
  timeout: 60000,
  testDir: './e2e',
  testMatch: 'admin-design.spec.ts',
  use: { baseURL: 'http://127.0.0.1:3102', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: 'npm run dev -- -p 3102',
    url: 'http://127.0.0.1:3102/e2e/admin-design',
    timeout: 120000,
    reuseExistingServer: false,
    env: { ...process.env, ADMIN_DESIGN_PREVIEW: '1', NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3102' },
  },
});
