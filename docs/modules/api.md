# rustcloud-api 模块（当前实现）

## 职责

- 暴露 REST API 与 WebSocket
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

### Folders（鉴权）
- `POST /folders` — 创建文件夹
- `GET /folders` — 列出子项（根或指定目录）
- `GET /folders/:id` — 获取文件夹详情
- `PATCH /folders/:id` — 重命名文件夹
- `POST /folders/:id/move` — 移动文件夹
- `DELETE /folders/:id` — 删除文件夹
- `GET /folders/:id/snapshot` — 获取目录快照（含加密密钥包）
- `POST /folders/:id/share` — 分享文件夹

### Storage（鉴权）
- `POST /storage/upload` — 直传文件（返回存储 key）

### Identities（鉴权）
- `POST /identities` — 创建身份组
- `GET /identities` — 列出自己拥有的身份组
- `GET /identities/granted` — 列出被授予访问权的身份组
- `GET /identities/:id` — 获取身份组详情
- `PUT /identities/:id` — 更新身份组
- `DELETE /identities/:id` — 删除身份组
- `POST /identities/:id/users` — 批量添加成员
- `GET /identities/:id/users` — 列出成员
- `DELETE /identities/:id/users` — 批量移除成员

### Shares
公开：
- `GET /shares/access/:token`
- `POST /shares/access/:token`
- `GET /shares/access/:token/download`

鉴权：
- `POST /shares`
- `GET /shares`
- `DELETE /shares/:id`

### WebSocket
- `GET /documents/:id/ws` — 加密协作编辑（Yjs CRDT，Token 通过 query param 传入）

### Other
- `GET /health`

## 加密边界

API 不做文档内容解密；仅存取密文与 `encrypted_key`。WebSocket 端点同样仅中继加密后的 Yjs 增量，不持有明文。
