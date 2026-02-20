# RustCloud 快速启动

## 1. 前置要求

- Rust 1.75+
- Node.js 18+
- Docker + Docker Compose

## 2. 一键启动（推荐）

```bash
docker-compose up -d
```

启动后：
- Web: `http://localhost:3000`
- API: `http://localhost:8080/api/v1`
- MinIO Console: `http://localhost:9001`

## 3. 本地验证

```bash
# 后端
cargo check --workspace
cargo clippy --workspace --all-targets -- -D warnings

# 前端
cd web
npm install
npm run build
```

## 4. 核心流程（当前实现）

- 注册：前端生成 RSA 密钥对，私钥用 PBKDF2 派生的 `MasterKey` 加密后上传。
- 登录：后端校验密码（Argon2），返回加密私钥与 salt；前端本地解密私钥。
- 上传：前端生成 DEK，加密文件内容/文件名，再把 `encrypted_key` 与密文上传。
- 下载：后端返回密文与 `encrypted_key`，前端用私钥解 DEK 并解密内容。

## 5. 注意

- 当前后端 `rustcloud-crypto` 不再执行文档 AES/RSA 加解密；仅保留密码哈希与 SHA-256。
- 前端 lint 目前仍有历史质量问题；本指南不要求 `npm run lint` 全绿。

## 6. 目录速览

```text
crates/rustcloud-api
crates/rustcloud-auth
crates/rustcloud-core
crates/rustcloud-crypto
crates/rustcloud-database
crates/rustcloud-storage
web
```
