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
- `folders`（目录节点，支持嵌套层级）
- `folder_keys`（每用户一条文件夹密钥密文）
- `identities`（身份组/团队，用于批量授权）
- `identity_users`（身份组成员关联表）

## 关键事实

- `encrypted_key` / `folder_key` 在数据库中均为密文字符串，由前端生成/重加密后提交。
- 数据库层不解密任何密钥，只做存取与权限关联。
- `folders` 通过 `parent_id` 自关联实现任意深度目录树。
- `identities` 代表一组用户，文档权限可授予整个 identity，成员批量继承。

## 主要仓库

- `UserRepository`
- `DocumentRepository`
- `DocumentKeyRepository`
- `ShareLinkRepository`
- `FolderRepository`
- `FolderKeyRepository`
- `IdentityRepository`
- `IdentityUserRepository`

## 查询参数

`DocumentListParams` 支持分页与排序（`created_at/updated_at/size`）。
