# RustCloud 环境配置（当前实现）

> 快速上手请参阅 [QUICKSTART.md](../QUICKSTART.md)。

## 环境变量

```env
SERVER_HOST=0.0.0.0
SERVER_PORT=8080

DATABASE_URL=postgres://rustcloud:rustcloud_dev@localhost:5432/rustcloud
DATABASE_MAX_CONNECTIONS=20
DATABASE_MIN_CONNECTIONS=5

REDIS_URL=redis://localhost:6379

STORAGE_BACKEND=minio
STORAGE_ENDPOINT=http://localhost:9000
STORAGE_BUCKET=rustcloud
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin

JWT_SECRET=your-super-secret-key-at-least-32-bytes-long
JWT_ACCESS_TOKEN_TTL=3600
JWT_REFRESH_TOKEN_TTL=604800

RUST_LOG=rustcloud=debug,tower_http=debug
```

> 说明：`ARGON2_MEMORY / ARGON2_ITERATIONS / ARGON2_PARALLELISM` 已不在 `AppConfig` 中暴露为环境变量。

## 端口

- API: `8080`
- Web: `3000`
- PostgreSQL: `5432`
- Redis: `6379`
- MinIO API: `9000`
- MinIO Console: `9001`
