//! 工具函数

pub fn generate_token() -> String {
    let bytes: [u8; 32] = rand::random();
    hex::encode(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_token() {
        let token = generate_token();
        assert_eq!(token.len(), 64); // 32 bytes = 64 hex chars
    }
}
