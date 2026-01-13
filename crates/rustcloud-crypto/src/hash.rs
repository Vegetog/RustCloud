//! SHA-256 hashing functions

use sha2::{Digest, Sha256};

/// Compute SHA-256 hash of data.
pub fn sha256_hash(data: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hasher.finalize().into()
}

/// Compute SHA-256 hash and return as hex string.
pub fn sha256_hash_hex(data: &[u8]) -> String {
    hex::encode(sha256_hash(data))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sha256_known_value() {
        // Test with known SHA-256 value
        let data = b"hello";
        let hash_hex = sha256_hash_hex(data);

        // SHA-256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
        assert_eq!(
            hash_hex,
            "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
        );
    }

    #[test]
    fn test_sha256_empty() {
        let data = b"";
        let hash_hex = sha256_hash_hex(data);

        // SHA-256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
        assert_eq!(
            hash_hex,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn test_sha256_deterministic() {
        let data = b"test data";
        let hash1 = sha256_hash(data);
        let hash2 = sha256_hash(data);

        assert_eq!(hash1, hash2);
    }

    #[test]
    fn test_sha256_different_inputs() {
        let hash1 = sha256_hash(b"data1");
        let hash2 = sha256_hash(b"data2");

        assert_ne!(hash1, hash2);
    }
}
