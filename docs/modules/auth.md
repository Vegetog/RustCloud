# rustcloud-auth 模块（当前实现）

## 职责

- JWT 访问/刷新令牌生成与验证
- Refresh token rotation + token family 检查
- Redis 会话管理与黑名单
- 密码强度校验
- 调用 `rustcloud-crypto` 执行 Argon2 哈希与验证

## 关键接口

- `create_password_hash` / `check_password`
- `validate_password_strength`
- `JwtManager`
- `SessionManager`

## 关键事实

- 登录认证是传统服务端密码校验流程，不是 PAKE。
- 该模块不参与文档内容加解密。
