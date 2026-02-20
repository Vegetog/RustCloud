# rustcloud-core 模块（当前实现）

## 职责

- 统一错误类型（`crates/rustcloud-core/src/error.rs`）
- 应用配置加载（`AppConfig`）
- 核心业务类型定义
- 通用工具函数

## 关键事实

- `AppConfig` 当前不再包含 `argon2_memory/iterations/parallelism` 字段。
- 用户/文档核心类型使用字符串字段承载密钥与密文（base64/文本形态）。

## 主要结构（节选）

- `AppConfig`：`server_*`、数据库、Redis、存储、JWT 配置
- `StorageBackend`：`Local | Minio`
- `types::User`：`public_key`、`encrypted_private_key`、`key_salt`
- `types::DocumentKey`：每用户每文档的 `encrypted_key` 记录

## 使用方

- `rustcloud-api` 读取配置和错误类型
- 其他 crate 复用 `Result/Error` 与基础类型
