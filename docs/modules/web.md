# web 模块（当前实现）

## 技术栈

- React + TypeScript + Vite
- Zustand 状态管理
- Web Crypto API

## 核心加密职责

`web/src/services/crypto.ts`：

- `deriveMasterKey(password, salt)`：PBKDF2 派生 AES key
- `generateKeyPair()`：RSA-OAEP 密钥对
- `encryptPrivateKey/decryptPrivateKey()`：用户私钥本地加解密
- `encryptDocument/decryptDocument()`：文档内容与文件名加解密
- `reEncryptDocumentKey()`：授权分享时 DEK 重加密

## 状态与流程

- `authStore`：注册/登录、会话密钥恢复
- `documentStore`：上传加密、下载解密、列表加载
- `SharePage`：从 URL hash 读取分享密钥并本地解密

## 边界说明

- 前端负责文件 E2EE。
- 后端返回密文与密钥包，前端完成解密。
