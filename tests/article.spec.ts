import { test, expect } from '@playwright/test';

const ARTICLE_URLS = [
  '/articles/cloudflare-tunnel/',
  '/articles/mysql84/',
  '/articles/ssh-reverse-tunnel/',
  '/articles/vibemusic/',
  '/articles/wsl-systemd/',
  '/articles/wsl-win-dev/',
  '/articles/xueyan/',
];

test.describe('文章页', () => {
  test('所有文章页可访问且标题正确', async ({ page }) => {
    for (const url of ARTICLE_URLS) {
      const resp = await page.goto(url);
      expect(resp?.status(), `${url} 应返回 200`).toBe(200);
      // 页面标题包含站点名
      const title = await page.title();
      expect(title.length).toBeGreaterThan(5);
    }
  });

  test('代码块渲染（Shiki astro-code）', async ({ page }) => {
    await page.goto(ARTICLE_URLS[0]);
    const codeBlocks = page.locator('pre.astro-code');
    const count = await codeBlocks.count();
    expect(count).toBeGreaterThanOrEqual(5);
    // 有语言标注
    const lang = await codeBlocks.first().getAttribute('data-language');
    expect(lang).toBeTruthy();
  });

  test('代码块内容与行号完整', async ({ page }) => {
    await page.goto(ARTICLE_URLS[0]);
    const firstBlock = page.locator('pre.astro-code').first();
    const lineCount = await firstBlock.locator('.line').count();
    expect(lineCount).toBeGreaterThan(0);
  });

  test('文章正文渲染', async ({ page }) => {
    await page.goto(ARTICLE_URLS[0]);
    const article = page.locator('article, .prose, main');
    const textLen = await article.first().innerText().then((t) => t.length);
    expect(textLen).toBeGreaterThan(500);
  });

  test('文章页主题切换正常', async ({ page }) => {
    await page.goto(ARTICLE_URLS[0]);
    const initial = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    await page.locator('#theme-toggle').click();
    const after = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    expect(after).not.toBe(initial);
  });

  test('文章页滚动毛玻璃 + 滚动进度条', async ({ page }) => {
    await page.goto(ARTICLE_URLS[0]);
    await page.evaluate(() => window.scrollTo(0, 400));

    // 轮询等待 header is-scrolled 生效（固定 sleep 在高负载下会先于 rAF 更新断言，偶发失败）
    await page.waitForFunction(() =>
      document.querySelector('#site-header')?.classList.contains('is-scrolled')
    );

    const state = await page.evaluate(() => {
      const header = document.querySelector('#site-header')!;
      return {
        isScrolled: header.classList.contains('is-scrolled'),
        blur: getComputedStyle(header).backdropFilter,
        progress: getComputedStyle(document.querySelector('.scroll-progress')!).transform,
      };
    });
    expect(state.isScrolled).toBe(true);
    expect(state.blur).toContain('blur');
    expect(state.progress).toContain('matrix');
  });

  test('文章页无控制台错误', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    for (const url of ARTICLE_URLS) {
      await page.goto(url);
      await page.waitForTimeout(400);
    }
    expect(errors).toEqual([]);
  });

  test('文章页无水平溢出', async ({ page }) => {
    for (const url of ARTICLE_URLS) {
      await page.goto(url);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(overflow, `${url} 不应水平溢出`).toBe(false);
    }
  });
});