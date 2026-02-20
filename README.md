# RustCloud

基于 Rust 的加密云存储系统，采用“前端文件 E2EE + 后端认证与密文存储”架构。

## 当前架构（以代码为准）

- 前端负责：
  - 生成用户 RSA 密钥对
  - 使用密码经 PBKDF2 派生 `MasterKey`
  - 本地加/解密私钥与文档内容
  - 生成并封装文档密钥（DEK）
- 后端负责：
  - 用户注册/登录、JWT、会话管理
  - 存储与转发密文（包含 `encrypted_key`）
  - 密码哈希与校验（Argon2id）
  - 存储层 SHA-256 哈希计算

## E2EE 边界说明

- 文档内容与文件名：端到端加密（服务器不持有明文 DEK）
- 登录密码：传统认证流程（通过 HTTPS 传输到后端，后端 Argon2 校验）

## 仓库结构

```text
crates/
  rustcloud-core       # 核心错误/配置/类型
  rustcloud-crypto     # 后端当前仅: hash_password/verify_password/sha256
  rustcloud-auth       # JWT、会话、密码强度
  rustcloud-storage    # Local/MinIO 存储抽象
  rustcloud-database   # SeaORM 实体、仓库、迁移
  rustcloud-api        # REST API
web/                   # React + TypeScript + Web Crypto
```

## 快速开始

```bash
# 1) 启动服务
Docker compose up -d

# 2) 后端检查
cargo check --workspace

# 3) 前端构建
cd web && npm install && npm run build
```

默认入口：
- Web: `http://localhost:3000`
- API: `http://localhost:8080/api/v1`

## 常用命令

```bash
# Rust
cargo check --workspace
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace

# Frontend
cd web
npm run build
```

## 文档索引

- 快速启动：`QUICKSTART.md`
- 系统总览：`docs/README.md`
- 模块文档：`docs/modules/*.md`
- 环境变量：`docs/environment.md`
- 流程说明：`docs/flows.md`

## 历史文档说明

`CHANGELOG.md`、`TODO.md`、`TEST_REPORT.md` 保留历史记录；已追加“当前状态更正”说明，请以最新更正和源码为准。
