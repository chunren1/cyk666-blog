# cyk666-blog · 陈永康的个人技术博客

线上地址：**https://cyk666.top** ｜ 技术文章 ＋ 项目展示的静态站点，Astro 构建、Nginx 托管。

## 这是什么

- 首页：个人介绍 ＋ 技术文章列表 ＋ 项目卡片矩阵（7 个：vibeMusic / LanShare / 学研在线 / JavaInfoHub / JobRader / Myworker / blog）
- `/articles/[slug]`：技术笔记详情页（7 篇：内网穿透、MySQL、SSH 反向隧道、WSL、vibeMusic、学研在线）
- `/projects/[slug]`：项目详情页——标题/描述/标签/源码按钮 ＋ **实时拉取对应 GitHub 仓库 `README.md` 渲染的技术笔记区**，与源码保持同步
- 暗色模式（防闪烁初始化）、中文排版优化、移动端适配、`prefers-reduced-motion` 降级

## 技术栈

Astro 7（静态输出）＋ TypeScript ＋ Content Collections（`src/data/articles/*.md`，glob loader ＋ zod 校验）＋ `marked`（README 渲染）＋ Inter 可变字体 ＋ Lucide 图标 ＋ Playwright（7 个 spec：首页/文章/导航/主题/SEO/移动端/动效）

要求 Node.js ≥ 22.12。

## 本地开发

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # 输出到 dist/
npm run preview  # 预览构建产物
npx playwright test
```

## 部署

`./deploy.sh`：构建 → `rsync --delete` 同步 `dist/` 到云服务器 `/var/www/testweb-dist-new` → 本地链路验证 → 公网验证。线上由宿主机 Nginx（80 端口，`try_files`）直接托管静态文件，经 Cloudflare Tunnel 对外。

## 目录

```
src/
├── pages/            # index.astro（首页）/ articles/[slug].astro / projects/[slug].astro
├── data/articles/    # 技术文章 Markdown（7 篇）
├── components/       # ProjectCard（含 3D 倾斜＋高光）/ GithubIcon 等
├── layouts/          # BaseLayout（暗色初始化＋SEO）
└── content.config.ts # articles 集合定义
```
