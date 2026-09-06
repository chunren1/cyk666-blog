---
title: "MySQL 8.4 升级踩坑记录"
date: 2026-08-17
description: "Ubuntu 26.04 默认安装 MySQL 8.4，mysql_native_password 插件已被默认移除，旧教程里的 ALTER USER ... IDENTIFIED WITH mysql_native_password 会直接报 Plugin not loaded。改用 caching_sha2_password 后的完整配置记录，以及配套的 Redis 密码、Spring Boot 环境变量注入姿势。"
tags: ["MySQL 8.4", "踩坑", "Redis", "systemd"]
---

## 背景与目标

vibeMusic 的 Spring Boot 后端要跑在本地 WSL（Ubuntu 26.04）上，第一步是把数据层铺好：MySQL 存业务数据，Redis 管缓存和热搜。直接 apt 安装：

```bash
sudo apt-get update
sudo apt-get install mysql-server redis-server
```

装完一看版本，MySQL 8.4.10、Redis 8.0.5，都挺新。MySQL 8.4 是 LTS，默认配置比 8.0 收紧了一大截，这次踩的坑基本全落在"新默认值"上。

## 踩坑 1：apt 中断，dpkg 锁死

第一次安装时网络超时中断，再跑安装命令直接报错：

```text
E: dpkg was interrupted, you must manually run 'sudo dpkg --configure -a'
```

按提示补一刀：

```bash
sudo dpkg --configure -a
```

修复完才发现包其实早就装上了，两个版本都能查到：

```bash
$ mysql --version
mysql  Ver 8.4.10 for Linux on x86_64 ...
$ redis-server --version
Redis server v=8.0.5
```

> [!NOTE] apt 中断不等于没装上。先跑 `dpkg --configure -a` 修复再验证，别急着卸载重装。

## 踩坑 2：mysql_native_password 已死

WSL 下 MySQL 的 root 默认走 auth_socket 插件，本地免密登录。要给 Spring Boot 配密码登录，按老习惯执行：

```sql
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'xxx';
```

直接报错：

```text
ERROR 1524 (HY000) at line 2: Plugin 'mysql_native_password' is not loaded
```

原因很简单：MySQL 8.4 默认移除了 mysql_native_password 插件，这个插件在 8.0 就被标记废弃了。换 8.x 默认插件 caching_sha2_password 即可，Spring Boot 8.x 驱动原生支持，不用额外配置：

```sql
ALTER USER 'root'@'localhost' IDENTIFIED WITH caching_sha2_password BY 'xxx';
```

## 踩坑 3：导入初始化 SQL

建库后一次性导入 7 张表：users、song、playlist、playlist_song、user_favorite、play_history 等。

```bash
mysql -uroot -p密码 vibemusic < init.sql
```

## 踩坑 4：systemd 的 Environment 放错段

给后端写 systemd unit 时，把 Redis 密码的 Environment 顺手追加到了 [Install] 段后面：

```ini
[Install]
WantedBy=multi-user.target
Environment=REDIS_PASSWORD=xxx   # 写错位置
```

systemd 只甩一句警告：

```text
systemd[1]: /etc/systemd/system/vibebackend.service:7: Unknown key 'Environment' in section [Install], ignoring.
```

警告被忽略的代价是环境变量根本没注入，后端连 Redis 直接失败，日志反复刷：

```text
Unable to connect to Redis
```

> [!WARNING] Environment 必须放在 [Service] 段内。写完 unit 用 `systemd-analyze verify` 检查一遍，别等运行时才发现。

## 踩坑 5：启动慢到以为挂了

Spring Boot 启动要 90 到 140 秒，含热搜关键词 prewarm 预热。中途用 systemctl is-active 看是 active，但其实还没就绪。判断就绪只看日志：

```bash
journalctl -u vibebackend | grep "Tomcat started on port 8080"
```

## Redis 密码配置

/etc/redis/redis.conf 里设置 requirepass，与项目根目录 .env 中的 REDIS_PASSWORD 保持一致（如 3KOrynsnGSSVxgUVfPg9Zw），重启后验证：

```conf
requirepass 3KOrynsnGSSVxgUVfPg9Zw

sudo systemctl restart redis-server
redis-cli -a 3KOrynsnGSSVxgUVfPg9Zw ping    # → PONG
```

## 验证命令汇总

```bash
systemctl is-active mysql redis-server    # → active
mysql -uroot -p密码 -e "SELECT 1;"         # → 1
redis-cli -a 密码 ping                     # → PONG
```

> 一句话总结：MySQL 8.4 别再惦记 mysql_native_password，直接用默认的 caching_sha2_password，能省掉一整轮排查。