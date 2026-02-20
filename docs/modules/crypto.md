# rustcloud-crypto 模块（当前实现）

## 职责（后端）

当前后端仅保留：

- `hash_password(password)`：Argon2id 密码哈希
- `verify_password(password, hash)`：密码校验
- `sha256_hash / sha256_hash_hex`：SHA-256 计算

## 非职责（已迁出）

以下不再由后端 `rustcloud-crypto` 承担：

- 文档 AES 加解密
- RSA 密钥对生成/DEK 封装
- MasterKey/DocumentKey 运行时结构

这些能力在当前架构中由前端 `web/src/services/crypto.ts` 使用 Web Crypto API 完成。

## 边界说明

- 认证密码：后端 Argon2（`rustcloud-auth` 调用）
- 文件加密：前端 E2EE
