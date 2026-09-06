---
title: "免备案托管实战：Cloudflare Tunnel + 阿里云"
date: 2026-08-17
description: "国内服务器没备案也能跑 HTTPS 网站的完整方案：域名 DNS 托管到 Cloudflare，服务器通过 cloudflared 隧道主动外连，公网 80/443 端口全部关闭，服务器对公网\"隐身\"。手把手记录从建隧道、配 ingress、切 DNS 到验证证书的完整链路。"
tags: ["Cloudflare", "免备案", "隧道", "运维"]
---

## 背景：没备案，也想跑 HTTPS

手头这台阿里云是国内地域的服务器，2 核 1.6G，Ubuntu 22.04，一直想拿来托管个人博客。卡点很明确：域名没有 ICP 备案。国内服务器没备案的公网 IP，80/443 端口不允许对外提供服务，域名解析过去直接被拦，更别想 HTTPS。备案流程要等好几周，我懒得等，于是盯上了 Cloudflare Tunnel 这条免备案的路。

思路其实很简单：**不让流量从公网进 80/443，而是让服务器主动外连 Cloudflare 边缘节点**。cloudflared 在服务器上发起一条出站长连接，域名流量先到 Cloudflare，再由边缘节点顺着这条隧道转发回服务器。服务器的公网 80/443 全程关闭，对公网等于隐身，阿里云探测不到 HTTP 服务，自然管不着备案这件事。

## 整体链路

```text
浏览器
  │  HTTPS（443，TLS 终止在 Cloudflare）
  ▼
Cloudflare 边缘节点 ── DNS: cyk666.top（免费计划托管）
  │  出站长连接（cloudflared，走 7844 端口）
  ▼
服务器 cloudflared ──► http://localhost:80 ──► nginx 静态博客
  │
  └─ 公网 80/443 被 UFW 全关，对公网不可见
```

相比常见的「nginx 挂 SSL 证书」方案，区别在于服务器上根本没有 80/443 的监听，HTTPS 完全由 Cloudflare 边缘负责，服务器只回一条本地 HTTP。

## 为什么能免备案

| 项目 | 常规托管 | 本方案 |
|------|----------|--------|
| 80/443 入站 | 公网开放，可被扫描 | UFW 全关，仅 22 |
| HTTPS 证书 | 自己申请、手动续 | Cloudflare 自动签发续期 |
| 服务器被探测 HTTP | 能探测到 | 探测不到，无 HTTP 监听 |
| 备案要求 | 需要 | 规避（灰色地带） |

## 实施步骤

### 1. DNS 托管迁移到 Cloudflare

Cloudflare 添加站点 `cyk666.top`，选免费计划，拿到两个 NS：`brenda.ns.cloudflare.com` 和 `finley.ns.cloudflare.com`。去阿里云域名控制台把 NS 改成这两个。改完 NS 要等 DNS 传播，快的十几分钟，慢的可能要几小时，期间网站先不解析是正常的。

### 2. 安装并授权 cloudflared

```bash
# 以 root 运行，扫码授权（授权一次即可，永久有效）
cloudflared tunnel login
# 成功后生成 /root/.cloudflared/cert.pem
```

login 会打印一个链接，浏览器打开后用 Cloudflare 账号扫码，授权后证书落到 `/root/.cloudflared/cert.pem`。

### 3. 创建隧道

```bash
cloudflared tunnel create cyk666
# 返回隧道 ID，并在 ~/.cloudflared/ 生成对应 ID 的凭据 json
```

### 4. 写配置文件

```yml
# /etc/cloudflared/config.yml
tunnel: cyk666
credentials-file: /root/.cloudflared/<隧道ID>.json

ingress:
  - hostname: cyk666.top
    service: http://localhost:80
  - hostname: www.cyk666.top
    service: http://localhost:80
  - service: http_status:404
```

### 5. 解析域名到隧道

```bash
# 注意：域名原本在阿里云有 A 记录，首次 route dns 会报冲突
cloudflared tunnel route dns --overwrite-dns cyk666 cyk666.top
cloudflared tunnel route dns --overwrite-dns cyk666 www.cyk666.top
```

第一次跑会报「A record already exists」之类的冲突，加上 `--overwrite-dns` 强制覆盖就行。

### 6. systemd 托管，开机自启

```ini
# /etc/systemd/system/cloudflared.service
[Unit]
Description=Cloudflare Tunnel
After=network-online.target
Wants=network-online.target

[Service]
Type=notify
ExecStart=/usr/local/bin/cloudflared tunnel --config /etc/cloudflared/config.yml run
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable --now cloudflared

# 顺手确认隧道注册状态
cloudflared tunnel list          # 应显示 cyk666 为 active
cloudflared tunnel info cyk666   # 显示连接到的边缘节点地址
```

## 踩坑记录

### 坑 1：systemd 一直起不来，报 flag 未定义

第一次写 ExecStart 我把参数顺序写反了，写成 `cloudflared tunnel run --config /etc/cloudflared/config.yml`，结果服务反复重启，日志里报：

```text
flag provided but not defined: -config
```

原因是 `--config` 属于 cloudflared 顶层参数，必须在 `tunnel` 子命令之前。改成 `cloudflared tunnel --config /etc/cloudflared/config.yml run` 就正常了。这个坑耽误了我半个小时。

### 坑 2：浏览器报 ERR_CERT_AUTHORITY_INVALID

隧道通了，服务器端 curl 都 200，但浏览器打开一直报证书无效。查了一圈发现是本地 DNS 缓存还指向阿里云解析的旧 IP，流量没走 Cloudflare，自然没有对应证书。Windows 上执行 `ipconfig /flushdns`，再彻底重启浏览器，问题消失。

## 证书说明

证书这块基本零运维：TLS 终止在 Cloudflare 边缘，证书由 Cloudflare 自动签发（根证书是 Google Trust Services 的 WE1），浏览器看到的就是标准 HTTPS。有效期自动续，不需要自己申请、不需要手动上传，服务器上连 pem 都不用配。

## 收尾加固

- UFW 只放行 22，其余全拒：`ufw allow 22 && ufw enable`
- 阿里云安全组里删掉 80/443/3389 入方向规则，公网对这些端口彻底不可达
- 重启服务器验证过一次：开机后 cloudflared 自动拉起隧道，网站无需人工干预就恢复

> [!WARNING] 说明一点：这种模式是「对阿里云的探测隐身」，服务本身仍真实跑在这台国内服务器上，属于灰色地带。只建议个人博客这类低流量场景，别拿去跑正经业务，风险自担。

## 验证命令

```bash
# 查看隧道运行状态，应显示 3 个 Edge 连接
systemctl status cloudflared

# 公网验证：应返回 HTTP/2 200
curl -I https://cyk666.top
```

> 跑通的那一刻，浏览器地址栏出现绿色小锁，还是挺有成就感的。免备案 + 免费 HTTPS + 自动续期，这套组合对个人站点够用了。