//! RSA-2048 密钥操作

use rsa::{
    pkcs8::{DecodePrivateKey, DecodePublicKey, EncodePrivateKey, EncodePublicKey, LineEnding},
    Oaep, RsaPrivateKey, RsaPublicKey,
};
use rustcloud_core::error::{Error, Result};
use sha2::Sha256;

use crate::{
    aes::{decrypt_with_master_key, encrypt_with_master_key},
    keys::{DocumentKey, EncryptedData, MasterKey, RsaKeyPair},
};

/// 生成新的 RSA-2048 密钥对。
pub fn generate_rsa_keypair() -> Result<RsaKeyPair> {
    let mut rng = rand::thread_rng();

    let private_key = RsaPrivateKey::new(&mut rng, 2048)
        .map_err(|e| Error::EncryptionFailed(format!("RSA key generation failed: {}", e)))?;

    let public_key = RsaPublicKey::from(&private_key);

    let private_key_der = private_key
        .to_pkcs8_der()
        .map_err(|e| Error::EncryptionFailed(format!("Private key encoding failed: {}", e)))?;

    let public_key_der = public_key
        .to_public_key_der()
        .map_err(|e| Error::EncryptionFailed(format!("Public key encoding failed: {}", e)))?;

    Ok(RsaKeyPair::new(
        public_key_der.to_vec(),
        private_key_der.to_bytes().to_vec(),
    ))
}

/// 使用主密钥通过 AES-256-GCM 加密 RSA 私钥。
pub fn encrypt_private_key(private_key_der: &[u8], master_key: &MasterKey) -> Result<EncryptedData> {
    encrypt_with_master_key(private_key_der, master_key)
}

/// 使用主密钥解密 RSA 私钥。
pub fn decrypt_private_key(encrypted: &EncryptedData, master_key: &MasterKey) -> Result<Vec<u8>> {
    decrypt_with_master_key(encrypted, master_key)
}

/// 使用 RSA-OAEP（SHA-256）加密文档密钥。
pub fn encrypt_document_key(doc_key: &DocumentKey, public_key_der: &[u8]) -> Result<Vec<u8>> {
    let public_key = RsaPublicKey::from_public_key_der(public_key_der)
        .map_err(|e| Error::EncryptionFailed(format!("Invalid public key: {}", e)))?;

    let padding = Oaep::new::<Sha256>();
    let mut rng = rand::thread_rng();

    let encrypted = public_key
        .encrypt(&mut rng, padding, doc_key.as_bytes())
        .map_err(|e| Error::EncryptionFailed(format!("RSA encryption failed: {}", e)))?;

    Ok(encrypted)
}

/// 使用 RSA-OAEP（SHA-256）解密文档密钥。
pub fn decrypt_document_key(encrypted_key: &[u8], private_key_der: &[u8]) -> Result<DocumentKey> {
    let private_key = RsaPrivateKey::from_pkcs8_der(private_key_der)
        .map_err(|e| Error::DecryptionFailed(format!("Invalid private key: {}", e)))?;

    let padding = Oaep::new::<Sha256>();

    let decrypted = private_key
        .decrypt(padding, encrypted_key)
        .map_err(|e| Error::DecryptionFailed(format!("RSA decryption failed: {}", e)))?;

    if decrypted.len() != 32 {
        return Err(Error::DecryptionFailed(
            "Invalid document key length".into(),
        ));
    }

    let mut key_bytes = [0u8; 32];
    key_bytes.copy_from_slice(&decrypted);

    Ok(DocumentKey::from_bytes(key_bytes))
}

/// 以 PEM 格式导出公钥。
#[allow(dead_code)]
pub fn public_key_to_pem(public_key_der: &[u8]) -> Result<String> {
    let public_key = RsaPublicKey::from_public_key_der(public_key_der)
        .map_err(|e| Error::EncryptionFailed(format!("Invalid public key: {}", e)))?;

    let pem = public_key
        .to_public_key_pem(LineEnding::LF)
        .map_err(|e| Error::EncryptionFailed(format!("PEM encoding failed: {}", e)))?;

    Ok(pem)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_keypair() {
        let keypair = generate_rsa_keypair().unwrap();
        assert!(!keypair.public_key_der().is_empty());
        assert!(!keypair.private_key_der().is_empty());
    }

    #[test]
    fn test_encrypt_decrypt_private_key() {
        let keypair = generate_rsa_keypair().unwrap();
        let master_key = MasterKey::new([0u8; 32]);

        let encrypted = encrypt_private_key(keypair.private_key_der(), &master_key).unwrap();
        let decrypted = decrypt_private_key(&encrypted, &master_key).unwrap();

        assert_eq!(keypair.private_key_der(), decrypted.as_slice());
    }

    #[test]
    fn test_encrypt_decrypt_document_key() {
        let keypair = generate_rsa_keypair().unwrap();
        let doc_key = DocumentKey::new();

        let encrypted = encrypt_document_key(&doc_key, keypair.public_key_der()).unwrap();
        let decrypted = decrypt_document_key(&encrypted, keypair.private_key_der()).unwrap();

        assert_eq!(doc_key.as_bytes(), decrypted.as_bytes());
    }

    #[test]
    fn test_wrong_private_key_fails() {
        let keypair1 = generate_rsa_keypair().unwrap();
        let keypair2 = generate_rsa_keypair().unwrap();
        let doc_key = DocumentKey::new();

        let encrypted = encrypt_document_key(&doc_key, keypair1.public_key_der()).unwrap();
        let result = decrypt_document_key(&encrypted, keypair2.private_key_der());

        assert!(result.is_err());
    }

    #[test]
    fn test_public_key_pem() {
        let keypair = generate_rsa_keypair().unwrap();
        let pem = public_key_to_pem(keypair.public_key_der()).unwrap();

        assert!(pem.contains("BEGIN PUBLIC KEY"));
        assert!(pem.contains("END PUBLIC KEY"));
    }
}
