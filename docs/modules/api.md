# rustcloud-api 模块设计

## 一、模块职责

rustcloud-api 是系统的 HTTP 接口层：

- **路由定义**: RESTful API 端点
- **请求处理**: 参数提取、验证、响应
- **中间件**: 认证、日志、限流、CORS
- **错误处理**: 统一的错误响应格式

## 二、核心数据结构

### 2.1 请求/响应模型

```
认证相关:

RegisterRequest
├── email: String               # 邮箱
├── password: String            # 密码
├── public_key: String          # Base64 编码公钥
├── encrypted_private_key: String  # Base64 编码加密私钥
└── private_key_nonce: String   # Base64 编码 Nonce

LoginRequest
├── email: String               # 邮箱
└── password: String            # 密码

LoginResponse
├── access_token: String        # JWT Access Token
├── refresh_token: String       # JWT Refresh Token
├── expires_in: i64             # Access Token 有效期(秒)
├── user: UserInfo              # 用户信息
└── encrypted_private_key: String  # 加密的私钥 (客户端解密用)

RefreshRequest
└── refresh_token: String       # Refresh Token

RefreshResponse
├── access_token: String        # 新的 Access Token
├── refresh_token: String       # 新的 Refresh Token
└── expires_in: i64             # 有效期
```

```
文档相关:

UploadRequest (multipart/form-data)
├── file: Binary                # 加密的文件内容
├── encrypted_name: String      # 加密的文件名
├── name_nonce: String          # 文件名 Nonce
├── content_hash: String        # 内容哈希
└── encrypted_key: String       # 加密的文档密钥

DocumentResponse
├── id: String                  # 文档 ID
├── encrypted_name: String      # 加密的文件名
├── name_nonce: String          # 文件名 Nonce
├── size: i64                   # 文件大小
├── content_hash: String        # 内容哈希
├── created_at: String          # 创建时间 (ISO 8601)
└── permission_level: String    # 权限级别

DocumentListResponse
├── documents: Vec<DocumentResponse>
├── total: i64                  # 总数
├── page: i32                   # 当前页
└── page_size: i32              # 每页数量

DownloadResponse
├── encrypted_key: String       # 加密的文档密钥
└── file: Binary                # 加密的文件内容 (流)
```

```
分享相关:

CreateShareRequest
├── document_id: String         # 文档 ID
├── encrypted_key: String       # 用分享密钥加密的文档密钥
├── password: Option<String>    # 可选访问密码
├── expires_in: Option<i64>     # 有效期(秒)
└── max_access_count: Option<i32>  # 最大访问次数

ShareLinkResponse
├── id: String                  # 分享 ID
├── access_token: String        # 访问令牌
├── url: String                 # 完整分享链接
├── expires_at: Option<String>  # 过期时间
└── max_access_count: Option<i32>

AccessShareRequest
├── password: Option<String>    # 访问密码 (如需要)

AccessShareResponse
├── encrypted_key: String       # 加密的文档密钥
├── encrypted_name: String      # 加密的文件名
├── name_nonce: String          # 文件名 Nonce
└── file: Binary                # 加密的文件内容
```

### 2.2 通用响应

```
ApiResponse<T>
├── success: bool               # 是否成功
├── data: Option<T>             # 响应数据
└── error: Option<ApiError>     # 错误信息

ApiError
├── code: String                # 错误码 (如 AUTH_INVALID_TOKEN)
├── message: String             # 用户友好消息
└── details: Option<Value>      # 详细信息 (开发环境)

分页响应:
PageResponse<T>
├── items: Vec<T>               # 数据列表
├── total: i64                  # 总数
├── page: i32                   # 当前页
├── page_size: i32              # 每页数量
└── total_pages: i32            # 总页数
```

## 三、API 端点

### 3.1 认证 (/api/v1/auth)

| 方法 | 路径 | 功能 | 认证 |
|------|------|------|------|
| POST | /register | 用户注册 | 否 |
| POST | /login | 用户登录 | 否 |
| POST | /refresh | 刷新令牌 | 否 |
| POST | /logout | 退出登录 | 是 |
| GET | /me | 获取当前用户 | 是 |
| PUT | /password | 修改密码 | 是 |

### 3.2 文档 (/api/v1/documents)

| 方法 | 路径 | 功能 | 认证 |
|------|------|------|------|
| GET | / | 获取文档列表 | 是 |
| POST | / | 上传文档 | 是 |
| GET | /:id | 获取文档详情 | 是 |
| GET | /:id/download | 下载文档 | 是 |
| DELETE | /:id | 删除文档 | 是 |
| POST | /:id/permissions | 授予权限 | 是 |
| DELETE | /:id/permissions/:user_id | 撤销权限 | 是 |

### 3.3 分享 (/api/v1/shares)

| 方法 | 路径 | 功能 | 认证 |
|------|------|------|------|
| POST | / | 创建分享链接 | 是 |
| GET | / | 获取我的分享列表 | 是 |
| DELETE | /:id | 删除分享链接 | 是 |
| GET | /access/:token | 访问分享 | 否 |
| POST | /access/:token | 访问分享 (带密码) | 否 |

## 四、主要接口

### 4.1 路由配置

```
fn create_router(state: AppState) -> Router
  - 创建 Axum Router
  - 注册所有路由
  - 配置中间件
  - 返回: Router

路由结构:
Router::new()
    .nest("/api/v1", api_routes())
    .layer(cors_layer())
    .layer(trace_layer())
    .layer(compression_layer())
    .with_state(state)
```

### 4.2 处理器函数

```
认证处理器:

async fn register(
    State(state): State<AppState>,
    Json(req): Json<RegisterRequest>,
) -> Result<Json<ApiResponse<UserInfo>>, ApiError>

async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<ApiResponse<LoginResponse>>, ApiError>

文档处理器:

async fn upload_document(
    State(state): State<AppState>,
    Extension(user): Extension<AuthenticatedUser>,
    Multipart(form): Multipart,
) -> Result<Json<ApiResponse<DocumentResponse>>, ApiError>

async fn download_document(
    State(state): State<AppState>,
    Extension(user): Extension<AuthenticatedUser>,
    Path(id): Path<Uuid>,
) -> Result<(HeaderMap, Body), ApiError>
```

### 4.3 中间件

```
认证中间件:
async fn auth_middleware(
    State(state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Result<Response, ApiError>
  - 提取 Authorization 头
  - 验证 JWT Token
  - 注入 AuthenticatedUser 到 Extension

限流中间件:
async fn rate_limit_middleware(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, ApiError>
  - 基于 IP 或用户 ID 限流
  - 使用 Redis 计数
  - 超限返回 429

日志中间件:
async fn logging_middleware(
    request: Request,
    next: Next,
) -> Response
  - 记录请求方法、路径、耗时
  - 记录响应状态码
```

## 五、依赖关系

```
rustcloud-api
├── 依赖
│   ├── rustcloud-core        # 错误类型、配置
│   ├── rustcloud-crypto      # (可选) 服务端验证
│   ├── rustcloud-storage     # 文件存取
│   ├── rustcloud-auth        # 认证
│   └── rustcloud-database    # 数据访问
├── 外部依赖
│   ├── axum                  # Web 框架
│   ├── tower                 # 中间件框架
│   ├── tower-http            # HTTP 中间件
│   ├── serde_json            # JSON 序列化
│   └── validator             # 请求验证
└── 被依赖
    └── main                  # 程序入口
```

## 六、设计要点

### 6.1 应用状态

```
AppState (共享状态)
├── db: DatabaseConnection       # 数据库连接池
├── redis: RedisPool            # Redis 连接池
├── storage: Arc<dyn Storage>   # 存储服务
├── jwt_manager: Arc<JwtManager> # JWT 管理
├── session_manager: Arc<SessionManager> # 会话管理
└── config: Arc<AppConfig>      # 配置
```

### 6.2 错误处理

```
错误码规范:
- AUTH_*: 认证相关错误
- DOC_*: 文档相关错误
- SHARE_*: 分享相关错误
- VALIDATION_*: 验证错误
- INTERNAL_*: 内部错误

示例:
- AUTH_INVALID_CREDENTIALS: 凭证无效
- AUTH_TOKEN_EXPIRED: Token 过期
- DOC_NOT_FOUND: 文档不存在
- DOC_PERMISSION_DENIED: 无权访问
- SHARE_EXPIRED: 分享已过期
- VALIDATION_INVALID_EMAIL: 邮箱格式无效
```

### 6.3 请求验证

```rust
#[derive(Deserialize, Validate)]
struct RegisterRequest {
    #[validate(email)]
    email: String,

    #[validate(length(min = 8))]
    password: String,

    #[validate(length(min = 1))]
    public_key: String,
}

// 在处理器中验证
async fn register(Json(req): Json<RegisterRequest>) -> Result<...> {
    req.validate()?;
    // ...
}
```

### 6.4 文件上传处理

```
大文件上传策略:
1. 使用 multipart/form-data
2. 流式处理，不全量加载到内存
3. 限制最大文件大小 (100MB)
4. 同时验证 Content-Length 头

下载策略:
1. 返回 StreamBody
2. 设置正确的 Content-Type 和 Content-Disposition
3. 支持 Range 请求 (断点续传)
```

## 七、中间件配置

### 7.1 CORS

```
CorsLayer::new()
    .allow_origin(Any)  // 开发环境
    // .allow_origin(["https://app.example.com"])  // 生产环境
    .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
    .allow_headers([AUTHORIZATION, CONTENT_TYPE])
    .max_age(Duration::from_secs(3600))
```

### 7.2 限流配置

```
限流规则:
- 注册: 5 次/分钟/IP
- 登录: 10 次/分钟/IP
- 文件上传: 100 次/小时/用户
- API 总体: 1000 次/分钟/用户

超限响应:
HTTP 429 Too Many Requests
{
    "success": false,
    "error": {
        "code": "RATE_LIMITED",
        "message": "请求过于频繁，请稍后再试",
        "details": { "retry_after": 60 }
    }
}
```

### 7.3 响应压缩

```
CompressionLayer::new()
    .compress_when(SizeAbove::new(1024))  // 大于 1KB 才压缩
    .quality(CompressionLevel::Default)
```

## 八、实现注意事项

### 8.1 敏感信息处理

```
1. 密码不在响应中返回
2. 私钥只在登录时返回
3. 错误信息不泄露系统细节
4. 日志中脱敏敏感字段
```

### 8.2 幂等性

```
幂等操作:
- GET: 天然幂等
- DELETE: 删除不存在的资源返回 204
- PUT: 使用完整替换语义

非幂等操作:
- POST /upload: 每次创建新文档
- POST /shares: 每次创建新链接
```

### 8.3 版本控制

```
URL 版本: /api/v1/...
- 主版本变更使用新前缀 /api/v2/...
- 向后兼容的变更不需要新版本
```

## 九、安全考虑

1. **输入验证**: 所有输入都需验证
2. **HTTPS**: 生产环境强制 HTTPS
3. **安全头**: X-Content-Type-Options, X-Frame-Options 等
4. **CSRF**: 使用 SameSite Cookie 或 CSRF Token
5. **XSS**: Content-Type 正确设置

## 十、测试要点

1. 端点响应测试
2. 认证流程测试
3. 权限控制测试
4. 文件上传/下载测试
5. 限流测试
6. 错误处理测试
