import { test, expect } from '@playwright/test';

test.describe('移动端 (390px)', () => {
  test('无水平溢出', async ({ page }) => {
    await page.goto('/');
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return {
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        hasHorizontalOverflow: doc.scrollWidth > doc.clientWidth,
      };
    });
    expect(overflow.hasHorizontalOverflow).toBe(false);
  });

  test('汉堡菜单开合', async ({ page, isMobile }) => {
    test.skip(!isMobile, '汉堡菜单仅移动端可见');
    await page.goto('/');
    const toggle = page.locator('#mobile-menu-toggle');

    // 初始关闭
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#mobile-menu')).toBeHidden();

    // 打开
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#mobile-menu')).toBeVisible();

    // 关闭
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#mobile-menu')).toBeHidden();
  });

  test('汉堡菜单内导航链接可达', async ({ page, isMobile }) => {
    test.skip(!isMobile, '汉堡菜单仅移动端可见');
    await page.goto('/');
    await page.locator('#mobile-menu-toggle').click();
    const links = page.locator('#mobile-menu .mobile-nav-link');
    const count = await links.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('Hero 在移动端垂直居中布局', async ({ page, isMobile }) => {
    test.skip(!isMobile, '垂直布局仅移动端');
    await page.goto('/');
    const layout = await page.evaluate(() => {
      const hero = document.querySelector('.hero')!;
      const avatar = document.querySelector('.hero-avatar')!;
      const name = document.querySelector('.hero-name')!;
      const aRect = avatar.getBoundingClientRect();
      const nRect = name.getBoundingClientRect();
      const hRect = hero.getBoundingClientRect();
      return {
        avatarAboveName: aRect.top < nRect.top,
        avatarCentered:
          Math.abs(aRect.left + aRect.width / 2 - hRect.width / 2) < 30,
        nameCentered: Math.abs(nRect.left + nRect.width / 2 - hRect.width / 2) < 30,
      };
    });
    expect(layout.avatarAboveName).toBe(true);
    expect(layout.avatarCentered).toBe(true);
    expect(layout.nameCentered).toBe(true);
  });

  test('移动端滚动毛玻璃正常', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForTimeout(400);

    const state = await page.evaluate(() => {
      const header = document.querySelector('#site-header')!;
      return {
        isScrolled: header.classList.contains('is-scrolled'),
        blur: getComputedStyle(header).backdropFilter,
      };
    });
    expect(state.isScrolled).toBe(true);
    expect(state.blur).toContain('blur');
  });

  test('暗色模式下移动端无溢出', async ({ page }) => {
    await page.goto('/');
    const current = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    if (current !== 'dark') await page.locator('#theme-toggle').click();
    await page.waitForTimeout(300);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);
  });
});