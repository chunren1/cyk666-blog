import { test, expect } from '@playwright/test';

test.describe('View Transitions 导航', () => {
  test('首页 → 文章页导航后主题保持', async ({ page }) => {
    await page.goto('/');
    // 切到暗色（若当前不是）
    const current = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    if (current !== 'dark') await page.locator('#theme-toggle').click();

    // 点击文章卡片触发 View Transitions 导航
    await page.locator('.article-card a.card-link').first().click();
    await page.waitForURL(/\/articles\/.+\/$/);

    const afterNav = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    expect(afterNav).toBe('dark');
  });

  test('导航后 header 滚动毛玻璃仍工作（is-scrolled + blur）', async ({ page }) => {
    await page.goto('/');
    // 先导航到文章页（替换 DOM）
    await page.locator('.article-card a.card-link').first().click();
    await page.waitForURL(/\/articles\/.+\/$/);

    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForTimeout(400);

    const headerState = await page.evaluate(() => {
      const header = document.querySelector('#site-header')!;
      const cs = getComputedStyle(header);
      return {
        isScrolled: header.classList.contains('is-scrolled'),
        backdropFilter: cs.backdropFilter,
      };
    });
    expect(headerState.isScrolled).toBe(true);
    expect(headerState.backdropFilter).toContain('blur');
  });

  test('导航后滚动进度条仍工作', async ({ page }) => {
    await page.goto('/');
    await page.locator('.article-card a.card-link').first().click();
    await page.waitForURL(/\/articles\/.+\/$/);

    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(300);

    const progress = await page.evaluate(
      () => getComputedStyle(document.querySelector('.scroll-progress')!).transform
    );
    expect(progress).toContain('matrix');
  });

  test('导航后汉堡菜单（移动端）仍工作', async ({ page, isMobile }) => {
    test.skip(!isMobile, '汉堡菜单仅移动端可见');
    await page.goto('/');

    await page.locator('.article-card a.card-link').first().click();
    await page.waitForURL(/\/articles\/.+\/$/);

    const toggle = page.locator('#mobile-menu-toggle');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#mobile-menu')).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('导航回首页后 Hero 入场动画元素可见（回归：hero-animate 重新触发）', async ({ page }) => {
    await page.goto('/');
    // 必须先进入文章页，导航替换 DOM 后才能复现 Hero 消失的回归
    await page.locator('.article-card a.card-link').first().click();
    await page.waitForURL(/\/articles\/.+\/$/);

    await page.goBack();
    await page.waitForURL('/');

    // 轮询等待入场动画收敛（固定 sleep 在公网 HTTPS 延迟下会踩到动画 delay 期，断言 opacity=0）
    await page.waitForFunction(() => {
      const badge = document.querySelector('.hero-badge');
      if (!badge) return false;
      return parseFloat(getComputedStyle(badge).opacity) > 0.9;
    });

    const heroState = await page.evaluate(() => {
      const animated = document.querySelectorAll('[data-anim="fade-up"].hero-animate').length;
      const total = document.querySelectorAll('[data-anim="fade-up"]').length;
      const badge = document.querySelector('.hero-badge');
      const badgeOpacity = badge ? getComputedStyle(badge).opacity : 'missing';
      return { animated, total, badgeOpacity };
    });
    // 未获 hero-animate 类的元素默认 opacity:0，正是本次回归（Hero 区消失）的根因
    expect(heroState.animated).toBe(heroState.total);
    expect(heroState.total).toBeGreaterThan(0);
  });

  test('导航回首页后项目卡片 3D tilt 仍绑定（回归：card-tilt-wrapper transform）', async ({ page, isMobile }) => {
    test.skip(isMobile, 'tilt 是 hover 交互，仅桌面端');
    await page.goto('/');
    await page.locator('.article-card a.card-link').first().click();
    await page.waitForURL(/\/articles\/.+\/$/);

    await page.goBack();
    await page.waitForURL('/');

    // 轮询等待新 DOM 中项目卡片出现且 hero 入场动画已触发（同为 astro:page-load 绑定，信号同步）
    await page.waitForFunction(() => {
      const animated = document.querySelectorAll('[data-anim="fade-up"].hero-animate').length;
      return animated > 0 && !!document.querySelector('.project-card .card-tilt-wrapper');
    });

    const tiltState = await page.evaluate(() => {
      const card = document.querySelector('.project-card')! as HTMLElement;
      const wrapper = card.querySelector('.card-tilt-wrapper')! as HTMLElement;
      card.dispatchEvent(
        new MouseEvent('mousemove', {
          bubbles: true,
          clientX: card.getBoundingClientRect().left + 10,
          clientY: card.getBoundingClientRect().top + 10,
        })
      );
      return wrapper.style.transform;
    });
    expect(tiltState).toContain('rotate');
  });

  test('导航后 header 无控制台错误', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/');
    await page.locator('.article-card a.card-link').first().click();
    await page.waitForURL(/\/articles\/.+\/$/);
    await page.waitForTimeout(600);

    expect(errors).toEqual([]);
  });
});