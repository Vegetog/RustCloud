//! AES-256-GCM 加密与解密

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use rand::RngCore;
use rustcloud_core::error::{Error, Result};

use crate::keys::{DocumentKey, EncryptedData, MasterKey};

/// 使用文档密钥通过 AES-256-GCM 加密数据。
pub fn encrypt_data(plaintext: &[u8], key: &DocumentKey) -> Result<EncryptedData> {
    encrypt_with_key(plaintext, key.as_bytes())
}

/// 使用主密钥通过 AES-256-GCM 加密数据。
pub fn encrypt_with_master_key(plaintext: &[u8], key: &MasterKey) -> Result<EncryptedData> {
    encrypt_with_key(plaintext, key.as_bytes())
}

fn encrypt_with_key(plaintext: &[u8], key: &[u8; 32]) -> Result<EncryptedData> {
    let cipher =
        Aes256Gcm::new_from_slice(key).map_err(|e| Error::EncryptionFailed(e.to_string()))?;

    // 生成随机 nonce
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| Error::EncryptionFailed(e.to_string()))?;

    Ok(EncryptedData::new(ciphertext, nonce_bytes))
}

/// 使用文档密钥通过 AES-256-GCM 解密数据。
pub fn decrypt_data(encrypted: &EncryptedData, key: &DocumentKey) -> Result<Vec<u8>> {
    decrypt_with_key(encrypted, key.as_bytes())
}

/// 使用主密钥通过 AES-256-GCM 解密数据。
pub fn decrypt_with_master_key(encrypted: &EncryptedData, key: &MasterKey) -> Result<Vec<u8>> {
    decrypt_with_key(encrypted, key.as_bytes())
}

fn decrypt_with_key(encrypted: &EncryptedData, key: &[u8; 32]) -> Result<Vec<u8>> {
    let cipher =
        Aes256Gcm::new_from_slice(key).map_err(|e| Error::DecryptionFailed(e.to_string()))?;

    let nonce = Nonce::from_slice(&encrypted.nonce);

    let plaintext = cipher
        .decrypt(nonce, encrypted.ciphertext.as_ref())
        .map_err(|_| Error::DecryptionFailed("Authentication failed".into()))?;

    Ok(plaintext)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let key = DocumentKey::new();
        let plaintext = b"Hello, World! This is a test message.";

        let encrypted = encrypt_data(plaintext, &key).unwrap();
        let decrypted = decrypt_data(&encrypted, &key).unwrap();

        assert_eq!(plaintext.as_slice(), decrypted.as_slice());
    }

    #[test]
    fn test_wrong_key_fails() {
        let key1 = DocumentKey::new();
        let key2 = DocumentKey::new();
        let plaintext = b"Secret message";

        let encrypted = encrypt_data(plaintext, &key1).unwrap();
        let result = decrypt_data(&encrypted, &key2);

        assert!(result.is_err());
    }

    #[test]
    fn test_tampered_ciphertext_fails() {
        let key = DocumentKey::new();
        let plaintext = b"Secret message";

        let mut encrypted = encrypt_data(plaintext, &key).unwrap();
        // 篡改密文
        if let Some(byte) = encrypted.ciphertext.first_mut() {
            *byte ^= 0xFF;
        }

        let result = decrypt_data(&encrypted, &key);
        assert!(result.is_err());
    }

    #[test]
    fn test_empty_plaintext() {
        let key = DocumentKey::new();
        let plaintext = b"";

        let encrypted = encrypt_data(plaintext, &key).unwrap();
        let decrypted = decrypt_data(&encrypted, &key).unwrap();

        assert!(decrypted.is_empty());
    }

    #[test]
    fn test_large_plaintext() {
        let key = DocumentKey::new();
        let plaintext: Vec<u8> = (0..100_000).map(|i| (i % 256) as u8).collect();

        let encrypted = encrypt_data(&plaintext, &key).unwrap();
        let decrypted = decrypt_data(&encrypted, &key).unwrap();

        assert_eq!(plaintext, decrypted);
    }
}
