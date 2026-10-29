/**
 * 项目列表的唯一数据源。
 *
 * 首页卡片（index.astro）与详情页（projects/[slug].astro）都从这里读，
 * 加/改项目只改这一个文件 —— 之前两处各写一份，加了首页卡片忘了详情页就会点进去 404。
 *
 * ⚠️ `slug` 同时是 URL 片段，历史链接是 /projects/<title>/（中文会 URL 编码），
 *    所以 slug 必须与 title 完全一致，改标题等于改链接（旧链接会 404）。
 */
export interface Project {
  /** URL 片段，= title，不要单独改 */
  slug: string;
  title: string;
  description: string;
  repo: string;
  /** README 所在分支（各仓库默认分支不同，别统一写 main） */
  branch: string;
  /** 在线演示地址，没有就不写 */
  demo?: string;
  tags: string[];
  /** 详情页拉取的文件名，默认 README.md */
  readmePath?: string;
}

export const projects: Project[] = [
  {
    slug: 'vibeMusic',
    title: 'vibeMusic',
    description:
      '全栈音乐平台 — 从零构建的在线音乐播放器，支持歌单管理、歌词同步、个性化推荐。前后端分离架构，部署于 Cloudflare。',
    repo: 'https://github.com/chunren1/vibeMusic',
    branch: 'main',
    demo: 'https://vibe.cyk666.top',
    tags: ['Vue 3', 'Java', '全栈', 'Cloudflare'],
  },
  {
    slug: 'LanShare',
    title: 'LanShare',
    description:
      '局域网文件共享工具 — 电脑/手机/平板通过浏览器互相传输文件，无需外网。支持大文件分片上传、断点续传、秒传、打包下载与在线预览。',
    repo: 'https://github.com/chunren1/LanShare-Source',
    branch: 'main',
    tags: ['Python', 'Node.js', '局域网', '文件传输'],
  },
  {
    slug: '学研在线',
    title: '学研在线',
    description:
      '微服务教育平台 — 面向在线教育场景的微服务架构实践，涵盖用户中心、课程管理、学习进度追踪等核心模块。',
    repo: 'https://github.com/chunren1/xueyan',
    branch: 'main',
    tags: ['微服务', 'Java', 'Spring Boot', '教育'],
  },
  {
    slug: 'JavaInfoHub',
    title: 'JavaInfoHub',
    description:
      'Java 开发者信息聚合平台 — 聚合 4 个技术源的文章与资讯，结合 AI 智能增强。WebMagic/Jsoup 爬虫 + React 18 + Spring Boot。',
    repo: 'https://github.com/chunren1/JavaInfoHub',
    branch: 'master',
    tags: ['React', 'Spring Boot', '爬虫', 'AI'],
  },
  {
    slug: 'JobRader',
    title: 'JobRader',
    description:
      'AI 求职雷达 — Chrome 插件 + Next.js 的求职效率工具，一键采集招聘网站岗位数据，AI 语义分析智能评分与简历匹配度分析。',
    repo: 'https://github.com/chunren1/JobRader',
    branch: 'master',
    tags: ['Chrome 插件', 'Next.js', 'AI', '求职'],
  },
  {
    slug: 'Myworker',
    title: 'Myworker',
    description:
      '个人作品集网站 — 面向求职展示的全栈工程师作品集，Next.js 14 + Framer Motion 动效，突出技术能力与项目经验。',
    repo: 'https://github.com/chunren1/Myworker',
    branch: 'main',
    demo: 'https://myworker-three.vercel.app',
    tags: ['Next.js', 'React', 'Framer Motion', '作品集'],
    readmePath: 'TECH_DESIGN.md',
  },
  {
    slug: 'blog',
    title: 'blog',
    description:
      '本站博客应用 — 本博客的源码仓库，基于 Astro 构建的静态技术博客，支持暗色模式和中文优化排版。（原 testWeb，已重命名为 blog）',
    repo: 'https://github.com/chunren1/cyk666-blog',
    branch: 'main',
    tags: ['Astro', '静态站点', '博客'],
  },
];

/** slug → 项目，详情页用；构建时生成静态路径也用它 */
export const projectBySlug = new Map(projects.map((p) => [p.slug, p]));
