---
title: "vibeMusic 开发实录：不依赖破解的自有账号全栈音乐平台"
date: 2026-08-14
description: "一款不依赖第三方破解、完全使用自有 VIP 账号获取高品质音乐的全栈学习项目。双源聚合搜索（网易云 + QQ 音乐）、去重评分排序；基于 LLM Function Calling 的 AI 智能体实现自然语言操控音乐；Redis → ES → API → 兜底的四级缓存降级链路，保障搜索 SLA。全栈测试 164 条，代码覆盖率 60%+ 门禁，搜索 P95 < 0.4s，缓存命中率 92%。"
tags: ["Java 17", "Vue 3", "AI Agent", "缓存降级"]
---

vibeMusic 这个项目源于一个很直接的需求：想做一个完全属于自己的音乐平台，不依赖任何第三方破解接口，用自有 VIP 账号就能拿到高品质音乐。从 Java 后端写到 Vue 前端，再到 Docker 编排 14 个服务上线，整个项目把现代 Web 全栈开发的流程完整走了一遍。

## 项目背景与目标

市面上很多"免费音乐站"都靠逆向破解接口支撑，这类接口不稳定，随时可能失效，还有不小的合规风险。做 vibeMusic 之前我先给自己定了三条原则：

- 不碰破解与逆向，音乐来源只走自有 VIP 账号的合法能力；
- 搜索要快、要稳，网易云和 QQ 音乐双源聚合，用缓存降级保障 SLA；
- 全链路可观测、可测试，质量用数据说话。

功能目标也很明确：用户注册登录、歌曲搜索、歌单、收藏、播放历史，再加上一个基于 LLM Function Calling 的 AI Agent，支持用自然语言直接操控音乐系统。

## 技术选型与整体架构

后端选 Java 17 + Spring Boot，本地开发用 Spring Boot 3.x，实际部署在 Spring Boot 4.0.6 / Spring 7 上；前端 Vue 3.5 + Vite；数据层 MySQL、Redis、Elasticsearch。为了聚合两个音乐源，我额外写了一个 Node.js Express 的 BFF 网关，跑在 3000 端口，负责源接入、去重和评分。整体链路如下：

```text
用户 → Nginx
 ├─→ Vue 前端（Vue 3.5 + Vite 构建，静态资源）
 ├─→ Spring Boot 后端（REST API，JWT 鉴权）
 │     └─→ MySQL（业务数据） / Redis（缓存） / ES（搜索） / MinIO（对象存储）
 ├─→ Express BFF（:3000，网易云 + QQ 音乐双源聚合）
 └─→ Prometheus → Grafana（可观测面板）
```

### 应用功能与数据模型

用户系统走 JWT 注册登录，歌曲、歌单、收藏、播放历史落 MySQL，核心表结构比较直白：

| 表名 | 职责 |
|------|------|
| users | 用户信息与登录凭证 |
| song | 歌曲元数据与来源标识 |
| playlist | 歌单 |
| playlist_song | 歌单与歌曲关联 |
| user_favorite | 用户收藏 |
| play_history | 播放历史 |

## 核心特性详解

### 双源聚合搜索

BFF 把网易云和 QQ 音乐两个源的搜索结果拿回来，按"歌曲名 + 歌手"归一化去重，再按来源可信度和匹配度打分排序。搜"周杰伦""热歌"这类关键词时，返回的正是 74 首去重后的结果，同一首歌不会出现两遍。核心逻辑很薄：

```js
// express-bff/search.js
const sources = [neteaseSearch, qqMusicSearch];
const results = await Promise.all(sources.map(fn => fn(keyword)));
const merged = dedupeByKey(flat(results), r => r.title + r.artist);
merged.sort((a, b) => score(b) - score(a)); // 来源权重 + 匹配度打分
```

### AI Agent：自然语言操控音乐

基于 LLM Function Calling，把"搜索、播放、加歌单、收藏"暴露成函数给模型调用，用户直接说"放一首周杰伦的晴天"就能完成搜索加播放。回复走 SSE 流式输出，首字延迟控制在 500ms 以内。函数声明的核心就是一段 JSON：

```json
tools: [{
  "type": "function",
  "function": {
    "name": "search_and_play",
    "description": "按关键词搜索歌曲并加入播放队列",
    "parameters": {
      "type": "object",
      "properties": { "keyword": { "type": "string" } },
      "required": ["keyword"]
    }
  }
}]
```

### 四级缓存降级：搜索 SLA 的底气

搜索链路设计成 Redis → ES → API → 兜底四级，逐层 fallback。正常情况 Redis 直接命中；缓存未命中查 ES；ES 不可用或没有结果再打上游 API；连 API 都失败就返回兜底结果。每一层都打结构化日志，真实运行日志长这样：

```text
2026-08-14 21:03:02 [CACHE-LAYER] miss key=search:周杰伦
2026-08-14 21:03:02 [ES-LAYER]   hit  hits=74 took=186ms
2026-08-14 21:03:02 [CACHE-LAYER] set  key=search:周杰伦 ttl=1800s
```

> [!WARNING] 降级不是偷懒，是明确的分层 SLA。宁可让某一层慢一点或者空一点，也不能让整条搜索链路跟着雪崩。缓存命中率稳定在 92%，搜索 P95 和音频流 P95 都被压进 0.4s。

### 监控可观测

用 Micrometer 埋点 + Prometheus 采集 + Grafana 面板，盯三组指标：JVM（堆、GC、线程）、缓存（命中率、TTL 驱逐）、延迟（搜索、流媒体、AI 首字）。线上出问题先看面板定位到层，再翻日志核对细节，排查效率比瞎猜高很多。

### 全栈 DevOps

14 个服务用 docker-compose 统一编排，包含 MySQL、Redis、ES、MinIO、Prometheus、Grafana、后端、前端、BFF 等。GitHub Actions 负责 CI/CD：push 触发全栈测试（共 164 条），代码覆盖率低于 60% 直接拦截构建，通过后自动构建镜像并部署到服务器。

## 踩坑与设计决策

### ES 初始化失败不能拖垮主流程

ES 启动慢，如果后端强依赖它，服务会一直起不来。我改成异步初始化：ES 初始化失败只跳过搜索缓存层并告警，用户、歌单、播放这些主流程照常工作。同样的思路用在 MinIO 上，存储桶创建失败时自动降级为本地存储模式，不阻塞上传功能。

### 音频流和搜索同等重要

一开始只盯着搜索性能，结果播放偶尔卡顿。后来给音频流单独做了链路：BFF 拿到直链后走本地缓存加预加载，音频流 P95 才真正压进 0.4s。

> 这个项目最大的收获不是技术清单，而是降级意识：任何一个组件都可能挂，设计的时候就要想清楚，它挂了以后系统该怎么活。

## 量化结果

| 维度 | 指标 | 数值 |
|------|------|------|
| 测试 | 全栈测试用例 | 164 条 |
| 质量 | 代码覆盖率门禁 | 60%+ |
| 性能 | 搜索 P95 | < 0.4s |
| 性能 | 音频流 P95 | < 0.4s |
| 缓存 | 缓存命中率 | 92% |
| AI | AI 首字延迟 | < 500ms |
| 接口 | API 端点 | 30+ |
| 部署 | Docker 服务 | 14 个 |

> [!NOTE] 在线 Demo：[https://vibe.cyk666.top](https://vibe.cyk666.top)

项目代码、文档都在仓库里。下一步计划做多端同步和更细粒度的个性化推荐，把这套降级体系沉淀成通用的脚手架。