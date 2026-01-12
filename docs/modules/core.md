# rustcloud-core 模块设计

## 一、模块职责

rustcloud-core 是系统的基础模块，提供所有其他模块共享的核心功能：

- **类型定义**: 统一的数据模型和结构体
- **错误处理**: 统一的错误类型体系
- **配置管理**: 环境变量和配置文件解析
- **工具函数**: 通用的辅助功能

## 二、核心数据结构

### 2.1 用户相关

```
User
├── id: UUID                    # 用户唯一标识
├── email: String               # 邮箱（登录凭证）
├── password_hash: String       # Argon2 哈希后的密码
├── salt: Vec<u8>               # 密钥派生盐值 (32字节)
├── public_key: Vec<u8>         # RSA 公钥 (DER格式)
├── encrypted_private_key: Vec<u8>  # 加密的私钥
├── private_key_nonce: Vec<u8>  # 加密私钥的 Nonce
├── created_at: DateTime        # 创建时间
└── updated_at: DateTime        # 更新时间
```

### 2.2 文档相关

```
Document
├── id: UUID                    # 文档唯一标识
├── owner_id: UUID              # 所有者 ID
├── encrypted_name: Vec<u8>     # 加密的文件名
├── content_hash: String        # 内容 SHA-256 哈希
├── storage_path: String        # 存储路径
├── size: i64                   # 文件大小（字节）
├── created_at: DateTime        # 创建时间
└── updated_at: DateTime        # 更新时间

DocumentKey
├── id: UUID                    # 记录 ID
├── document_id: UUID           # 文档 ID
├── user_id: UUID               # 用户 ID
├── encrypted_key: Vec<u8>      # 用用户公钥加密的文档密钥
├── permission_level: PermissionLevel  # 权限级别
└── created_at: DateTime        # 创建时间
```

### 2.3 分享相关

```
ShareLink
├── id: UUID                    # 分享 ID
├── document_id: UUID           # 文档 ID
├── creator_id: UUID            # 创建者 ID
├── access_token: String        # 访问令牌 (URL安全)
├── encrypted_key: Vec<u8>      # 用分享密钥加密的文档密钥
├── password_hash: Option<String>  # 可选访问密码
├── expires_at: Option<DateTime>   # 过期时间
├── max_access_count: Option<i32>  # 最大访问次数
├── access_count: i32           # 当前访问次数
└── created_at: DateTime        # 创建时间

PermissionLevel (枚举)
├── Owner     # 所有者 - 完全控制
├── Editor    # 编辑者 - 读写
├── Viewer    # 查看者 - 只读
└── Previewer # 预览者 - 仅预览
```

## 三、错误类型体系

```
RustCloudError (枚举)
├── AuthError           # 认证错误
│   ├── InvalidCredentials    # 凭证无效
│   ├── TokenExpired          # Token 过期
│   ├── TokenInvalid          # Token 无效
│   └── Unauthorized          # 未授权
├── CryptoError         # 加密错误
│   ├── EncryptionFailed      # 加密失败
│   ├── DecryptionFailed      # 解密失败
│   ├── KeyGenerationFailed   # 密钥生成失败
│   └── InvalidKey            # 密钥无效
├── StorageError        # 存储错误
│   ├── FileNotFound          # 文件不存在
│   ├── UploadFailed          # 上传失败
│   ├── DownloadFailed        # 下载失败
│   └── DeleteFailed          # 删除失败
├── DatabaseError       # 数据库错误
│   ├── ConnectionFailed      # 连接失败
│   ├── QueryFailed           # 查询失败
│   └── NotFound              # 记录不存在
├── ValidationError     # 验证错误
│   ├── InvalidInput          # 输入无效
│   ├── MissingField          # 缺少字段
│   └── FormatError           # 格式错误
└── InternalError       # 内部错误
```

错误需实现:
- `std::error::Error` trait
- `std::fmt::Display` trait
- 转换为 HTTP 状态码的方法

## 四、配置管理

### 4.1 配置结构

```
AppConfig
├── server: ServerConfig
│   ├── host: String          # 监听地址 (默认 0.0.0.0)
│   ├── port: u16             # 监听端口 (默认 8080)
│   └── workers: usize        # 工作线程数
├── database: DatabaseConfig
│   ├── url: String           # PostgreSQL 连接 URL
│   ├── max_connections: u32  # 最大连接数
│   └── min_connections: u32  # 最小连接数
├── redis: RedisConfig
│   └── url: String           # Redis 连接 URL
├── storage: StorageConfig
│   ├── backend: String       # 存储后端 (local/minio)
│   ├── path: String          # 本地存储路径
│   ├── endpoint: String      # MinIO 端点
│   ├── bucket: String        # 存储桶名称
│   ├── access_key: String    # 访问密钥
│   └── secret_key: String    # 私密密钥
├── jwt: JwtConfig
│   ├── secret: String        # JWT 签名密钥
│   ├── access_token_ttl: u64 # Access Token 有效期(秒)
│   └── refresh_token_ttl: u64 # Refresh Token 有效期(秒)
└── crypto: CryptoConfig
    ├── argon2_memory: u32    # Argon2 内存参数 (KB)
    ├── argon2_iterations: u32 # Argon2 迭代次数
    └── argon2_parallelism: u32 # Argon2 并行度
```

### 4.2 配置加载优先级

1. 环境变量 (最高优先级)
2. .env 文件
3. config.toml 文件
4. 默认值 (最低优先级)

## 五、主要接口

### 5.1 配置加载

```
fn load_config() -> Result<AppConfig, ConfigError>
  - 从多个来源加载配置
  - 合并配置值
  - 验证必填项

fn get_env<T>(key: &str) -> Option<T>
  - 获取环境变量并解析类型
```

### 5.2 错误转换

```
impl From<sqlx::Error> for RustCloudError
impl From<std::io::Error> for RustCloudError
impl From<ring::error::Unspecified> for RustCloudError
impl IntoResponse for RustCloudError  # Axum 响应转换
```

### 5.3 工具函数

```
fn generate_uuid() -> Uuid
  - 生成 UUID v4

fn current_timestamp() -> DateTime<Utc>
  - 获取当前 UTC 时间

fn base64_encode(data: &[u8]) -> String
fn base64_decode(s: &str) -> Result<Vec<u8>>
  - Base64 编解码 (URL安全变体)
```

## 六、依赖关系

```
rustcloud-core
├── 外部依赖
│   ├── uuid          # UUID 生成
│   ├── chrono        # 时间处理
│   ├── serde         # 序列化
│   ├── thiserror     # 错误派生
│   ├── config        # 配置管理
│   └── base64        # 编码
└── 被依赖
    └── 所有其他模块
```

## 七、设计要点

1. **零依赖循环**: core 模块不依赖任何其他业务模块
2. **类型安全**: 使用 newtype 模式包装敏感类型
3. **错误信息**: 错误消息要有意义但不泄露敏感信息
4. **配置验证**: 启动时验证所有必要配置

## 八、实现注意事项

1. 敏感配置（密钥、密码）不应出现在日志中
2. UUID 使用 v4 随机版本
3. 时间统一使用 UTC
4. 序列化时字段命名使用 snake_case
5. 错误实现 `Send + Sync` 以支持异步
