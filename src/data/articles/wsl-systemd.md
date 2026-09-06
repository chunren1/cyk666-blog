---
title: "WSL + systemd：把本地环境变成稳定\"服务器\""
date: 2026-08-17
description: "让 WSL 里的服务像云服务器一样稳定：MySQL / Redis / Spring Boot / Node API / autossh 隧道全部注册为 systemd 服务，崩溃自动重启、开机自启、日志统一 journalctl 管理。记录 systemd 服务文件编写的几个坑（Environment 位置、nvm node 全路径、启动依赖顺序）。"
tags: ["WSL", "systemd", "运维", "autossh"]
---

## 背景与目标

vibeMusic 的后端全家桶现在全跑在本地 WSL（Ubuntu 26.04）上：MySQL、Redis、Spring Boot 后端、Node 音乐 API，外加一条到云服务器的 SSH 反向隧道。既然 systemd 在 WSL 里已经可用，就别再靠一堆终端窗口手动起服务了。目标跟云服务器对齐：崩溃自动重启、开机自启、日志统一管理。

## 服务清单

全部注册为 systemd unit 并 enabled：

| 服务 | 职责 | 重启策略 |
|------|------|----------|
| mysql.service | MySQL 数据层 | 系统自带 |
| redis-server.service | Redis 缓存 | 系统自带 |
| vibebackend.service | Spring Boot 后端 :8080 | on-failure |
| musicapi.service | Node 音乐 API :3000 | on-failure |
| vibetunnel.service | autossh 反向隧道 | always |

整体架构：

```text
WSL (Ubuntu 26.04)
┌────────────────────────────────────────────┐
│  vibebackend :8080                         │
│    ├── mysql.service                       │
│    ├── redis-server.service                │
│    └──→ musicapi :3000                     │
│  vibetunnel (autossh -R 8080) ──→ 云服务器 :8080
└────────────────────────────────────────────┘
```

## vibebackend.service

```ini
[Unit]
Description=vibeMusic Spring Boot backend
After=mysql.service redis-server.service
Wants=mysql.service redis-server.service

[Service]
WorkingDirectory=/home/user/projects/vibeMusic/vibeMusic-backend
Environment=REDIS_PASSWORD=3KOrynsnGSSVxgUVfPg9Zw
ExecStart=/usr/bin/java -Xmx512m -jar /home/user/projects/vibeMusic/vibeMusic-backend/target/vibeMusic-backend-0.0.1-SNAPSHOT.jar
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

WorkingDirectory 特意指到 vibeMusic-backend 目录，这样代码里 DotenvLoader 用相对路径加载的 ../.env 能命中项目根目录的 .env，密码才能读到。

## vibetunnel.service

```ini
[Unit]
Description=autossh reverse tunnel to cloud server
After=network-online.target

[Service]
ExecStart=/usr/bin/autossh -M 0 -N -R 8080:localhost:8080 -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 deploy@云服务器IP
Restart=always

[Install]
WantedBy=multi-user.target
```

## 踩坑 1：node 找不到

musicapi 的 ExecStart 最初写的 /usr/bin/node，一启动就报 203：

```text
vibemusic[1234]: main process exited, code=exited, status=203/EXEC
vibemusic[1234]: Failed at step EXEC spawning /usr/bin/node: No such file or directory
```

因为 node 是 nvm 装的，真实路径在：

```text
/home/user/.nvm/versions/node/v24.19.0/bin/node
```

ExecStart 必须写全路径。systemd 的环境是精简过的，nvm 那套 PATH 注入在这里完全不管用。

> 踩过一遍之后的教训：systemd unit 里的可执行文件一律写绝对路径，写之前先用 which 查清楚。

## 踩坑 2：Environment 必须在 [Service] 段

写完每个 unit 都要过一遍语法检查：

```bash
sudo systemd-analyze verify /etc/systemd/system/*.service
```

写错段 systemd 只警告不报错，运行时才炸。这个坑在 MySQL 篇里踩过一轮，从 systemd 视角再看一遍，验证工具是真省事。

## 踩坑 3：启动顺序

vibebackend 依赖 MySQL 和 Redis，unit 里用 After + Wants 声明，保证顺序。Node API 要提前起来，后端的搜索会调它，起晚了第一次请求就 502。

## 踩坑 4：autossh 隧道端口冲突

重启 vibetunnel 前，本地可能还挂着之前手动敲的 ssh -R 进程。不先杀掉，云服务器 8080 端口被旧隧道占着，新隧道因为 ExitOnForwardFailure 直接退出：

```bash
pkill -f "ssh -R 8080"    # 先停掉手动隧道
sudo systemctl restart vibetunnel
```

> [!WARNING] 依赖端口的东西都要先清干净手动残留再启 systemd 服务，否则静默失败很难定位。

## 运维收益

- systemctl is-active 一条命令查全部服务状态
- journalctl -u vibebackend 看单个服务日志，不用再开终端窗口
- WSL 重启后所有服务自动拉起，systemctl is-enabled 看全是 enabled

## 验证命令

```bash
for s in mysql redis-server vibebackend musicapi vibetunnel; do
  systemctl is-active $s
done
# 全部输出 active

journalctl -u vibebackend | grep "Tomcat started"    # 后端就绪

# 云服务器上验证全链路
curl http://127.0.0.1:8081/api/auth/health            # → 200
```