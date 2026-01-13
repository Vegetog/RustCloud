//! RustCloud Crypto Module
//!
//! Cryptographic operations including key derivation, encryption, and hashing.

mod aes;
mod argon2;
mod hash;
mod keys;
mod rsa;

pub use aes::{decrypt_data, encrypt_data};
pub use argon2::{derive_master_key, hash_password, verify_password};
pub use hash::{sha256_hash, sha256_hash_hex};
pub use keys::{DocumentKey, EncryptedData, MasterKey, RsaKeyPair};
pub use rsa::{
    decrypt_document_key, decrypt_private_key, encrypt_document_key, encrypt_private_key,
    generate_rsa_keypair,
};

use rand::RngCore;

pub fn generate_salt() -> [u8; 32] {
    let mut salt = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut salt);
    salt
}

pub fn generate_document_key() -> DocumentKey {
    DocumentKey::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_full_encryption_flow() {
        // 1. Generate salt and derive master key
        let salt = generate_salt();
        let master_key = derive_master_key("test_password_123", &salt).unwrap();

        // 2. Generate RSA key pair
        let rsa_keypair = generate_rsa_keypair().unwrap();

        // 3. Encrypt private key with master key
        let encrypted_private_key =
            encrypt_private_key(&rsa_keypair.private_key_der(), &master_key).unwrap();

        // 4. Generate document key
        let doc_key = generate_document_key();

        // 5. Encrypt document
        let plaintext = b"Hello, RustCloud! This is a secret document.";
        let encrypted_doc = encrypt_data(plaintext, &doc_key).unwrap();

        // 6. Encrypt document key with RSA public key
        let encrypted_doc_key =
            encrypt_document_key(&doc_key, rsa_keypair.public_key_der()).unwrap();

        // === Decryption flow ===

        // 7. Derive master key again (simulating login)
        let master_key_2 = derive_master_key("test_password_123", &salt).unwrap();

        // 8. Decrypt private key
        let decrypted_private_key =
            decrypt_private_key(&encrypted_private_key, &master_key_2).unwrap();

        // 9. Decrypt document key
        let decrypted_doc_key =
            decrypt_document_key(&encrypted_doc_key, &decrypted_private_key).unwrap();

        // 10. Decrypt document
        let decrypted_doc = decrypt_data(&encrypted_doc, &decrypted_doc_key).unwrap();

        assert_eq!(plaintext.as_slice(), decrypted_doc.as_slice());
    }

    #[test]
    fn test_wrong_password_fails() {
        let salt = generate_salt();
        let master_key = derive_master_key("correct_password", &salt).unwrap();
        let rsa_keypair = generate_rsa_keypair().unwrap();
        let encrypted_private_key =
            encrypt_private_key(&rsa_keypair.private_key_der(), &master_key).unwrap();

        // Try with wrong password
        let wrong_master_key = derive_master_key("wrong_password", &salt).unwrap();
        let result = decrypt_private_key(&encrypted_private_key, &wrong_master_key);

        assert!(result.is_err());
    }

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
