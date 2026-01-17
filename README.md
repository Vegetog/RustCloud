# RustCloud

> 基于 Rust 的零知识加密云存储系统

[![Rust](https://img.shields.io/badge/rust-1.70%2B-orange.svg)](https://www.rust-lang.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-in--development-yellow.svg)]()

RustCloud 是一个采用零知识架构的加密云存储系统，提供端到端加密、细粒度权限控制和安全文档共享功能。这是一个毕业设计项目，旨在展示现代化的 Rust 后端开发和密码学最佳实践。

---

## ✨ 三大创新点

### 1. 零服务端存储密钥管理
- **Master Key** 仅在客户端内存中存在，服务器永远无法获取
- 所有加密操作在客户端完成，服务端只存储加密后的数据
- 即使服务器被攻破，攻击者也无法解密用户数据

### 2. 分层威胁防护模型
- **客户端层**: Argon2id 密钥派生 + Web Crypto API
- **传输层**: JWT Bearer Token + HTTPS
- **服务器层**: Redis 会话管理 + Token 黑名单 + 数据库访问控制

### 3. 基于密码学的细粒度权限控制
- 三级权限模型：Owner / Write / Read
- 通过 RSA 密钥重加密实现权限分发
- 无密钥无法解密，安全性数学可证明

---

## 🚀 快速启动

### 前置要求

- Rust 1.70+
- Docker & Docker Compose
- 8GB+ RAM

### 一键启动（推荐）

使用启动脚本自动启动所有服务（Docker依赖 + 后端API + 前端）：

```bash
# 1. 克隆项目
git clone https://github.com/your-org/rustcloud.git
cd rustcloud

# 2. 配置环境
cp .env.example .env

# 3. 给脚本添加执行权限
chmod +x start-dev.sh stop-dev.sh

# 4. 一键启动开发环境
./start-dev.sh
```

启动后访问：
- **前端**: http://localhost:3000
- **后端 API**: http://localhost:8080
- **MinIO 控制台**: http://localhost:9001 (minioadmin/minioadmin)

停止所有服务：
```bash
./stop-dev.sh
```

<details>
<summary>📖 手动启动（点击展开）</summary>

如果需要手动启动各个服务：

```bash
# 1. 启动 Docker 依赖服务
docker-compose -f docker-compose.dev.yml up -d

# 2. 运行数据库迁移
cd crates/rustcloud-database/migration && cargo run && cd ../../..

# 3. 启动后端 API 服务
RUST_LOG=rustcloud=debug cargo run --bin rustcloud-api

# 4. 启动前端开发服务器（新终端）
cd web && npm install && npm run dev
```

</details>

📖 **详细指南**: [QUICKSTART.md](./QUICKSTART.md)

---

## 🏗️ 架构设计

### 技术栈

| 层次 | 技术 |
|------|------|
| 后端语言 | Rust 2021 Edition |
| Web 框架 | Axum + Tokio |
| 数据库 | PostgreSQL + SeaORM |
| 缓存 | Redis |
| 对象存储 | MinIO (S3 兼容) |
| 对称加密 | AES-256-GCM |
| 非对称加密 | RSA-2048 |
| 密钥派生 | Argon2id |
| 认证 | JWT (jsonwebtoken) |

### 模块架构

```
rustcloud/
├── rustcloud-core         # 核心类型、错误、配置 (~300 行)
├── rustcloud-crypto       # 加密模块 (~600 行)
│   ├── AES-256-GCM       # 对称加密
│   ├── RSA-2048          # 非对称加密
│   └── Argon2id          # 密钥派生
├── rustcloud-storage      # 存储抽象 (~400 行)
│   ├── LocalStorage      # 本地文件系统
│   └── MinioStorage      # MinIO/S3
├── rustcloud-auth         # JWT + 会话管理 (~500 行)
├── rustcloud-database     # SeaORM 数据访问 (~600 行)
│   ├── entities/         # 数据模型
│   ├── repositories/     # Repository 模式
│   └── migration/        # 数据库迁移
└── rustcloud-api          # REST API 服务 (~1200 行)
    ├── handlers/         # 路由处理器
    ├── middleware/       # 认证、CORS
    └── dto/              # 数据传输对象
```

---

## 📊 当前进度

| 模块 | 状态 | 测试 | 代码量 |
|------|------|------|--------|
| rustcloud-core | ✅ 完成 | ✅ 通过 | ~300 行 |
| rustcloud-crypto | ✅ 完成 | ✅ 25 tests | ~600 行 |
| rustcloud-storage | ✅ 完成 | ✅ 6 tests | ~400 行 |
| rustcloud-auth | ✅ 完成 | ✅ 18 tests | ~500 行 |
| rustcloud-database | ✅ 完成 | ✅ 33 tests | ~600 行 |
| rustcloud-api | ✅ 完成 | ✅ 10+ tests | ~1200 行 |
| web 前端 | 🚧 进行中 | - | - |

**总计**: ~3600 行 Rust 代码 | **测试**: 92+ 个测试用例全部通过

📋 **详细清单**: [TODO.md](./TODO.md)  
📈 **测试报告**: [TEST_REPORT.md](./TEST_REPORT.md)

---

## 🎯 核心功能

### ✅ 已实现

- [x] 用户注册和登录
- [x] JWT 访问令牌 + 刷新令牌
- [x] Token family 防重放攻击
- [x] 会话管理（最多 5 个并发会话）
- [x] Token 黑名单（Redis）
- [x] 文档列表查询（分页）
- [x] 细粒度权限控制 (Owner/Write/Read)
- [x] 错误处理和统一响应格式

### 🚧 进行中

- [ ] 文档上传/下载（客户端加密）
- [ ] 文档权限管理（跨用户共享）
- [ ] 分享链接生成和访问
- [ ] 前端 UI (React + Web Crypto API)

---

## 🔒 安全特性

### 加密算法

- **对称加密**: AES-256-GCM (认证加密)
- **非对称加密**: RSA-2048 (OAEP padding)
- **密钥派生**: Argon2id (memory: 64MB, iterations: 3, parallelism: 4)
- **哈希**: SHA-256

### 安全机制

- ✅ 端到端加密（E2EE）
- ✅ 零知识证明架构
- ✅ JWT 双 Token 机制
- ✅ Token family 防重放
- ✅ 会话限制和黑名单
- ✅ 密码强度验证
- ✅ SQL 注入防护（SeaORM 参数化查询）
- ✅ XSS 防护（输入验证）

---

## 📖 文档

- [快速启动指南](./QUICKSTART.md) - 5 分钟快速上手
- [测试报告](./TEST_REPORT.md) - 完整的测试结果
- [开发清单](./TODO.md) - 开发进度追踪
- [架构设计](./docs/README.md) - 系统架构详解
- [模块文档](./docs/modules/) - 各模块设计文档
  - [核心模块](./docs/modules/core.md)
  - [加密模块](./docs/modules/crypto.md) ⭐
  - [存储模块](./docs/modules/storage.md)
  - [认证模块](./docs/modules/auth.md)
  - [数据库模块](./docs/modules/database.md)
  - [API 模块](./docs/modules/api.md)
  - [前端模块](./docs/modules/web.md)

---

## 🧪 测试

### 运行测试

```bash
# 运行所有测试
cargo test --all

# 运行特定模块测试
cargo test -p rustcloud-crypto
cargo test -p rustcloud-database
cargo test -p rustcloud-auth

# 查看测试覆盖率
cargo tarpaulin --all
```

### 测试统计

- **单元测试**: 92+ 个测试用例
- **集成测试**: 10+ API 端点测试
- **成功率**: 100% ✅

---

## 🛠️ 开发

### 项目结构

```
rustcloud/
├── crates/              # Rust workspace 成员
├── docs/                # 文档
├── docker-compose.dev.yml
├── .env.example
├── Cargo.toml           # Workspace 配置
├── README.md
├── TODO.md
├── TEST_REPORT.md
└── QUICKSTART.md
```

### 常用命令

```bash
# 构建项目
cargo build

# 运行 API 服务
cargo run -p rustcloud-api

# 格式化代码
cargo fmt --all

# 代码检查
cargo clippy --all -- -D warnings

# 运行测试
cargo test --all

# 生成文档
cargo doc --no-deps --open
```

---

## 🚀 部署

### Docker 部署（推荐）

```bash
# 使用 docker-compose 一键部署
docker-compose up -d
```

### 手动部署

```bash
# 构建发布版本
cargo build --release

# 运行迁移
cd crates/rustcloud-database/migration
cargo run --release

# 启动服务
./target/release/rustcloud-api
```

---

## 🤝 贡献

欢迎贡献代码、报告问题或提出建议！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

---

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

---

## 🙏 致谢

- [Axum](https://github.com/tokio-rs/axum) - Web 框架
- [SeaORM](https://www.sea-ql.org/SeaORM/) - ORM
- [RustCrypto](https://github.com/RustCrypto) - 加密算法实现
- [Tokio](https://tokio.rs/) - 异步运行时

---

## 📧 联系方式

- **作者**: RustCloud Team
- **项目**: 毕业设计项目
- **年份**: 2026

---

**⭐ 如果这个项目对你有帮助，请给个 Star！**
