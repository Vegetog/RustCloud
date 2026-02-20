//! Argon2id 密钥派生与密码哈希

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Algorithm, Argon2, Params, Version,
};
use rustcloud_core::error::{Error, Result};

/// 使用 Argon2id 对密码进行哈希以便存储。
/// 返回包含盐值的 PHC 格式字符串。
pub fn hash_password(password: &str) -> Result<String> {
    let salt = SaltString::generate(&mut OsRng);

    // 使用适中参数进行密码哈希
    let params = Params::new(65536, 3, 4, None)
        .map_err(|e| Error::KeyDerivationFailed(e.to_string()))?;

    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    let hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| Error::KeyDerivationFailed(e.to_string()))?;

    Ok(hash.to_string())
}

/// 验证密码是否与存储的哈希匹配。
/// 使用常量时间比较以防止时序攻击。
pub fn verify_password(password: &str, hash: &str) -> Result<bool> {
    let parsed_hash =
        PasswordHash::new(hash).map_err(|e| Error::KeyDerivationFailed(e.to_string()))?;

    // 使用默认 Argon2 进行验证（参数从哈希值中读取）
    let argon2 = Argon2::default();

    match argon2.verify_password(password.as_bytes(), &parsed_hash) {
        Ok(()) => Ok(true),
        Err(argon2::password_hash::Error::Password) => Ok(false),
        Err(e) => Err(Error::KeyDerivationFailed(e.to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_and_verify_password() {
        let password = "test_password_123";
        let hash = hash_password(password).unwrap();

        assert!(verify_password(password, &hash).unwrap());
        assert!(!verify_password("wrong_password", &hash).unwrap());
    }
}
