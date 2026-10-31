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

- 全新安装：第二节 → 第三节 → 第五节 → 第六节 → 第七节 → 第八节
- 迁移服务器：新服务器执行第二节 → 旧服务器执行 4.1、4.2 → 新服务器执行 4.3 → 第五节 → 第六节 → 第七节 → 第八节

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
read -rp "请输入站点 HTTPS Origin（例如 https://tokenaigate.com）: " SESSION_COOKIE_TRUSTED_URL
printf 'MYSQL_ROOT_PASSWORD=%s\nREDIS_PASSWORD=%s\nSESSION_SECRET=%s\nSESSION_COOKIE_TRUSTED_URL=%s\nDEFAULT_LANGUAGE=zh-CN\n' \
  "$MYSQL_ROOT_PASSWORD" "$REDIS_PASSWORD" "$SESSION_SECRET" \
  "$SESSION_COOKIE_TRUSTED_URL" > .env
unset MYSQL_ROOT_PASSWORD REDIS_PASSWORD SESSION_SECRET SESSION_COOKIE_TRUSTED_URL
chmod 600 .env

docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 new-api
curl --retry 10 --retry-connrefused --retry-delay 2 \
  -fsS http://127.0.0.1:3000/api/status
```

`.env` 只保留在服务器，已被 Git 忽略。不要把真实密码发送到聊天、截图或提交到开源仓库。

### 3.1 服务器 `.env` 完整格式

生产服务器的 `/data/new-api/.env` 至少包含以下配置：

```dotenv
MYSQL_ROOT_PASSWORD=<随机的 MySQL 强密码>
REDIS_PASSWORD=<随机的 Redis 强密码>
SESSION_SECRET=<用 openssl rand -hex 32 生成的固定密钥>
SESSION_COOKIE_TRUSTED_URL=https://your-domain.example
DEFAULT_LANGUAGE=zh-CN
```

- `MYSQL_ROOT_PASSWORD` 和 `REDIS_PASSWORD` 必须与 Compose 中的数据库、应用配置保持一致。
- `SESSION_SECRET` 只生成一次并长期保留；多节点部署时每个节点必须使用同一值。更换它会让现有用户重新登录。
- `SESSION_COOKIE_TRUSTED_URL` 填写浏览器实际访问的完整 HTTPS Origin，不带路径和末尾斜杠。更换域名时只修改这一项，多个域名用英文逗号分隔，例如 `https://example.com,https://admin.example.com`。
- 生产 Compose 已启用 `SESSION_COOKIE_SECURE=true`，因此 `SESSION_COOKIE_TRUSTED_URL` 不能留空。
- `DEFAULT_LANGUAGE=zh-CN` 让新访客、默认邮件和服务端提示使用简体中文。

修改后先验证变量和 Compose 配置：

```bash
cd /data/new-api
chmod 600 .env
docker compose config --quiet
```

`docker compose config --quiet` 没有输出代表配置解析通过。如果提示某个 required variable 缺失，应在 `.env` 中补齐对应项后再构建镜像。

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

## 七、注册、登录和反滥用配置

本节在 HTTPS、Cloudflare 和管理员账号均可用后执行。配置期间先关闭公开注册，避免尚未完成邮件、OAuth 和人机验证配置时产生未验证账号：

1. 以根管理员进入“系统设置 → 认证设置 → 基础认证”。
2. 暂时关闭“允许注册”，保留管理员现有登录方式。
3. 在“系统设置 → 通用设置”确认站点地址为 `https://tokenaigate.com`，末尾不带 `/`。
4. 依次配置 Resend、Turnstile、GitHub、Google 和微信；全部验收后再决定是否开放注册。

认证相关 Client Secret、SMTP API Key、Turnstile Secret Key 和微信服务令牌会保存在数据库配置中。不得写入本文档、Git、截图或聊天记录；轮换后应立即撤销旧凭据。

### 7.1 认证策略和当前能力边界

计划采用以下入口：

- 账号密码注册：Turnstile → 发送邮箱验证码 → 校验验证码并创建账号。
- GitHub 登录：GitHub OAuth App，回调地址为 `https://tokenaigate.com/oauth/github`。
- Google 登录：使用内置 OIDC，回调地址为 `https://tokenaigate.com/oauth/oidc`。
- 微信登录：推荐使用 new-api 内置的微信公众号回调；也可以继续使用兼容的外部验证码服务。

必须注意当前代码的实际边界：

- “启用邮箱验证”只强制约束账号密码注册，不会让 GitHub、Google 或微信的首次注册自动进入 Resend 验证码步骤。
- Turnstile 覆盖账号密码登录、账号密码注册、注册验证码发送、密码重置邮件发送，以及 GitHub、Google、Telegram 等第三方登录的授权发起和微信验证码登录入口；须先在后台配置并开启。
- GitHub、Google 和微信在“允许注册”开启时都可能直接创建新账号；微信创建的新账号可以没有邮箱。
- “允许注册”是全局开关，目前没有“只允许第三方登录已有账号、禁止第三方自动注册”的独立开关。

因此，仅完成本节配置还不能宣称“所有首次注册都已强制经过邮箱验证码”。第三方授权发起已支持 Turnstile 服务端校验；如果生产策略还要求所有入口统一验证邮箱，需要在第三方身份返回后创建短期、单次使用的待注册流程，待 Resend 邮箱验证码验证成功后再以事务创建账号和绑定第三方身份。该流程还必须覆盖过期、重放、并发注册、邮箱/第三方身份已占用、回调 state 校验和失败回滚测试。在完成该代码改造前，不要把第三方自动注册作为满足强制邮箱验证策略的入口。

邮箱验证码只用于证明邮箱所有权和完成注册，不应作为高权限账号的唯一认证因素。管理员账号应另外启用 TOTP 或 Passkey。

### 7.2 使用 Resend 发送邮箱验证码

先在 [Resend Domains](https://resend.com/domains) 添加邮件域名并完成 SPF、DKIM 验证，再创建仅供本服务使用的 API Key。建议使用独立发件地址，例如 `no-reply@tokenaigate.com`。

进入“系统设置 → 运维 → SMTP 邮箱”，填写：

| 配置项 | 值 |
| --- | --- |
| SMTP Host | `smtp.resend.com` |
| Port | `587` |
| SMTP encryption | `STARTTLS` |
| Username | `resend` |
| From Address | 已验证域名下的地址，例如 `no-reply@tokenaigate.com` |
| Password / Access Token | Resend API Key |
| Skip SMTP TLS certificate verification | 关闭 |
| Force AUTH LOGIN | 关闭 |

如果云服务商限制常用邮件端口，可将端口改为 Resend 支持的 `2587`，加密方式仍使用 `STARTTLS`。`465` 和 `2465` 则必须搭配 `SSL/TLS`。不要使用“无加密”。Resend 当前 SMTP 参数以其[官方 SMTP 文档](https://resend.com/docs/send-with-smtp)为准。

如页面提示 `Unable to connect to SMTP server`，先在服务器上检查 DNS、TCP 和 STARTTLS：

```bash
getent ahosts smtp.resend.com
timeout 15 openssl s_client \
  -starttls smtp \
  -connect smtp.resend.com:587 \
  -servername smtp.resend.com \
  -brief </dev/null
docker compose logs --since=10m new-api | grep -iE 'smtp|timeout|dial|tls|auth'
```

- `openssl` 显示 TLS 协议和证书信息，说明服务器到 Resend 的网络正常，应继续检查 API Key、发件域名和应用日志。
- `587` 连接超时时，改用 `2587 + STARTTLS` 后重试。
- `587` 和 `2587` 均超时时，联系云服务商解除出站 SMTP 限制，并检查服务器防火墙、安全组和出站 ACL。
- 不要通过开启“跳过 SMTP TLS 证书验证”解决连接超时；该选项无法解决网络不通，反而会降低连接安全性。

如 Resend 返回 `550 ... domain is not verified`，说明 SMTP 已经连接成功，但“发件地址”使用的域名尚未通过 Resend 验证。以 `noreply@mail.tokenaigate.com` 为例，应在 Resend Domains 中添加并验证 `mail.tokenaigate.com`，然后在该域名的 DNS 服务商中逐项添加 Resend 页面给出的 DKIM、SPF、MX 等记录。记录名称、类型、内容和 MX 优先级必须与 Resend 页面一致；使用 Cloudflare 时，相关记录保持“仅 DNS”。等待 Resend 显示 `Verified` 后再发送验证码。不要只验证其他域名后继续使用未验证的 `mail.tokenaigate.com` 发信。

保存后进入“认证设置 → 基础认证”：

1. 开启“允许注册”和“允许账号密码注册”。
2. 开启“邮箱验证”。
3. 如只接受指定域名，再开启邮箱域名限制并逐行填写白名单；不要为了拦截临时邮箱而只依赖一份长期不更新的静态名单。
4. 使用一个从未注册的真实邮箱请求验证码，确认邮件到达、验证码错误会失败、验证码过期会失败，并确认同一验证码成功注册后不能再次使用。
5. 在 Resend 后台检查发送结果，不在应用日志中记录验证码、API Key 或完整验证邮件内容。

SMTP 可用并不等于邮箱验证已启用；必须同时开启“邮箱验证”开关。

### 7.3 配置 Cloudflare Turnstile

在 Cloudflare Dashboard 创建 Turnstile Widget：

- Hostname 只允许 `tokenaigate.com`；测试环境使用单独 Widget 和密钥。
- Widget 名称应能区分生产环境，例如 `tokenaigate-production-auth`。
- 保存生成的 Site Key 和 Secret Key；Site Key 可公开，Secret Key 只能保存在服务端配置中。

进入“系统设置 → 认证设置 → Bot Protection”，先填写 Site Key 和 Secret Key，再开启 Turnstile。应用会在服务端调用 Cloudflare Siteverify，不应以浏览器显示了组件作为验证成功的依据。Cloudflare 规定 Turnstile token 五分钟过期且只能使用一次，详见[服务端校验文档](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)。

验收时至少检查：

- 不完成人机验证不能发送注册邮箱验证码。
- 不完成人机验证不能提交账号密码注册或账号密码登录。
- 使用错误、过期或已经提交过的 token 会失败。
- Cloudflare Turnstile Analytics 能看到服务端验证记录。
- Turnstile 不可用时认证请求应失败关闭，不能绕过验证继续注册。

Turnstile 是纵深防御，不能替代现有 IP/账号限速、注册审计、异常注册监控和邮箱验证。

### 7.4 配置 GitHub 登录

在 GitHub 的 `Settings → Developer settings → OAuth Apps` 创建 OAuth App：

| GitHub 配置项 | 值 |
| --- | --- |
| Application name | 自定义生产应用名称 |
| Homepage URL | `https://tokenaigate.com` |
| Authorization callback URL | `https://tokenaigate.com/oauth/github` |

生成 Client Secret 后，进入“系统设置 → 认证设置 → OAuth → GitHub”，填写 Client ID、Client Secret，最后开启 GitHub OAuth。回调地址必须逐字符一致，不使用通配符、不填内网地址。配置方法以 [GitHub OAuth App 文档](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)为准。

使用普通 GitHub 测试账号验收首次授权、再次登录、拒绝授权、错误 state、已绑定身份冲突和注销后重新登录。授权范围保持为应用当前需要的 `user:email`，不要额外申请仓库或组织权限。

### 7.5 使用 OIDC 配置 Google 登录

在 Google Cloud Console 完成 OAuth consent screen，然后创建类型为 `Web application` 的 OAuth Client：

| Google 配置项 | 值 |
| --- | --- |
| Authorized JavaScript origins | `https://tokenaigate.com` |
| Authorized redirect URIs | `https://tokenaigate.com/oauth/oidc` |

进入“系统设置 → 认证设置 → OAuth → OIDC”，填写：

| new-api 配置项 | 值 |
| --- | --- |
| OIDC Display Name | `Google` |
| Client ID | Google OAuth Client ID |
| Client Secret | Google OAuth Client Secret |
| Well-Known URL | `https://accounts.google.com/.well-known/openid-configuration` |

保存时确认自动发现得到的 Authorization、Token 和 UserInfo Endpoint 均为 Google HTTPS 地址，再开启 OIDC。应用请求的范围为 `openid profile email`。Google 的端点和注册要求以 [Sign in with Google OIDC 文档](https://developers.google.com/identity/openid-connect/openid-connect)为准。

使用未加入测试用户列表的账号做生产验收前，先确认 Google OAuth consent screen 的发布状态、用户类型和域名验证均符合预期。验收首次授权、再次登录、用户拒绝授权、回调地址不匹配和错误 state。

### 7.6 配置微信登录

new-api 已内置微信公众号消息回调和验证码存储，不再需要单独部署 `wechat-server`。内置模式支持微信安全模式，验证码由加密随机数生成，三分钟过期且成功登录后立即失效；配置 Redis 时可安全用于多实例部署，未配置 Redis 时仅适合单实例。

进入“系统设置 → 认证设置 → OAuth → WeChat”，选择“内置回调”并填写：

| 配置项 | 值 |
| --- | --- |
| App ID | 公众号基本信息中的 AppID；用于校验安全模式密文归属 |
| Callback Token | 新生成的随机 Token；必须与微信平台填写值完全一致 |
| EncodingAESKey | 微信平台生成的 43 位 EncodingAESKey；必须与微信平台填写值完全一致 |
| QR Code Image URL | 公众号二维码的 HTTPS 图片地址 |

保存以上配置后，页面会显示回调地址。生产域名示例为：

```text
https://tokenaigate.com/api/wechat/callback
```

在微信公众平台“设置与开发 → 基本配置 → 服务器配置”中填写该 URL、相同的 Token 和 EncodingAESKey，消息加解密方式选择“安全模式”，然后提交。回调地址无需登录即可访问，但每次请求都会验证微信签名和五分钟内的时间戳。配置验证成功后再返回 new-api 开启微信认证。

用户流程为：扫描二维码关注公众号，向公众号发送“验证码”，收到六位验证码后在登录弹窗输入。繁体“驗證碼”同样受支持。

如需兼容已经部署的旧服务，可选择“外部服务”模式。new-api 会请求：

```text
GET {WeChatServerAddress}/api/wechat/user?code={code}
Authorization: {WeChatServerToken}
```

返回成功时 `data` 必须是稳定且不可被其他用户复用的微信用户标识。旧 [`songquanpeng/wechat-server`](https://github.com/songquanpeng/wechat-server) 协议可以继续使用，但其原始实现仅支持明文回调和单机内存验证码，不建议直接用于生产。

微信服务至少满足：

- 使用独立域名和有效 HTTPS 证书；管理后台仅允许管理员网络访问。
- 首次启动立即修改默认管理员凭据，设置随机会话密钥和随机 API Token。
- new-api 只访问固定的可信 HTTPS 地址；禁止把 `WeChatServerAddress` 指向用户可控地址、内网元数据地址或会重定向到其他主机的地址。
- 微信 AppSecret、公众号 Token、EncodingAESKey 和服务 API Token 不进入 Git；令牌定期轮换。
- `/api/wechat/user` 校验 Authorization、限制请求速率，并使登录验证码短期有效且单次使用。
- 独立备份微信服务的数据目录或数据库，并纳入监控、日志脱敏和漏洞更新流程。

外部服务模式填写：

| 配置项 | 值 |
| --- | --- |
| Server Address | 微信服务的 HTTPS 根地址，不带末尾 `/` |
| Server Token | 与微信服务 API Authorization 一致的随机令牌 |
| QR Code Image URL | 公众号二维码的 HTTPS 图片地址 |

最后开启微信认证，测试签名错误、过期回调、错误验证码、过期验证码、重复验证码、已绑定微信身份冲突以及 Redis 或外部服务不可用时的失败行为。在第 7.1 节所述统一邮箱验证流程完成前，微信首次登录可能创建无邮箱账号，不符合“所有新账号必须验证邮箱”的目标策略。

### 7.7 安全依据和上线顺序

#### 本次注册登录页面与协议

登录和注册页现在优先展示已配置的微信、GitHub、Google（OIDC）和 Telegram，用户名方式进入独立表单；未配置或未启用的入口不会作为可用方式展示。微信可使用内置公众号验证码回调，Telegram 沿用当前 OAuth 授权流程。

Cloudflare Turnstile 开启后，除密码登录、注册和邮件验证码外，第三方登录的 `/api/oauth/state` 发起请求和微信验证码登录也会在服务端校验 token。账号绑定和安全操作仍执行原有的安全证明。token 使用后需重新完成校验，加载失败可重试。开启前必须同时配置 Site Key 和 Secret Key，不能使用测试密钥代替生产密钥。

已新增可编辑的中文初稿 `setting/system_setting/legal/user-agreement.md` 和 `setting/system_setting/legal/privacy-policy.md`。未配置过法律文档的新部署使用这些默认正文；已有数据库中的自定义正文或显式空值保持其原有配置。已有站点如正文为空，请在“系统设置”的协议编辑器中复制两份初稿、补齐实际运营主体和有效联系方式，并核对模型供应商、日志保存期限、支付和跨境处理安排后保存。协议页面沿用 `/user-agreement` 和 `/privacy-policy`。

这些初稿不替代运营方对实际服务和适用法律的核实；首次第三方登录仍沿用原有自动注册策略，不新增强制补充邮箱步骤。

本节按 OWASP ASVS 5.0.0 V6.1.1、V6.1.3 的要求记录多条认证路径和反自动化措施，并参考 OWASP Authentication、Session Management、OAuth 2.0、Email Validation and Verification 以及 CSRF Prevention Cheat Sheet。关键原则是：服务端执行校验；OAuth 使用不可预测且单次消费的 state；回调地址精确匹配；邮箱验证码短期、单次使用并限速；认证错误避免泄露账号是否存在；认证成功后使用新的会话；日志不记录密码、验证码、OAuth code、访问令牌、刷新令牌或会话令牌。

推荐上线顺序：

1. 保持公开注册关闭，完成 Resend 和 Turnstile 配置。
2. 配置 GitHub、Google 和微信，在现有测试账号上完成绑定与再次登录测试。
3. 若只要求账号密码注册经过邮箱验证码和 Turnstile，可开启公开注册，并持续监控注册速率和邮件发送量。
4. 若要求所有第三方首次注册也经过邮箱验证码和 Turnstile，先完成第 7.1 节的服务端统一注册挑战和回归测试；完成前保持公开注册关闭。
5. 开放后立即检查审计日志、Resend 发送记录、Turnstile Analytics 和异常账号增长；发现滥用先关闭公开注册，不删除已有审计证据。

### 7.8 配置充值支付方式

生产环境计划启用 AliMPay 支付宝、USDT 和 Stripe。所有通道都必须先完成“系统设置 → 账单设置 → 支付网关”中的合规确认；密钥、钱包私钥、助记词、支付宝 Cookie 或访问令牌不得写入 Git、本文档或聊天记录。

#### AliMPay 收银台（自动核对到账）

`workspace/AliMPay` 是独立的收款服务，提供易支付 V1 接口。它需要单独运行 Bun/Compose 服务及持久化目录，由 Nginx 配置独立 HTTPS 域名；不要把它的管理后台或 SQLite 数据文件并入本项目。先按其 `README.md` 完成首次设置、支付宝应用密钥、账务明细查询权限、经营码上传和连接测试，取得 V1 商户 ID 与 V1 密钥。

进入本站“系统设置 → 计费与支付 → 支付网关”：

1. 在“支付方式”点“使用 AliMPay（仅支付宝）”，确保 `PayMethods` 只包含 `type=alipay`。
2. 在“Epay”页签填写 AliMPay 的 **HTTPS 根地址**（不带 `/submit.php`）、V1 商户 ID 和 V1 密钥。回调地址只填本站 HTTPS 根地址；不填时采用服务端的站点地址。保存全部设置。
3. AliMPay 的公网回调地址须能访问本站 `/api/user/epay/notify`。AliMPay 默认拒绝私网回调，因此本地 `localhost` 回调不适用于生产联调。
4. 钱包选择“支付宝”下单后，会跳转 AliMPay 收银台。它按实际账务查询确认支付，并向本站发送签名通知。本站核对商户号、原始订单金额和待支付状态后，才给余额入账；同一订单重复通知不会重复加款。

AliMPay 经营码会对用户实付金额增加 0.01–0.99 元用于匹配，本站核对的是下单时的原始金额。上线前用小额真实交易验证收银台、实际到账、回调和余额，并确认支付宝应用有账务查询权限。仅部署代码不会自动启用该通道，仍需在两个后台分别完成密钥和收款配置。

#### USDT 自动确认（独立部署 epusdt / GM Pay）

`workspace/epusdt` 包含独立的链上监听、支付订单、数据库和通知队列，应作为独立服务部署并使用独立 HTTPS 域名，例如 `usdt.tokenaigate.com`。固定经过验收的版本，不直接跟随 `latest`；只开放收银台和必要接口，限制管理后台访问。初期建议只启用一种网络，例如 USDT-TRC20，且使用专门的收款地址，不与个人转账或其他业务共用。部署时持久化 `.env`、主数据库及运行目录；仓库自带的 `docker-compose.yaml` 只挂载了 `./env`，不能直接视为完整的持久化生产配置。

在 epusdt 中创建数字 PID 的 EPay 兼容商户、启用 USDT/TRON 钱包与网络后，回到 new-api 的独立 `epusdt` 页签填写：

| 配置项 | 值 |
| --- | --- |
| epusdt EPay endpoint | `https://usdt.example.com/payments/epay/v1/order/create-transaction`（本站自动追加 `/submit.php`） |
| epusdt merchant PID | epusdt 分配的数字 PID |
| epusdt EPay secret key | 对应 PID 的签名密钥，保存在本站服务端配置，不要填入收款私钥 |
| epusdt enable | 配置完成后先在受控测试环境开启并验收，再在生产开启 |

本站 `Epay` 页签继续专供 AliMPay；它的回调是 `/api/user/epay/notify`。epusdt 使用 `/api/user/epusdt/notify`。两边订单在本站分别记录 `epay` 和 `epusdt` 提供商；回调签名使用各自密钥，核对数字 PID、支付类型、原始法币金额和待支付状态，再执行一次性入账。`PayMethods` 中无需填写 `usdt.tron`，启用独立 epusdt 配置后钱包自动出现“USDT-TRC20”。旧版“支付宝收款码”和“USDT 转账（人工核验）”配置入口已移除，历史订单仍可在订单记录中查看。

epusdt 的法币默认币种设为 **CNY**，与本站 `Price` 算出的收款金额一致。确保 epusdt 已启用 `USDT/TRON` 收款资产；该站点的 EPay `type=usdt.tron` 才会直接生成对应的链上订单。公开收款地址在 epusdt 钱包后台配置，不填进本站的 EPay 密钥字段。链上监听所需节点/API 凭据也只保存在 epusdt。

本地工作区的 `workspace/epusdt/compose.production.yaml` 示例固定使用本地源码构建镜像、仅在服务器回环地址开放 8000 端口，并持久化 `./data`；部署前需把此文件一同复制到服务器。从经过验收的 Git 提交部署，不直接拉取 `latest` 镜像。该 Compose 将项目根目录的 `.env` 只读挂载到 `/app/.env`，不能使用会写入 `.env` 的首次安装向导。先在宿主机复制根目录 `.env.example` 为未入库的 `.env`；模板已经设置 `install=false` 和持久化路径，复制后核对域名：

```dotenv
app_uri=https://usdt.tokenaigate.com
http_listen=:8000
db_type=sqlite
sqlite_database_filename=/app/data/epusdt.db
runtime_root_path=/app/data/runtime
log_save_path=/app/data/logs
order_notice_max_retry=5
install=false
```

此版本通过后台管理 API Key、链上 RPC 节点、收款钱包和汇率；不要往 `.env` 加旧版的 `api_auth_token` 或 `tron_grid_api_key` 配置。首次启动会在容器日志中输出自动创建的管理员密码，立即妥善保存并登录修改。生产服务器上的 `.env` 应仅供管理员读取，`data/` 应保持可写和持久化。

为 epusdt 准备独立的 HTTPS 域名和反向代理，代理至 `127.0.0.1:8000`；AliMPay 使用另一域名代理至 `127.0.0.1:3001`（其 Compose 默认宿主机端口，可通过 `ALIMPAY_HOST_PORT` 修改；容器内部仍为 3000）。两套服务以及本站分别保存自己的配置、密钥、数据库和日志，分别备份与监控。验证 Nginx 配置后再重载；不要将 epusdt 的管理后台公开给未授权访问者。epusdt 启动示例：

```sh
cd /data/epusdt
cp .env.example .env
chmod 600 .env
# 核对 .env 的 app_uri 指向实际 HTTPS 域名
mkdir -p data
docker compose -f compose.production.yaml build --pull
docker compose -f compose.production.yaml up -d
docker compose -f compose.production.yaml ps
```

epusdt 的 Nginx 站点示例（证书路径改成实际位置，AliMPay 的站点配置见其 README）：

```nginx
server {
    listen 443 ssl;
    server_name usdt.example.com;
    ssl_certificate /etc/letsencrypt/live/usdt.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/usdt.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 30s;
    }
}
```

两个独立站点均应使用 TLS，收银台公开可访问；管理入口额外限制来源并使用强认证。部署或升级前备份 AliMPay 的 `data/`、epusdt 的 `data/` 与两个服务的配置，并保留回滚用的镜像/源码版本。对 epusdt 的 SQLite 文件做一致性备份，避免在写入时直接复制数据库文件。

上线前各做一笔小额真实支付：确认 AliMPay/epusdt 收银台金额、回调地址、实际到账、订单状态与本站余额一致；再分别测试金额不符、错误商户号、错误签名、重复通知和另一网关的订单号，均不得错误入账。USDT 还需核验链网络、确认数、超时和区块回滚处理；不要凭用户截图手动确认。测试通过后再面向普通用户启用两个通道。钱包助记词、私钥和 API 密钥不可写进文档或 Git。

#### Stripe Checkout

在 Stripe 创建用于 API 额度充值的 Product 和 Price，并在 new-api 的 `Stripe` 页签填写 API Secret、Webhook Secret、Price ID、单位价格和最低充值金额。生产 Webhook 地址为：

```text
https://tokenaigate.com/api/stripe/webhook
```

至少订阅 `checkout.session.completed`、`checkout.session.async_payment_succeeded`、`checkout.session.async_payment_failed` 和 `checkout.session.expired`。先用测试模式完成成功付款、异步付款、失败、过期、重复通知、金额不一致和退款流程验收，再整体切换为生产密钥；测试与生产密钥不得混用。

## 八、部署完成后的验收与回滚

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
- Resend 验证码、Turnstile、GitHub、Google 和已启用的微信登录均通过第七节的成功、失败、过期与重放验收
- HTTPS、Cloudflare 代理和证书自动续期正常

建议保留旧服务器和迁移备份 3～7 天，但保持旧应用停止。备份确认不再需要后再安全删除；其中包含数据库、真实密码和会话密钥。

如果必须立即回滚：

1. 停止新服务器的 `new-api`，防止继续写入。
2. 将 Cloudflare A 记录改回旧服务器 IP。
3. 在旧服务器执行 `docker compose start new-api`。

新服务器已经产生业务写入后，直接回滚会丢失这些新数据，必须先反向导出并恢复数据库。

## 九、同步官方上游更新

仓库长期保持下面的分工：

- `upstream/main`：官方 QuantumNous/new-api 的最新代码
- `origin/main`：个人 Fork 中跟随官方的主分支，不放自定义修改
- `origin/feature/20261013-init`：自己的生产定制分支

同步操作在本地开发机器执行，不要直接在生产服务器合并官方分支。正式更新前先按 4.1 节备份生产数据库，并确认本地修改已经提交：

```bash
cd 本地仓库目录
git status --short
```

### 9.1 首次添加官方仓库

只需要执行一次：

```bash
git remote add upstream https://github.com/QuantumNous/new-api.git
git remote -v
```

如果提示 `remote upstream already exists`，执行：

```bash
git remote set-url upstream https://github.com/QuantumNous/new-api.git
```

### 9.2 更新个人 Fork 的 main

```bash
git fetch --prune upstream
git switch main
git pull --ff-only origin main
git merge --ff-only upstream/main
git push origin main
```

也可以在 GitHub 的个人 Fork 页面点击 `Sync fork` 更新 `main`，但仍然需要继续执行下一节，把新的 `main` 合并到生产定制分支。

### 9.3 合并到生产定制分支

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

### 9.4 验证并推送定制分支

至少检查 Compose 并完成一次镜像构建：

```bash
docker compose config --quiet
docker compose build new-api
git status
git log --oneline --decorate -10
git push origin feature/20261013-init
```

官方更新可能包含数据库迁移或业务行为变化。镜像构建成功不代表数据库升级一定安全，重要版本应先在测试环境使用生产备份的副本验证，再部署到生产。

### 9.5 部署到生产服务器

生产服务器始终只拉取自己的定制分支：

```bash
cd /data/new-api
git status --short

OLD_COMMIT="$(git rev-parse HEAD)"
git pull --ff-only origin feature/20261013-init
git diff --name-only "$OLD_COMMIT"..HEAD

docker compose config --quiet
DOCKER_BUILDKIT=1 docker compose build new-api
docker compose up -d --no-deps --no-build new-api

docker compose ps
docker compose logs --tail=100 new-api
curl -fsS http://127.0.0.1:3000/api/status
curl -fsS https://tokenaigate.com/api/status
```

如果差异列表包含 `docker-compose.yml`、数据库配置或数据卷配置，应先人工检查，再按照 10.2 节的完整配置更新方式部署。

## 十、日常更新

### 10.1 仅更新应用代码

适用于 MySQL 和 Redis 已正常运行、仅应用代码发生变化的日常更新：

```bash
cd /data/new-api
git status --short
git pull --ff-only origin feature/20261013-init
DOCKER_BUILDKIT=1 docker compose build new-api
docker compose up -d --no-deps --no-build new-api

docker compose ps
docker compose logs --tail=100 new-api
curl -fsS http://127.0.0.1:3000/api/status
curl -fsS https://tokenaigate.com/api/status
```

构建成功后再执行启动命令；若构建失败，先处理错误，保留当前正在运行的容器。`--no-deps` 避免操作 MySQL 和 Redis，`--no-build` 使用刚刚构建好的应用镜像。

日常构建默认复用已有镜像层，无需每次添加 `--pull`。`--pull` 会尝试从仓库拉取基础镜像，但不等于禁用构建缓存。首次部署或需要重新拉取基础镜像时，可将上面的构建命令替换为：

```bash
DOCKER_BUILDKIT=1 docker compose build --pull new-api
```

当前 Dockerfile 的基础镜像使用固定摘要；升级基础镜像需要先更新 Dockerfile 中对应的摘要，仅添加 `--pull` 不会自动升级到同名标签的最新版本。

构建缓存说明：

- Dockerfile 已启用 Go 编译缓存。首次使用、切换构建器或清理缓存后的构建仍需预热；后续在同一构建器上更新时可复用依赖的编译结果。
- 前端文件嵌入 Go 可执行文件，修改前端或文档页面后仍需重新构建前端和应用镜像。
- `.dockerignore` 已排除本地数据、日志、缓存和 `.env` 文件，减少构建上下文传输；这不会删除宿主机文件，也不影响 Compose 读取 `.env` 或挂载数据目录。
- 日常更新避免添加 `--no-cache`，也不要在每次更新前清理构建缓存。

如需定位耗时阶段，可使用详细构建日志：

```bash
DOCKER_BUILDKIT=1 docker compose --progress plain build new-api
```

### 10.2 Compose 基础配置发生变化

如果 `docker-compose.yml` 中的 MySQL、Redis、网络或数据卷配置也发生变化：

```bash
cd /data/new-api
git pull --ff-only origin feature/20261013-init
docker compose up -d --build
```

## 十一、常见故障

### 11.1 本机 3000 端口拒绝连接

```bash
cd /data/new-api
docker compose ps -a
docker compose logs --tail=200 new-api
docker compose logs --tail=100 mysql
docker compose logs --tail=100 redis
```

### 11.2 MySQL 报错 1045 Access denied

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

### 11.3 域名返回 502

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

### 11.4 查看实时日志

```bash
cd /data/new-api
docker compose logs -f new-api
```

按 `Ctrl+C` 只会退出日志查看，不会停止容器。
