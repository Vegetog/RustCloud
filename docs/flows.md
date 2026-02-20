# RustCloud 流程说明（当前实现）

## 1. 注册

1. 前端生成 `salt`（32 字节）。
2. 前端用 PBKDF2 从用户密码派生 `MasterKey`。
3. 前端生成 RSA 密钥对。
4. 前端用 `MasterKey` 加密私钥。
5. 前端提交：`email/password/salt/public_key/encrypted_private_key/private_key_nonce`。
6. 后端做密码强度检查与 Argon2 哈希存储。

## 2. 登录

1. 前端提交 `email/password`。
2. 后端用 Argon2 验证密码，返回 token + `salt` + 加密私钥。
3. 前端再次 PBKDF2 派生 `MasterKey`，本地解密私钥。
4. 前端在会话内保存密钥与 token。

## 3. 上传文档

1. 前端随机生成 DEK（32 字节）。
2. 前端用 DEK 加密文件内容与文件名（AES-GCM）。
3. 前端用用户公钥封装 DEK，得到 `encrypted_key`。
4. 前端上传密文内容 + 元数据（`encrypted_name/name_nonce/content_nonce/content_hash/encrypted_key`）。
5. 后端存储密文并建立文档与文档密钥记录。

## 4. 下载文档

1. 前端请求文档详情（获取当前用户 `encrypted_key`）与密文内容。
2. 前端用私钥解封装 DEK。
3. 前端用 DEK 解密内容与文件名。

## 5. 授权共享（站内用户）

1. 授权者前端取出已有 `encrypted_key`。
2. 使用授权者私钥解封装 DEK。
3. 使用目标用户公钥重新加密 DEK。
4. 提交新的 `encrypted_key` 给后端创建权限记录。

## 6. 链接分享

1. 创建分享链接时，后端保存分享记录与 `encrypted_key`。
2. 访问端通过 `/shares/access/:token` 取密文元数据。
3. 访问端在浏览器侧完成解密（可配合 URL hash 携带分享密钥）。

## 7. 边界总结

- 文件密文与 DEK 明文只在前端处理。
- 后端仅做认证、授权、存储与转发。
- 登录密码仍是传统服务端认证链路（非 PAKE）。
