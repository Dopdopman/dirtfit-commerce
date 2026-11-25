import { defineConfig } from '@playwright/test';

const API_URL = 'http://localhost:4000';
const WEB_URL = 'http://localhost:3000';

export default defineConfig({
  testDir: './tests/system',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  webServer: [
    {
      command: 'node apps/api/src/server.js',
      url: `${API_URL}/health/ready`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: '4000',
        HOST: '127.0.0.1',
        APP_URL: WEB_URL,
        API_URL,
        CORS_ALLOWED_ORIGINS: `${WEB_URL},http://127.0.0.1:3000`,
        COOKIE_SAME_SITE: 'lax',
        COOKIE_SECURE: 'false',
        SWAGGER_ENABLED: 'true',
        PAYMENT_DEFAULT_PROVIDER: 'MOCK',
        ENABLE_MOCK_PAYMENT: 'true',
        STORAGE_DRIVER: 'local',
        GOOGLE_OAUTH_ENABLED: 'true',
        ENABLE_MOCK_OAUTH: 'true',
        GOOGLE_CALLBACK_URL: `${API_URL}/api/v1/auth/google/callback`,
        CHAT_PROVIDER: 'fallback',
        RATE_LIMIT_GLOBAL_MAX: '1000',
        RATE_LIMIT_AUTH_MAX: '100',
        CHAT_RATE_LIMIT_MAX: '100',
      },
    },
    {
      command: 'pnpm --filter @dirtfit/web start',
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 90_000,
      env: {
        ...process.env,
        PORT: '3000',
        HOSTNAME: 'localhost',
        NEXT_PUBLIC_API_URL: API_URL,
        INTERNAL_API_URL: 'http://127.0.0.1:4000',
      },
    },
  ],
});
