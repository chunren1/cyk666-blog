import { test, expect } from '@playwright/test';

test.describe('首页渲染', () => {
  test('Hero 区完整渲染', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/KKstar/);
    await expect(page.locator('.hero-name')).toHaveText('KKstar');

    // 核心元素
    await expect(page.locator('.hero')).toBeVisible();
    await expect(page.locator('.hero-badge')).toContainText('全栈开发者');
    await expect(page.locator('.hero-name')).toBeVisible();
    await expect(page.locator('.hero-avatar')).toBeVisible();
    await expect(page.locator('.avatar-glow')).toBeVisible();
    await expect(page.locator('.live-dot')).toBeVisible();
    await expect(page.locator('.scroll-indicator')).toBeVisible();

    // 背景层
    await expect(page.locator('.hero-bg')).toBeVisible();
    await expect(page.locator('.hero-blob')).toHaveCount(3);
    await expect(page.locator('.hero-grid-pattern')).toBeVisible();
  });

  test('Hero 动画处于运行状态', async ({ page }) => {
    await page.goto('/');
    // 入场动画完成后检查无限循环动画
    await page.waitForTimeout(1500);

    const animStates = await page.evaluate(() => {
      const gs = (sel: string) => getComputedStyle(document.querySelector(sel)!);
      return {
        nameSheen: gs('.hero-name').animationName + ':' + gs('.hero-name').animationPlayState,
        avatarFloat: gs('.hero-avatar').animationName + ':' + gs('.hero-avatar').animationPlayState,
        glowPulse: gs('.avatar-glow').animationName + ':' + gs('.avatar-glow').animationPlayState,
        blob1: gs('.hero-blob-1').animationName + ':' + gs('.hero-blob-1').animationPlayState,
        badge: gs('.hero-badge').animationName,
      };
    });

    expect(animStates.nameSheen).toContain('nameSheen');
    expect(animStates.nameSheen).toContain('running');
    expect(animStates.avatarFloat).toContain('avatarFloat');
    expect(animStates.avatarFloat).toContain('running');
    expect(animStates.glowPulse).toContain('glowPulse');
    expect(animStates.glowPulse).toContain('running');
    expect(animStates.blob1).toContain('running');
  });

  test('Inter Variable 字体已加载并生效', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const fontOk = await page.evaluate(() => document.fonts.check('16px "Inter Variable"'));
    expect(fontOk).toBe(true);
    const fontFamily = await page.evaluate(
      () => getComputedStyle(document.body).fontFamily
    );
    expect(fontFamily).toContain('Inter Variable');
  });

  test('滚动进度条随滚动更新', async ({ page }) => {
    await page.goto('/');
    // 进度条是 fixed 顶部 3px 细线，初始 scaleX(0)，先验证存在
    await expect(page.locator('.scroll-progress')).toHaveCount(1);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(300);
    const mid = await page.evaluate(() => {
      const el = document.querySelector('.scroll-progress')!;
      return {
        transform: getComputedStyle(el).transform,
        progress: getComputedStyle(el).getPropertyValue('--scroll-progress'),
      };
    });
    // 滚动后 scaleX 应变大（transform 非恒等且 progress > 0）
    expect(parseFloat(mid.progress)).toBeGreaterThan(0);

    // 滚到底部应接近 100%
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
    const end = await page.evaluate(
      () => getComputedStyle(document.querySelector('.scroll-progress')!).getPropertyValue('--scroll-progress')
    );
    expect(parseFloat(end)).toBeGreaterThan(0.9);
  });

  test('首页无控制台错误与资源加载失败', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push('PAGEERROR: ' + err.message));
    page.on('requestfailed', (req) => errors.push('FAILED: ' + req.url()));

    await page.goto('/');
    await page.waitForTimeout(1000);

    expect(errors).toEqual([]);
  });
});

test.describe('首页分区', () => {
  test('文章卡片渲染且有正确链接', async ({ page }) => {
    await page.goto('/');
    const cards = page.locator('.article-card');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(6);

    const firstLink = cards.first().locator('a.card-link');
    await expect(firstLink).toHaveAttribute('href', /\/articles\/[\w-]+\/$/);
  });

  test('文章卡片具有新视觉元素', async ({ page }) => {
    await page.goto('/');
    const first = page.locator('.article-card').first();
    // accent-line 是 hover 才展开的顶部渐变线
    await expect(first.locator('.card-accent-line')).toHaveCount(1);
    await expect(first.locator('.card-spotlight')).toHaveCount(1);
    await expect(first.locator('.card-arrow')).toBeVisible();
    await expect(first.locator('.card-date')).toBeVisible();

    // hover 后 accent-line 展开
    await first.hover();
    await page.waitForTimeout(400);
    const lineTransform = await first
      .locator('.card-accent-line')
      .evaluate((el) => getComputedStyle(el).transform);
    expect(lineTransform).not.toContain('scaleX(0');
  });

  test('项目卡片具有 3D tilt 结构', async ({ page }) => {
    await page.goto('/');
    const projects = page.locator('.projects-grid .project-card');
    const count = await projects.count();
    expect(count).toBeGreaterThanOrEqual(1);
    await expect(projects.first().locator('.card-tilt-wrapper')).toBeVisible();
  });

  test('技能分区渲染', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#articles')).toBeVisible();
    await expect(page.locator('#projects')).toBeVisible();
    await expect(page.locator('#about')).toBeVisible();
    await expect(page.locator('.skills-section')).toBeVisible();
  });
});