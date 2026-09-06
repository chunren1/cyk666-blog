import { test, expect } from '@playwright/test';

test.describe('主题切换系统', () => {
  test('默认主题跟随系统/初始设置，html 有 data-theme', async ({ page }) => {
    await page.goto('/');
    const theme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    expect(['light', 'dark']).toContain(theme);
  });

  test('点击切换按钮在 light/dark 间切换', async ({ page }) => {
    await page.goto('/');
    const initial = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );

    await page.locator('#theme-toggle').click();
    const afterFirst = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    expect(afterFirst).not.toBe(initial);

    await page.locator('#theme-toggle').click();
    const afterSecond = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    expect(afterSecond).toBe(initial);
  });

  test('主题偏好持久化到 localStorage', async ({ page }) => {
    await page.goto('/');
    await page.locator('#theme-toggle').click();

    const stored = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) =>
        k.toLowerCase().includes('theme')
      );
      return key ? { key, value: localStorage.getItem(key) } : null;
    });
    expect(stored).not.toBeNull();
  });

  test('刷新后主题保持', async ({ page }) => {
    await page.goto('/');
    const initial = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    // 确保与默认不同，才真正测试持久化
    if (initial === 'light') {
      await page.locator('#theme-toggle').click();
    }
    const chosen = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );

    await page.reload();
    const afterReload = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    expect(afterReload).toBe(chosen);
  });

  test('暗色模式关键元素对比度渲染正常', async ({ page }) => {
    await page.goto('/');
    // 强制暗色
    const current = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    if (current !== 'dark') await page.locator('#theme-toggle').click();
    await page.waitForTimeout(200);

    const bg = await page.evaluate(() => {
      const bodyBg = getComputedStyle(document.body).backgroundColor;
      const text = getComputedStyle(document.body).color;
      return { bodyBg, text };
    });
    // 暗色下背景不应是白色
    expect(bg.bodyBg).not.toBe('rgb(255, 255, 255)');
  });
});

test.describe('主题切换按钮可访问性', () => {
  test('按钮有 aria-label 且可聚焦', async ({ page }) => {
    await page.goto('/');
    const btn = page.locator('#theme-toggle');
    await expect(btn).toHaveAttribute('aria-label', /.+/);
    await expect(btn).toBeVisible();
    await btn.focus();
    await expect(btn).toBeFocused();
  });
});