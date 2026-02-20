//! RustCloud 加密模块
//!
//! 包含密钥派生、加密和哈希等密码学操作。

mod argon2;
mod hash;

pub use argon2::{hash_password, verify_password};
pub use hash::{sha256_hash, sha256_hash_hex};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_password_hashing() {
        let password = "my_secure_password";
        let hash = hash_password(password).unwrap();

        assert!(verify_password(password, &hash).unwrap());
        assert!(!verify_password("wrong_password", &hash).unwrap());
    }

    #[test]
    fn test_sha256() {
        let data = b"Hello, World!";
        let hash = sha256_hash(data);
        let hash_hex = sha256_hash_hex(data);

        assert_eq!(hash.len(), 32);
        assert_eq!(hash_hex.len(), 64);
    }
}
