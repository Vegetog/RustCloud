# rustcloud-auth 模块设计

## 一、模块职责

rustcloud-auth 负责系统的身份认证和授权：

- **JWT 管理**: Token 生成、验证、刷新
- **密码管理**: 哈希、验证、强度检查
- **会话管理**: 创建、维护、销毁
- **认证中间件**: 请求拦截、Token 提取、用户注入

## 二、核心数据结构

### 2.1 Token 相关

```
TokenPair
├── access_token: String        # 访问令牌
├── refresh_token: String       # 刷新令牌
├── access_expires_at: DateTime # 访问令牌过期时间
└── refresh_expires_at: DateTime # 刷新令牌过期时间

AccessTokenClaims
├── sub: String                 # 用户 ID (subject)
├── email: String               # 用户邮箱
├── exp: i64                    # 过期时间戳
├── iat: i64                    # 签发时间戳
└── jti: String                 # 令牌 ID (防重放)

RefreshTokenClaims
├── sub: String                 # 用户 ID
├── exp: i64                    # 过期时间戳
├── iat: i64                    # 签发时间戳
├── jti: String                 # 令牌 ID
└── family: String              # 令牌族 (检测重放)
```

### 2.2 会话相关

```
Session
├── id: String                  # 会话 ID
├── user_id: UUID               # 用户 ID
├── refresh_token_id: String    # 当前刷新令牌 ID
├── token_family: String        # 令牌族
├── ip_address: String          # 客户端 IP
├── user_agent: String          # 客户端 UA
├── created_at: DateTime        # 创建时间
└── last_active_at: DateTime    # 最后活跃时间

AuthenticatedUser
├── id: UUID                    # 用户 ID
├── email: String               # 邮箱
└── session_id: String          # 当前会话 ID
```

### 2.3 认证配置

```
AuthConfig
├── jwt_secret: String          # JWT 签名密钥 (至少 256 bit)
├── access_token_ttl: Duration  # Access Token 有效期 (默认 1 小时)
├── refresh_token_ttl: Duration # Refresh Token 有效期 (默认 7 天)
├── max_sessions_per_user: u32  # 每用户最大会话数 (默认 5)
└── password_min_length: usize  # 密码最小长度 (默认 8)
```

## 三、主要接口

### 3.1 Token 管理

```
struct JwtManager {
    config: AuthConfig,
}

impl JwtManager {
    fn new(config: AuthConfig) -> Self

    fn generate_token_pair(&self, user: &User) -> Result<TokenPair>
      - 生成 Access Token + Refresh Token
      - 设置过期时间
      - 返回令牌对

    fn verify_access_token(&self, token: &str) -> Result<AccessTokenClaims>
      - 验证签名
      - 检查过期时间
      - 返回解析的 Claims

    fn verify_refresh_token(&self, token: &str) -> Result<RefreshTokenClaims>
      - 验证签名
      - 检查过期时间
      - 返回解析的 Claims

    fn refresh_tokens(&self, refresh_token: &str) -> Result<TokenPair>
      - 验证 Refresh Token
      - 生成新的令牌对
      - 作废旧 Refresh Token
}
```

### 3.2 密码管理

```
struct PasswordManager;

impl PasswordManager {
    fn hash_password(password: &str) -> Result<String>
      - 使用 Argon2id 哈希
      - 自动生成 salt
      - 返回 PHC 格式字符串

    fn verify_password(password: &str, hash: &str) -> Result<bool>
      - 常量时间比较
      - 防止时序攻击

    fn validate_strength(password: &str) -> Result<(), Vec<String>>
      - 检查长度 >= 8
      - 检查包含大写字母
      - 检查包含小写字母
      - 检查包含数字
      - 返回不满足的规则列表
}
```

### 3.3 会话管理

```
struct SessionManager {
    redis: RedisPool,
    config: AuthConfig,
}

impl SessionManager {
    async fn create_session(&self, user_id: UUID, ip: &str, ua: &str) -> Result<Session>
      - 创建新会话
      - 存储到 Redis
      - 检查并清理超额会话

    async fn get_session(&self, session_id: &str) -> Result<Option<Session>>
      - 获取会话信息
      - 更新最后活跃时间

    async fn destroy_session(&self, session_id: &str) -> Result<()>
      - 删除会话
      - 作废相关令牌

    async fn destroy_all_sessions(&self, user_id: UUID) -> Result<()>
      - 删除用户所有会话
      - 用于密码修改、安全退出

    async fn validate_token_family(&self, token_family: &str, token_id: &str) -> Result<bool>
      - 检查令牌是否属于有效族
      - 检测令牌重放攻击
}
```

### 3.4 认证中间件

```
struct AuthMiddleware {
    jwt_manager: Arc<JwtManager>,
    session_manager: Arc<SessionManager>,
}

impl AuthMiddleware {
    fn new(jwt: Arc<JwtManager>, session: Arc<SessionManager>) -> Self

    async fn authenticate(&self, request: &Request) -> Result<AuthenticatedUser>
      - 从 Authorization 头提取 Bearer Token
      - 验证 Token
      - 查询会话
      - 返回认证用户

    fn require_auth() -> impl Layer
      - 返回 Axum Layer
      - 注入认证用户到 Extension
}
```

## 四、依赖关系

```
rustcloud-auth
├── 依赖
│   ├── rustcloud-core        # 错误类型、配置
│   └── rustcloud-crypto      # 密码哈希
├── 外部依赖
│   ├── jsonwebtoken          # JWT 编解码
│   ├── argon2                # 密码哈希
│   └── redis                 # 会话存储
└── 被依赖
    └── rustcloud-api         # 认证中间件
```

## 五、设计要点

### 5.1 JWT 结构

```
Header:
{
  "alg": "HS256",
  "typ": "JWT"
}

Access Token Payload:
{
  "sub": "用户ID",
  "email": "user@example.com",
  "exp": 1234567890,
  "iat": 1234567890,
  "jti": "唯一令牌ID"
}

Refresh Token Payload:
{
  "sub": "用户ID",
  "exp": 1234567890,
  "iat": 1234567890,
  "jti": "唯一令牌ID",
  "family": "令牌族ID"
}
```

### 5.2 令牌刷新策略

```
Refresh Token Rotation:
1. 每次刷新都生成新的 Refresh Token
2. 旧 Refresh Token 立即失效
3. 使用 token_family 追踪令牌链

重放检测:
1. 记录每个 family 当前有效的 token_id
2. 如果收到旧的 token_id，说明令牌被盗用
3. 立即作废整个 family 的所有令牌
```

### 5.3 会话存储结构 (Redis)

```
Key 结构:
- session:{session_id}           -> Session JSON
- user_sessions:{user_id}        -> Set of session_ids
- token_family:{family_id}       -> 当前有效 token_id
- blacklist:{token_id}           -> 1 (已作废令牌)

TTL:
- session: 7 天 (与 Refresh Token 同步)
- token_family: 7 天
- blacklist: 1 小时 (Access Token 过期后可删除)
```

### 5.4 密码强度规则

```
必须满足:
1. 长度 >= 8 字符
2. 至少 1 个大写字母 [A-Z]
3. 至少 1 个小写字母 [a-z]
4. 至少 1 个数字 [0-9]

可选建议:
- 至少 1 个特殊字符
- 不包含常见弱密码
- 不包含用户邮箱
```

## 六、实现注意事项

### 6.1 安全措施

```
1. JWT 密钥
   - 至少 256 bit 随机值
   - 从环境变量加载
   - 不硬编码

2. 常量时间比较
   - 密码验证使用 subtle crate
   - 防止时序攻击

3. 令牌传输
   - 仅通过 HTTPS
   - 不存储在 localStorage (XSS 风险)
   - 推荐 HttpOnly Cookie + CSRF Token
```

### 6.2 错误处理

```
认证错误不应泄露信息:
- "用户不存在" ✗
- "密码错误" ✗
- "邮箱或密码错误" ✓

令牌错误:
- 过期: 返回 401，提示使用刷新令牌
- 无效: 返回 401，提示重新登录
- 被盗用: 返回 401，作废所有会话
```

### 6.3 并发控制

```
1. 会话数量限制
   - 默认每用户最多 5 个会话
   - 超过时踢出最旧的会话

2. 令牌刷新竞争
   - 使用 Redis 事务或 Lua 脚本
   - 确保同一时刻只有一个刷新成功
```

## 七、安全考虑

1. **暴力破解防护**: 登录失败次数限制，账户锁定
2. **令牌泄露**: Refresh Token Rotation，重放检测
3. **跨站攻击**: CSRF 保护，SameSite Cookie
4. **会话固定**: 登录后重新生成会话 ID
5. **密码存储**: Argon2id，不可逆

## 八、测试要点

1. Token 生成和验证测试
2. Token 过期处理测试
3. Refresh Token Rotation 测试
4. 重放攻击检测测试
5. 密码强度验证测试
6. 并发会话限制测试
