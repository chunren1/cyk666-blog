---
title: "SSH 反向隧道：让 2 核小服务器跑完整后端"
date: 2026-08-17
description: "vibeMusic 后端（Spring Boot + MySQL + Redis + Node API）全部跑在本地 WSL，云服务器只放前端静态文件。用 autossh 建立 SSH 反向隧道（WSL:8080 → 服务器:8080），nginx 将 /api 反代到隧道端口，实现\"云上静态、本地后端\"的轻量部署架构，小内存服务器也能流畅运行完整项目。"
tags: ["SSH 隧道", "autossh", "部署架构", "systemd"]
---

## 背景：小服务器跑不动全家桶

vibeMusic 音乐站的后端是 Java Spring Boot，还挂着 MySQL、Redis，以及一个 Node.js 写的音乐 API。这套东西全塞进那台 2 核 1.6G 的云服务器，内存和 CPU 都吃紧，随便来点并发就抖，Java 一启动就吃掉一大半内存。而我本地的 WSL（Ubuntu 26.04，9.7GB 内存）资源充足，长期闲置。

于是做了个架构决策：**方案 B，后端全家桶留在本地 WSL，云服务器只放前端静态文件**。Vue 的 dist 打包出来约 2.8M，小服务器当静态文件服务器毫无压力。两边用一条 SSH 反向隧道打通，等于把 WSL 的端口「借」到云服务器上。

## 整体链路

```text
浏览器
  │  HTTPS
  ▼
Cloudflare 边缘 (vibe.cyk666.top)
  │  cloudflared 隧道
  ▼
云服务器 cloudflared
  │  http://localhost:8081
  ▼
云服务器 nginx :8081
  ├── 静态前端 (Vue dist，try_files 直出)
  └── /api 反代 ──► 127.0.0.1:8080 ──(SSH 反向隧道)──► WSL 后端 :8080
```

整条链路里，唯一「跨机器」的那一跳就是 `127.0.0.1:8080`。在服务器看来它只是连了一个本地端口，实际数据通过 SSH 隧道传回了家里的 WSL。

## 关键实现

### 1. 反向隧道：把 WSL 的 8080 暴露到服务器

在 WSL 里执行（WSL 主动连服务器，服务器侧不需要开任何额外端口）：

```bash
# 把 WSL 的 8080 映射到服务器的 8080
ssh -R 8080:localhost:8080 root@101.132.167.178
```

`-R` 是反向转发：远端（服务器）的 8080 收到的连接，全部送回本地（WSL）的 8080。注意方向别搞反，正着用 `-L` 是把服务器端口拉到本地，不是我们要的。

> [!NOTE] 这套的前提是 WSL 有到服务器的 SSH 访问权。我用的密钥登录，且只在 WSL 侧建连，服务器无需给 SSH 开额外放行（22 本来就开着）。

### 2. autossh 守护，断了自动重连

裸 ssh 一旦断线就凉了，得用 autossh 保活。我关了监控端口（`-M 0`），改用 SSH 自带的 keepalive 参数：

```bash
autossh -M 0 -N -R 8080:localhost:8080 \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -o ExitOnForwardFailure=yes \
  -o StrictHostKeyChecking=no \
  root@101.132.167.178
```

- `-M 0`：关闭 autossh 自带的监控端口，避免占用多余端口
- `ServerAliveInterval=30`：每 30 秒发一次心跳，防止连接被中间设备掐断
- `ExitOnForwardFailure=yes`：8080 绑定失败就退出，让 systemd 立刻重启而非挂着半死连接

### 3. systemd 服务托管

```ini
# /etc/systemd/system/vibetunnel.service（放在 WSL 侧）
[Unit]
Description=Autossh reverse tunnel for vibeMusic backend
After=network-online.target
Wants=network-online.target

[Service]
User=root
ExecStart=/usr/bin/autossh -M 0 -N -R 8080:localhost:8080 \
  -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
  -o ExitOnForwardFailure=yes -o StrictHostKeyChecking=no \
  root@101.132.167.178
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable --now vibetunnel.service
```

`Restart=always` + `RestartSec=5`：隧道挂了 5 秒内自动拉起，配着 autossh 的重连逻辑，基本感知不到断线。

### 4. 服务器 nginx：静态文件 + /api 反代

```conf
# /etc/nginx/conf.d/vibe.conf
server {
    listen 127.0.0.1:8081;
    server_name vibe.cyk666.top;

    root /var/www/vibe/dist;
    index index.html;

    # SPA 路由：所有路径都回退到 index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 后端接口全部走隧道回 WSL
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

监听在 `127.0.0.1:8081`，不暴露到公网，只有本机 cloudflared 能碰到它，少一层攻击面。WSL 侧同理：MySQL、Redis 都绑 `127.0.0.1`，只有 Spring Boot 开 8080 等着隧道接入，别开 0.0.0.0。

### 5. cloudflared 新增 ingress 规则

```yml
# /etc/cloudflared/config.yml（追加）
  - hostname: vibe.cyk666.top
    service: http://localhost:8081
```

### 6. 解析子域名

```bash
cloudflared tunnel route dns --overwrite-dns cyk666 vibe.cyk666.top
systemctl restart cloudflared
```

## 前端零改动

最舒服的一点：前端一行代码都没改。vibeMusic 的 Vue 项目从一开始 API 就用相对路径，`vibemusic-web/src/api/request.js` 里 `API_BASE = '/api'`。部署时页面和接口同源，nginx 按路径分流就行，连环境变量都不用换。

## 收益

| 角色 | 承担的工作 | 资源 |
|------|-----------|------|
| 云服务器 | 静态文件 + 反向代理 | 2 核 1.6G 绰绰有余 |
| 本地 WSL | Spring Boot + MySQL + Redis + Node 音乐 API | 9.7GB 内存随便跑 |
| Cloudflare | TLS 终止 + 隧道入口 | 免费 |

整个部署不新增一分钱成本，服务器、域名、隧道都是已有的。

## 代价与注意事项

> [!WARNING] 最大代价：**WSL 必须保持开机**。本机关机或 WSL 关了，SSH 隧道随之断开，公网上页面还能打开（静态文件在服务器），但所有 /api 请求会 502 Bad Gateway。autossh 会在 WSL 下次开机后自动重连，服务随之恢复，只是这段时间后端不可用。

- 502 比连接被拒好排查：看到 502 先查 WSL 是否开机、`systemctl status vibetunnel` 是否 running、服务器 `ss -tlnp | grep 8080` 是否在听
- 家里的网络可能变（IP/运营商），WSL 连不上时检查一下当前网络能不能 ssh 到服务器
- 如果哪天流量大了，还是得把后端迁回云上或换大内存机器，这套是穷办法

## 验证命令

```bash
# 在服务器上：确认 nginx 能经过隧道够到后端 → 200
curl http://127.0.0.1:8081/api/auth/health

# 在公网：完整链路穿透 → 返回真实歌曲 JSON
curl https://vibe.cyk666.top/api/recommend/personalized
```

> 当公网请求真的返回了推荐歌曲列表的 JSON 时，等于验证了浏览器 → Cloudflare → 服务器 → SSH 隧道 → 家里 WSL 这一整条链路全通。一台 2 核小服务器，就这么把完整后端服务「外包」给了自己的电脑。