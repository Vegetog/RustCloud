# rustcloud-database 模块（当前实现）

## 职责

- SeaORM 实体映射
- Repository 数据访问封装
- 迁移管理

## 关键实体关系

- `users`
- `documents`
- `document_keys`（每用户一条 `encrypted_key`）
- `share_links`

## 关键事实

- `encrypted_key` 在数据库中是密文字符串，由前端生成/重加密后提交。
- 数据库层不解密 `encrypted_key`，只做存取与权限关联。

## 主要仓库

- `UserRepository`
- `DocumentRepository`
- `DocumentKeyRepository`
- `ShareLinkRepository`

## 查询参数

`DocumentListParams` 支持分页与排序（`created_at/updated_at/size`）。
