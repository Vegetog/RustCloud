// 加密服务：使用 Web Crypto API 实现客户端加密
// 这是实现零知识加密的核心模块

import type { EncryptedData, KeyPair, EncryptedDocument, DecryptedDocument } from '../types/crypto';

export class CryptoService {
  /**
   * 通过 PBKDF2 从密码派生主密钥
   * 注意：浏览器不支持 Argon2，故使用 PBKDF2 作为替代方案
   *
   * @param password - 用户密码
   * @param salt - 随机盐值（32 字节）
   * @returns 用于加密/解密的 AES-256-GCM CryptoKey
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
        iterations: 100000, // 100,000 次迭代（现代浏览器约耗时 300-500ms）
        hash: 'SHA-256',
      },
      passwordKey,
      { name: 'AES-GCM', length: 256 },
      true, // 可导出，用于会话持久化
      ['encrypt', 'decrypt']
    );
  }

  /**
   * 生成 RSA-2048 密钥对
   * 用于对文档密钥进行非对称加密
   *
   * @returns 包含公钥和私钥的 KeyPair
   */
  async generateKeyPair(): Promise<KeyPair> {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]), // 公钥指数 65537
        hash: 'SHA-256',
      },
      true, // 可导出
      ['encrypt', 'decrypt']
    );

    return {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
    };
  }

  /**
   * 使用主密钥加密私钥
   * 私钥以 PKCS8 格式导出后使用 AES-GCM 加密
   *
   * @param privateKey - 待加密的 RSA 私钥
   * @param masterKey - 从密码派生的主密钥
   * @returns 包含密文和随机数的加密数据
   */
  async encryptPrivateKey(
    privateKey: CryptoKey,
    masterKey: CryptoKey
  ): Promise<EncryptedData> {
    // 将私钥导出为 PKCS8 格式
    const exported = await crypto.subtle.exportKey('pkcs8', privateKey);

    // 生成随机随机数（AES-GCM 使用 12 字节）
    const nonce = crypto.getRandomValues(new Uint8Array(12));

    // 使用 AES-GCM 加密
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      masterKey,
      exported
    );

    return { ciphertext, nonce };
  }

  /**
   * 使用主密钥解密私钥
   *
   * @param encrypted - 已加密的私钥数据
   * @param masterKey - 从密码派生的主密钥
   * @returns 解密后的 RSA 私钥
   */
  async decryptPrivateKey(
    encrypted: EncryptedData,
    masterKey: CryptoKey
  ): Promise<CryptoKey> {
    // 使用 AES-GCM 解密
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: encrypted.nonce.buffer as ArrayBuffer },
      masterKey,
      encrypted.ciphertext
    );

    // 导入为 CryptoKey（extractable: true 用于会话持久化）
    return crypto.subtle.importKey(
      'pkcs8',
      decrypted,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      true, // 可导出，用于会话持久化
      ['decrypt']
    );
  }

  /**
   * 加密文档文件
   *
   * 处理流程：
   * 1. 生成随机文档密钥（DEK）
   * 2. 使用 DEK 加密文件内容
   * 3. 使用 DEK 加密文件名
   * 4. 计算内容哈希
   * 5. 使用用户公钥加密 DEK
   * 6. 清除内存中的 DEK
   *
   * @param file - 待加密的文件
   * @param publicKey - 用户的 RSA 公钥
   * @returns 加密后的文档数据
   */
  async encryptDocument(
    file: File,
    publicKey: CryptoKey
  ): Promise<EncryptedDocument> {
    // 1. 生成随机文档密钥（256 位）
    const documentKey = crypto.getRandomValues(new Uint8Array(32));

    // 2. 导入为 AES-GCM CryptoKey
    const aesKey = await crypto.subtle.importKey(
      'raw',
      documentKey,
      'AES-GCM',
      false,
      ['encrypt']
    );

    // 3. 读取文件内容
    const fileContent = await file.arrayBuffer();

    // 4. 加密文件内容
    const contentNonce = crypto.getRandomValues(new Uint8Array(12));
    const encryptedContent = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: contentNonce.buffer },
      aesKey,
      fileContent
    );

    // 5. 加密文件名
    const nameNonce = crypto.getRandomValues(new Uint8Array(12));
    const nameBytes = new TextEncoder().encode(file.name);
    const encryptedName = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nameNonce.buffer },
      aesKey,
      nameBytes
    );

    // 6. 使用公钥加密文档密钥
    const encryptedKey = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      publicKey,
      documentKey
    );

    // 7. 清除内存中的文档密钥
    documentKey.fill(0);

    return {
      encryptedContent,
      encryptedName: this.arrayBufferToBase64(encryptedName),
      nameNonce: this.arrayBufferToBase64(nameNonce.buffer),
      contentNonce: this.arrayBufferToBase64(contentNonce.buffer),
      encryptedKey: this.arrayBufferToBase64(encryptedKey),
    };
  }

  /**
   * 解密文档
   *
   * 处理流程：
   * 1. 使用私钥解密文档密钥
   * 2. 解密文件内容
   * 3. 解密文件名
   *
   * @param encryptedContent - 加密的文件内容
   * @param encryptedName - 加密的文件名（base64）
   * @param nameNonce - 文件名加密的随机数（base64）
   * @param contentNonce - 内容加密的随机数（base64）
   * @param encryptedKey - 加密的文档密钥（base64）
   * @param privateKey - 用户的 RSA 私钥
   * @returns 包含内容和文件名的解密文档
   */
  async decryptDocument(
    encryptedContent: ArrayBuffer,
    encryptedName: string,
    nameNonce: string,
    contentNonce: string,
    encryptedKey: string,
    privateKey: CryptoKey
  ): Promise<DecryptedDocument> {
    // 1. 使用 RSA 私钥解密文档密钥
    const encryptedKeyBuffer = this.base64ToArrayBuffer(encryptedKey);
    const documentKey = await crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      privateKey,
      encryptedKeyBuffer
    );

    // 2. 将文档密钥导入为 AES-GCM CryptoKey
    const aesKey = await crypto.subtle.importKey(
      'raw',
      documentKey,
      'AES-GCM',
      false,
      ['decrypt']
    );

    // 3. 解密文件内容
    const contentNonceBuffer = this.base64ToArrayBuffer(contentNonce);
    const content = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: contentNonceBuffer },
      aesKey,
      encryptedContent
    );

    // 4. 解密文件名
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
   * 为其他用户重加密文档密钥
   * 实现零知识密钥共享：文档密钥先用授权者私钥解密，再用被授权者公钥重新加密。
   * 服务器始终无法获得明文文档密钥。
   *
   * @param encryptedKey - 当前加密的文档密钥（base64）
   * @param grantorPrivateKey - 授权者的 RSA 私钥
   * @param granteePublicKeyBase64 - 被授权者的公钥（base64）
   * @returns 重新加密的文档密钥（base64）
   */
  async reEncryptDocumentKey(
    encryptedKey: string,
    grantorPrivateKey: CryptoKey,
    granteePublicKeyBase64: string
  ): Promise<string> {
    // 1. 使用授权者私钥解密文档密钥
    const encryptedKeyBuffer = this.base64ToArrayBuffer(encryptedKey);
    const dekBuffer = await crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      grantorPrivateKey,
      encryptedKeyBuffer
    );

    // 2. 导入被授权者的公钥
    const granteePublicKeyBuffer = this.base64ToArrayBuffer(granteePublicKeyBase64);
    const granteePublicKey = await crypto.subtle.importKey(
      'spki',
      granteePublicKeyBuffer,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['encrypt']
    );

    // 3. 使用被授权者公钥重新加密
    const reEncryptedKey = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      granteePublicKey,
      dekBuffer
    );

    // 4. 从内存中清除明文密钥（安全最佳实践）
    new Uint8Array(dekBuffer).fill(0);

    return this.arrayBufferToBase64(reEncryptedKey);
  }

  /**
   * 仅解密文件名（无需下载完整内容）
   *
   * @param encryptedName - 加密的文件名（base64）
   * @param nameNonce - 文件名加密的随机数（base64）
   * @param encryptedKey - 加密的文档密钥（base64）
   * @param privateKey - 用户的 RSA 私钥
   * @returns 解密后的文件名
   */
  async decryptFileName(
    encryptedName: string,
    nameNonce: string,
    encryptedKey: string,
    privateKey: CryptoKey
  ): Promise<string> {
    const encryptedKeyBuffer = this.base64ToArrayBuffer(encryptedKey);
    const documentKey = await crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      privateKey,
      encryptedKeyBuffer
    );

    const aesKey = await crypto.subtle.importKey(
      'raw',
      documentKey,
      'AES-GCM',
      false,
      ['decrypt']
    );

    const nameNonceBuffer = this.base64ToArrayBuffer(nameNonce);
    const nameBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(nameNonceBuffer) },
      aesKey,
      this.base64ToArrayBuffer(encryptedName)
    );

    return new TextDecoder().decode(nameBuffer);
  }

  /**
   * 使用 RSA-OAEP 公钥加密文件夹名
   * 文件夹名直接用 RSA 加密（不用 AES DEK），因为名称短（< 190 字节）
   *
   * @param name - 明文文件夹名
   * @param publicKey - 用户 RSA 公钥
   * @returns Base64 编码的密文
   */
  async rsaEncryptFolderName(name: string, publicKey: CryptoKey): Promise<string> {
    const nameBytes = new TextEncoder().encode(name);
    const encrypted = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      publicKey,
      nameBytes
    );
    return this.arrayBufferToBase64(encrypted);
  }

  /**
   * 使用 RSA-OAEP 私钥解密文件夹名
   *
   * @param encryptedName - Base64 编码的密文
   * @param privateKey - 用户 RSA 私钥
   * @returns 明文文件夹名
   */
  async rsaDecryptFolderName(encryptedName: string, privateKey: CryptoKey): Promise<string> {
    const encryptedBuffer = this.base64ToArrayBuffer(encryptedName);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      privateKey,
      encryptedBuffer
    );
    return new TextDecoder().decode(decrypted);
  }

  /**
   * 生成一次性 RSA-2048 临时密钥对（用于文件夹公开链接分享）
   * 公钥写入分享记录，私钥放 URL fragment，服务器永远不持有私钥
   */
  async generateEphemeralKeyPair(): Promise<{ publicKey: CryptoKey; privateKey: CryptoKey }> {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt']
    );
    return { publicKey: keyPair.publicKey, privateKey: keyPair.privateKey };
  }

  /**
   * 导出 RSA 公钥为 SPKI Base64
   */
  async exportPublicKeySPKI(key: CryptoKey): Promise<string> {
    const exported = await crypto.subtle.exportKey('spki', key);
    return this.arrayBufferToBase64(exported);
  }

  /**
   * 导出 RSA 私钥为 PKCS8 Base64
   */
  async exportPrivateKeyPKCS8(key: CryptoKey): Promise<string> {
    const exported = await crypto.subtle.exportKey('pkcs8', key);
    return this.arrayBufferToBase64(exported);
  }

  /**
   * 从 SPKI Base64 导入 RSA 公钥（encrypt）
   */
  async importPublicKeySPKI(base64: string): Promise<CryptoKey> {
    const buffer = this.base64ToArrayBuffer(base64);
    return crypto.subtle.importKey(
      'spki',
      buffer,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['encrypt']
    );
  }

  /**
   * 从 PKCS8 Base64 导入 RSA 私钥（decrypt）
   */
  async importPrivateKeyPKCS8(base64: string): Promise<CryptoKey> {
    const buffer = this.base64ToArrayBuffer(base64);
    return crypto.subtle.importKey(
      'pkcs8',
      buffer,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['decrypt']
    );
  }

  /**
   * 将 ArrayBuffer 转换为 Base64 字符串
   *
   * @param buffer - 待转换的 ArrayBuffer
   * @returns Base64 编码字符串
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
   * 将 Base64 字符串转换为 ArrayBuffer
   *
   * @param base64 - Base64 编码字符串
   * @returns ArrayBuffer
   */
  base64ToArrayBuffer(base64: string): ArrayBuffer {
    // 清理 base64 字符串：移除空白字符、换行符等
    const cleanBase64 = base64.replace(/\s/g, '');
    const binary = atob(cleanBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

// 导出单例
export const cryptoService = new CryptoService();
