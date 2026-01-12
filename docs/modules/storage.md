# rustcloud-storage 模块设计

## 一、模块职责

rustcloud-storage 提供统一的文件存储抽象层：

- **存储抽象**: 定义通用存储接口
- **本地存储**: 文件系统存储实现
- **对象存储**: MinIO/S3 存储实现
- **加密包装**: 透明加密层（装饰器模式）

## 二、核心数据结构

### 2.1 存储元数据

```
StorageMetadata
├── path: String                # 存储路径/键名
├── size: u64                   # 文件大小（字节）
├── content_type: String        # MIME 类型
├── hash: String                # SHA-256 哈希
├── created_at: DateTime        # 创建时间
└── modified_at: DateTime       # 修改时间

StorageObject
├── metadata: StorageMetadata   # 元数据
└── content: Vec<u8>            # 文件内容（或流）
```

### 2.2 存储配置

```
LocalStorageConfig
├── base_path: PathBuf          # 存储根目录
├── max_file_size: u64          # 最大文件大小
└── directory_depth: u32        # 目录分级深度

MinioStorageConfig
├── endpoint: String            # MinIO 服务端点
├── bucket: String              # 存储桶名称
├── access_key: String          # 访问密钥
├── secret_key: String          # 私密密钥
├── region: String              # 区域
└── use_ssl: bool               # 是否使用 SSL
```

## 三、主要接口

### 3.1 存储 Trait

```
trait Storage: Send + Sync {
    async fn put(&self, path: &str, content: &[u8]) -> Result<StorageMetadata>
      - 存储文件
      - 返回存储元数据

    async fn get(&self, path: &str) -> Result<StorageObject>
      - 获取文件
      - 返回完整对象（元数据 + 内容）

    async fn delete(&self, path: &str) -> Result<()>
      - 删除文件

    async fn exists(&self, path: &str) -> Result<bool>
      - 检查文件是否存在

    async fn list(&self, prefix: &str) -> Result<Vec<StorageMetadata>>
      - 列出指定前缀的文件

    async fn get_metadata(&self, path: &str) -> Result<StorageMetadata>
      - 仅获取元数据（不下载内容）
}
```

### 3.2 本地文件存储

```
struct LocalStorage {
    config: LocalStorageConfig,
}

impl LocalStorage {
    fn new(config: LocalStorageConfig) -> Result<Self>
      - 创建实例
      - 确保基础目录存在

    fn generate_path(&self, key: &str) -> PathBuf
      - 生成分级存储路径
      - 例: abc123 -> /base/ab/c1/abc123
}

impl Storage for LocalStorage { ... }
```

### 3.3 MinIO 存储

```
struct MinioStorage {
    client: minio::Client,
    config: MinioStorageConfig,
}

impl MinioStorage {
    async fn new(config: MinioStorageConfig) -> Result<Self>
      - 创建客户端连接
      - 验证凭证
      - 确保存储桶存在

    async fn ensure_bucket(&self) -> Result<()>
      - 检查并创建存储桶
}

impl Storage for MinioStorage { ... }
```

### 3.4 加密存储包装器

```
struct EncryptedStorage<S: Storage> {
    inner: S,
    key_provider: Arc<dyn KeyProvider>,
}

impl<S: Storage> EncryptedStorage<S> {
    fn new(storage: S, key_provider: Arc<dyn KeyProvider>) -> Self
      - 包装原始存储
      - 提供密钥获取器
}

impl<S: Storage> Storage for EncryptedStorage<S> {
    async fn put(&self, path: &str, content: &[u8]) -> Result<StorageMetadata>
      - 获取加密密钥
      - 加密内容
      - 调用内部存储的 put
      - 返回元数据（大小为加密后大小）

    async fn get(&self, path: &str) -> Result<StorageObject>
      - 调用内部存储的 get
      - 获取解密密钥
      - 解密内容
      - 返回明文对象
}
```

## 四、依赖关系

```
rustcloud-storage
├── 依赖
│   ├── rustcloud-core        # 错误类型、配置
│   └── rustcloud-crypto      # 加密操作
├── 外部依赖
│   ├── tokio                 # 异步运行时
│   ├── tokio::fs             # 异步文件操作
│   └── minio-rs / aws-sdk-s3 # 对象存储客户端
└── 被依赖
    └── rustcloud-api         # 文档上传/下载
```

## 五、设计要点

### 5.1 目录分级策略

```
目的: 避免单目录文件过多导致性能下降

策略: 使用文件名的前几个字符作为子目录
深度: 2 级，每级 2 字符

示例:
  文件名: a1b2c3d4e5f6.enc
  路径: /storage/a1/b2/a1b2c3d4e5f6.enc

配置:
  directory_depth: 2
  chars_per_level: 2
```

### 5.2 文件命名

```
存储时使用 UUID 或哈希值命名:
- 避免文件名冲突
- 隐藏原始文件名（已加密存储在数据库）

格式: {uuid}.enc
示例: 550e8400-e29b-41d4-a716-446655440000.enc
```

### 5.3 大文件处理

```
分块策略:
- 分块大小: 4MB
- 并行上传: 最多 4 个块并行
- 断点续传: 记录已上传块

流式处理:
- 使用 AsyncRead/AsyncWrite trait
- 避免将整个文件加载到内存
```

### 5.4 装饰器模式应用

```
Storage (trait)
    │
    ├── LocalStorage
    │       │
    │       └── EncryptedStorage<LocalStorage>
    │
    └── MinioStorage
            │
            └── EncryptedStorage<MinioStorage>

优势:
- 加密逻辑与存储逻辑分离
- 可以灵活组合
- 便于测试（可以单独测试存储或加密）
```

## 六、实现注意事项

### 6.1 错误处理

```
存储错误类型:
- FileNotFound: 文件不存在
- PermissionDenied: 权限不足
- StorageFull: 存储空间不足
- NetworkError: 网络错误（MinIO）
- CorruptedData: 数据损坏

重试策略:
- 网络错误: 最多重试 3 次，指数退避
- 其他错误: 不重试，直接返回
```

### 6.2 并发安全

```
1. 文件锁
   - 写入时获取独占锁
   - 读取时获取共享锁
   - 使用 tokio::sync::RwLock

2. 原子写入
   - 先写入临时文件
   - 成功后原子重命名
   - 避免部分写入
```

### 6.3 清理策略

```
孤立文件清理:
- 定期扫描存储目录
- 比对数据库记录
- 删除无引用的文件

临时文件清理:
- 上传失败的临时文件
- 超过 24 小时自动清理
```

## 七、安全考虑

1. **路径遍历防护**: 验证路径不包含 `..` 或绝对路径
2. **文件大小限制**: 限制单文件最大大小（默认 100MB）
3. **MIME 类型验证**: 可选的文件类型白名单
4. **存储隔离**: 不同用户的文件存储在不同目录/前缀
5. **访问日志**: 记录所有存储操作

## 八、测试要点

1. 存储和检索往返测试
2. 大文件分块上传测试
3. 并发读写测试
4. 存储空间不足处理测试
5. 网络中断重试测试（MinIO）
6. 加密存储包装器测试
