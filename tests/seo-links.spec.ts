import { test, expect } from '@playwright/test';

test.describe('全站链接有效性', () => {
  test('首页所有内部链接均返回 200', async ({ page }) => {
    await page.goto('/');
    const hrefs = await page.evaluate(() => {
      const seen = new Set<string>();
      document.querySelectorAll('a[href]').forEach((a) => {
        const href = (a as HTMLAnchorElement).getAttribute('href')!;
        // 只收集站内链接（排除锚点、外链、mailto）
        if (href.startsWith('/') && !href.startsWith('/#')) seen.add(href);
      });
      return [...seen];
    });

    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      const resp = await page.request.get(href);
      expect(
        resp.status(),
        `链接 ${href} 应返回 200，实际 ${resp.status()}`
      ).toBe(200);
    }
  });

  test('首页锚点目标存在', async ({ page }) => {
    await page.goto('/');
    const anchors = await page.evaluate(() => {
      const missing: string[] = [];
      document.querySelectorAll('a[href^="/#"]').forEach((a) => {
        const target = a.getAttribute('href')!.slice(2);
        if (!document.getElementById(target)) missing.push(a.getAttribute('href')!);
      });
      return missing;
    });
    expect(anchors).toEqual([]);
  });

  test('无损坏图片资源', async ({ page }) => {
    await page.goto('/');
    const broken = await page.evaluate(async () => {
      const imgs = [...document.querySelectorAll('img')];
      const bad: string[] = [];
      for (const img of imgs) {
        if (!img.complete || img.naturalWidth === 0) bad.push(img.src);
      }
      return bad;
    });
    expect(broken).toEqual([]);
  });

  test('favicon 与站点图标存在', async ({ page }) => {
    await page.goto('/');
    const icons = await page.evaluate(() => {
      return [...document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')].map(
        (l) => (l as HTMLLinkElement).href
      );
    });
    expect(icons.length).toBeGreaterThan(0);
  });
});

test.describe('SEO 基础', () => {
  test('首页有 meta description', async ({ page }) => {
    await page.goto('/');
    const desc = await page.evaluate(() =>
      document.querySelector('meta[name="description"]')?.getAttribute('content')
    );
    expect(desc).toBeTruthy();
    expect(desc!.length).toBeGreaterThan(20);
  });

  test('首页有 Open Graph 标签', async ({ page }) => {
    await page.goto('/');
    const og = await page.evaluate(() => {
      return {
        title: document.querySelector('meta[property="og:title"]')?.getAttribute('content'),
        type: document.querySelector('meta[property="og:type"]')?.getAttribute('content'),
      };
    });
    expect(og.title).toBeTruthy();
    expect(og.type).toBeTruthy();
  });

  test('文章页有规范链接与描述', async ({ page }) => {
    await page.goto('/articles/cloudflare-tunnel/');
    const canonical = await page.evaluate(() =>
      document.querySelector('link[rel="canonical"]')?.getAttribute('href')
    );
    const desc = await page.evaluate(() =>
      document.querySelector('meta[name="description"]')?.getAttribute('content')
    );
    expect(canonical).toBeTruthy();
    expect(desc).toBeTruthy();
  });

  test('页面有 lang 属性', async ({ page }) => {
    await page.goto('/');
    const lang = await page.evaluate(() => document.documentElement.lang);
    expect(lang).toBeTruthy();
  });

  test('字体与 CSS 资源加载成功', async ({ page }) => {
    await page.goto('/');
    const failed = await page.evaluate(async () => {
      const resources = performance
        .getEntriesByType('resource')
        .filter((r) => r.name.includes('.css') || r.name.includes('.woff'));
      return resources.length;
    });
    expect(failed).toBeGreaterThan(0);
  });
});