# rustcloud-storage 模块（当前实现）

## 职责

- 定义统一 `Storage` trait
- 实现 `LocalStorage` 与 `MinioStorage`
- 返回 `StorageObject`（元数据 + 二进制内容）

## 关键结构

- `StorageMetadata`: `path/size/content_type/hash/created_at/modified_at`
- `StorageObject`: `{ metadata, content }`
- `LocalStorageConfig` / `MinioStorageConfig`

## 与加密关系

- 存储层不负责文档业务加解密。
- 存储层仅对传入字节做持久化；上传内容是否密文由上层决定。
- 哈希能力通过 `rustcloud-crypto::sha256_hash_hex` 复用。
