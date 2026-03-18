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

## 一键部署（跨平台）

默认拉取 `latest`（无需手动指定版本）。

如需固定到某个 Release，可在命令末尾追加：`-s -- vX.Y.Z`。

- Windows PowerShell（原生推荐）

```powershell
irm https://raw.githubusercontent.com/Vegetog/RustCloud/main/install.ps1 | iex
```

- Windows CMD（原生）

```cmd
curl -fsSL https://raw.githubusercontent.com/Vegetog/RustCloud/main/install.cmd -o install.cmd && install.cmd && del install.cmd
```

- Windows（Git Bash）

```powershell
curl.exe -fsSL https://raw.githubusercontent.com/Vegetog/RustCloud/main/install.sh | bash
```

- macOS（Terminal / zsh）

```bash
curl -fsSL https://raw.githubusercontent.com/Vegetog/RustCloud/main/install.sh | bash
```

- Linux（bash）

```bash
curl -fsSL https://raw.githubusercontent.com/Vegetog/RustCloud/main/install.sh | bash
```

- WSL（在 Windows 的 WSL 终端中执行）

```bash
curl -fsSL https://raw.githubusercontent.com/Vegetog/RustCloud/main/install.sh | bash
```

如果在 PowerShell 中没有 `bash`，可直接通过 WSL 执行：

```powershell
wsl bash -lc "curl -fsSL https://raw.githubusercontent.com/Vegetog/RustCloud/main/install.sh | bash"
```

固定版本示例（可选）：

```bash
curl -fsSL https://raw.githubusercontent.com/Vegetog/RustCloud/main/install.sh | bash -s -- v1.0.7
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Vegetog/RustCloud/main/install.ps1))) -Version v1.0.7"
```

若历史数据卷导致数据库密码不匹配，可启用自动清理重装（会删除已有数据）：

```bash
RUSTCLOUD_RESET_DATA=1 curl -fsSL https://raw.githubusercontent.com/Vegetog/RustCloud/main/install.sh | bash
```

```powershell
$env:RUSTCLOUD_RESET_DATA="1"; irm https://raw.githubusercontent.com/Vegetog/RustCloud/main/install.ps1 | iex
```

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

## 许可证

本项目使用 AGPL-3.0 协议发布，详见 `LICENSE`。

补充说明：
- 若你修改本项目并通过网络提供服务，需要按 AGPL-3.0 提供对应修改源码。
- 项目名称与品牌标识不随代码许可证自动授权。
