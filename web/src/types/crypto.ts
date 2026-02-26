// 加密相关的 TypeScript 类型定义

export interface EncryptedData {
  ciphertext: ArrayBuffer;
  nonce: Uint8Array; // AES-GCM 使用 12 字节
}

export interface KeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export interface EncryptedDocument {
  encryptedContent: ArrayBuffer;
  encryptedName: string; // base64
  nameNonce: string; // base64
  contentNonce: string; // base64
  encryptedKey: string; // base64 (RSA encrypted)
}

export interface DecryptedDocument {
  content: ArrayBuffer;
  fileName: string;
}
