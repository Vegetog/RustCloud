# rustcloud-crypto 模块设计

## 一、模块职责

rustcloud-crypto 是系统的安全核心，负责所有密码学操作：

- **对称加密**: AES-256-GCM 文件内容加密
- **非对称加密**: RSA-2048 密钥封装
- **哈希计算**: SHA-256 完整性校验
- **密钥派生**: Argon2id 从密码派生密钥
- **密钥管理**: 生成、存储、轮换、清零

## 二、核心数据结构

### 2.1 密钥类型

```
MasterKey
├── key: [u8; 32]               # 256-bit 主密钥
└── impl Drop                   # 销毁时自动清零

DocumentKey (DEK)
├── key: [u8; 32]               # 256-bit 文档密钥
└── impl Drop                   # 销毁时自动清零

RsaKeyPair
├── public_key: Vec<u8>         # DER 编码公钥
├── private_key: Vec<u8>        # DER 编码私钥
└── impl Drop                   # 销毁时清零私钥

EncryptedData
├── ciphertext: Vec<u8>         # 密文
├── nonce: [u8; 12]             # GCM Nonce (96-bit)
└── tag: [u8; 16]               # 认证标签 (128-bit)
```

### 2.2 加密参数

```
Argon2Params
├── memory: u32                 # 内存成本 (默认 65536 KB = 64MB)
├── iterations: u32             # 时间成本 (默认 3)
├── parallelism: u32            # 并行度 (默认 4)
└── output_length: usize        # 输出长度 (32 字节)

AesGcmParams
├── key_size: usize             # 256 bits
├── nonce_size: usize           # 96 bits
└── tag_size: usize             # 128 bits
```

## 三、主要接口

### 3.1 密钥派生

```
fn derive_master_key(password: &str, salt: &[u8]) -> Result<MasterKey>
  - 使用 Argon2id 从密码派生 256-bit 主密钥
  - salt 必须是 32 字节随机值
  - 内存参数: 64MB, 迭代: 3次
  - 返回: MasterKey (使用后自动清零)

fn generate_salt() -> [u8; 32]
  - 生成 32 字节密码学安全随机 salt
  - 使用 ring::rand::SystemRandom
```

### 3.2 RSA 密钥操作

```
fn generate_rsa_keypair() -> Result<RsaKeyPair>
  - 生成 RSA-2048 密钥对
  - 公钥/私钥使用 DER 编码
  - 返回: RsaKeyPair

fn encrypt_private_key(private_key: &[u8], master_key: &MasterKey) -> Result<EncryptedData>
  - 使用主密钥加密 RSA 私钥
  - 算法: AES-256-GCM
  - 返回: 加密数据 (密文 + Nonce)

fn decrypt_private_key(encrypted: &EncryptedData, master_key: &MasterKey) -> Result<Vec<u8>>
  - 解密 RSA 私钥
  - 验证失败说明密码错误
  - 返回: DER 编码的私钥
```

### 3.3 文档加密

```
fn generate_document_key() -> DocumentKey
  - 生成 256-bit 随机文档密钥
  - 使用 CSPRNG

fn encrypt_document(content: &[u8], key: &DocumentKey) -> Result<EncryptedData>
  - 使用 AES-256-GCM 加密文档内容
  - 自动生成随机 Nonce
  - 返回: 加密数据

fn decrypt_document(encrypted: &EncryptedData, key: &DocumentKey) -> Result<Vec<u8>>
  - 解密文档内容
  - 验证认证标签
  - 返回: 明文内容
```

### 3.4 密钥封装

```
fn encrypt_document_key(doc_key: &DocumentKey, public_key: &[u8]) -> Result<Vec<u8>>
  - 使用 RSA-OAEP 加密文档密钥
  - 填充: OAEP with SHA-256
  - 返回: 加密的文档密钥

fn decrypt_document_key(encrypted_key: &[u8], private_key: &[u8]) -> Result<DocumentKey>
  - 使用 RSA 私钥解密文档密钥
  - 返回: DocumentKey
```

### 3.5 哈希计算

```
fn sha256_hash(data: &[u8]) -> [u8; 32]
  - 计算 SHA-256 哈希
  - 用于文件完整性校验

fn sha256_hash_hex(data: &[u8]) -> String
  - 返回十六进制编码的哈希值
```

### 3.6 密码哈希（认证用）

```
fn hash_password(password: &str) -> Result<String>
  - Argon2id 密码哈希（用于登录验证）
  - 自动生成 salt
  - 返回: PHC 格式字符串

fn verify_password(password: &str, hash: &str) -> Result<bool>
  - 验证密码
  - 常量时间比较
```

## 四、依赖关系

```
rustcloud-crypto
├── 依赖
│   └── rustcloud-core        # 错误类型、配置
├── 外部依赖
│   ├── ring                  # 加密原语
│   ├── argon2                # 密钥派生
│   ├── rsa                   # RSA 操作
│   └── zeroize               # 安全清零
└── 被依赖
    ├── rustcloud-storage     # 加密存储
    └── rustcloud-auth        # 密码哈希
```

## 五、设计要点

### 5.1 密钥生命周期

```
1. 生成阶段
   - 使用 CSPRNG 生成
   - 立即检查熵源质量

2. 使用阶段
   - 最小化内存驻留时间
   - 避免日志输出
   - 避免交换到磁盘

3. 销毁阶段
   - 使用 zeroize 安全清零
   - Drop trait 自动触发
```

### 5.2 Nonce 管理

```
- 每次加密生成新的随机 Nonce
- 96-bit Nonce + 随机生成 = 碰撞概率极低
- Nonce 与密文一起存储（不需保密）
```

### 5.3 错误处理

```
- 解密失败只返回通用错误，不泄露具体原因
- 密码验证使用常量时间比较
- 不在错误信息中包含密钥片段
```

## 六、实现注意事项

### 6.1 内存安全

```rust
// 使用 zeroize 包装敏感数据
use zeroize::{Zeroize, ZeroizeOnDrop};

#[derive(ZeroizeOnDrop)]
struct MasterKey {
    key: [u8; 32],
}
```

### 6.2 侧信道防护

```
1. 常量时间操作
   - 密码比较使用 subtle::ConstantTimeEq
   - 避免基于秘密值的分支

2. 避免时序泄露
   - 解密验证在固定时间内完成
```

### 6.3 密钥派生参数选择

```
Argon2id 参数设计:
- 内存: 64MB (平衡安全性和可用性)
- 迭代: 3 (确保足够计算成本)
- 并行度: 4 (利用多核)
- 预期耗时: 300-500ms (客户端可接受)
```

## 七、安全考虑

1. **密钥存储**: Master Key 绝不持久化，仅内存中存在
2. **算法选择**: 使用经过审计的库 (ring)，不自己实现算法
3. **随机数**: 只使用操作系统 CSPRNG
4. **密钥长度**: AES-256 (256-bit), RSA-2048 (足够安全)
5. **认证加密**: 使用 GCM 模式，同时保证机密性和完整性
6. **前向保密**: 每个文档独立密钥，单个密钥泄露不影响其他文档

## 八、测试要点

1. 加密-解密往返测试
2. 错误密钥解密失败测试
3. 密文篡改检测测试
4. 密钥清零验证测试
5. 大文件加密性能测试
