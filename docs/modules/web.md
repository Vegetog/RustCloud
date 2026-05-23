# web 模块（当前实现）

## 技术栈

- React 19 + TypeScript + Vite
- Zustand 状态管理
- Web Crypto API（E2EE 核心）
- Yjs + y-protocols（CRDT 协作编辑）
- Monaco Editor（在线文本/代码编辑）

## 核心加密职责

`web/src/services/crypto.ts`：

- `deriveMasterKey(password, salt)`：PBKDF2 派生 AES key
- `generateKeyPair()`：RSA-OAEP 密钥对
- `encryptPrivateKey/decryptPrivateKey()`：用户私钥本地加解密
- `encryptDocument/decryptDocument()`：文档内容与文件名加解密
- `reEncryptDocumentKey()`：授权分享时 DEK 重加密

## 状态管理

- `authStore`：注册/登录、会话密钥恢复
- `documentStore`：上传加密、下载解密、列表加载
- `folderStore`：文件夹树、创建/重命名/移动/删除

## 协作编辑

`web/src/services/yjsWsProvider.ts`（`EncryptedYjsWsProvider`）：

- 将 Yjs CRDT 增量更新用文档 DEK（AES-GCM）加密后通过 WebSocket 传输。
- 服务端只中继密文，不持有明文 DEK。
- 第一个进入房间的用户将解密内容插入 Y.Doc 并广播；后续用户等待同步。
- Monaco Editor 通过 `y-monaco` 绑定到 Y.Doc，实现多人实时编辑。

## 文件预览

前端支持多种格式的客户端预览（先解密，再渲染）：

- Word（DOCX）：`docx-preview`
- Excel（XLSX）：`xlsx`
- PowerPoint（PPTX）：`pptx-preview`
- 代码 / 文本：Monaco Editor + Highlight.js
- Markdown：`react-markdown`
- ZIP：`jszip`（解包后预览内层文件）

## AI 摘要

`web/src/services/gemini.ts` + `aiProvider.ts`：

- 支持火山引擎 DeepSeek 和 OpenAI 兼容 API。
- 文件内容在客户端解密后直接发送至 AI 服务，**不经过 RustCloud 服务器**。
- 用户自行配置并存储 API Key（`localStorage`），服务端不感知。

## 边界说明

- 前端负责文件 E2EE；后端返回密文与密钥包，前端完成解密。
- 协作编辑中 WebSocket 服务端也不持有明文，E2EE 贯穿实时通道。
- AI 功能完全在客户端调用外部 API，RustCloud 后端不参与。
