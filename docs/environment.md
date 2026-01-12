# RustCloud 开发环境文档

## 一、开发环境要求

### 1.1 必需软件

| 软件 | 版本要求 | 用途 |
|------|---------|------|
| Rust | 1.75+ | 后端开发语言 |
| Node.js | 18+ | 前端构建工具 |
| PostgreSQL | 14+ | 主数据库 |
| Redis | 7+ | 会话缓存 |
| Docker | 24+ | 容器化部署 |
| Docker Compose | 2.0+ | 本地开发环境 |

### 1.2 推荐工具

| 工具 | 用途 |
|------|------|
| VS Code | 代码编辑器 |
| rust-analyzer | Rust 语言服务器 |
| cargo-watch | 热重载 |
| sea-orm-cli | 数据库迁移 |
| Postman / Insomnia | API 测试 |

## 二、环境搭建

### 2.1 安装 Rust

```bash
# 安装 rustup
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 安装稳定版工具链
rustup default stable

# 验证安装
rustc --version
cargo --version
```

### 2.2 安装 Node.js

```bash
# 使用 nvm 安装 (推荐)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18

# 验证安装
node --version
npm --version
```

### 2.3 启动依赖服务 (Docker)

```bash
# 创建 docker-compose.yml
cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  postgres:
    image: postgres:14-alpine
    container_name: rustcloud-postgres
    environment:
      POSTGRES_USER: rustcloud
      POSTGRES_PASSWORD: rustcloud_dev
      POSTGRES_DB: rustcloud
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    container_name: rustcloud-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  minio:
    image: minio/minio:latest
    container_name: rustcloud-minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/data

volumes:
  postgres_data:
  redis_data:
  minio_data:
EOF

# 启动服务
docker-compose up -d

# 验证服务状态
docker-compose ps
```

### 2.4 安装开发工具

```bash
# SeaORM CLI (数据库迁移)
cargo install sea-orm-cli

# cargo-watch (热重载)
cargo install cargo-watch

# cargo-nextest (更好的测试运行器)
cargo install cargo-nextest
```

## 三、环境变量配置

### 3.1 创建 .env 文件

```bash
cat > .env << 'EOF'
# 服务器配置
SERVER_HOST=0.0.0.0
SERVER_PORT=8080

# 数据库配置
DATABASE_URL=postgres://rustcloud:rustcloud_dev@localhost:5432/rustcloud
DATABASE_MAX_CONNECTIONS=20
DATABASE_MIN_CONNECTIONS=5

# Redis 配置
REDIS_URL=redis://localhost:6379

# MinIO 配置
STORAGE_BACKEND=minio
STORAGE_ENDPOINT=http://localhost:9000
STORAGE_BUCKET=rustcloud
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin

# JWT 配置
JWT_SECRET=your-super-secret-key-at-least-32-bytes-long
JWT_ACCESS_TOKEN_TTL=3600
JWT_REFRESH_TOKEN_TTL=604800

# 加密配置
ARGON2_MEMORY=65536
ARGON2_ITERATIONS=3
ARGON2_PARALLELISM=4

# 日志配置
RUST_LOG=rustcloud=debug,tower_http=debug
EOF
```

### 3.2 环境变量说明

| 变量 | 说明 | 默认值 |
|------|------|--------|
| SERVER_HOST | 监听地址 | 0.0.0.0 |
| SERVER_PORT | 监听端口 | 8080 |
| DATABASE_URL | PostgreSQL 连接串 | - |
| DATABASE_MAX_CONNECTIONS | 最大连接数 | 20 |
| REDIS_URL | Redis 连接串 | - |
| STORAGE_BACKEND | 存储后端 (local/minio) | local |
| STORAGE_ENDPOINT | MinIO 端点 | - |
| STORAGE_BUCKET | 存储桶名称 | rustcloud |
| JWT_SECRET | JWT 签名密钥 | - |
| JWT_ACCESS_TOKEN_TTL | Access Token 有效期(秒) | 3600 |
| JWT_REFRESH_TOKEN_TTL | Refresh Token 有效期(秒) | 604800 |
| ARGON2_MEMORY | Argon2 内存参数(KB) | 65536 |
| RUST_LOG | 日志级别 | info |

## 四、项目初始化

### 4.1 创建项目结构

```bash
# 创建 Cargo 工作空间
mkdir -p crates/{rustcloud-core,rustcloud-crypto,rustcloud-storage}
mkdir -p crates/{rustcloud-auth,rustcloud-database,rustcloud-api}
mkdir -p web

# 创建 Cargo.toml
cat > Cargo.toml << 'EOF'
[workspace]
members = [
    "crates/rustcloud-core",
    "crates/rustcloud-crypto",
    "crates/rustcloud-storage",
    "crates/rustcloud-auth",
    "crates/rustcloud-database",
    "crates/rustcloud-api",
]
resolver = "2"

[workspace.dependencies]
tokio = { version = "1", features = ["full"] }
axum = "0.7"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
thiserror = "1"
anyhow = "1"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
EOF
```

### 4.2 数据库初始化

```bash
# 创建迁移目录
mkdir -p migration/src

# 运行迁移 (创建表)
sea-orm-cli migrate up

# 检查数据库状态
sea-orm-cli migrate status
```

### 4.3 创建 MinIO 存储桶

```bash
# 使用 mc 命令行工具
docker exec rustcloud-minio mc alias set local http://localhost:9000 minioadmin minioadmin
docker exec rustcloud-minio mc mb local/rustcloud
docker exec rustcloud-minio mc ls local
```

## 五、开发命令

### 5.1 构建

```bash
# 调试构建
cargo build

# 发布构建
cargo build --release

# 构建单个 crate
cargo build -p rustcloud-api
```

### 5.2 运行

```bash
# 运行 API 服务
cargo run --bin rustcloud-api

# 热重载运行
cargo watch -x 'run --bin rustcloud-api'

# 指定日志级别
RUST_LOG=debug cargo run --bin rustcloud-api
```

### 5.3 测试

```bash
# 运行所有测试
cargo test --all

# 运行单个 crate 的测试
cargo test -p rustcloud-crypto

# 运行特定测试
cargo test test_encrypt_decrypt

# 使用 nextest (更好的输出)
cargo nextest run --all
```

### 5.4 代码质量

```bash
# 格式化代码
cargo fmt --all

# 代码检查
cargo clippy --all -- -D warnings

# 检查未使用的依赖
cargo machete
```

### 5.5 数据库迁移

```bash
# 创建新迁移
sea-orm-cli migrate generate create_users_table

# 运行迁移
sea-orm-cli migrate up

# 回滚迁移
sea-orm-cli migrate down

# 重置数据库
sea-orm-cli migrate fresh
```

## 六、前端开发

### 6.1 初始化前端项目

```bash
cd web

# 使用 Vite 创建 React + TypeScript 项目
npm create vite@latest . -- --template react-ts

# 安装依赖
npm install

# 安装额外依赖
npm install axios react-router-dom @tanstack/react-query zustand
```

### 6.2 前端开发命令

```bash
# 开发模式
npm run dev

# 构建
npm run build

# 预览构建结果
npm run preview

# 类型检查
npm run type-check

# 代码检查
npm run lint
```

## 七、调试技巧

### 7.1 日志配置

```rust
// 在 main.rs 中配置
tracing_subscriber::fmt()
    .with_env_filter(EnvFilter::from_default_env())
    .with_target(true)
    .with_line_number(true)
    .init();
```

### 7.2 数据库查询日志

```bash
# 启用 SQLx 查询日志
RUST_LOG=sqlx=debug cargo run
```

### 7.3 VS Code 调试配置

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "lldb",
      "request": "launch",
      "name": "Debug API",
      "cargo": {
        "args": ["build", "--bin=rustcloud-api", "--package=rustcloud-api"],
        "filter": {
          "name": "rustcloud-api",
          "kind": "bin"
        }
      },
      "args": [],
      "cwd": "${workspaceFolder}",
      "env": {
        "RUST_LOG": "debug"
      }
    }
  ]
}
```

## 八、常见问题

### 8.1 PostgreSQL 连接失败

```bash
# 检查服务状态
docker-compose ps

# 查看日志
docker-compose logs postgres

# 手动连接测试
docker exec -it rustcloud-postgres psql -U rustcloud -d rustcloud
```

### 8.2 MinIO 权限问题

```bash
# 确保存储桶存在且有权限
docker exec rustcloud-minio mc ls local/rustcloud

# 设置公开读取策略 (如需要)
docker exec rustcloud-minio mc anonymous set download local/rustcloud
```

### 8.3 Rust 编译慢

```bash
# 使用 sccache 加速
cargo install sccache
export RUSTC_WRAPPER=sccache

# 或使用 mold 链接器 (Linux)
sudo apt install mold
RUSTFLAGS="-C link-arg=-fuse-ld=mold" cargo build
```

### 8.4 端口被占用

```bash
# 查找占用端口的进程
lsof -i :8080

# 杀死进程
kill -9 <PID>

# 或修改 .env 中的端口
SERVER_PORT=8081
```
