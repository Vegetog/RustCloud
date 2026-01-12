# web 前端模块设计

## 一、模块职责

web 模块是系统的用户界面层：

- **用户界面**: 登录、注册、文件管理、分享
- **客户端加密**: Web Crypto API 实现
- **状态管理**: 用户会话、文件列表
- **API 交互**: 与后端 API 通信

## 二、核心数据结构

### 2.1 状态类型

```
AuthState
├── isAuthenticated: boolean    # 是否已登录
├── user: User | null           # 当前用户
├── accessToken: string | null  # Access Token
├── refreshToken: string | null # Refresh Token
└── masterKey: CryptoKey | null # Master Key (内存中)

User
├── id: string                  # 用户 ID
├── email: string               # 邮箱
└── publicKey: ArrayBuffer      # 公钥

DocumentState
├── documents: Document[]       # 文档列表
├── loading: boolean            # 加载状态
├── error: string | null        # 错误信息
└── selectedId: string | null   # 选中的文档

Document
├── id: string                  # 文档 ID
├── name: string                # 解密后的文件名
├── size: number                # 文件大小
├── contentHash: string         # 内容哈希
├── createdAt: Date             # 创建时间
└── permissionLevel: string     # 权限级别
```

### 2.2 加密相关类型

```
EncryptionContext
├── masterKey: CryptoKey        # 主密钥 (AES)
├── privateKey: CryptoKey       # RSA 私钥
└── publicKey: CryptoKey        # RSA 公钥

EncryptedDocument
├── encryptedContent: ArrayBuffer   # 加密内容
├── encryptedName: ArrayBuffer      # 加密文件名
├── nameNonce: ArrayBuffer          # 文件名 Nonce
├── contentHash: string             # 内容哈希
└── encryptedKey: ArrayBuffer       # 加密的文档密钥
```

## 三、页面结构

### 3.1 页面路由

```
/                       # 首页 (重定向到登录或文件列表)
/login                  # 登录页
/register               # 注册页
/documents              # 文件列表页 (需要认证)
/documents/:id          # 文件详情页 (需要认证)
/share/:token           # 分享访问页 (无需认证)
```

### 3.2 页面组件

```
LoginPage
├── EmailInput          # 邮箱输入
├── PasswordInput       # 密码输入
├── LoginButton         # 登录按钮
└── RegisterLink        # 注册链接

RegisterPage
├── EmailInput          # 邮箱输入
├── PasswordInput       # 密码输入 (含强度提示)
├── ConfirmPasswordInput # 确认密码
├── RegisterButton      # 注册按钮
└── ProgressIndicator   # 密钥生成进度

DocumentListPage
├── Header              # 标题栏 (用户信息、退出)
├── UploadButton        # 上传按钮
├── SearchBar           # 搜索栏 (可选)
├── DocumentTable       # 文档列表
│   ├── DocumentRow     # 文档行
│   └── Pagination      # 分页
└── UploadModal         # 上传对话框

DocumentRow
├── FileName            # 文件名
├── FileSize            # 大小
├── CreatedAt           # 创建时间
├── DownloadButton      # 下载按钮
├── ShareButton         # 分享按钮
└── DeleteButton        # 删除按钮

SharePage
├── PasswordInput       # 密码输入 (如需要)
├── DownloadButton      # 下载按钮
└── FileInfo            # 文件信息
```

## 四、主要接口

### 4.1 加密服务

```
CryptoService

// 密钥派生
deriveMasterKey(password: string, salt: Uint8Array): Promise<CryptoKey>
  - 使用 PBKDF2 派生主密钥 (浏览器不支持 Argon2)
  - 参数: 100,000 次迭代, SHA-256
  - 返回: AES-GCM CryptoKey

// RSA 密钥生成
generateKeyPair(): Promise<CryptoKeyPair>
  - 生成 RSA-OAEP 2048 位密钥对
  - 返回: { publicKey, privateKey }

// 私钥加密
encryptPrivateKey(privateKey: CryptoKey, masterKey: CryptoKey): Promise<EncryptedData>
  - 导出私钥为 PKCS8
  - 使用 AES-GCM 加密
  - 返回: { ciphertext, nonce }

// 私钥解密
decryptPrivateKey(encrypted: EncryptedData, masterKey: CryptoKey): Promise<CryptoKey>
  - 解密私钥
  - 导入为 CryptoKey
  - 返回: RSA 私钥

// 文档加密
encryptDocument(file: File, publicKey: CryptoKey): Promise<EncryptedDocument>
  - 生成随机文档密钥
  - 加密文件内容
  - 加密文件名
  - 用公钥加密文档密钥
  - 计算内容哈希

// 文档解密
decryptDocument(encrypted: EncryptedDocument, privateKey: CryptoKey): Promise<DecryptedDocument>
  - 用私钥解密文档密钥
  - 解密文件内容
  - 解密文件名
  - 验证内容哈希
```

### 4.2 API 服务

```
ApiService

// 认证
register(email: string, password: string, keys: UserKeys): Promise<void>
login(email: string, password: string): Promise<LoginResponse>
logout(): Promise<void>
refreshToken(): Promise<TokenPair>

// 文档
getDocuments(params: ListParams): Promise<DocumentList>
uploadDocument(encrypted: EncryptedDocument): Promise<Document>
downloadDocument(id: string): Promise<EncryptedBlob>
deleteDocument(id: string): Promise<void>

// 分享
createShare(docId: string, options: ShareOptions): Promise<ShareLink>
getMyShares(): Promise<ShareLink[]>
deleteShare(id: string): Promise<void>
accessShare(token: string, password?: string): Promise<ShareAccess>
```

### 4.3 状态管理

```
AuthStore

state: AuthState
actions:
  - login(email, password): Promise<void>
  - register(email, password): Promise<void>
  - logout(): void
  - refreshAuth(): Promise<void>
  - clearAuth(): void

getters:
  - isAuthenticated: boolean
  - currentUser: User | null
  - hasValidToken: boolean

DocumentStore

state: DocumentState
actions:
  - loadDocuments(): Promise<void>
  - uploadFile(file: File): Promise<void>
  - downloadFile(id: string): Promise<void>
  - deleteFile(id: string): Promise<void>
  - shareFile(id: string, options): Promise<ShareLink>

getters:
  - documentList: Document[]
  - selectedDocument: Document | null
  - isLoading: boolean
```

## 五、依赖关系

```
web
├── 外部依赖
│   ├── React               # UI 框架
│   ├── TypeScript          # 类型系统
│   ├── React Router        # 路由
│   ├── Zustand/Redux       # 状态管理 (可选)
│   └── Axios               # HTTP 客户端
├── 浏览器 API
│   ├── Web Crypto API      # 加密操作
│   ├── File API            # 文件处理
│   └── IndexedDB           # 本地存储 (可选)
└── 与后端通信
    └── rustcloud-api       # REST API
```

## 六、设计要点

### 6.1 客户端加密流程

```
注册流程:
1. 用户输入邮箱和密码
2. 生成随机 salt (32 字节)
3. PBKDF2 派生主密钥 (显示进度)
4. 生成 RSA 密钥对 (显示进度)
5. 用主密钥加密私钥
6. 发送到服务器: { email, passwordHash, salt, publicKey, encryptedPrivateKey }
7. 清零主密钥

登录流程:
1. 用户输入邮箱和密码
2. 发送登录请求，获取 salt 和 encryptedPrivateKey
3. PBKDF2 派生主密钥
4. 尝试解密私钥
   - 成功: 密码正确，保存密钥到内存
   - 失败: 密码错误，提示用户
5. 保存 token 和主密钥到状态
```

### 6.2 文件加密流程

```
上传:
1. 用户选择文件
2. 生成随机文档密钥 (AES-256)
3. 分块读取文件并加密
4. 加密文件名
5. 用公钥加密文档密钥
6. 计算加密内容的 SHA-256
7. 上传: multipart/form-data

下载:
1. 请求文档，获取 encryptedKey 和加密内容
2. 用私钥解密文档密钥
3. 解密文件内容
4. 解密文件名
5. 验证哈希
6. 触发浏览器下载
```

### 6.3 Web Crypto API 使用

```javascript
// 密钥派生 (替代 Argon2)
const masterKey = await crypto.subtle.deriveKey(
  {
    name: "PBKDF2",
    salt: salt,
    iterations: 100000,
    hash: "SHA-256"
  },
  passwordKey,
  { name: "AES-GCM", length: 256 },
  false,  // 不可导出
  ["encrypt", "decrypt"]
);

// RSA 密钥生成
const keyPair = await crypto.subtle.generateKey(
  {
    name: "RSA-OAEP",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256"
  },
  true,  // 可导出
  ["encrypt", "decrypt"]
);

// AES-GCM 加密
const nonce = crypto.getRandomValues(new Uint8Array(12));
const ciphertext = await crypto.subtle.encrypt(
  { name: "AES-GCM", iv: nonce },
  key,
  plaintext
);
```

### 6.4 安全存储

```
Token 存储策略:
- Access Token: 内存中 (最安全)
- Refresh Token: HttpOnly Cookie (防 XSS)
- 备选: sessionStorage (标签页关闭后清除)

密钥存储:
- Master Key: 仅内存，不持久化
- 私钥: 仅内存，不持久化
- 公钥: 可存储在 localStorage

注意:
- 不使用 localStorage 存储敏感数据
- 页面关闭/刷新后需要重新登录
```

## 七、实现注意事项

### 7.1 大文件处理

```
分块策略:
- 分块大小: 1MB
- 使用 FileReader.readAsArrayBuffer
- 逐块加密，避免内存溢出
- 显示上传进度

流式处理:
const CHUNK_SIZE = 1024 * 1024; // 1MB
for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
  const chunk = file.slice(offset, offset + CHUNK_SIZE);
  const encryptedChunk = await encryptChunk(chunk, key);
  await uploadChunk(encryptedChunk);
  updateProgress(offset / file.size);
}
```

### 7.2 错误处理

```
错误类型:
- CryptoError: 加密/解密失败
- NetworkError: 网络请求失败
- AuthError: 认证失败
- ValidationError: 输入验证失败

用户提示:
- 密码错误: "邮箱或密码错误"
- Token 过期: 自动刷新或提示重新登录
- 网络错误: "网络连接失败，请重试"
- 加密失败: "文件处理失败，请重试"
```

### 7.3 性能优化

```
1. 密钥派生
   - 使用 Web Worker 避免阻塞 UI
   - 显示进度条

2. 文件加密
   - 分块处理
   - 使用 Web Worker
   - 显示进度

3. 列表渲染
   - 虚拟滚动 (大量文件时)
   - 分页加载
```

## 八、安全考虑

1. **XSS 防护**: React 默认转义，注意 dangerouslySetInnerHTML
2. **CSRF 防护**: 使用 SameSite Cookie
3. **密钥安全**: 密钥只存在内存，不持久化
4. **密码强度**: 客户端验证密码强度
5. **输入验证**: 所有用户输入都要验证

## 九、测试要点

1. 加密/解密往返测试
2. 登录/注册流程测试
3. 文件上传/下载测试
4. 分享功能测试
5. Token 刷新测试
6. 大文件处理测试
7. 错误场景测试
