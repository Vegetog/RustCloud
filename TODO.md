# RustCloud 开发清单

> 使用 `- [x]` 标记已完成的任务

## 现状校正（以当前代码为准）

- `rustcloud-crypto` 中历史上的 AES/RSA/DEK 后端实现已移除，当前仅保留密码哈希与 SHA-256。
- 文档相关任务中若出现“服务端执行文档加解密”，视为历史方案，不代表当前实现。
- 当前前端 `npm run lint` 仍有历史质量债务；本次清理不包含该类重构。

---

## 阶段一：基础架构搭建 ✅

- [x] 创建 Cargo workspace 配置 (`Cargo.toml`)
- [x] 创建各模块目录和 Cargo.toml
  - [x] rustcloud-core
  - [x] rustcloud-crypto
  - [x] rustcloud-storage
  - [x] rustcloud-auth
  - [x] rustcloud-database
  - [x] rustcloud-api
- [x] 创建 `docker-compose.yml`（Docker 全容器化部署）
- [x] 创建 `.env.example` 配置模板
- [x] 验证开发环境能正常启动

---

## 阶段二：核心模块 (rustcloud-core) ~300行 ✅

- [x] 错误类型定义 (`RustCloudError`)
- [x] 核心数据结构
  - [x] User
  - [x] Document
  - [x] DocumentKey
  - [x] ShareLink
- [x] 配置管理 (`AppConfig`)
- [x] 工具函数 (uuid, time, base64)
- [x] 单元测试

---

## 阶段三：加密模块 (rustcloud-crypto) ~600行 ✅

- [x] Argon2id 密钥派生
- [x] RSA-2048 密钥对操作
  - [x] 密钥对生成
  - [x] 公钥加密
  - [x] 私钥解密
- [x] AES-256-GCM 加密/解密
- [x] SHA-256 哈希
- [x] 安全内存清零 (`zeroize`)
- [x] 单元测试 (25 tests passed)

---

## 阶段四：存储模块 (rustcloud-storage) ~400行 ✅

- [x] Storage Trait 定义
- [x] LocalStorage 实现（开发用）
- [x] MinioStorage 实现
- [ ] EncryptedStorage 装饰器（后续按需实现）
- [ ] 大文件分块处理（后续按需实现）
- [x] 单元测试 (6 tests passed)

---

## 阶段五：认证模块 (rustcloud-auth) ~500行 ✅

- [x] JWT Access Token 管理
- [x] JWT Refresh Token 管理
- [x] Argon2id 密码哈希
- [x] 密码强度验证（≥8字符、大小写、数字）
- [x] Redis 会话管理（最多5个会话/用户）
- [x] Token Family 重放检测
- [x] 单元测试 (18 tests passed)

---

## 阶段六：数据库模块 (rustcloud-database) ~600行 ✅

- [x] SeaORM 实体定义
  - [x] users
  - [x] documents
  - [x] document_keys
  - [x] share_links
- [x] 数据库迁移脚本
- [x] UserRepository 实现
- [x] DocumentRepository 实现
- [x] DocumentKeyRepository 实现
- [x] ShareLinkRepository 实现
- [x] 单元测试 (33 tests passed)

---

## 阶段七：API 服务 (rustcloud-api) ~1200行 ✅

- [x] Axum 应用框架搭建
- [x] AppState 共享状态
- [x] 中间件
  - [x] 认证中间件
  - [x] 错误处理中间件
  - [x] CORS 配置
  - [ ] 限流中间件（后续可选）
- [x] Auth API (`/api/v1/auth/*`)
  - [x] POST /register
  - [x] POST /login
  - [x] POST /refresh
  - [x] POST /logout
  - [x] GET /me
- [x] Documents API (`/api/v1/documents/*`)
  - [x] GET / (list)
  - [x] POST / (upload)
  - [x] GET /:id
  - [x] GET /:id/download
  - [x] DELETE /:id
  - [x] POST /:id/permissions (grant)
  - [x] DELETE /:id/permissions/:user_id (revoke)
- [x] Shares API (`/api/v1/shares/*`)
  - [x] POST / (create)
  - [x] GET / (list)
  - [x] GET /:token (access)
  - [x] DELETE /:id
- [x] 功能测试（10+ 测试场景全部通过）
- [x] 错误处理测试（401/404/409 等）

---

## 阶段八：前端开发 (web) ~800行 ✅

- [x] Vite + React + TypeScript 项目初始化
- [x] Web Crypto API 加密服务封装
  - [x] 密钥派生 (PBKDF2)
  - [x] RSA 操作
  - [x] AES-GCM 操作
- [x] Zustand 状态管理
  - [x] AuthStore
  - [x] DocumentStore
- [x] 页面开发
  - [x] 登录页面
  - [x] 注册页面
  - [x] 文件列表页面
  - [x] 分享访问页面（基础版本）
- [x] 功能实现
  - [x] 文件上传（客户端加密）
  - [x] 文件下载（客户端解密）
  - [x] React Router 路由配置
- [x] 构建测试（289.74 kB, gzip: 94.14 kB）
- [ ] API 集成测试（待前后端联调）

---

## 阶段九：集成测试与安全审计

- [ ] 端到端加密流程测试
- [ ] 权限控制测试
- [ ] API 安全测试
- [ ] 性能测试

---

## 阶段十：Docker 全容器化部署 ✅

- [x] 后端多阶段 Dockerfile (`Dockerfile.api`)
- [x] 前端多阶段 Dockerfile (`Dockerfile.web`, Nginx 托管)
- [x] `docker-compose.yml`（全容器化部署）
  - [x] rustcloud-api 服务（cargo-watch 热重载）
  - [x] rustcloud-web 服务（Vite HMR）
  - [x] PostgreSQL 服务
  - [x] Redis 服务
  - [x] MinIO 服务 + 自动初始化
  - [x] 数据库迁移服务
  - [x] Adminer 数据库管理工具
- [x] 环境变量配置

---

## 验证方式

- 每完成一个模块，运行 `cargo test --all` 验证
- 前后端联调通过后勾选对应项
- 最终通过 `docker-compose up -d` 一键启动验证

---

## 代码量统计

| 模块 | 预计行数 | 实际行数 | 状态 |
|------|---------|---------|------|
| rustcloud-core | ~300 | ~350 | ✅ |
| rustcloud-crypto | ~600 | ~650 | ✅ |
| rustcloud-storage | ~400 | ~420 | ✅ |
| rustcloud-auth | ~500 | ~550 | ✅ |
| rustcloud-database | ~600 | ~800 | ✅ |
| rustcloud-api | ~1200 | ~1500 | ✅ |
| web 前端 | ~800 | ~1350 | ✅ |
| **总计** | **~4400** | **~5620** | **8/10** |
