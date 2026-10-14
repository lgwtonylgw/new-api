# 生产部署与新服务器迁移手册

本文档适用于以下生产配置：

- 域名：`tokenaigate.com`
- 个人 Fork：`https://github.com/lgwtonylgw/new-api.git`
- 官方上游：`https://github.com/QuantumNous/new-api.git`
- Git 分支：`feature/20261013-init`
- 安装目录：`/data/new-api`
- 数据库：MySQL 8.2
- 缓存：Redis
- 入口：Cloudflare → Nginx → `127.0.0.1:3000` → new-api

执行路线：

- 全新安装：第二节 → 第三节 → 第五节 → 第六节 → 第七节
- 迁移服务器：新服务器执行第二节 → 旧服务器执行 4.1、4.2 → 新服务器执行 4.3 → 第五节 → 第六节 → 第七节

## 一、部署约定与重要数据

迁移或备份时需要保留：

| 内容 | 位置 | 是否必须 |
| --- | --- | --- |
| MySQL 数据 | Compose 的 `mysql_data` 数据卷 | 必须，使用 `mysqldump` 导出 |
| 服务密码和会话密钥 | `/data/new-api/.env` | 必须，禁止提交到 Git |
| MobaXterm SSH 私钥 | 管理员电脑的安全存储 | 必须，设置保护口令且不得上传服务器 |
| 应用文件 | `/data/new-api/data` | 建议保留 |
| 应用日志 | `/data/new-api/logs` | 可选 |
| 源代码 | Git 仓库 | 重新拉取即可 |
| Redis 数据 | 无持久化卷 | 不需要迁移 |

必须遵守：

- 生产环境不要执行 `docker compose down -v`，`-v` 会删除 MySQL 数据卷。
- 不要执行不带 `--quiet` 的 `docker compose config`，它可能在终端中展开并显示密码。
- 迁移期间不要让新旧两台服务器同时对外写入业务数据。
- `.env` 和迁移备份包含真实密码及会话密钥，不得提交到 Git、发送到聊天或放入公开存储。

## 二、新服务器基础环境

以下命令适用于 Ubuntu/Debian，并假定当前用户是 `root`：

### 2.1 安装基础软件

```bash
apt update
apt install -y git curl ca-certificates nginx certbot python3-certbot-nginx ufw at

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

### 2.2 使用 MobaXterm SSH 密钥登录

新服务器首次开通时可以临时使用服务商提供的密码登录。完成本节并确认密钥登录成功后，再关闭 SSH 密码登录。私钥只能保存在自己的电脑上，建议设置保护口令；不要上传、发送或写入服务器。

1. 在 MobaXterm 中打开 `Tools` → `MobaKeyGen`，生成 Ed25519 密钥并保存私钥，然后复制公钥文本。
2. 在仍然保持连接的新服务器上安装公钥：

```bash
install -d -m 700 /root/.ssh
touch /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
nano /root/.ssh/authorized_keys
```

每个公钥独占一行。保存后，在 MobaXterm 新建 SSH 会话，填写服务器 IP、当前 SSH 端口和用户名 `root`，在 `Advanced SSH settings` 中勾选 `Use private key` 并选择私钥。保持旧会话开启，确认新会话能够通过私钥登录后再继续。

### 2.3 配置防火墙和 SSH 密钥专用登录

本项目使用 TCP `52222` 作为 SSH 端口。云服务器有安全组时，至少允许：

- TCP 52222：仅允许自己的固定 IP；公网 IP 不固定时先允许公网
- TCP 80、443：允许公网；稳定后可进一步只允许 Cloudflare IP 段
- 不开放 3000、3306、6379

没有安全组或控制台救援入口时，先安排十分钟后的 UFW 自动回滚，防止误操作导致服务器失联：

```bash
systemctl enable --now atd
CURRENT_SSH_PORT="$(sshd -T | awk '$1 == "port" {print $2; exit}')"
echo "当前 SSH 端口：$CURRENT_SSH_PORT"

echo '/usr/sbin/ufw --force disable' | at now + 10 minutes
atq

ufw default deny incoming
ufw default allow outgoing
ufw allow "${CURRENT_SSH_PORT}/tcp" comment 'Temporary SSH during migration'
ufw allow 52222/tcp comment 'SSH key login'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable
ufw status verbose
```

当前 SSH 端口只用于首次迁移过程。接着创建 `/etc/ssh/sshd_config.d/00-key-only.conf`：

```bash
nano /etc/ssh/sshd_config.d/00-key-only.conf
```

写入：

```text
Port 52222
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
```

验证配置并平滑重载 SSH：

```bash
sshd -t
systemctl reload ssh
sshd -T | grep -E '^(port|permitrootlogin|pubkeyauthentication|passwordauthentication|kbdinteractiveauthentication)'
```

期望只出现端口 `52222`、公钥登录为 `yes`，密码和键盘交互登录为 `no`；`PermitRootLogin` 应显示 `prohibit-password` 或等价的 `without-password`。如果仍出现端口 `22`，用下面的命令找到其他生效的端口配置并处理后重新验证：

```bash
grep -RnsE '^[[:space:]]*Port[[:space:]]+' /etc/ssh/sshd_config /etc/ssh/sshd_config.d
```

在 MobaXterm 新建第二个会话，改用端口 `52222`、用户名 `root` 和刚才保存的私钥。新会话登录成功后，在仍保留变量的旧会话中删除临时端口规则，并取消 UFW 自动回滚任务：

```bash
if [ "$CURRENT_SSH_PORT" != "52222" ]; then
  ufw delete allow "${CURRENT_SSH_PORT}/tcp"
fi
ufw status verbose
atq
read -rp "请输入上面的 UFW 回滚任务编号: " ROLLBACK_JOB
atrm "$ROLLBACK_JOB"
unset ROLLBACK_JOB
atq
```

最后一次 `atq` 应没有输出。执行完之前不要关闭旧 SSH 会话。如果新会话无法登录，不要断开旧会话；检查 `sshd -t`、`sshd -T` 和 `ufw status verbose`。若只是 UFW 规则错误，等待十分钟后防火墙会自动关闭。

MobaXterm 会话中保存的是服务器地址、端口、用户名和私钥路径。迁移服务器时应重新核对服务器地址；不得把私钥随数据库备份上传到服务器。

## 三、全新安装

没有历史数据时使用本节；从旧服务器迁移时跳到第四节。

```bash
mkdir -p /data
cd /data
git clone -b feature/20261013-init --single-branch \
  https://github.com/lgwtonylgw/new-api.git new-api
cd /data/new-api

umask 077
MYSQL_ROOT_PASSWORD="$(openssl rand -hex 24)"
REDIS_PASSWORD="$(openssl rand -hex 24)"
SESSION_SECRET="$(openssl rand -hex 32)"
printf 'MYSQL_ROOT_PASSWORD=%s\nREDIS_PASSWORD=%s\nSESSION_SECRET=%s\n' \
  "$MYSQL_ROOT_PASSWORD" "$REDIS_PASSWORD" "$SESSION_SECRET" > .env
unset MYSQL_ROOT_PASSWORD REDIS_PASSWORD SESSION_SECRET
chmod 600 .env

docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 new-api
curl --retry 10 --retry-connrefused --retry-delay 2 \
  -fsS http://127.0.0.1:3000/api/status
```

`.env` 只保留在服务器，已被 Git 忽略。不要把真实密码发送到聊天、截图或提交到开源仓库。

应用正常后，依次完成第五节的 Nginx 和第六节的 HTTPS、Cloudflare 配置，然后立即通过 `https://tokenaigate.com/setup` 创建管理员。

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

unset MYSQL_ROOT_PASSWORD REDIS_PASSWORD SESSION_SECRET
echo "备份目录：$BACKUP_DIR"
```

日志不是恢复服务所必需的。如需保留，再执行：

```bash
tar -C /data/new-api -czf "$BACKUP_DIR/logs.tar.gz" logs
sha256sum "$BACKUP_DIR/logs.tar.gz" >> "$BACKUP_DIR/SHA256SUMS"
```

备份目录包含数据库、密码和会话密钥，只能通过 SSH/SCP 等加密通道传输。

### 4.2 传输并校验备份

仍在旧服务器执行，把占位内容替换为实际值：

```bash
scp -P 52222 -r "$BACKUP_DIR" root@新服务器IP:/data/
```

在新服务器检查备份，目录名替换为实际名称：

```bash
cd /data/new-api-backup-YYYYMMDD-HHMMSS
sha256sum -c SHA256SUMS
```

### 4.3 在新服务器恢复

```bash
cd /data
git clone -b feature/20261013-init --single-branch \
  https://github.com/lgwtonylgw/new-api.git new-api
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

unset MYSQL_ROOT_PASSWORD REDIS_PASSWORD SESSION_SECRET

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

### 6.1 切换域名并签发证书

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
- 前两条成功、第三条失败：检查 Cloudflare、DNS、UFW 和服务器安全组

## 七、部署完成后的验收与回滚

先完成服务器侧检查：

```bash
cd /data/new-api
docker compose ps
docker compose logs --tail=100 new-api
ufw status verbose
ss -lntup
certbot renew --dry-run
```

确认以下项目均正常：

- MobaXterm 通过私钥连接 TCP `52222`，密码登录已关闭
- UFW 只对外放行 `52222`、`80`、`443`
- `new-api` 仅绑定 `127.0.0.1:3000`，MySQL 和 Redis 未发布公网端口
- 管理员登录、渠道、令牌、余额和 API 调用正常
- HTTPS、Cloudflare 代理和证书自动续期正常

建议保留旧服务器和迁移备份 3～7 天，但保持旧应用停止。备份确认不再需要后再安全删除；其中包含数据库、真实密码和会话密钥。

如果必须立即回滚：

1. 停止新服务器的 `new-api`，防止继续写入。
2. 将 Cloudflare A 记录改回旧服务器 IP。
3. 在旧服务器执行 `docker compose start new-api`。

新服务器已经产生业务写入后，直接回滚会丢失这些新数据，必须先反向导出并恢复数据库。

## 八、同步官方上游更新

仓库长期保持下面的分工：

- `upstream/main`：官方 QuantumNous/new-api 的最新代码
- `origin/main`：个人 Fork 中跟随官方的主分支，不放自定义修改
- `origin/feature/20261013-init`：自己的生产定制分支

同步操作在本地开发机器执行，不要直接在生产服务器合并官方分支。正式更新前先按 4.1 节备份生产数据库，并确认本地修改已经提交：

```bash
cd 本地仓库目录
git status --short
```

### 8.1 首次添加官方仓库

只需要执行一次：

```bash
git remote add upstream https://github.com/QuantumNous/new-api.git
git remote -v
```

如果提示 `remote upstream already exists`，执行：

```bash
git remote set-url upstream https://github.com/QuantumNous/new-api.git
```

### 8.2 更新个人 Fork 的 main

```bash
git fetch --prune upstream
git switch main
git pull --ff-only origin main
git merge --ff-only upstream/main
git push origin main
```

也可以在 GitHub 的个人 Fork 页面点击 `Sync fork` 更新 `main`，但仍然需要继续执行下一节，把新的 `main` 合并到生产定制分支。

### 8.3 合并到生产定制分支

使用普通合并，不使用 rebase，也不需要强制推送：

```bash
git switch feature/20261013-init
git pull --ff-only origin feature/20261013-init
git merge main
```

如果没有冲突，直接进入验证。如果发生冲突：

```bash
git status
```

逐个编辑冲突文件，删除 `<<<<<<<`、`=======`、`>>>>>>>` 标记，确认结果后执行：

```bash
git add 冲突文件
git commit
```

如果暂时无法确定如何解决，可以安全取消本次合并：

```bash
git merge --abort
```

处理 `docker-compose.yml` 冲突时，必须保留本项目的生产配置：

- 从当前代码构建 `new-api:production`
- 使用 MySQL，不切换到 PostgreSQL
- MySQL、Redis 密码和 `SESSION_SECRET` 继续从服务器 `.env` 读取，不能写死或提交
- 3000 端口只绑定 `127.0.0.1`
- 保留 `SESSION_COOKIE_SECURE` 和 `SESSION_COOKIE_TRUSTED_URL`
- 保留 `mysql_data` 数据卷

### 8.4 验证并推送定制分支

至少检查 Compose 并完成一次镜像构建：

```bash
docker compose config --quiet
docker compose build new-api
git status
git log --oneline --decorate -10
git push origin feature/20261013-init
```

官方更新可能包含数据库迁移或业务行为变化。镜像构建成功不代表数据库升级一定安全，重要版本应先在测试环境使用生产备份的副本验证，再部署到生产。

### 8.5 部署到生产服务器

生产服务器始终只拉取自己的定制分支：

```bash
cd /data/new-api
git status --short

OLD_COMMIT="$(git rev-parse HEAD)"
git pull --ff-only origin feature/20261013-init
git diff --name-only "$OLD_COMMIT"..HEAD

docker compose config --quiet
docker compose build --pull new-api
docker compose up -d --no-deps new-api

docker compose ps
docker compose logs --tail=100 new-api
curl -fsS http://127.0.0.1:3000/api/status
curl -fsS https://tokenaigate.com/api/status
```

如果差异列表包含 `docker-compose.yml`、数据库配置或数据卷配置，应先人工检查，再按照 9.2 节的完整配置更新方式部署。

## 九、日常更新

### 9.1 仅更新应用代码

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

### 9.2 Compose 基础配置发生变化

如果 `docker-compose.yml` 中的 MySQL、Redis、网络或数据卷配置也发生变化：

```bash
cd /data/new-api
git pull --ff-only origin feature/20261013-init
docker compose up -d --build
```

## 十、常见故障

### 10.1 本机 3000 端口拒绝连接

```bash
cd /data/new-api
docker compose ps -a
docker compose logs --tail=200 new-api
docker compose logs --tail=100 mysql
docker compose logs --tail=100 redis
```

### 10.2 MySQL 报错 1045 Access denied

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

unset OLD_MYSQL_PASSWORD MYSQL_ROOT_PASSWORD REDIS_PASSWORD SESSION_SECRET

docker compose up -d --force-recreate redis
docker compose up -d --no-deps --force-recreate new-api
```

如果迁移命令仍然返回 `Access denied`，说明输入的旧密码不正确。不要删除数据卷，应从旧配置或 Git 历史中找回数据库初始化时使用的密码。

### 10.3 域名返回 502

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

### 10.4 查看实时日志

```bash
cd /data/new-api
docker compose logs -f new-api
```

按 `Ctrl+C` 只会退出日志查看，不会停止容器。
