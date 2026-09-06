import { test, expect } from '@playwright/test';

test.describe('prefers-reduced-motion 尊重', () => {
  test('动画被禁用（不无限循环）', async ({ browser }) => {
    // 用 reducedMotion: reduce 的上下文
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();

    await page.goto('/');
    await page.waitForTimeout(1500);

    const animStates = await page.evaluate(() => {
      const gs = (sel: string) => getComputedStyle(document.querySelector(sel)!);
      return {
        nameSheen: gs('.hero-name').animationName,
        avatarFloat: gs('.hero-avatar').animationName,
        glowPulse: gs('.avatar-glow').animationName,
        blob1: gs('.hero-blob-1').animationName,
        blob2: gs('.hero-blob-2').animationName,
        blob3: gs('.hero-blob-3').animationName,
      };
    });

    // reduced-motion 下所有无限循环动画应为 none（或已被媒体查询覆盖）
    const runningAnims = Object.values(animStates).filter((a) => a !== 'none');
    expect(runningAnims.length).toBe(0);

    await context.close();
  });

  test('页面仍可正常交互', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();

    await page.goto('/');
    // 主题切换仍可用
    await page.locator('#theme-toggle').click();
    const theme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    expect(['light', 'dark']).toContain(theme);

    // 导航仍可用
    await page.locator('.article-card a.card-link').first().click();
    await page.waitForURL(/\/articles\/.+\/$/);

    await context.close();
  });
});