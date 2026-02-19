# RustCloud 快速启动指南

本指南帮助您快速启动 RustCloud 开发环境并运行 API 服务。

---

## 前置要求

- **Rust**: 1.70+ (推荐使用 `rustup` 安装)
- **Docker**: 20.10+
- **Docker Compose**: 2.0+
- **Git**: 任意版本

---

## 快速启动（5分钟）

### 1. 克隆项目

```bash
git clone https://github.com/your-org/rustcloud.git
cd rustcloud
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

确认 `.env` 文件中的配置（默认配置适用于开发环境）：
- `DATABASE_URL`: PostgreSQL 连接字符串
- `REDIS_URL`: Redis 连接字符串
- `STORAGE_BACKEND`: minio 或 local
- `JWT_SECRET`: JWT 签名密钥（生产环境必须修改）

### 3. 启动依赖服务

```bash
docker-compose up -d
```

这将启动：
- PostgreSQL (端口 5432)
- Redis (端口 6379)
- MinIO (端口 9000/9001)

验证服务健康：
```bash
docker-compose ps
```

### 4. 运行数据库迁移

```bash
cd crates/rustcloud-database/migration
cargo run
cd ../../..
```

验证表已创建：
```bash
docker exec rustcloud-postgres psql -U rustcloud -d rustcloud -c "\dt"
```

### 5. 启动 API 服务

```bash
RUST_LOG=rustcloud=debug,tower_http=debug cargo run -p rustcloud-api
```

服务将在 `http://localhost:8080` 启动。

---

## 测试 API

### 注册用户

```bash
curl -X POST http://localhost:8080/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo@example.com",
    "password": "Demo123456!",
    "salt": "ZGVtby1zYWx0LWJhc2U2NA==",
    "public_key": "LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0K...",
    "encrypted_private_key": "ZW5jcnlwdGVkLXByaXZhdGUta2V5",
    "private_key_nonce": "bm9uY2UtdmFsdWU="
  }'
```

### 登录

```bash
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo@example.com",
    "password": "Demo123456!"
  }'
```

保存返回的 `access_token`。

### 获取用户信息

```bash
TOKEN="your-access-token"

curl http://localhost:8080/api/v1/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

### 查看文档列表

```bash
curl "http://localhost:8080/api/v1/documents?page=1&page_size=20" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 开发工作流

### 运行测试

```bash
# 运行所有测试
cargo test --all

# 运行特定模块测试
cargo test -p rustcloud-crypto
cargo test -p rustcloud-database
```

### 构建项目

```bash
# 开发构建
cargo build

# 发布构建
cargo build --release

# 仅构建 API 服务
cargo build -p rustcloud-api --release
```

### 查看日志

API 服务日志级别通过 `RUST_LOG` 环境变量控制：

```bash
# Debug 级别
RUST_LOG=rustcloud=debug cargo run -p rustcloud-api

# Info 级别（生产推荐）
RUST_LOG=rustcloud=info cargo run -p rustcloud-api

# 仅错误
RUST_LOG=rustcloud=error cargo run -p rustcloud-api
```

---

## 项目结构

```
rustcloud/
├── crates/
│   ├── rustcloud-core/          # 核心类型和配置
│   ├── rustcloud-crypto/        # 加密模块 (AES-GCM, RSA, Argon2id)
│   ├── rustcloud-storage/       # 存储抽象 (Local, MinIO)
│   ├── rustcloud-auth/          # JWT 认证和会话管理
│   ├── rustcloud-database/      # SeaORM 数据库层
│   │   └── migration/           # 数据库迁移
│   └── rustcloud-api/           # Axum REST API 服务
├── docker-compose.yml           # Docker 全容器化部署
├── .env.example                 # 环境变量模板
├── TODO.md                      # 开发清单
└── TEST_REPORT.md               # 测试报告
```

---

## API 端点

### 认证 API (`/api/v1/auth`)

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/register` | 用户注册 | ❌ |
| POST | `/login` | 用户登录 | ❌ |
| POST | `/refresh` | 刷新令牌 | ❌ |
| POST | `/logout` | 用户登出 | ✅ |
| GET | `/me` | 获取当前用户 | ✅ |

### 文档 API (`/api/v1/documents`)

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/` | 文档列表 | ✅ |
| POST | `/` | 上传文档 | ✅ |
| GET | `/:id` | 文档详情 | ✅ |
| GET | `/:id/download` | 下载文档 | ✅ |
| DELETE | `/:id` | 删除文档 | ✅ |
| POST | `/:id/permissions` | 授予权限 | ✅ |
| DELETE | `/:id/permissions/:user_id` | 撤销权限 | ✅ |

### 分享 API (`/api/v1/shares`)

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/` | 创建分享链接 | ✅ |
| GET | `/` | 分享列表 | ✅ |
| GET | `/:token` | 访问分享 | ❌ |
| DELETE | `/:id` | 删除分享 | ✅ |

---

## 常见问题

### 端口被占用

```bash
# 检查端口占用
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis
lsof -i :8080  # API 服务

# 停止服务
docker-compose down
pkill -f "cargo run"
```

### 数据库连接失败

```bash
# 重启 PostgreSQL
docker-compose restart postgres

# 检查数据库状态
docker exec rustcloud-postgres pg_isready -U rustcloud
```

### 清理并重新开始

```bash
# 停止所有服务
docker-compose down -v

# 清理编译缓存
cargo clean

# 重新启动
docker-compose up -d
cd crates/rustcloud-database/migration && cargo run && cd ../../..
cargo run -p rustcloud-api
```

---

## 下一步

1. ✅ **查看测试报告**: [TEST_REPORT.md](./TEST_REPORT.md)
2. ✅ **查看开发进度**: [TODO.md](./TODO.md)
3. 🚀 **开始前端开发**: 参考 `docs/modules/web.md`
4. 📖 **阅读架构文档**: 参考 `docs/README.md`

---

## 技术栈

- **后端**: Rust + Axum + Tokio
- **数据库**: PostgreSQL + SeaORM
- **缓存**: Redis
- **存储**: MinIO (S3 兼容)
- **加密**: AES-256-GCM, RSA-2048, Argon2id
- **认证**: JWT (jsonwebtoken)

---

## 获取帮助

- 📋 查看 [开发文档](./docs/)
- 🐛 提交 [Issue](https://github.com/your-org/rustcloud/issues)
- 💬 加入社区讨论

---

**版本**: v0.1.0  
**最后更新**: 2026-01-16
