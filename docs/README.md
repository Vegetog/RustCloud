# RustCloud 文档总览

本文档描述当前代码状态（非历史设计稿）。

## 系统边界

- 文件数据层：前端 E2EE（DEK 在前端生成和使用）
- 认证层：服务端密码认证（Argon2 哈希/校验）
- 服务端主要职责：鉴权、授权、密文存储与转发

## 模块现状

- `core`：错误、配置、核心类型
- `crypto`：后端当前仅 `hash_password/verify_password/sha256`
- `auth`：JWT、refresh rotation、Redis 会话
- `storage`：Local/MinIO 存储实现
- `database`：SeaORM 实体与仓库
- `api`：认证/文档/分享/锁接口
- `web`：React + Web Crypto 客户端加密

## 关键数据流

1. 注册：前端生成密钥对并上传公钥 + 加密私钥。
2. 登录：后端验证密码，返回加密私钥和盐；前端本地解密。
3. 上传：前端生成 DEK，加密内容后上传密文和 `encrypted_key`。
4. 下载：后端返回密文，前端使用私钥解 DEK 再解密内容。
5. 分享：前端进行 DEK 重加密，后端只存/转发 `encrypted_key`。

## 子文档

- 环境与配置：`docs/environment.md`
- 业务流程：`docs/flows.md`
- 模块文档：`docs/modules/*.md`

## 历史文档提示

`CHANGELOG.md`、`TODO.md`、`TEST_REPORT.md` 保留历史记录；请以源码和“当前状态更正”小节为准。
