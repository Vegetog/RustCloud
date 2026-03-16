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

## 2.1 发布后的一行部署（给其他人使用）

维护者先发布镜像（打 tag 会自动触发）：

```bash
git tag v1.0.0
git push origin v1.0.0
```

普通用户一行部署（默认 latest，也可传版本号）：

```bash
curl -fsSL https://raw.githubusercontent.com/Vegetog/RustCloud/main/install.sh | bash
# 或指定版本
curl -fsSL https://raw.githubusercontent.com/Vegetog/RustCloud/main/install.sh | bash -s -- v1.0.0
```

部署目录默认在 `$HOME/rustcloud`，首次会自动生成 `.env.prod`。
正式环境请务必替换其中所有 `CHANGE_ME` 配置。

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
