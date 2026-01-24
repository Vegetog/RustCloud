// CryptoService: Client-side encryption using Web Crypto API
// This is the core module that implements zero-knowledge encryption

import type { EncryptedData, KeyPair, EncryptedDocument, DecryptedDocument } from '../types/crypto';

export class CryptoService {
  /**
   * Derive master key from password using PBKDF2
   * Note: Browsers don't support Argon2, so we use PBKDF2 as an alternative
   *
   * @param password - User's password
   * @param salt - Random salt (32 bytes)
   * @returns AES-256-GCM CryptoKey for encrypting/decrypting
   */
  async deriveMasterKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt.buffer as ArrayBuffer,
        iterations: 100000, // 100,000 iterations (~300-500ms on modern browsers)
        hash: 'SHA-256',
      },
      passwordKey,
      { name: 'AES-GCM', length: 256 },
      true, // Exportable for session persistence
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Generate RSA-2048 key pair
   * Used for asymmetric encryption of document keys
   *
   * @returns KeyPair with public and private CryptoKeys
   */
  async generateKeyPair(): Promise<KeyPair> {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]), // 65537
        hash: 'SHA-256',
      },
      true, // Exportable
      ['encrypt', 'decrypt']
    );

    return {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
    };
  }

  /**
   * Encrypt private key with master key
   * The private key is exported to PKCS8 format and encrypted with AES-GCM
   *
   * @param privateKey - RSA private key to encrypt
   * @param masterKey - Master key derived from password
   * @returns Encrypted data with ciphertext and nonce
   */
  async encryptPrivateKey(
    privateKey: CryptoKey,
    masterKey: CryptoKey
  ): Promise<EncryptedData> {
    // Export private key to PKCS8 format
    const exported = await crypto.subtle.exportKey('pkcs8', privateKey);

    // Generate random nonce (12 bytes for AES-GCM)
    const nonce = crypto.getRandomValues(new Uint8Array(12));

    // Encrypt with AES-GCM
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      masterKey,
      exported
    );

    return { ciphertext, nonce };
  }

  /**
   * Decrypt private key with master key
   *
   * @param encrypted - Encrypted private key data
   * @param masterKey - Master key derived from password
   * @returns Decrypted RSA private key
   */
  async decryptPrivateKey(
    encrypted: EncryptedData,
    masterKey: CryptoKey
  ): Promise<CryptoKey> {
    // Decrypt with AES-GCM
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: encrypted.nonce.buffer as ArrayBuffer },
      masterKey,
      encrypted.ciphertext
    );

    // Import as CryptoKey (extractable: true for session persistence)
    return crypto.subtle.importKey(
      'pkcs8',
      decrypted,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      true, // Exportable for session persistence
      ['decrypt']
    );
  }

  /**
   * Encrypt a document file
   *
   * Process:
   * 1. Generate random document key (DEK)
   * 2. Encrypt file content with DEK
   * 3. Encrypt file name with DEK
   * 4. Calculate content hash
   * 5. Encrypt DEK with user's public key
   * 6. Clear DEK from memory
   *
   * @param file - File to encrypt
   * @param publicKey - User's RSA public key
   * @returns Encrypted document data
   */
  async encryptDocument(
    file: File,
    publicKey: CryptoKey
  ): Promise<EncryptedDocument> {
    // 1. Generate random document key (256 bits)
    const documentKey = crypto.getRandomValues(new Uint8Array(32));

    // 2. Import as AES-GCM CryptoKey
    const aesKey = await crypto.subtle.importKey(
      'raw',
      documentKey,
      'AES-GCM',
      false,
      ['encrypt']
    );

    // 3. Read file content
    const fileContent = await file.arrayBuffer();

    // 4. Encrypt file content
    const contentNonce = crypto.getRandomValues(new Uint8Array(12));
    const encryptedContent = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: contentNonce.buffer },
      aesKey,
      fileContent
    );

    // 5. Encrypt file name
    const nameNonce = crypto.getRandomValues(new Uint8Array(12));
    const nameBytes = new TextEncoder().encode(file.name);
    const encryptedName = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nameNonce.buffer },
      aesKey,
      nameBytes
    );

    // 6. Calculate content hash (SHA-256 of encrypted content)
    const hashBuffer = await crypto.subtle.digest('SHA-256', encryptedContent);
    const contentHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // 7. Encrypt document key with public key
    const encryptedKey = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      publicKey,
      documentKey
    );

    // 8. Clear document key from memory
    documentKey.fill(0);

    return {
      encryptedContent,
      encryptedName: this.arrayBufferToBase64(encryptedName),
      nameNonce: this.arrayBufferToBase64(nameNonce.buffer),
      contentNonce: this.arrayBufferToBase64(contentNonce.buffer),
      contentHash,
      encryptedKey: this.arrayBufferToBase64(encryptedKey),
    };
  }

  /**
   * Decrypt a document
   *
   * Process:
   * 1. Decrypt document key with private key
   * 2. Decrypt file content
   * 3. Decrypt file name
   *
   * @param encryptedContent - Encrypted file content
   * @param encryptedName - Encrypted file name (base64)
   * @param nameNonce - Nonce for name encryption (base64)
   * @param contentNonce - Nonce for content encryption (base64)
   * @param encryptedKey - Encrypted document key (base64)
   * @param privateKey - User's RSA private key
   * @returns Decrypted document with content and file name
   */
  async decryptDocument(
    encryptedContent: ArrayBuffer,
    encryptedName: string,
    nameNonce: string,
    contentNonce: string,
    encryptedKey: string,
    privateKey: CryptoKey
  ): Promise<DecryptedDocument> {
    // 1. Decrypt document key with RSA private key
    const encryptedKeyBuffer = this.base64ToArrayBuffer(encryptedKey);
    const documentKey = await crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      privateKey,
      encryptedKeyBuffer
    );

    // 2. Import document key as AES-GCM CryptoKey
    const aesKey = await crypto.subtle.importKey(
      'raw',
      documentKey,
      'AES-GCM',
      false,
      ['decrypt']
    );

    // 3. Decrypt file content
    const contentNonceBuffer = this.base64ToArrayBuffer(contentNonce);
    const content = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: contentNonceBuffer },
      aesKey,
      encryptedContent
    );

    // 4. Decrypt file name
    const nameNonceBuffer = this.base64ToArrayBuffer(nameNonce);
    const nameBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(nameNonceBuffer) },
      aesKey,
      this.base64ToArrayBuffer(encryptedName)
    );
    const fileName = new TextDecoder().decode(nameBuffer);

    return { content, fileName };
  }

  /**
   * Re-encrypt document key for another user
   * This enables zero-knowledge key sharing: the document key is decrypted
   * with the grantor's private key, then re-encrypted with the grantee's public key.
   * The server never sees the plaintext document key.
   *
   * @param encryptedKey - Current encrypted document key (base64)
   * @param grantorPrivateKey - Grantor's RSA private key
   * @param granteePublicKeyBase64 - Grantee's public key (base64)
   * @returns Re-encrypted document key (base64)
   */
  async reEncryptDocumentKey(
    encryptedKey: string,
    grantorPrivateKey: CryptoKey,
    granteePublicKeyBase64: string
  ): Promise<string> {
    // 1. Decrypt document key with grantor's private key
    const encryptedKeyBuffer = this.base64ToArrayBuffer(encryptedKey);
    const dekBuffer = await crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      grantorPrivateKey,
      encryptedKeyBuffer
    );

    // 2. Import grantee's public key
    const granteePublicKeyBuffer = this.base64ToArrayBuffer(granteePublicKeyBase64);
    const granteePublicKey = await crypto.subtle.importKey(
      'spki',
      granteePublicKeyBuffer,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['encrypt']
    );

    // 3. Re-encrypt with grantee's public key
    const reEncryptedKey = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      granteePublicKey,
      dekBuffer
    );

    // 4. Clear plaintext key from memory (security best practice)
    new Uint8Array(dekBuffer).fill(0);

    return this.arrayBufferToBase64(reEncryptedKey);
  }

  /**
   * Convert ArrayBuffer to Base64 string
   *
   * @param buffer - ArrayBuffer to convert
   * @returns Base64 encoded string
   */
  arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert Base64 string to ArrayBuffer
   *
   * @param base64 - Base64 encoded string
   * @returns ArrayBuffer
   */
  base64ToArrayBuffer(base64: string): ArrayBuffer {
    // Clean the base64 string: remove whitespace, newlines, etc.
    const cleanBase64 = base64.replace(/\s/g, '');
    const binary = atob(cleanBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

// Export singleton instance
export const cryptoService = new CryptoService();
