# rustcloud-database 模块设计

## 一、模块职责

rustcloud-database 负责数据持久化和访问：

- **ORM 模型**: SeaORM 实体定义
- **数据仓库**: Repository 模式封装
- **数据库迁移**: 版本化的 Schema 管理
- **事务处理**: 复杂操作的原子性保证

## 二、核心数据结构

### 2.1 实体模型

```
UserEntity
├── id: Uuid                    # 主键
├── email: String               # 邮箱 (唯一索引)
├── password_hash: String       # 密码哈希
├── salt: Vec<u8>               # 密钥派生盐
├── public_key: Vec<u8>         # RSA 公钥
├── encrypted_private_key: Vec<u8>  # 加密的私钥
├── private_key_nonce: Vec<u8>  # 私钥加密 Nonce
├── created_at: DateTimeUtc     # 创建时间
└── updated_at: DateTimeUtc     # 更新时间

DocumentEntity
├── id: Uuid                    # 主键
├── owner_id: Uuid              # 所有者 (外键 -> users)
├── encrypted_name: Vec<u8>     # 加密的文件名
├── name_nonce: Vec<u8>         # 文件名加密 Nonce
├── content_hash: String        # SHA-256 哈希
├── storage_path: String        # 存储路径
├── size: i64                   # 文件大小
├── mime_type: String           # MIME 类型
├── created_at: DateTimeUtc     # 创建时间
└── updated_at: DateTimeUtc     # 更新时间

DocumentKeyEntity
├── id: Uuid                    # 主键
├── document_id: Uuid           # 文档 (外键 -> documents)
├── user_id: Uuid               # 用户 (外键 -> users)
├── encrypted_key: Vec<u8>      # 加密的文档密钥
├── permission_level: i16       # 权限级别
└── created_at: DateTimeUtc     # 创建时间

ShareLinkEntity
├── id: Uuid                    # 主键
├── document_id: Uuid           # 文档 (外键 -> documents)
├── creator_id: Uuid            # 创建者 (外键 -> users)
├── access_token: String        # 访问令牌 (唯一索引)
├── encrypted_key: Vec<u8>      # 加密的文档密钥
├── password_hash: Option<String>   # 可选密码
├── expires_at: Option<DateTimeUtc> # 过期时间
├── max_access_count: Option<i32>   # 最大访问次数
├── access_count: i32           # 当前访问次数
└── created_at: DateTimeUtc     # 创建时间
```

### 2.2 查询参数

```
DocumentListParams
├── owner_id: Option<Uuid>      # 按所有者筛选
├── shared_with_me: bool        # 共享给我的文档
├── search: Option<String>      # 搜索 (元数据)
├── sort_by: SortField          # 排序字段
├── sort_order: SortOrder       # 排序方向
├── page: u32                   # 页码
└── page_size: u32              # 每页数量

SortField (枚举)
├── CreatedAt
├── UpdatedAt
├── Size
└── Name (加密名称的哈希)

SortOrder (枚举)
├── Asc
└── Desc
```

## 三、主要接口

### 3.1 用户仓库

```
struct UserRepository {
    db: DatabaseConnection,
}

impl UserRepository {
    async fn create(&self, user: CreateUser) -> Result<UserEntity>
      - 插入新用户
      - 返回创建的实体

    async fn find_by_id(&self, id: Uuid) -> Result<Option<UserEntity>>
      - 按 ID 查询

    async fn find_by_email(&self, email: &str) -> Result<Option<UserEntity>>
      - 按邮箱查询 (登录用)

    async fn update(&self, id: Uuid, update: UpdateUser) -> Result<UserEntity>
      - 更新用户信息

    async fn delete(&self, id: Uuid) -> Result<()>
      - 删除用户 (级联删除相关数据)

    async fn update_keys(&self, id: Uuid, keys: UserKeys) -> Result<()>
      - 更新密钥信息 (密码修改时)
}

CreateUser
├── email: String
├── password_hash: String
├── salt: Vec<u8>
├── public_key: Vec<u8>
├── encrypted_private_key: Vec<u8>
└── private_key_nonce: Vec<u8>
```

### 3.2 文档仓库

```
struct DocumentRepository {
    db: DatabaseConnection,
}

impl DocumentRepository {
    async fn create(&self, doc: CreateDocument) -> Result<DocumentEntity>
      - 创建文档记录
      - 同时创建所有者的密钥记录

    async fn find_by_id(&self, id: Uuid) -> Result<Option<DocumentEntity>>
      - 按 ID 查询

    async fn find_by_owner(&self, owner_id: Uuid, params: DocumentListParams) -> Result<Page<DocumentEntity>>
      - 查询用户拥有的文档
      - 支持分页

    async fn find_accessible(&self, user_id: Uuid, params: DocumentListParams) -> Result<Page<DocumentEntity>>
      - 查询用户可访问的文档 (拥有 + 共享)
      - 联表查询 document_keys

    async fn update(&self, id: Uuid, update: UpdateDocument) -> Result<DocumentEntity>
      - 更新文档元数据

    async fn delete(&self, id: Uuid) -> Result<()>
      - 删除文档
      - 级联删除密钥和分享链接
}
```

### 3.3 文档密钥仓库

```
struct DocumentKeyRepository {
    db: DatabaseConnection,
}

impl DocumentKeyRepository {
    async fn create(&self, key: CreateDocumentKey) -> Result<DocumentKeyEntity>
      - 创建密钥记录 (授权)

    async fn find_by_document_and_user(&self, doc_id: Uuid, user_id: Uuid) -> Result<Option<DocumentKeyEntity>>
      - 查询用户对文档的密钥

    async fn find_by_document(&self, doc_id: Uuid) -> Result<Vec<DocumentKeyEntity>>
      - 查询文档的所有授权

    async fn update_permission(&self, id: Uuid, level: PermissionLevel) -> Result<()>
      - 更新权限级别

    async fn delete(&self, id: Uuid) -> Result<()>
      - 删除密钥记录 (撤销权限)

    async fn delete_by_document(&self, doc_id: Uuid) -> Result<()>
      - 删除文档的所有密钥 (密钥轮换)
}
```

### 3.4 分享链接仓库

```
struct ShareLinkRepository {
    db: DatabaseConnection,
}

impl ShareLinkRepository {
    async fn create(&self, link: CreateShareLink) -> Result<ShareLinkEntity>
      - 创建分享链接

    async fn find_by_token(&self, token: &str) -> Result<Option<ShareLinkEntity>>
      - 按访问令牌查询

    async fn find_by_document(&self, doc_id: Uuid) -> Result<Vec<ShareLinkEntity>>
      - 查询文档的所有分享链接

    async fn increment_access_count(&self, id: Uuid) -> Result<()>
      - 增加访问计数

    async fn delete(&self, id: Uuid) -> Result<()>
      - 删除分享链接

    async fn delete_expired(&self) -> Result<u64>
      - 清理过期的分享链接
}
```

## 四、依赖关系

```
rustcloud-database
├── 依赖
│   └── rustcloud-core        # 错误类型、数据模型
├── 外部依赖
│   ├── sea-orm               # ORM 框架
│   ├── sea-orm-migration     # 迁移工具
│   └── sqlx                  # 底层数据库驱动
└── 被依赖
    └── rustcloud-api         # 数据访问
```

## 五、数据库 Schema

### 5.1 表定义

```sql
-- 用户表
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    salt BYTEA NOT NULL,
    public_key BYTEA NOT NULL,
    encrypted_private_key BYTEA NOT NULL,
    private_key_nonce BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 文档表
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    encrypted_name BYTEA NOT NULL,
    name_nonce BYTEA NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    storage_path VARCHAR(255) NOT NULL,
    size BIGINT NOT NULL,
    mime_type VARCHAR(127) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 文档密钥表
CREATE TABLE document_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    encrypted_key BYTEA NOT NULL,
    permission_level SMALLINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(document_id, user_id)
);

-- 分享链接表
CREATE TABLE share_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    access_token VARCHAR(64) NOT NULL UNIQUE,
    encrypted_key BYTEA NOT NULL,
    password_hash VARCHAR(255),
    expires_at TIMESTAMPTZ,
    max_access_count INTEGER,
    access_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 5.2 索引

```sql
-- 用户表索引
CREATE INDEX idx_users_email ON users(email);

-- 文档表索引
CREATE INDEX idx_documents_owner_id ON documents(owner_id);
CREATE INDEX idx_documents_created_at ON documents(created_at);

-- 文档密钥表索引
CREATE INDEX idx_document_keys_document_id ON document_keys(document_id);
CREATE INDEX idx_document_keys_user_id ON document_keys(user_id);

-- 分享链接表索引
CREATE INDEX idx_share_links_access_token ON share_links(access_token);
CREATE INDEX idx_share_links_document_id ON share_links(document_id);
CREATE INDEX idx_share_links_expires_at ON share_links(expires_at);
```

## 六、设计要点

### 6.1 Repository 模式

```
优势:
1. 数据访问逻辑集中管理
2. 便于单元测试 (可以 mock)
3. 隔离 ORM 实现细节

规范:
- 每个实体一个 Repository
- 方法名遵循 find_by_xxx, create, update, delete 命名
- 返回 Result<T, DatabaseError>
```

### 6.2 事务处理

```rust
// 示例: 创建文档 (需要同时创建文档记录和密钥记录)
async fn create_document_with_key(
    &self,
    doc: CreateDocument,
    key: CreateDocumentKey,
) -> Result<DocumentEntity> {
    let txn = self.db.begin().await?;

    let doc_entity = Document::insert(doc).exec(&txn).await?;
    let key_entity = DocumentKey::insert(key).exec(&txn).await?;

    txn.commit().await?;
    Ok(doc_entity)
}
```

### 6.3 分页查询

```
使用 Cursor-based 或 Offset-based 分页:

Offset-based (简单场景):
- SELECT * FROM documents LIMIT 20 OFFSET 40
- 适合数据量小、顺序固定的场景

Cursor-based (大数据量):
- SELECT * FROM documents WHERE created_at < ? LIMIT 20
- 性能更好，但实现复杂
```

## 七、实现注意事项

### 7.1 连接池配置

```
推荐配置:
- min_connections: 5
- max_connections: 20
- connect_timeout: 10s
- idle_timeout: 300s
- max_lifetime: 1800s
```

### 7.2 查询优化

```
1. 避免 N+1 查询
   - 使用 JOIN 或批量查询
   - SeaORM 的 find_with_related

2. 只查询需要的字段
   - select_only + columns

3. 使用预编译语句
   - SeaORM 默认使用
```

### 7.3 数据迁移

```
迁移文件命名: m{timestamp}_{name}.rs
例: m20240101_000001_create_users_table.rs

规范:
- 每次变更一个迁移文件
- 迁移要可逆 (实现 up 和 down)
- 生产环境先备份再迁移
```

## 八、安全考虑

1. **SQL 注入**: 使用参数化查询 (SeaORM 默认)
2. **敏感数据**: 密码哈希、加密密钥等字段不在日志中输出
3. **级联删除**: 用户删除时清理所有相关数据
4. **访问控制**: Repository 不做权限检查，由 Service 层负责
5. **审计日志**: 可选的操作日志记录

## 九、测试要点

1. CRUD 操作测试
2. 事务回滚测试
3. 并发写入测试
4. 级联删除测试
5. 分页正确性测试
6. 迁移 up/down 测试
