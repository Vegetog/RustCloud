//! 具备安全内存处理的密钥类型

use rand::RngCore;
use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, ZeroizeOnDrop};

/// 使用 Argon2id 从用户密码派生的主密钥。
/// 出于安全考虑，析构时会自动清零。
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct MasterKey {
    key: [u8; 32],
}

impl MasterKey {
    pub fn new(key: [u8; 32]) -> Self {
        Self { key }
    }

    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.key
    }
}

/// 用于 AES-256-GCM 的文档加密密钥（DEK）。
/// 出于安全考虑，析构时会自动清零。
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct DocumentKey {
    key: [u8; 32],
}

impl DocumentKey {
    pub fn new() -> Self {
        let mut key = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut key);
        Self { key }
    }

    pub fn from_bytes(bytes: [u8; 32]) -> Self {
        Self { key: bytes }
    }

    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.key
    }
}

impl Default for DocumentKey {
    fn default() -> Self {
        Self::new()
    }
}

/// 用于非对称加密的 RSA 密钥对。
/// 私钥在析构时会清零。
pub struct RsaKeyPair {
    public_key: Vec<u8>,
    #[allow(dead_code)]
    private_key: ZeroizeVec,
}

/// 实现 zeroize 的 Vec<u8> 封装
struct ZeroizeVec(Vec<u8>);

impl Drop for ZeroizeVec {
    fn drop(&mut self) {
        self.0.zeroize();
    }
}

impl RsaKeyPair {
    pub fn new(public_key: Vec<u8>, private_key: Vec<u8>) -> Self {
        Self {
            public_key,
            private_key: ZeroizeVec(private_key),
        }
    }

    pub fn public_key_der(&self) -> &[u8] {
        &self.public_key
    }

    pub fn private_key_der(&self) -> &[u8] {
        &self.private_key.0
    }
}

/// 使用 AES-256-GCM 的加密数据
#[derive(Clone, Serialize, Deserialize)]
pub struct EncryptedData {
    pub ciphertext: Vec<u8>,
    pub nonce: [u8; 12],
}

impl EncryptedData {
    pub fn new(ciphertext: Vec<u8>, nonce: [u8; 12]) -> Self {
        Self { ciphertext, nonce }
    }

    /// 序列化为字节（nonce + 密文）
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut result = Vec::with_capacity(12 + self.ciphertext.len());
        result.extend_from_slice(&self.nonce);
        result.extend_from_slice(&self.ciphertext);
        result
    }

    /// 从字节反序列化
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < 12 {
            return None;
        }
        let mut nonce = [0u8; 12];
        nonce.copy_from_slice(&bytes[..12]);
        let ciphertext = bytes[12..].to_vec();
        Some(Self { ciphertext, nonce })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_document_key_generation() {
        let key1 = DocumentKey::new();
        let key2 = DocumentKey::new();
        assert_ne!(key1.as_bytes(), key2.as_bytes());
    }

    #[test]
    fn test_encrypted_data_serialization() {
        let nonce = [1u8; 12];
        let ciphertext = vec![2, 3, 4, 5];
        let encrypted = EncryptedData::new(ciphertext.clone(), nonce);

        let bytes = encrypted.to_bytes();
        let restored = EncryptedData::from_bytes(&bytes).unwrap();

        assert_eq!(restored.nonce, nonce);
        assert_eq!(restored.ciphertext, ciphertext);
    }
}
