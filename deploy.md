首次部署：
git clone -b 你的分支 --single-branch 仓库地址 new-api
cd new-api

docker compose up -d --build
以后更新：
git pull --ff-only origin 你的分支
docker compose build --pull new-api
docker compose up -d
如果只想更新应用、不动 PostgreSQL 和 Redis：
git pull --ff-only origin 你的分支
docker compose build --pull new-api
docker compose up -d --no-deps new-api