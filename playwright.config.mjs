import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: 'browser.spec.mjs', workers: 1,
  outputDir: '/tmp/laisla-playwright-results', reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3901', headless: true },
  webServer: {
    command: 'NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=isolated-browser-fixture npm run build && npm run start -- --hostname 127.0.0.1 -p 3901',
    url: 'http://127.0.0.1:3901', reuseExistingServer: false, timeout: 60_000,
  },
});
