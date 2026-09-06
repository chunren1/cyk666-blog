---
title: "WSL + Windows 双平台开发：踩坑与真香经验"
date: 2026-08-18
description: "一边用 Windows 做日常办公与浏览器调试，一边用 WSL 跑 Linux 开发环境，两年下来总结的实用经验：文件系统放哪、性能差距有多大、浏览器/Playwright 怎么管、SSH 与工具链怎么打通，以及 Windows 与 WSL 之间如何协作才能不互相拖累。"
tags: ["WSL", "Windows", "开发环境", "经验总结"]
---

## 为什么选择双平台开发

很多开发者会纠结一个问题：主力机到底是 Windows 还是 Linux？我的选择是**两个都要**：Windows 负责日常办公、浏览器、图形化工具；WSL（Windows Subsystem for Linux）负责所有开发工作。这样既保留了 Windows 生态的便利，又能享受 Linux 的开发体验。

这套组合跑下来的体验是：**开发环境稳定到可以忘记系统切换这件事**。WSL 里跑的服务（数据库、后端、构建工具）常年不关机，Windows 侧随时打开浏览器访问 localhost 调试，两边各司其职。

## 第一条铁律：项目必须放 Linux 原生文件系统

这是踩过最深的一个坑。WSL 会把你电脑的盘符挂载成 `/mnt/c`、`/mnt/d`，很多人图省事直接在 `/mnt/d` 下建项目，结果发现**性能差到离谱**：

- 在 `/mnt/` 挂载盘上跑 `npm install`、`git clone`、`docker build`，速度可能比原生盘慢 **5-10 倍**
- 大量小文件读写（`node_modules` 就是典型）是重灾区，因为 `/mnt/` 走的是 9P 协议桥接，每次文件操作都有协议开销
- `git status` 在巨大的仓库上都会卡顿

所以规则很简单：**所有开发项目放在 WSL 原生文件系统（ext4）里**，比如 `~/projects/`。Windows 盘只做三件事：读 Windows 侧的文件、临时迁移数据、跑 Windows 专属的 GUI 工具。

我早期把 vibeMusic 项目放在 Windows 的 D 盘开发，体验是"能跑但处处卡"，后来统一迁到 `~/projects/` 下，构建速度肉眼可见地提升。这是双平台开发体验提升最大的一步。

## WSL 里的浏览器：没有 GPU 的软件渲染世界

WSL 没有硬件 GPU 直通（至少默认配置下），Chrome/Chromium 在 WSL 里跑用的是 **SwiftShader 软件渲染**。这意味着：

- 渲染 CPU 和内存开销是原生环境的 3-5 倍
- 每多开一个浏览器实例，资源消耗都看得见
- 浏览器实例管理不当，会直接把整台机器拖垮

结合 Playwright 做自动化测试的教训是三条硬规则：

1. **复用，绝不新建**：同一轮调试只创建一个浏览器实例/context，禁止每次调用都 `newContext()`
2. **用完必须关闭**：任何手动创建的 context/browser 必须显式 `close()`，Playwright 常驻服务不会自动回收
3. **一次只做一件事**：定位目标 → 操作 → 读结果 → 关闭，不要为了等待而反复开新浏览器

真实翻车案例：某次调试每步都开新浏览器窗口，累积了十几个 Chrome 进程，GPU 进程吃满 90%+ CPU，整机内存被打满直接卡死。从那以后，浏览器资源管理成了纪律。

## Windows 侧的经验：终端与 SSH

Windows 侧最值得投入的两个配置是 **Windows Terminal** 和 **SSH key 打通**。

Windows Terminal 可以原生打开 WSL 的 Ubuntu 会话，把默认 shell 设为 WSL 的 zsh，配色主题统一，开发体验跟 macOS 的 iTerm2 已经非常接近。

SSH 的关键经验是**在 WSL 里生成 key，Windows 也复用同一把**。比如 `~/.ssh/id_ed25519` 在 WSL 里生成后，把公钥分别加到 GitHub 和 Gitee 上，两个平台都能免密推送。Windows 侧如果需要用同一把 key，可以直接引用 WSL 的文件系统路径，避免维护两套密钥。

## 网络与端口：双平台协作的隐藏坑

WSL 的网络模式默认是 NAT，Windows 和 WSL 之间访问 localhost 通常没问题（WSL 会把端口自动转发到 Windows），但有几个点要注意：

- WSL 里启动的服务，Windows 浏览器一般能直接 `localhost:端口` 访问
- 反向的情况（Windows 服务给 WSL 访问）要小心防火墙
- 服务器端的公网端口管理要独立考虑——比如我的博客部署在阿里云，公网 80/443 用 UFW 关死，只留 22，靠 Cloudflare Tunnel 出站连接，这跟本地 WSL 环境无关，是另一套安全模型

## 工具链的打通方案

双平台开发最大的痛点是工具链分裂，我的做法是**把主工具链全部放 WSL**：

| 工具 | 运行环境 | 理由 |
| --- | --- | --- |
| 编辑器 | Windows 侧（VSCode Remote-WSL） | 图形界面流畅，代码在 WSL 里跑 |
| 语言运行时（Node/Python/Java） | WSL | 与生产环境一致，原生性能 |
| 包管理器（npm/pip） | WSL | 避免 /mnt 性能陷阱 |
| 数据库（MySQL/Redis） | WSL | 常驻服务，Windows 侧随时连 |
| 浏览器调试 | Windows 侧 | 有 GPU，图形渲染快 |
| Git | WSL | 文件在 ext4，速度快 |

VSCode 的 Remote-WSL 插件是打通体验的关键：Windows 的编辑器界面 + WSL 的运行时，代码在 ext4 上，调试器、终端、扩展全部跟着 WSL 走，几乎没有割裂感。

## 值得记住的小经验清单

1. **Windows 上别 `git clone` 到大目录**：换到 WSL 里做，速度快且不会触发 Windows 的 Defender 实时扫描拖慢 IO
2. **`nohup` + 后台任务**：WSL 里常驻服务用 `nohup` 或 systemd 管理（新版 WSL 支持 systemd），会话关掉服务不中断
3. **WSL 里跑 GUI 工具要慎重**：除非需要，否则优先用 Windows 侧的工具做图形化操作
4. **Docker 优先在 WSL 里跑**：Docker Desktop 的 WSL2 后端性能远好于 Hyper-V 模式，且和开发环境同网络
5. **磁盘空间**：WSL 的 vhdx 虚拟磁盘会自动增长但不会自动收缩，空间紧张时用 `wsl --shutdown` 后执行磁盘压缩
6. **文件互访**：`\\wsl.localhost\Ubuntu\...` 可以在 Windows 资源管理器直接访问 WSL 文件系统，反之 `/mnt/c/...` 访问 Windows 文件

## 总结

双平台开发不是"两个系统各搞一套"，而是**明确分工后的统一体**：开发在 WSL，日常在 Windows，用 SSH、Remote-WSL、共享文件系统把两边缝起来。最大的经验就一条——**数据流要简单**：代码和工具链放 WSL 原生盘，Windows 只做它擅长的事。规则越简单，越不容易在某个角落里踩坑。
