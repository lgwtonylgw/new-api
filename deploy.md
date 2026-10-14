# 生产部署与新服务器迁移手册

本文档适用于以下生产配置：

- 域名：`tokenaigate.com`
- Git 分支：`feature/20261013-init`
- 安装目录：`/data/new-api`
- 数据库：MySQL 8.2
- 缓存：Redis
- 入口：Cloudflare → Nginx → `127.0.0.1:3000` → new-api

## 一、重要文件和数据

迁移或备份时需要保留：

| 内容 | 位置 | 是否必须 |
| --- | --- | --- |
| MySQL 数据 | Compose 的 `mysql_data` 数据卷 | 必须，使用 `mysqldump` 导出 |
| 服务密码 | `/data/new-api/.env` | 必须，禁止提交到 Git |
| 应用文件 | `/data/new-api/data` | 建议保留 |
| 应用日志 | `/data/new-api/logs` | 可选 |
| 源代码 | Git 仓库 | 重新拉取即可 |
| Redis 数据 | 无持久化卷 | 不需要迁移 |

生产环境不要执行 `docker compose down -v`，`-v` 会删除 MySQL 数据卷。

## 二、新服务器基础环境

以下命令适用于 Ubuntu/Debian，并假定当前用户是 `root`：

```bash
apt update
apt install -y git curl ca-certificates nginx certbot python3-certbot-nginx

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sh /tmp/get-docker.sh
  rm -f /tmp/get-docker.sh
fi

systemctl enable --now docker
systemctl enable --now nginx
docker --version
docker compose version
```

云服务器安全组至少需要：

- TCP 22：仅允许自己的固定 IP
- TCP 80、443：允许公网；稳定后可进一步只允许 Cloudflare IP 段
- 不开放 3000、3306、6379

## 三、全新安装

没有历史数据时使用本节；从旧服务器迁移时跳到第四节。

```bash
mkdir -p /data
cd /data
git clone -b feature/20261013-init --single-branch 仓库地址 new-api
cd /data/new-api

umask 077
MYSQL_ROOT_PASSWORD="$(openssl rand -hex 24)"
REDIS_PASSWORD="$(openssl rand -hex 24)"
printf 'MYSQL_ROOT_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \
  "$MYSQL_ROOT_PASSWORD" "$REDIS_PASSWORD" > .env
unset MYSQL_ROOT_PASSWORD REDIS_PASSWORD
chmod 600 .env

docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 new-api
curl --retry 10 --retry-connrefused --retry-delay 2 \
  -fsS http://127.0.0.1:3000/api/status
```

`.env` 只保留在服务器，已被 Git 忽略。不要把真实密码发送到聊天、截图或提交到开源仓库。

应用正常后，完成第六节的 Nginx、HTTPS 和 Cloudflare 配置，然后立即通过 `https://tokenaigate.com/setup` 创建管理员。

## 四、从旧服务器迁移

### 4.1 在旧服务器生成一致性备份

迁移窗口开始后停止应用，避免备份完成后仍有新数据写入：

```bash
cd /data/new-api
docker compose stop new-api

set -a
. ./.env
set +a

BACKUP_DIR="/data/new-api-backup-$(date +%Y%m%d-%H%M%S)"
umask 077
mkdir -p "$BACKUP_DIR"

docker compose exec -T -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql \
  mysqldump -hmysql -uroot \
  --single-transaction --quick --routines --triggers --events \
  --set-gtid-purged=OFF --no-tablespaces new-api \
  > "$BACKUP_DIR/new-api.sql"

cp .env "$BACKUP_DIR/.env"
tar -C /data/new-api -czf "$BACKUP_DIR/app-data.tar.gz" data
git rev-parse HEAD > "$BACKUP_DIR/git-commit.txt"

test -s "$BACKUP_DIR/new-api.sql"
test -s "$BACKUP_DIR/.env"
sha256sum "$BACKUP_DIR/.env" "$BACKUP_DIR"/* > "$BACKUP_DIR/SHA256SUMS"
chmod -R go-rwx "$BACKUP_DIR"

unset MYSQL_ROOT_PASSWORD REDIS_PASSWORD
echo "备份目录：$BACKUP_DIR"
```

日志不是恢复服务所必需的。如需保留，再执行：

```bash
tar -C /data/new-api -czf "$BACKUP_DIR/logs.tar.gz" logs
sha256sum "$BACKUP_DIR/logs.tar.gz" >> "$BACKUP_DIR/SHA256SUMS"
```

备份目录包含数据库和密码，只能通过 SSH/SCP 等加密通道传输。

### 4.2 将备份传到新服务器

仍在旧服务器执行，把占位内容替换为实际值：

```bash
scp -r "$BACKUP_DIR" root@新服务器IP:/data/
```

在新服务器检查备份，目录名替换为实际名称：

```bash
cd /data/new-api-backup-YYYYMMDD-HHMMSS
sha256sum -c SHA256SUMS
```

### 4.3 在新服务器恢复

```bash
cd /data
git clone -b feature/20261013-init --single-branch 仓库地址 new-api
cd /data/new-api

cp /data/new-api-backup-YYYYMMDD-HHMMSS/.env .env
chmod 600 .env
tar -xzf /data/new-api-backup-YYYYMMDD-HHMMSS/app-data.tar.gz -C /data/new-api

docker compose config --quiet
docker compose up -d mysql

set -a
. ./.env
set +a

until docker compose exec -T -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql \
  mysqladmin ping -hmysql -uroot --silent; do
  echo "等待 MySQL 启动……"
  sleep 2
done

docker compose exec -T -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql \
  mysql -hmysql -uroot new-api \
  < /data/new-api-backup-YYYYMMDD-HHMMSS/new-api.sql

unset MYSQL_ROOT_PASSWORD REDIS_PASSWORD

docker compose up -d redis
docker compose build --pull new-api
docker compose up -d --no-deps new-api

docker compose ps
docker compose logs --tail=100 new-api
curl --retry 10 --retry-connrefused --retry-delay 2 \
  -fsS http://127.0.0.1:3000/api/status
```

本机接口返回成功 JSON 后，再切换域名。不要让新旧两台服务器同时对外写入同一份业务数据。

## 五、Nginx 反向代理

创建 `/etc/nginx/sites-available/tokenaigate.com`：

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name tokenaigate.com;

    client_max_body_size 100m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

启用配置：

```bash
ln -sfn /etc/nginx/sites-available/tokenaigate.com \
  /etc/nginx/sites-enabled/tokenaigate.com
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

## 六、HTTPS 和 Cloudflare 切换

### 6.1 简单迁移方案

1. 在 Cloudflare 把 `tokenaigate.com` 的 A 记录修改为新服务器 IP。
2. 临时将代理状态改为“仅 DNS”（灰色云朵）。
3. 等待 DNS 生效并确认新服务器的 80 端口可访问。
4. 在新服务器申请证书：

```bash
certbot --nginx -d tokenaigate.com
nginx -t
systemctl reload nginx
curl -fsS https://tokenaigate.com/api/status
```

5. HTTPS 正常后，把 Cloudflare 代理恢复为“已代理”（橙色云朵）。

Certbot 会安装自动续期任务，可用下面的命令测试：

```bash
certbot renew --dry-run
```

### 6.2 Cloudflare 必查项

- DNS：A 记录指向新服务器 IP，并开启橙色代理
- SSL/TLS 加密模式：`Full (strict)`，不要使用 `Flexible`
- Always Use HTTPS：开启
- TLS 1.3：开启
- Minimum TLS Version：TLS 1.2
- Bot Fight Mode：关闭，避免误伤 API SDK
- Under Attack Mode：平时关闭
- DNSSEC：开启

建议创建 Cache Rule，对 API 动态接口执行 `Bypass cache`：

```text
(http.request.uri.path eq "/v1") or
(http.request.uri.path starts_with "/v1/") or
(http.request.uri.path eq "/api") or
(http.request.uri.path starts_with "/api/") or
(http.request.uri.path starts_with "/setup")
```

### 6.3 分层验证

在新服务器执行：

```bash
# 应用容器
curl -fsS http://127.0.0.1:3000/api/status

# 绕过 Cloudflare，直接检查本机 Nginx 和源站证书
curl -kfsS --resolve tokenaigate.com:443:127.0.0.1 \
  https://tokenaigate.com/api/status

# 完整公网链路
curl -fsS https://tokenaigate.com/api/status
```

判断方式：

- 第一条失败：检查 `new-api`、MySQL、Redis 容器
- 第一条成功、第二条失败：检查 Nginx 和源站证书
- 前两条成功、第三条失败：检查 Cloudflare、DNS 和服务器安全组

## 七、迁移完成后的处理

确认登录、渠道、令牌、余额和 API 调用均正常后：

```bash
cd /data/new-api
docker compose ps
docker compose logs --tail=100 new-api
```

建议保留旧服务器和迁移备份 3～7 天，但保持旧应用停止。备份确认不再需要后再安全删除；其中包含数据库内容和真实密码。

如果必须立即回滚：

1. 停止新服务器的 `new-api`，防止继续写入。
2. 将 Cloudflare A 记录改回旧服务器 IP。
3. 在旧服务器执行 `docker compose start new-api`。

新服务器已经产生业务写入后，直接回滚会丢失这些新数据，必须先反向导出并恢复数据库。

## 八、日常更新

只更新应用代码，不重建 MySQL 和 Redis：

```bash
cd /data/new-api
git status --short
git pull --ff-only origin feature/20261013-init
docker compose build --pull new-api
docker compose up -d --no-deps new-api

docker compose ps
docker compose logs --tail=100 new-api
curl -fsS http://127.0.0.1:3000/api/status
curl -fsS https://tokenaigate.com/api/status
```

如果 `docker-compose.yml` 中的 MySQL、Redis、网络或数据卷配置也发生变化：

```bash
cd /data/new-api
git pull --ff-only origin feature/20261013-init
docker compose up -d --build
```

## 九、常见故障

### 9.1 本机 3000 端口拒绝连接

```bash
cd /data/new-api
docker compose ps -a
docker compose logs --tail=200 new-api
docker compose logs --tail=100 mysql
docker compose logs --tail=100 redis
```

### 9.2 MySQL 报错 1045 Access denied

这表示 `.env` 中的新密码与已有 MySQL 数据卷中的旧密码不一致。仅修改 Compose 环境变量不会修改已初始化数据库的密码。

只在从旧硬编码密码迁移时执行一次：

```bash
cd /data/new-api
docker compose stop new-api
docker compose up -d mysql

read -rsp "请输入旧 MySQL root 密码: " OLD_MYSQL_PASSWORD
echo

set -a
. ./.env
set +a

printf "ALTER USER USER() IDENTIFIED BY '%s';\n" \
  "$MYSQL_ROOT_PASSWORD" | \
  docker compose exec -T -e MYSQL_PWD="$OLD_MYSQL_PASSWORD" \
  mysql mysql -hmysql -uroot

docker compose exec -T -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" \
  mysql mysql -hmysql -uroot -e "SELECT 1;"

unset OLD_MYSQL_PASSWORD MYSQL_ROOT_PASSWORD REDIS_PASSWORD

docker compose up -d --force-recreate redis
docker compose up -d --no-deps --force-recreate new-api
```

如果迁移命令仍然返回 `Access denied`，说明输入的旧密码不正确。不要删除数据卷，应从旧配置或 Git 历史中找回数据库初始化时使用的密码。

### 9.3 域名返回 502

先检查应用端口：

```bash
curl -fsS http://127.0.0.1:3000/api/status
```

如果拒绝连接，问题在应用容器；如果成功，再检查：

```bash
nginx -t
systemctl status nginx --no-pager
curl -kfsS --resolve tokenaigate.com:443:127.0.0.1 \
  https://tokenaigate.com/api/status
```

### 9.4 查看实时日志

```bash
cd /data/new-api
docker compose logs -f new-api
```

按 `Ctrl+C` 只会退出日志查看，不会停止容器。
