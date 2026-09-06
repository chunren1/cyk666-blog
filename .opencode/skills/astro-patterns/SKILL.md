---
name: astro-patterns
description: Astro 开发规范（cyk666-blog 专用）— View Transitions 下脚本必须用 astro:page-load 重绑定、Lightning CSS 前缀去重坑、astro preview 守护进程模式、组件脚本纯 JS 约束。Use when editing any .astro file or related CSS/scripts in this repo.
license: MIT
compatibility: opencode
metadata:
  workflow: astro-development
---

## What I do

- Enforce View Transitions-safe scripting patterns (this repo uses ClientRouter)
- Document Astro 7 build pipeline pitfalls (Lightning CSS, daemon preview)
- Provide component conventions that prevent the DOM-replacement bugs seen in this repo

## 本仓库已知坑（务必遵守）

### 1. View Transitions 替换 DOM → 脚本必须重新绑定

本仓库 BaseLayout 启用了 `ClientRouter`。导航会**替换整个 DOM**（新节点无事件、无动画类）。任何依赖 DOM 状态的脚本，绑定在 `DOMContentLoaded` 或顶层只执行一次都会在导航后失效——已踩过 3 次（Header 毛玻璃、Hero 入场动画、卡片 tilt/spotlight）。

**规则：**
- 查询 DOM 并绑定 → 必须监听 `astro:page-load` 在每次导航后重新执行
- window/document 级监听器（scroll、resize、matchMedia）常驻可只绑一次，但回调里查 DOM 要实时
- 已修复的正例见 `src/components/Header.astro`、`src/pages/index.astro`（Hero 动画）、`src/components/ArticleCard.astro`、`src/components/ProjectCard.astro`

```js
// ✅ 正确模式：首次 + 每次导航都执行
function init() {
  document.querySelectorAll('[data-anim]').forEach((el) => el.classList.add('animate'));
}
document.addEventListener('astro:page-load', init);
init();
```

```js
// ❌ 错误：只执行一次，导航后新 DOM 无状态（元素保持 opacity:0 等默认态 → "页面消失"）
document.querySelectorAll('[data-anim]').forEach((el) => el.classList.add('animate'));
```

### 2. 动画初始态必须默认隐藏 + JS 触发显示

隐藏态元素（`opacity: 0`）若显示逻辑只在首载执行，导航回来后元素永久不可见。任何"入场动画"必须：默认 `opacity: 0` → `astro:page-load` 加类触发。`prefers-reduced-motion: reduce` 下必须无条件显示（fallback）。

### 3. Lightning CSS 前缀去重（Astro 7 默认压缩器）

Lightning CSS 会去重**同值**的 `-webkit-` 前缀与无前缀声明，通常保留 `-webkit-` 版本。而现代 Chromium 不支持 `-webkit-backdrop-filter` 别名（`CSS.supports` 返回 false）→ 毛玻璃等效果**静默失效**。

**规则：** 源码里不要写冗余的 `-webkit-` 前缀（除非需要旧浏览器），让 Lightning CSS 自动加。若效果不生效，先检查编译后 CSS 是否保留了无前缀声明。

```css
/* ❌ 源码写两行 → 编译后可能只剩 -webkit- 版 → Chromium 不认 → 效果消失 */
backdrop-filter: blur(12px);
-webkit-backdrop-filter: blur(12px);

/* ✅ 只写无前缀版，Lightning CSS 自动补 */
backdrop-filter: blur(12px);
```

### 4. `astro preview` 是守护进程（Astro 7）

命令立即返回 JSON 后退出（后台 daemon）。不能作为 Playwright webServer（报 exited early），本地预览后要 `astro preview stop`。测试用 `python3 -m http.server` 服务 `dist/` 或 `TEST_BASE_URL` 指公网。

### 5. `<script data-astro-rerun>` 必须纯 JS

Astro 原样输出该脚本不转译 TS——写 TS 类型注解会 SyntaxError。ThemeToggle 已是正例（纯 JS + rerun 每次导航重执行）。

### 6. 本仓库测试套件

`tests/` 下有 90+ 用例。改 UI/脚本后必须跑：
```
TEST_BASE_URL=http://127.0.0.1:4321 npx playwright test   # 需先 python3 -m http.server 4321 -d dist
```
改动涉及导航/动画/脚本 → 重点跑 `navigation.spec.ts`（含回归用例）。
