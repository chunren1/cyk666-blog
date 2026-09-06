import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  timeout: 30000,
  expect: { timeout: 5000 },

  use: {
    baseURL: process.env.TEST_BASE_URL || 'http://127.0.0.1:4321',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // 视觉回归需要确定性的字体渲染
    contextOptions: { reducedMotion: 'no-preference' },
  },

  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'mobile',
      use: {
        // iPhone 13 视口尺寸 + Chromium 引擎（不继承 WebKit，避免额外浏览器依赖）
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
      },
    },
  ],

  webServer: process.env.TEST_BASE_URL
    ? undefined
    : {
        // astro preview 在 Astro 7 是守护进程模式（命令立即返回），不适合 Playwright webServer
        // 用 python http.server 前台服务 dist 目录，由 Playwright 管理生命周期
        command: 'python3 -m http.server 4321 --directory dist',
        url: 'http://127.0.0.1:4321',
        reuseExistingServer: true,
        timeout: 30000,
      },
});
