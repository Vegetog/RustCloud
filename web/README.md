# RustCloud Web

前端应用：React + TypeScript + Vite。

## 主要能力

- 用户注册/登录
- 客户端密钥管理（Web Crypto API）
- 文档上传加密、下载解密
- 权限分享与链接分享

## 关键文件

- `src/services/crypto.ts`：客户端密码学实现
- `src/stores/authStore.ts`：认证与密钥会话状态
- `src/stores/documentStore.ts`：文档上传/下载流程
- `src/components/ShareModal.tsx`：授权与重加密
- `src/pages/SharePage.tsx`：分享链接访问与解密

## 开发命令

```bash
npm install
npm run dev
npm run build
npm run lint
```

## 加密边界

- 文件内容与文件名在浏览器端加解密。
- 后端仅接收/返回密文和 `encrypted_key`。
