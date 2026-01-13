//! Argon2id key derivation and password hashing

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Algorithm, Argon2, Params, Version,
};
use rustcloud_core::error::{Error, Result};

use crate::keys::MasterKey;

/// Derive a master key from password using Argon2id.
///
/// # Arguments
/// * `password` - User's password
/// * `salt` - 32-byte random salt (must be stored for later key derivation)
///
/// # Returns
/// * `MasterKey` - 256-bit derived key
pub fn derive_master_key(password: &str, salt: &[u8]) -> Result<MasterKey> {
    if salt.len() != 32 {
        return Err(Error::KeyDerivationFailed("Salt must be 32 bytes".into()));
    }

    // Argon2id parameters: 64MB memory, 3 iterations, 4 parallelism
    let params = Params::new(65536, 3, 4, Some(32))
        .map_err(|e| Error::KeyDerivationFailed(e.to_string()))?;

    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    let mut output = [0u8; 32];
    argon2
        .hash_password_into(password.as_bytes(), salt, &mut output)
        .map_err(|e| Error::KeyDerivationFailed(e.to_string()))?;

    Ok(MasterKey::new(output))
}

/// Hash a password for storage using Argon2id.
/// Returns a PHC format string that includes the salt.
pub fn hash_password(password: &str) -> Result<String> {
    let salt = SaltString::generate(&mut OsRng);

    // Use moderate parameters for password hashing
    let params = Params::new(65536, 3, 4, None)
        .map_err(|e| Error::KeyDerivationFailed(e.to_string()))?;

    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    let hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| Error::KeyDerivationFailed(e.to_string()))?;

    Ok(hash.to_string())
}

/// Verify a password against a stored hash.
/// Uses constant-time comparison to prevent timing attacks.
pub fn verify_password(password: &str, hash: &str) -> Result<bool> {
    let parsed_hash =
        PasswordHash::new(hash).map_err(|e| Error::KeyDerivationFailed(e.to_string()))?;

    // Use default Argon2 for verification (parameters come from the hash)
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

        // Same password + salt = same key
        assert_eq!(key1.as_bytes(), key2.as_bytes());
    }

    #[test]
    fn test_derive_master_key_different_passwords() {
        let salt = [0u8; 32];
        let key1 = derive_master_key("password1", &salt).unwrap();
        let key2 = derive_master_key("password2", &salt).unwrap();

        // Different passwords = different keys
        assert_ne!(key1.as_bytes(), key2.as_bytes());
    }

    #[test]
    fn test_derive_master_key_different_salts() {
        let salt1 = [0u8; 32];
        let salt2 = [1u8; 32];
        let key1 = derive_master_key("password", &salt1).unwrap();
        let key2 = derive_master_key("password", &salt2).unwrap();

        // Different salts = different keys
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
