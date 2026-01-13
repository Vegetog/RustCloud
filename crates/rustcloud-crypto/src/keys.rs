//! Key types with secure memory handling

use rand::RngCore;
use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, ZeroizeOnDrop};

/// Master key derived from user password using Argon2id.
/// Automatically zeroed on drop for security.
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

/// Document encryption key (DEK) for AES-256-GCM.
/// Automatically zeroed on drop for security.
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

/// RSA key pair for asymmetric encryption.
/// Private key is zeroed on drop.
pub struct RsaKeyPair {
    public_key: Vec<u8>,
    #[allow(dead_code)]
    private_key: ZeroizeVec,
}

/// Wrapper for Vec<u8> that implements zeroize
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

/// Encrypted data with AES-256-GCM
#[derive(Clone, Serialize, Deserialize)]
pub struct EncryptedData {
    pub ciphertext: Vec<u8>,
    pub nonce: [u8; 12],
}

impl EncryptedData {
    pub fn new(ciphertext: Vec<u8>, nonce: [u8; 12]) -> Self {
        Self { ciphertext, nonce }
    }

    /// Serialize to bytes (nonce + ciphertext)
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut result = Vec::with_capacity(12 + self.ciphertext.len());
        result.extend_from_slice(&self.nonce);
        result.extend_from_slice(&self.ciphertext);
        result
    }

    /// Deserialize from bytes
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
