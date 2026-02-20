# rustcloud-api 模块（当前实现）

## 职责

- 暴露 REST API
- 鉴权与权限检查
- 连接数据库、Redis、存储层
- 统一响应与错误格式

## 路由（以 `routes.rs` 为准）

前缀：`/api/v1`

### Auth
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`（鉴权）
- `GET /auth/me`（鉴权）
- `GET /auth/users/:email/public-key`（鉴权）

### Documents（鉴权）
- `GET /documents`
- `POST /documents`
- `GET /documents/:id`
- `PATCH /documents/:id`
- `GET /documents/:id/download`
- `DELETE /documents/:id`
- `GET /documents/:id/lock`
- `DELETE /documents/:id/lock`
- `POST /documents/:id/lock/heartbeat`
- `GET /documents/:id/permissions`
- `POST /documents/:id/permissions`
- `DELETE /documents/:id/permissions/:user_id`

### Shares
公开：
- `GET /shares/access/:token`
- `POST /shares/access/:token`
- `GET /shares/access/:token/download`

鉴权：
- `POST /shares`
- `GET /shares`
- `DELETE /shares/:id`

### Other
- `GET /health`

## 加密边界

API 不做文档内容解密；仅存取密文与 `encrypted_key`。
