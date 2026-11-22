# new-api 镜像升级、清理与回滚手册

适用仓库：`lgwtonylgw/new-api`。更新日期：2026-11-22。

本手册对应 `.github/workflows/publish-ghcr.yml`、`deploy-image.sh`、
`compose.image.yml`、`scripts/cleanup-new-api-images.py` 的当前实现。
安装服务器、配置域名、迁移数据库参考 [deploy.md](deploy.md)；接入镜像发布后，日常升级使用本手册。

## 1. 每次升级的固定步骤

### 1.1 提交源码

在开发电脑把修改提交并推送到 `feature/20261122-develop`，确认 GitHub 显示目标提交。

### 1.2 在 GitHub 构建镜像

进入 **Actions → Build new-api image for server → Run workflow**：

| 字段 | 填写 |
| --- | --- |
| Use workflow from | `feature/20261122-develop`，该分支须包含最新工作流 |
| source_ref | `feature/20261122-develop`；固定某个版本时填写完整提交 SHA |
| architecture | `x86_64` 服务器选择 `amd64`；`aarch64` / `arm64` 选择 `arm64` |
| deploy | 默认不勾选，保留手动部署；配置第 9 节后可勾选自动 SSH 部署 |

构建流程使用 `resolve`、`publish` 两个任务，另有可选的 `deploy` 任务：先锁定源码 SHA，然后使用 Dockerfile
编译前后端并发布到 `ghcr.io/lgwtonylgw/new-api`，不运行项目测试、vet 或独立类型检查。
更新代码或工作流后启动新的运行，核对 resolve 实际检出的源码 SHA。

等待两个任务成功，打开该次运行的 **Summary**，复制完整部署命令。格式如下：

```bash
bash deploy-image.sh deploy 'ghcr.io/lgwtonylgw/new-api@sha256:实际64位摘要'
```

这里的摘要是占位符，请复制 Summary 中的实际值。digest 固定实际镜像，不随标签变化。

### 1.3 在服务器发布

SSH 登录后进入原安装目录（默认 `/data/new-api`），粘贴刚复制的部署命令：

```bash
cd /data/new-api
# 在这里执行 Summary 给出的完整部署命令
```

脚本先下载镜像，再保留旧镜像、只替换应用容器、等待健康检查，最后自动清理过期本机镜像。
MySQL / Redis 的容器、密码和持久化挂载继续使用现有配置。
单实例更新会短暂中断请求，不属于零停机发布。

### 1.4 验收

```bash
bash deploy-image.sh status
curl -fsS http://127.0.0.1:3000/api/status
curl -fsS https://tokenaigate.com/api/status
docker stats --no-stream new-api
```

使用实际生产域名，并确认网页、已有数据和主要业务功能正常。
涉及数据库升级的版本，先按第 6 节备份并在测试环境演练。

## 2. 常用命令

以下命令均在原生产安装目录执行。

| 操作 | 命令 |
| --- | --- |
| 查看当前镜像、回滚目标和清理参数 | `bash deploy-image.sh status` |
| 发布镜像 | `bash deploy-image.sh deploy '完整镜像digest引用'` |
| 预览旧镜像清理，不删除 | `bash deploy-image.sh cleanup` |
| 实际清理本机旧镜像 | `bash deploy-image.sh cleanup --apply` |
| 回滚到保存的上一版 | `bash deploy-image.sh rollback` |
| 本次发布后暂不自动清理 | `AUTO_CLEANUP_IMAGES=0 bash deploy-image.sh deploy '完整镜像digest引用'` |

第一次启用清理，先运行预览并核对列表。

## 3. 镜像保留与清理规则

| 参数 | 默认值 | 含义 |
| --- | --- | --- |
| `KEEP_ROLLBACK_IMAGES` | `3` | 保留最近 3 个不同 image ID 的历史镜像，不含当前运行版本 |
| `IMAGE_MIN_AGE_DAYS` | `7` | 超出数量限制的镜像也至少保留 7 天 |
| `AUTO_CLEANUP_IMAGES` | `1` | 升级健康检查成功后自动清理；`0` 关闭 |

**只有“超出最近 3 个历史版本”且“严格超过 7 天”，才进入删除候选列表。**
这是保留底线，不是镜像总数量的硬上限。

以下情况额外保护，不受数量、天数限制：

- 当前运行的应用镜像。
- `.release/previous-image` 指向的回滚镜像。
- 任意运行中或停止的容器仍引用的镜像。
- 镜像还带其他仓库标签、`stable` 等手动标签。
- 无法确认保留时间的镜像。

同一个 image ID 的多个标签不重复占用保留名额。再次发布相同 image ID 时，
不新建重复回滚标签，也不覆盖已有回滚目标。

保留时间从 Docker 镜像创建时间、最新回滚标签时间两者中较晚的时间计算。
因此很早构建的镜像刚被保存为回滚版本时，也会获得新的保留期。

清理只处理本方案生成的回滚标签、GHCR 构建版本标签及 digest，和原有 `new-api:production`。
实际删除前再次检查容器和引用，使用 `docker image rm --no-prune`，不使用强制删除或全局 prune。
镜像共享层可能使实际释放空间小于镜像显示大小。

自动清理只发生在成功升级后，没有新升级时不会每天定时执行。升级失败、回滚不触发自动清理。
容器、数据卷、数据库、日志、备份和 Buildx 缓存不在清理范围内。

### 3.1 修改保留策略

例如本次改为保留最近 5 个历史镜像、至少 14 天：

```bash
KEEP_ROLLBACK_IMAGES=5 IMAGE_MIN_AGE_DAYS=14 bash deploy-image.sh cleanup
KEEP_ROLLBACK_IMAGES=5 IMAGE_MIN_AGE_DAYS=14 bash deploy-image.sh cleanup --apply
```

数量和天数都必须是大于等于 1 的整数。参数从进程环境读取，**不会自动从 Compose 的 `.env` 读取**。
上面的写法只影响当前命令；需要持续采用自定义值，可在该 SSH 用户的 shell 配置中设置对应 `export`，
或每次发布时显式指定。

### 3.2 GHCR 远程镜像

本逻辑只清理服务器本地镜像，GHCR 历史版本继续保留，避免删除服务器仍需要拉取的 digest。
确认运行版本、回滚版本和其他服务器均不再需要某个版本后，再在 GitHub Packages 页面人工管理。

## 4. 首次安装或更新部署脚本

### 4.1 上传文件

通过 MobaXterm 上传当前仓库的以下文件到服务器原安装目录，保持相对路径：

```text
deploy-image.sh
compose.image.yml
scripts/cleanup-new-api-images.py
```

工作流文件保留在 GitHub 的 `.github/workflows/` 中，不需要上传服务器。
已接入镜像部署的服务器，通常只需覆盖新版脚本、清理文件，再运行预览。

### 4.2 检查依赖和目录

```bash
cd /data/new-api
uname -m
docker compose version
python3 --version
command -v curl flock
docker inspect --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' new-api
docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' new-api
```

使用原 Compose 工作目录和原 `.env`，原应用、MySQL、Redis 应已正常运行。
部署基线：Docker Compose v2.24.4+、Bash、curl、flock、Python 3.10+。
Python 清理程序仅使用标准库，无需安装第三方包。

Ubuntu/Debian 缺少依赖时可安装：

```bash
apt-get update
apt-get install -y python3 curl util-linux
```

### 4.3 保存生产配置快照

逐条执行，任何一步报错先停止排查：

```bash
cd /data/new-api
umask 077
test -f .env
test -f docker-compose.yml
if [ ! -e compose.runtime.yml ]; then
  cp -p docker-compose.yml compose.runtime.yml
fi
chmod 600 compose.runtime.yml compose.image.yml
chmod 700 deploy-image.sh
chmod 600 scripts/cleanup-new-api-images.py
bash -n deploy-image.sh
bash deploy-image.sh status
bash deploy-image.sh cleanup
```

`compose.runtime.yml` 只首次生成，不要每次升级都覆盖。
它保留服务器的端口、数据库、挂载和会话配置，`compose.image.yml` 清除应用源码构建配置并覆盖镜像。
脚本显式复用原 Compose 项目名，避免接到另一套数据卷。

`.release/` 和 `compose.runtime.yml` 已加入 Git 忽略规则。
旧脚本没有 `.release/previous-image` 时，清理仍保护当前容器；首次切换镜像后才生成回滚引用。

### 4.4 GHCR 拉取权限

工作流使用自动提供的 `GITHUB_TOKEN` 和 `packages: write` 发布镜像。
首次发布后检查包本身的可见性：源码公开不表示镜像包自动公开。

- **Public**：任何人可下载，服务器无需登录。确认接受公开镜像后，在个人主页
  Packages → new-api → Package settings 中修改可见性。
- **Private**：保持私有，使用仅具拉取所需 `read:packages` 权限的 Personal access token (classic)，
  由执行发布脚本的同一个 Linux 用户登录：

```bash
read -rsp 'GHCR read:packages token: ' GHCR_TOKEN; printf '\n'
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u lgwtonylgw --password-stdin
unset GHCR_TOKEN
```

令牌、生产 `.env` 不得上传源码或发送到聊天。

## 5. 回滚与失败处理

确认旧程序兼容当前数据库结构后执行：

```bash
cd /data/new-api
bash deploy-image.sh rollback
bash deploy-image.sh status
curl -fsS http://127.0.0.1:3000/api/status
```

回滚使用保存的本地镜像，不依赖 GHCR。首次从本机构建切换时也会保留原镜像。
应用回滚不恢复数据库；涉及不兼容迁移时，在维护窗口停止写入并恢复兼容数据库后再恢复旧镜像。
恢复备份会丢失备份时间点之后的写入，需先保留失败现场并评估数据补偿。

| 失败阶段 | 处理 |
| --- | --- |
| 镜像下载、架构或配置校验失败 | 在替换旧容器前退出，排查后重试 |
| 新应用健康检查失败 | 返回失败并保留回滚引用；确认数据库兼容后决定是否回滚 |
| 应用健康但自动清理失败 | 发布仍算成功；先保持应用运行，再检查 Python、Docker 权限或回滚引用 |

## 6. 数据库和配置备份

首次切换、数据库升级前应备份。当前生产配置是 MySQL 服务 `mysql`、数据库 `new-api`。
详细迁移和恢复参见 [deploy.md 第四节](deploy.md#四从旧服务器迁移)。
以下命令在服务器同一会话逐条执行，备份期间不要并发执行 DDL：

```bash
cd /data/new-api
umask 077
BACKUP_DIR="$PWD/.release/backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
chmod 700 "$PWD/.release" "$PWD/.release/backups" "$BACKUP_DIR"
cp -p .env compose.runtime.yml "$BACKUP_DIR/"
docker inspect --format '{{.Image}} {{.Config.Image}}' new-api > "$BACKUP_DIR/application-image.txt"
PROJECT=$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' new-api)
docker compose --env-file .env -p "$PROJECT" -f compose.runtime.yml exec -T mysql \
  sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -u root --single-transaction --quick --routines --triggers --events --no-tablespaces --set-gtid-purged=OFF new-api' \
  > "$BACKUP_DIR/mysql.sql.tmp"
```

仅在上一条命令成功后执行：

```bash
test -s "$BACKUP_DIR/mysql.sql.tmp" && mv "$BACKUP_DIR/mysql.sql.tmp" "$BACKUP_DIR/mysql.sql"
test -s "$BACKUP_DIR/mysql.sql"
printf 'Backup ready: %s\n' "$BACKUP_DIR"
```

`--single-transaction` 的一致性依赖 InnoDB。备份含敏感数据，仅保留在受控位置。
镜像清理不会处理备份；备份保留和恢复演练单独管理。

## 7. 常见问题

| 现象 | 处理 |
| --- | --- |
| 仍有 backend/frontend 任务 | 工作流定义仍是旧版；使用包含新版工作流的分支新建运行 |
| 构建报旧代码错误 | 核对 resolve 实际检出的源码 SHA |
| GHCR 拉取 denied | 检查包可见性、read:packages 权限和 Docker 登录的 Linux 用户 |
| 不识别 !reset 或 --wait | 更新 Compose 插件 |
| 镜像架构不匹配 | 根据 uname -m 选择正确架构重新构建 |
| cleanup 显示 PREVIEW | 仅预览；需要实际删除时加 --apply |
| 清理后仍超过 3 个历史镜像 | 保留天数、回滚目标、容器引用或其他标签触发保护 |
| saved rollback image is missing | 先查明缺失原因并恢复有效回滚引用；脚本会停止清理 |
| Python 缺失或版本低 | 安装 Python 3.10+，上传清理文件，再执行预览 |
| CRLF 导致脚本错误 | 按 LF 上传；必要时执行 `sed -i 's/\r$//' deploy-image.sh` |
| 应用新增了必需环境变量 | 单独审查并更新 compose.runtime.yml，镜像升级不会自动修改运行配置 |

本地检查日志和空间，分享前脱敏：

```bash
docker logs --tail 100 new-api
docker system df
```

日常镜像发布不需要服务器端 `docker compose build`、`up --build` 或 `down -v`。
不要用 `docker compose restart` 代替版本更新，它只重启原容器。

## 8. 验证与官方参考

清理规则有独立的 Python 标准库模拟检查，不连接 Docker 或网络：

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s scripts/tests -p 'test_cleanup_new_api_images.py' -v
```

它不加入镜像发布工作流，不影响日常构建速度；也不能替代 Linux 上的 bash -n、
真实 Docker 清理预览和升级验收。

- [Docker 镜像删除与多标签](https://docs.docker.com/reference/cli/docker/image/rm/)
- [容器 ancestor 过滤](https://docs.docker.com/reference/cli/docker/container/ls/)
- [Compose 更新与健康等待](https://docs.docker.com/reference/cli/docker/compose/up/)
- [GHCR 权限与登录](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)

## 9. 可选：GitHub 通过 SSH 自动部署

配置后，仍手动点击 Run workflow 选择发布源码，但可勾选 `deploy`：
镜像发布成功后自动 SSH 调用服务器的发布脚本，完成下载、容器更新、健康检查和本机旧镜像清理。
默认 `deploy=false`，不配置 SSH 也可以继续按前面的手动方案使用。

### 9.1 先确认服务器已具备手动发布能力

第 4 节的文件和运行配置必须已放到服务器，包括 Python 清理文件。
私有 GHCR 镜像还需由同一个 SSH 用户事先完成 docker login。
自动部署任务不会上传脚本、修改生产 .env 或在服务器编译程序。

SSH 用户使用当前能够执行手动发布命令的运维账号，并具有原目录和 Docker 所需权限。
不要把普通用户加入 docker 组就当作低权限隔离；rootful Docker 的管理权限很高。
本方案用专用密钥和强制命令限制该密钥的用途。

### 9.2 在 Windows 生成一对专用 OpenSSH 密钥

在本地 PowerShell 执行，不覆盖已有密钥：

```powershell
ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\new_api_actions" -C "github-new-api-deploy"
```

该专用密钥供非交互任务使用，口令提示处按回车留空。
生成的 `new_api_actions` 是私钥，`new_api_actions.pub` 是公钥。
不要复用日常登录私钥，GitHub SSH 客户端需要 OpenSSH 格式而非 PPK。

### 9.3 安装受限的服务器入口

把 `scripts/deploy-from-github.sh` 上传到服务器 `/data/new-api/scripts/`。
若原安装目录不同，下面的目录及 authorized_keys 中的绝对路径一并修改。

```bash
cd /data/new-api
chmod 700 scripts/deploy-from-github.sh
bash -n scripts/deploy-from-github.sh
bash -n deploy-image.sh
mkdir -p ~/.ssh
chmod 700 ~/.ssh
touch ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

在这个 SSH 用户的 `~/.ssh/authorized_keys` 中追加一行，保留已有内容：

```text
restrict,command="/data/new-api/scripts/deploy-from-github.sh" ssh-ed25519 AAAA这里替换为pub文件的实际公钥 github-new-api-deploy
```

将 `ssh-ed25519` 开始的部分替换为公钥文件的完整单行内容。
该密钥只能提交形如 `deploy ghcr.io/lgwtonylgw/new-api@sha256:摘要` 的命令；
交互 Shell、端口转发和任意其他命令不会被允许。
入口脚本只接受固定仓库和 64 位 digest，随后执行现有 `deploy-image.sh`。

### 9.4 配置 production 环境与 5 个 Secret

GitHub 仓库 **Settings → Environments → New environment → production**。
在该环境下添加 Environment secrets：

| Secret | 填写内容 |
| --- | --- |
| SSH_HOST | 服务器实际 IP 或可解析域名，不能包含 https:// 或路径 |
| SSH_PORT | 实际 SSH 端口，例如 22 或 52222 |
| SSH_USER | 上一步安装公钥、可执行手动发布的 Linux 用户名 |
| SSH_PRIVATE_KEY | 专用 OpenSSH 私钥全部内容，包含 BEGIN/END 两行 |
| SSH_KNOWN_HOSTS | 已核验的服务器 SSH 公钥记录，格式见下文 |

私钥只填到 GitHub Secret，不发到聊天、不写到仓库。

通过已有可信的 MobaXterm 连接，在服务器读取主机公钥（注意是 .pub 文件）：

```bash
cat /etc/ssh/ssh_host_ed25519_key.pub
```

取输出中的 `ssh-ed25519 AAAA...`，按实际主机和端口拼成 SSH_KNOWN_HOSTS 的一行：

```text
# SSH 端口为 22 时：
实际服务器IP ssh-ed25519 实际主机公钥
# 非默认端口（例如 52222）时：
[实际服务器IP]:52222 ssh-ed25519 实际主机公钥
```

Secret 里只填适用的实际记录，不填注释或占位符。使用域名连接时，这里的主机也写同一个域名。
工作流启用严格主机密钥校验；更换服务器时先核对新主机，再更新此 Secret。

production 环境可以限定部署分支为 `feature/20261122-develop`。
如设置 Required reviewers，部署前还要在 GitHub 点批准；不设置审核人则构建成功后直接部署。
单人维护时不要启用导致自己无法批准的 Prevent self-review 设置。
环境分支规则约束工作流运行分支，不验证 source_ref 输入；发布时仍须确认该输入是可信源码。

### 9.5 第一次运行

提交并推送新增的入口脚本、工作流和文档。进入 Actions 新建运行，
Use workflow from 选择已包含新版工作流的分支，填写源码和架构，勾选 `deploy`。
整个流程将显示 `resolve → publish → deploy`。

SSH 任务使用本次 publish 的实际 digest，不使用 latest 标签。它不会重新运行测试。
部署错误会使 GitHub 的 deploy 任务失败；应用回滚仍按第 5 节判断数据库兼容性后手动执行。
自动清理失败但应用健康时，现有发布脚本仅提示清理警告，部署仍成功。

如果当前防火墙只允许管理电脑 IP，GitHub Runner 无法连接，需要配置适合的 SSH 访问路径；
不要直接关闭防火墙。第一次成功后，在服务器核对 status、网页和业务功能。
