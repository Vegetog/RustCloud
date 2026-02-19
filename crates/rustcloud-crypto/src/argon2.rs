//! Argon2id 密钥派生与密码哈希

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Algorithm, Argon2, Params, Version,
};
use rustcloud_core::error::{Error, Result};

use crate::keys::MasterKey;

/// 使用 Argon2id 从密码派生主密钥。
///
/// # 参数
/// * `password` - 用户密码
/// * `salt` - 32 字节随机盐值（必须保存以便后续密钥派生）
///
/// # 返回值
/// * `MasterKey` - 256 位派生密钥
pub fn derive_master_key(password: &str, salt: &[u8]) -> Result<MasterKey> {
    if salt.len() != 32 {
        return Err(Error::KeyDerivationFailed("Salt must be 32 bytes".into()));
    }

    // Argon2id 参数：64MB 内存、3 次迭代、4 并行度
    let params = Params::new(65536, 3, 4, Some(32))
        .map_err(|e| Error::KeyDerivationFailed(e.to_string()))?;

    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    let mut output = [0u8; 32];
    argon2
        .hash_password_into(password.as_bytes(), salt, &mut output)
        .map_err(|e| Error::KeyDerivationFailed(e.to_string()))?;

    Ok(MasterKey::new(output))
}

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
    fn test_derive_master_key() {
        let salt = [0u8; 32];
        let key1 = derive_master_key("password", &salt).unwrap();
        let key2 = derive_master_key("password", &salt).unwrap();

        // 相同密码 + 盐值 = 相同密钥
        assert_eq!(key1.as_bytes(), key2.as_bytes());
    }

    #[test]
    fn test_derive_master_key_different_passwords() {
        let salt = [0u8; 32];
        let key1 = derive_master_key("password1", &salt).unwrap();
        let key2 = derive_master_key("password2", &salt).unwrap();

        // 不同密码 = 不同密钥
        assert_ne!(key1.as_bytes(), key2.as_bytes());
    }

    #[test]
    fn test_derive_master_key_different_salts() {
        let salt1 = [0u8; 32];
        let salt2 = [1u8; 32];
        let key1 = derive_master_key("password", &salt1).unwrap();
        let key2 = derive_master_key("password", &salt2).unwrap();

        // 不同盐值 = 不同密钥
        assert_ne!(key1.as_bytes(), key2.as_bytes());
    }

    #[test]
    fn test_hash_and_verify_password() {
        let password = "test_password_123";
        let hash = hash_password(password).unwrap();

        assert!(verify_password(password, &hash).unwrap());
        assert!(!verify_password("wrong_password", &hash).unwrap());
    }

    #[test]
    fn test_invalid_salt_length() {
        let short_salt = [0u8; 16];
        let result = derive_master_key("password", &short_salt);
        assert!(result.is_err());
    }
}
