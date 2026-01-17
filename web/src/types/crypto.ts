// Crypto-related TypeScript type definitions

export interface EncryptedData {
  ciphertext: ArrayBuffer;
  nonce: Uint8Array; // 12 bytes for AES-GCM
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
  contentHash: string; // hex
  encryptedKey: string; // base64 (RSA encrypted)
}

export interface DecryptedDocument {
  content: ArrayBuffer;
  fileName: string;
}
