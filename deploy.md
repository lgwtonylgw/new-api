# 生产环境部署

## 首次部署

```bash
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

docker compose up -d --build
docker compose ps
```

`.env` 只保留在服务器的 `/data/new-api/.env`，已被 Git 忽略，不得将真实密码提交到开源仓库。

## 从旧的硬编码密码迁移

如果 MySQL 数据卷已经由旧版 Compose 初始化，仅修改 `MYSQL_ROOT_PASSWORD` 环境变量不会修改数据库中的现有密码。首次迁移时需要执行以下步骤，且只执行一次：

```bash
cd /data/new-api

# 输入当前正在使用的 MySQL root 旧密码，输入时不回显
read -rsp "Current MySQL root password: " OLD_MYSQL_PASSWORD
echo

git pull --ff-only origin feature/20261013-init

set -a
. ./.env
set +a

# 通过 Compose 网络登录当前应用使用的 root 账号，将远程和本地 root 账号轮换为 .env 中的新密码
printf "ALTER USER USER() IDENTIFIED BY '%s';\nALTER USER 'root'@'localhost' IDENTIFIED BY '%s';\n" \
  "$MYSQL_ROOT_PASSWORD" "$MYSQL_ROOT_PASSWORD" | \
  docker compose exec -T -e MYSQL_PWD="$OLD_MYSQL_PASSWORD" \
  mysql mysql -hmysql -uroot

unset OLD_MYSQL_PASSWORD MYSQL_ROOT_PASSWORD REDIS_PASSWORD

# Redis 使用新密码重建，应用容器同步切换到新密码
docker compose up -d --force-recreate redis
docker compose up -d --no-deps --force-recreate new-api

docker compose ps
docker compose logs --tail=100 new-api
```

数据库密码轮换成功且应用恢复健康后，后续更新不再执行本节。

## 启用域名和 HTTPS 后

`new-api` 的 3000 端口只绑定在服务器本机，不直接暴露到公网：

```text
127.0.0.1:3000:3000
```

云服务器安全组需要允许入站 TCP 80 和 443，Nginx 需要将 `https://tokenaigate.com` 反向代理到 `http://127.0.0.1:3000`。确认 Nginx 和 HTTPS 证书配置完成后，更新应用容器：

```bash
cd /data/new-api
docker compose up -d --no-deps new-api
curl -fsS http://127.0.0.1:3000/api/status
curl -fsS https://tokenaigate.com/api/status
```

Compose 已启用 HTTPS Secure Cookie，并将允许的浏览器 Origin 限定为 `https://tokenaigate.com`。在 HTTPS 生效前，不要通过 HTTP 进行登录或刷新会话。

## 以后更新应用

先确认服务器当前代码没有未提交的修改：

```bash
cd /data/new-api
git status
```

拉取指定分支，重新构建并只替换 `new-api` 容器：

```bash
git pull --ff-only origin feature/20261013-init
docker compose build --pull new-api
docker compose up -d --no-deps new-api
```

这个更新方式不会重建 MySQL 和 Redis，也不会删除数据卷。

## 配置也有变更时

如果 `docker-compose.yml` 中的 MySQL、Redis、网络或数据卷配置也发生了变化，执行完整更新：

```bash
cd /data/new-api
git pull --ff-only origin feature/20261013-init
docker compose up -d --build
```

## 检查部署结果

```bash
docker compose ps
docker compose logs --tail=100 new-api
```

如果需要持续查看日志：

```bash
docker compose logs -f new-api
```

> 生产环境不要执行 `docker compose down -v`，`-v` 会删除 MySQL 数据卷。
