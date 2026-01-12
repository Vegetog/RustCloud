# RustCloud 系统流程文档

本文档详细描述系统中各项功能的完整运行流程。

## 一、用户注册流程

### 1.1 流程概述

用户注册时需要在客户端生成密钥对，并用密码派生的主密钥加密私钥后发送到服务器。

### 1.2 详细步骤

```
┌─────────────────────────────────────────────────────────────────────┐
│                            客户端                                    │
├─────────────────────────────────────────────────────────────────────┤
│  1. 用户输入邮箱和密码                                               │
│                                                                      │
│  2. 客户端验证                                                       │
│     ├── 验证邮箱格式                                                 │
│     └── 验证密码强度 (≥8位, 大小写, 数字)                            │
│                                                                      │
│  3. 生成随机 salt (32 字节)                                          │
│     └── crypto.getRandomValues(new Uint8Array(32))                  │
│                                                                      │
│  4. 派生主密钥 (Master Key)                                          │
│     ├── 算法: PBKDF2 (浏览器) 或 Argon2id (后端验证)                 │
│     ├── 输入: 密码 + salt                                            │
│     ├── 输出: 256-bit AES 密钥                                       │
│     └── 显示进度条 (耗时约 300-500ms)                                │
│                                                                      │
│  5. 生成 RSA 密钥对                                                  │
│     ├── 算法: RSA-OAEP, 2048 位                                      │
│     ├── 输出: publicKey, privateKey                                  │
│     └── 显示进度条                                                   │
│                                                                      │
│  6. 加密私钥                                                         │
│     ├── 导出私钥为 PKCS8 格式                                        │
│     ├── 生成随机 nonce (12 字节)                                     │
│     ├── 使用 AES-256-GCM 加密                                        │
│     └── 输出: encryptedPrivateKey, nonce                            │
│                                                                      │
│  7. 计算密码哈希 (用于服务器验证)                                    │
│     └── Argon2id(password + 固定salt)                               │
│                                                                      │
│  8. 发送注册请求                                                     │
│     POST /api/v1/auth/register                                      │
│     {                                                                │
│       email,                                                         │
│       passwordHash,                                                  │
│       salt (base64),                                                 │
│       publicKey (base64),                                            │
│       encryptedPrivateKey (base64),                                  │
│       privateKeyNonce (base64)                                       │
│     }                                                                │
│                                                                      │
│  9. 清零内存中的主密钥和私钥                                         │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                            服务器                                    │
├─────────────────────────────────────────────────────────────────────┤
│  1. 验证请求参数                                                     │
│     ├── 邮箱格式                                                     │
│     ├── 邮箱是否已注册                                               │
│     └── 密钥格式正确性                                               │
│                                                                      │
│  2. 存储用户数据                                                     │
│     INSERT INTO users (                                             │
│       email, password_hash, salt,                                   │
│       public_key, encrypted_private_key, private_key_nonce          │
│     )                                                                │
│                                                                      │
│  3. 返回成功响应                                                     │
│     { success: true, user: { id, email } }                          │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.3 关键安全点

- 主密钥 **永远不会** 发送到服务器
- 私钥以加密形式存储，服务器无法解密
- 密码通过 Argon2id 哈希后传输，服务器存储哈希值

---

## 二、用户登录流程

### 2.1 流程概述

登录时客户端需要重新派生主密钥，解密私钥，验证密码正确性。

### 2.2 详细步骤

```
┌─────────────────────────────────────────────────────────────────────┐
│                            客户端                                    │
├─────────────────────────────────────────────────────────────────────┤
│  1. 用户输入邮箱和密码                                               │
│                                                                      │
│  2. 发送登录请求                                                     │
│     POST /api/v1/auth/login                                         │
│     { email, password }                                             │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                            服务器                                    │
├─────────────────────────────────────────────────────────────────────┤
│  1. 查询用户                                                         │
│     SELECT * FROM users WHERE email = ?                             │
│                                                                      │
│  2. 验证密码哈希                                                     │
│     verify_password(password, user.password_hash)                   │
│     └── 失败: 返回 401 "邮箱或密码错误"                              │
│                                                                      │
│  3. 生成 JWT Token                                                   │
│     ├── Access Token (1小时)                                         │
│     └── Refresh Token (7天)                                          │
│                                                                      │
│  4. 创建会话记录                                                     │
│     Redis: session:{id} -> { userId, tokenFamily, ... }             │
│                                                                      │
│  5. 返回登录响应                                                     │
│     {                                                                │
│       accessToken,                                                   │
│       refreshToken,                                                  │
│       expiresIn: 3600,                                               │
│       user: { id, email },                                           │
│       salt (base64),                                                 │
│       encryptedPrivateKey (base64),                                  │
│       privateKeyNonce (base64)                                       │
│     }                                                                │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                            客户端                                    │
├─────────────────────────────────────────────────────────────────────┤
│  6. 派生主密钥                                                       │
│     masterKey = PBKDF2(password, salt)                              │
│                                                                      │
│  7. 解密私钥                                                         │
│     privateKey = AES-GCM.decrypt(                                   │
│       encryptedPrivateKey,                                          │
│       masterKey,                                                     │
│       privateKeyNonce                                                │
│     )                                                                │
│     └── 解密失败: 说明密码错误 (理论上不会发生,服务器已验证)         │
│                                                                      │
│  8. 导入私钥为 CryptoKey                                             │
│     crypto.subtle.importKey('pkcs8', privateKey, ...)               │
│                                                                      │
│  9. 保存到内存状态                                                   │
│     ├── accessToken                                                  │
│     ├── refreshToken                                                 │
│     ├── masterKey                                                    │
│     └── privateKey                                                   │
│                                                                      │
│  10. 跳转到文件列表页                                                │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.3 关键安全点

- 服务器先验证密码，再返回加密私钥
- 密钥仅在客户端内存中，页面刷新后丢失
- Token 使用 Refresh Token Rotation 机制

---

## 三、文件上传流程

### 3.1 流程概述

文件在客户端加密后上传，服务器只存储密文。

### 3.2 详细步骤

```
┌─────────────────────────────────────────────────────────────────────┐
│                            客户端                                    │
├─────────────────────────────────────────────────────────────────────┤
│  1. 用户选择文件                                                     │
│     file = document.getElementById('fileInput').files[0]            │
│                                                                      │
│  2. 生成文档密钥 (DEK)                                               │
│     documentKey = crypto.getRandomValues(new Uint8Array(32))        │
│     └── 256-bit 随机密钥                                             │
│                                                                      │
│  3. 加密文件内容                                                     │
│     ├── 读取文件: fileContent = await file.arrayBuffer()            │
│     ├── 生成 nonce: contentNonce = randomBytes(12)                  │
│     ├── 加密: encryptedContent = AES-GCM.encrypt(                   │
│     │     fileContent, documentKey, contentNonce                    │
│     │   )                                                            │
│     └── 显示进度 (大文件分块处理)                                    │
│                                                                      │
│  4. 加密文件名                                                       │
│     ├── fileName = file.name (UTF-8 编码)                           │
│     ├── nameNonce = randomBytes(12)                                 │
│     └── encryptedName = AES-GCM.encrypt(fileName, documentKey)      │
│                                                                      │
│  5. 计算内容哈希                                                     │
│     contentHash = SHA-256(encryptedContent)                         │
│                                                                      │
│  6. 加密文档密钥                                                     │
│     encryptedKey = RSA-OAEP.encrypt(documentKey, publicKey)         │
│                                                                      │
│  7. 组装上传数据                                                     │
│     FormData:                                                        │
│     ├── file: encryptedContent (Blob)                               │
│     ├── encryptedName (base64)                                      │
│     ├── nameNonce (base64)                                          │
│     ├── contentNonce (base64)                                       │
│     ├── contentHash (hex)                                           │
│     └── encryptedKey (base64)                                       │
│                                                                      │
│  8. 发送上传请求                                                     │
│     POST /api/v1/documents                                          │
│     Content-Type: multipart/form-data                               │
│     Authorization: Bearer {accessToken}                             │
│                                                                      │
│  9. 清零文档密钥                                                     │
│     documentKey.fill(0)                                             │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                            服务器                                    │
├─────────────────────────────────────────────────────────────────────┤
│  1. 验证认证                                                         │
│     ├── 提取 Bearer Token                                            │
│     └── 验证 JWT 签名和过期时间                                      │
│                                                                      │
│  2. 解析上传数据                                                     │
│     ├── 提取文件内容                                                 │
│     └── 提取元数据                                                   │
│                                                                      │
│  3. 存储加密文件                                                     │
│     ├── 生成存储路径: /storage/{hash[0:2]}/{hash[2:4]}/{uuid}.enc   │
│     └── 调用 Storage.put(path, encryptedContent)                    │
│                                                                      │
│  4. 创建数据库记录                                                   │
│     BEGIN TRANSACTION;                                               │
│     INSERT INTO documents (...);                                    │
│     INSERT INTO document_keys (                                     │
│       document_id, user_id, encrypted_key, permission_level='owner' │
│     );                                                               │
│     COMMIT;                                                          │
│                                                                      │
│  5. 返回响应                                                         │
│     {                                                                │
│       id: "uuid",                                                    │
│       encryptedName,                                                 │
│       size,                                                          │
│       contentHash,                                                   │
│       createdAt                                                      │
│     }                                                                │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.3 关键安全点

- 文档密钥随机生成，每个文档独立
- 服务器只存储密文，无法解密
- 文件名也被加密，保护隐私

---

## 四、文件下载流程

### 4.1 流程概述

客户端请求文件，获取加密密钥和密文后在本地解密。

### 4.2 详细步骤

```
┌─────────────────────────────────────────────────────────────────────┐
│                            客户端                                    │
├─────────────────────────────────────────────────────────────────────┤
│  1. 用户点击下载                                                     │
│                                                                      │
│  2. 发送下载请求                                                     │
│     GET /api/v1/documents/{id}/download                             │
│     Authorization: Bearer {accessToken}                             │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                            服务器                                    │
├─────────────────────────────────────────────────────────────────────┤
│  1. 验证认证                                                         │
│                                                                      │
│  2. 查询文档和密钥                                                   │
│     SELECT d.*, dk.encrypted_key                                    │
│     FROM documents d                                                │
│     JOIN document_keys dk ON d.id = dk.document_id                  │
│     WHERE d.id = ? AND dk.user_id = ?                               │
│     └── 无记录: 返回 403 "无权访问"                                  │
│                                                                      │
│  3. 读取存储文件                                                     │
│     encryptedContent = Storage.get(document.storage_path)           │
│                                                                      │
│  4. 返回响应                                                         │
│     Headers:                                                         │
│     ├── X-Encrypted-Key: {encryptedKey}                             │
│     ├── X-Encrypted-Name: {encryptedName}                           │
│     ├── X-Name-Nonce: {nameNonce}                                   │
│     ├── X-Content-Nonce: {contentNonce}                             │
│     └── X-Content-Hash: {contentHash}                               │
│     Body: encryptedContent (stream)                                 │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                            客户端                                    │
├─────────────────────────────────────────────────────────────────────┤
│  5. 接收响应并提取元数据                                             │
│                                                                      │
│  6. 解密文档密钥                                                     │
│     documentKey = RSA-OAEP.decrypt(encryptedKey, privateKey)        │
│                                                                      │
│  7. 解密文件内容                                                     │
│     fileContent = AES-GCM.decrypt(                                  │
│       encryptedContent, documentKey, contentNonce                   │
│     )                                                                │
│     └── 显示进度 (大文件分块处理)                                    │
│                                                                      │
│  8. 验证内容哈希                                                     │
│     calculatedHash = SHA-256(encryptedContent)                      │
│     if (calculatedHash !== contentHash) {                           │
│       throw "文件完整性验证失败"                                     │
│     }                                                                │
│                                                                      │
│  9. 解密文件名                                                       │
│     fileName = AES-GCM.decrypt(encryptedName, documentKey, nameNonce)│
│                                                                      │
│  10. 触发浏览器下载                                                  │
│      const blob = new Blob([fileContent]);                          │
│      const url = URL.createObjectURL(blob);                         │
│      const a = document.createElement('a');                         │
│      a.href = url;                                                   │
│      a.download = fileName;                                         │
│      a.click();                                                      │
│                                                                      │
│  11. 清零文档密钥                                                    │
│      documentKey.fill(0)                                            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 五、文件分享流程

### 5.1 分享给注册用户

```
┌─────────────────────────────────────────────────────────────────────┐
│                            分享者客户端                              │
├─────────────────────────────────────────────────────────────────────┤
│  1. 选择要分享的文件                                                 │
│                                                                      │
│  2. 输入接收者邮箱                                                   │
│                                                                      │
│  3. 获取接收者公钥                                                   │
│     GET /api/v1/users/{email}/public-key                            │
│     返回: receiverPublicKey                                          │
│                                                                      │
│  4. 获取文档密钥                                                     │
│     GET /api/v1/documents/{id}/key                                  │
│     返回: encryptedKey (用分享者公钥加密)                            │
│                                                                      │
│  5. 解密文档密钥                                                     │
│     documentKey = RSA.decrypt(encryptedKey, myPrivateKey)           │
│                                                                      │
│  6. 用接收者公钥重新加密                                             │
│     reEncryptedKey = RSA.encrypt(documentKey, receiverPublicKey)    │
│                                                                      │
│  7. 发送授权请求                                                     │
│     POST /api/v1/documents/{id}/permissions                         │
│     {                                                                │
│       userId: receiverUserId,                                        │
│       encryptedKey: reEncryptedKey,                                  │
│       permissionLevel: "viewer"                                      │
│     }                                                                │
│                                                                      │
│  8. 清零文档密钥                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                            服务器                                    │
├─────────────────────────────────────────────────────────────────────┤
│  1. 验证分享者是文档所有者                                           │
│                                                                      │
│  2. 创建密钥记录                                                     │
│     INSERT INTO document_keys (                                     │
│       document_id, user_id, encrypted_key, permission_level         │
│     )                                                                │
│                                                                      │
│  3. 返回成功                                                         │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 创建公开分享链接

```
┌─────────────────────────────────────────────────────────────────────┐
│                            分享者客户端                              │
├─────────────────────────────────────────────────────────────────────┤
│  1. 选择要分享的文件                                                 │
│                                                                      │
│  2. 设置分享选项                                                     │
│     ├── 访问密码 (可选)                                              │
│     ├── 过期时间 (可选)                                              │
│     └── 最大访问次数 (可选)                                          │
│                                                                      │
│  3. 生成分享密钥                                                     │
│     shareKey = crypto.getRandomValues(new Uint8Array(32))           │
│                                                                      │
│  4. 获取文档密钥                                                     │
│     documentKey = RSA.decrypt(encryptedKey, myPrivateKey)           │
│                                                                      │
│  5. 用分享密钥加密文档密钥                                           │
│     encryptedDocKey = AES-GCM.encrypt(documentKey, shareKey)        │
│                                                                      │
│  6. 发送创建请求                                                     │
│     POST /api/v1/shares                                             │
│     {                                                                │
│       documentId,                                                    │
│       encryptedKey: encryptedDocKey,                                 │
│       password: (可选),                                              │
│       expiresIn: (可选),                                             │
│       maxAccessCount: (可选)                                         │
│     }                                                                │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                            服务器                                    │
├─────────────────────────────────────────────────────────────────────┤
│  1. 生成访问令牌                                                     │
│     accessToken = generateSecureToken()                             │
│                                                                      │
│  2. 创建分享记录                                                     │
│     INSERT INTO share_links (...)                                   │
│                                                                      │
│  3. 返回分享链接                                                     │
│     { accessToken, url: "https://app/share/{token}" }               │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                            分享者客户端                              │
├─────────────────────────────────────────────────────────────────────┤
│  7. 构造完整分享链接                                                 │
│     fullUrl = url + "#" + base64(shareKey)                          │
│     └── 注意: # 后的内容不会发送到服务器                             │
│                                                                      │
│  8. 显示分享链接供用户复制                                           │
│                                                                      │
│  9. 清零密钥                                                         │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.3 访问公开分享链接

```
┌─────────────────────────────────────────────────────────────────────┐
│                            访问者客户端                              │
├─────────────────────────────────────────────────────────────────────┤
│  1. 打开分享链接                                                     │
│     URL: https://app/share/{token}#{shareKey}                       │
│                                                                      │
│  2. 提取参数                                                         │
│     ├── token = URL path 参数                                        │
│     └── shareKey = URL fragment (location.hash)                     │
│                                                                      │
│  3. 发送访问请求                                                     │
│     POST /api/v1/shares/access/{token}                              │
│     { password: (如需要) }                                           │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                            服务器                                    │
├─────────────────────────────────────────────────────────────────────┤
│  1. 查询分享记录                                                     │
│     SELECT * FROM share_links WHERE access_token = ?                │
│                                                                      │
│  2. 验证访问条件                                                     │
│     ├── 是否过期                                                     │
│     ├── 是否超过最大访问次数                                         │
│     └── 密码是否正确 (如有)                                          │
│                                                                      │
│  3. 增加访问计数                                                     │
│     UPDATE share_links SET access_count = access_count + 1          │
│                                                                      │
│  4. 获取文档信息和加密内容                                           │
│                                                                      │
│  5. 返回响应                                                         │
│     {                                                                │
│       encryptedKey,      // 用分享密钥加密的文档密钥                 │
│       encryptedName,                                                 │
│       nameNonce,                                                     │
│       contentNonce,                                                  │
│       contentHash,                                                   │
│       encryptedContent   // 加密的文件内容                           │
│     }                                                                │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                            访问者客户端                              │
├─────────────────────────────────────────────────────────────────────┤
│  6. 解密文档密钥                                                     │
│     documentKey = AES-GCM.decrypt(encryptedKey, shareKey)           │
│                                                                      │
│  7. 解密文件内容                                                     │
│     fileContent = AES-GCM.decrypt(encryptedContent, documentKey)    │
│                                                                      │
│  8. 解密文件名                                                       │
│     fileName = AES-GCM.decrypt(encryptedName, documentKey)          │
│                                                                      │
│  9. 验证哈希并下载                                                   │
│                                                                      │
│  10. 清零密钥                                                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 六、权限撤销流程

### 6.1 立即撤销

```
1. 分享者发送请求
   DELETE /api/v1/documents/{id}/permissions/{userId}

2. 服务器删除密钥记录
   DELETE FROM document_keys
   WHERE document_id = ? AND user_id = ?

3. 被撤销者下次访问时
   - 查询不到密钥记录
   - 返回 403 无权访问
```

### 6.2 密钥轮换撤销

```
用于确保被撤销者无法使用已缓存的密钥:

1. 分享者生成新文档密钥
   newDocumentKey = randomBytes(32)

2. 解密文件并重新加密
   content = decrypt(encryptedContent, oldKey)
   newEncryptedContent = encrypt(content, newDocumentKey)

3. 为每个保留权限的用户重新加密密钥
   FOR each user WITH permission:
     reEncryptedKey = RSA.encrypt(newDocumentKey, user.publicKey)
     UPDATE document_keys SET encrypted_key = reEncryptedKey

4. 更新存储的文件
   Storage.put(path, newEncryptedContent)

5. 被撤销者的旧密钥无法解密新文件
```
