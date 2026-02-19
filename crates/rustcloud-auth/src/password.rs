//! 密码验证与哈希

use rustcloud_core::error::Result;

use crate::types::{PasswordError, PasswordValidation};

/// 验证密码强度
///
/// 要求：
/// - 至少 `min_length` 个字符（默认：8）
/// - 至少一个大写字母 [A-Z]
/// - 至少一个小写字母 [a-z]
/// - 至少一个数字 [0-9]
pub fn validate_password_strength(password: &str, min_length: usize) -> PasswordValidation {
    let mut errors = Vec::new();

    // 检查长度
    if password.len() < min_length {
        errors.push(PasswordError::TooShort {
            min: min_length,
            actual: password.len(),
        });
    }

    // 检查是否含大写字母
    if !password.chars().any(|c| c.is_ascii_uppercase()) {
        errors.push(PasswordError::MissingUppercase);
    }

    // 检查是否含小写字母
    if !password.chars().any(|c| c.is_ascii_lowercase()) {
        errors.push(PasswordError::MissingLowercase);
    }

    // 检查是否含数字
    if !password.chars().any(|c| c.is_ascii_digit()) {
        errors.push(PasswordError::MissingDigit);
    }

    PasswordValidation {
        is_valid: errors.is_empty(),
        errors,
    }
}

/// 使用 Argon2id 对密码进行哈希（从 rustcloud-crypto 重新导出）
pub fn create_password_hash(password: &str) -> Result<String> {
    rustcloud_crypto::hash_password(password)
}

/// 验证密码与哈希是否匹配（从 rustcloud-crypto 重新导出）
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
        // 应包含：TooShort、MissingUppercase、MissingDigit
        assert_eq!(result.errors.len(), 3);
    }

    #[test]
    fn test_password_hash_and_verify() {
        let password = "SecurePass123";
        let hash = create_password_hash(password).unwrap();

        // 正确密码应通过验证
        assert!(check_password(password, &hash).unwrap());

        // 错误密码不应通过验证
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
