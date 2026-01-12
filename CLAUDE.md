# RustCloud - Claude Code 项目上下文

## 项目简介

RustCloud 是一个基于 Rust 开发的加密云存储系统，采用零知识架构，提供端到端加密、细粒度权限控制和安全文档共享功能。这是一个毕业设计项目。

## 三大创新点

1. **零服务端存储密钥管理** - Master Key 仅在客户端内存中存在，服务器永远无法获取
2. **分层威胁防护模型** - 客户端、传输层、服务器三层系统化安全防护
3. **基于密码学的细粒度权限控制** - 通过密钥重加密实现权限分发，无密钥无法解密

## 技术栈

| 层次 | 技术 |
|------|------|
| 后端语言 | Rust |
| Web框架 | Axum + Tokio |
| 数据库 | PostgreSQL + SeaORM |
| 缓存 | Redis |
| 对象存储 | MinIO |
| 对称加密 | AES-256-GCM |
| 非对称加密 | RSA-2048 |
| 密钥派生 | Argon2id |
| 前端 | React + TypeScript + Web Crypto API |

## 文档导航

```
docs/
├── README.md           # 系统架构总览
├── modules/            # 模块设计文档
│   ├── core.md         # 核心模块
│   ├── crypto.md       # 加密模块 (核心)
│   ├── storage.md      # 存储模块
│   ├── auth.md         # 认证模块
│   ├── database.md     # 数据库模块
│   ├── api.md          # API模块
│   └── web.md          # 前端模块
├── flows.md            # 系统流程
└── environment.md      # 开发环境
```

## 模块概览

| 模块 | 职责 | 预计代码量 |
|------|------|-----------|
| rustcloud-core | 类型定义、错误处理、配置 | ~300行 |
| rustcloud-crypto | 加密解密、密钥管理 | ~600行 |
| rustcloud-storage | 文件存储抽象 | ~400行 |
| rustcloud-auth | JWT认证、会话管理 | ~500行 |
| rustcloud-database | ORM模型、数据访问 | ~600行 |
| rustcloud-api | RESTful API服务 | ~1200行 |
| web | 前端界面、客户端加密 | ~800行 |

## 开发状态

- [ ] 基础架构搭建
- [ ] 核心模块实现
- [ ] 加密模块实现
- [ ] 存储模块实现
- [ ] 认证模块实现
- [ ] 数据库模块实现
- [ ] API服务实现
- [ ] 前端开发
- [ ] 安全测试

## 常用命令

```bash
# 启动依赖服务
docker-compose up -d

# 构建项目
cargo build

# 运行测试
cargo test --all

# 运行服务
cargo run --bin rustcloud-api

# 数据库迁移
sea-orm-cli migrate up
```

## 可用技能

- `/dev` - 开发相关命令和调试技巧
