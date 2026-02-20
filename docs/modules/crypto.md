# rustcloud-crypto 模块设计

## 一、模块职责

当前后端仅保留以下密码学职责（与纯前端 E2EE 方案一致）：

- 密码哈希：Argon2id（用于用户登录与分享密码校验）
- 哈希计算：SHA-256（用于对象存储完整性校验）

文档内容加解密、DEK 生成/封装、RSA 私钥加解密均在前端完成，后端仅保存与转发密文。

## 二、主要接口

### 2.1 密码哈希

```rust
fn hash_password(password: &str) -> Result<String>
fn verify_password(password: &str, hash: &str) -> Result<bool>
```

说明：

- 使用 Argon2id 生成 PHC 格式哈希字符串
- 验证时从 PHC 字符串读取参数并校验

### 2.2 SHA-256

```rust
fn sha256_hash(data: &[u8]) -> [u8; 32]
fn sha256_hash_hex(data: &[u8]) -> String
```

说明：

- 用于存储层计算内容摘要与完整性比对

## 三、依赖关系

```text
rustcloud-crypto
├── 依赖
│   └── rustcloud-core        # 错误类型
├── 外部依赖
│   ├── argon2                # 密码哈希
│   ├── sha2                  # SHA-256
│   └── hex                   # 十六进制编码
└── 被依赖
    ├── rustcloud-auth        # 密码哈希/校验
    └── rustcloud-storage     # SHA-256 哈希
```

## 四、设计说明

- 纯前端 E2EE 下，服务端不持有明文 DEK，不执行文档内容解密。
- 后端接口中 `encrypted_key` 字段仅作为密文存取字段。
