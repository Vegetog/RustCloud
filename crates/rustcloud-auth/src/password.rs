//! Password validation and hashing

use rustcloud_core::error::Result;

use crate::types::{PasswordError, PasswordValidation};

/// Validate password strength
///
/// Requirements:
/// - At least `min_length` characters (default: 8)
/// - At least one uppercase letter [A-Z]
/// - At least one lowercase letter [a-z]
/// - At least one digit [0-9]
pub fn validate_password_strength(password: &str, min_length: usize) -> PasswordValidation {
    let mut errors = Vec::new();

    // Check length
    if password.len() < min_length {
        errors.push(PasswordError::TooShort {
            min: min_length,
            actual: password.len(),
        });
    }

    // Check for uppercase letter
    if !password.chars().any(|c| c.is_ascii_uppercase()) {
        errors.push(PasswordError::MissingUppercase);
    }

    // Check for lowercase letter
    if !password.chars().any(|c| c.is_ascii_lowercase()) {
        errors.push(PasswordError::MissingLowercase);
    }

    // Check for digit
    if !password.chars().any(|c| c.is_ascii_digit()) {
        errors.push(PasswordError::MissingDigit);
    }

    PasswordValidation {
        is_valid: errors.is_empty(),
        errors,
    }
}

/// Hash password using Argon2id (re-export from rustcloud-crypto)
pub fn create_password_hash(password: &str) -> Result<String> {
    rustcloud_crypto::hash_password(password)
}

/// Verify password against hash (re-export from rustcloud-crypto)
pub fn check_password(password: &str, hash: &str) -> Result<bool> {
    rustcloud_crypto::verify_password(password, hash)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_password() {
        let result = validate_password_strength("SecurePass1", 8);
        assert!(result.is_valid);
        assert!(result.errors.is_empty());
    }

    #[test]
    fn test_password_too_short() {
        let result = validate_password_strength("Short1", 8);
        assert!(!result.is_valid);
        assert!(result
            .errors
            .contains(&PasswordError::TooShort { min: 8, actual: 6 }));
    }

    #[test]
    fn test_password_missing_uppercase() {
        let result = validate_password_strength("lowercase1", 8);
        assert!(!result.is_valid);
        assert!(result.errors.contains(&PasswordError::MissingUppercase));
    }

    #[test]
    fn test_password_missing_lowercase() {
        let result = validate_password_strength("UPPERCASE1", 8);
        assert!(!result.is_valid);
        assert!(result.errors.contains(&PasswordError::MissingLowercase));
    }

    #[test]
    fn test_password_missing_digit() {
        let result = validate_password_strength("NoDigits", 8);
        assert!(!result.is_valid);
        assert!(result.errors.contains(&PasswordError::MissingDigit));
    }

    #[test]
    fn test_password_multiple_errors() {
        let result = validate_password_strength("short", 8);
        assert!(!result.is_valid);
        // Should have: TooShort, MissingUppercase, MissingDigit
        assert_eq!(result.errors.len(), 3);
    }

    #[test]
    fn test_password_hash_and_verify() {
        let password = "SecurePass123";
        let hash = create_password_hash(password).unwrap();

        // Correct password should verify
        assert!(check_password(password, &hash).unwrap());

        // Wrong password should not verify
        assert!(!check_password("WrongPass123", &hash).unwrap());
    }

    #[test]
    fn test_error_message() {
        let result = validate_password_strength("ab", 8);
        let msg = result.error_message();
        assert!(msg.contains("at least 8 characters"));
        assert!(msg.contains("uppercase"));
        assert!(msg.contains("digit"));
    }
}
