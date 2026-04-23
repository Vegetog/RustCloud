/**
 * 加密向量存储：使用 IndexedDB 存储所有文档的 chunks。
 *
 * 安全说明：
 * - encryptedVector / encryptedContent / encryptedTitle 使用 AES-256-GCM 加密，
 *   密钥由用户 masterKey 通过 HKDF 派生（标签 "rag-vector-index-v1"），服务端无法解密。
 * - docId 以明文存储，是唯一的隐私权衡：服务端（或恶意访问 IndexedDB 的脚本）
 *   可得知用户曾索引过某个文档 ID，但无法获得文档标题、内容或向量。
 *   可接受：docId 是随机 UUID，本身不含语义信息。
 */

const DB_NAME = 'rustcloud-rag-v1';
const STORE_NAME = 'chunks';
const DB_VERSION = 1;

export interface VectorEntry {
  id?: number;
  docId: string;        // 明文，用于过滤/聚合
  chunkId: string;      // 明文
  encryptedVector: ArrayBuffer;
  encryptedContent: ArrayBuffer;
  encryptedTitle: ArrayBuffer;
}

export interface DecryptedEntry {
  docId: string;
  chunkId: string;
  vector: Float32Array;
  content: string;
  title: string;
}

// ── IndexedDB helpers ──────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('docId', 'docId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── 加密工具（AES-GCM，nonce 前置） ─────────────────────────────────────

async function encrypt(data: ArrayBuffer, key: CryptoKey): Promise<ArrayBuffer> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, data);
  const result = new Uint8Array(12 + cipher.byteLength);
  result.set(nonce, 0);
  result.set(new Uint8Array(cipher), 12);
  return result.buffer;
}

async function decrypt(data: ArrayBuffer, key: CryptoKey): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(data);
  const nonce = bytes.slice(0, 12);
  const cipher = bytes.slice(12);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, cipher);
}

// ── 向量索引密钥派生 ────────────────────────────────────────────────────

/**
 * 从登录 masterKey 派生专用向量索引密钥（HKDF SHA-256）。
 * 与文档 DEK 完全独立，不影响现有加密体系。
 */
export async function deriveVectorIndexKey(masterKey: CryptoKey): Promise<CryptoKey> {
  const raw = await crypto.subtle.exportKey('raw', masterKey);
  const material = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32), // 固定零盐，确保确定性派生
      info: new TextEncoder().encode('rag-vector-index-v1'),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ── 公共接口 ─────────────────────────────────────────────────────────────

/** 写入文档的所有 chunks（先清除该文档旧记录） */
export async function putDocChunks(
  docId: string,
  title: string,
  entries: Array<{ chunkId: string; vector: Float32Array; content: string }>,
  key: CryptoKey
): Promise<void> {
  const db = await openDB();
  await deleteDoc(docId, db);

  const enc = new TextEncoder();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  const encTitle = await encrypt(enc.encode(title).buffer as ArrayBuffer, key);

  for (const e of entries) {
    const encVector = await encrypt(e.vector.buffer as ArrayBuffer, key);
    const encContent = await encrypt(enc.encode(e.content).buffer as ArrayBuffer, key);
    const row: VectorEntry = {
      docId,
      chunkId: e.chunkId,
      encryptedVector: encVector,
      encryptedContent: encContent,
      encryptedTitle: encTitle,
    };
    store.add(row);
  }

  await new Promise<void>((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

/** 读出并解密所有 entries（跨文档） */
export async function getAllEntries(key: CryptoKey): Promise<DecryptedEntry[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);

  const rows = await new Promise<VectorEntry[]>((res, rej) => {
    const req = store.getAll();
    req.onsuccess = () => res(req.result as VectorEntry[]);
    req.onerror = () => rej(req.error);
  });

  const dec = new TextDecoder();
  const results: DecryptedEntry[] = [];
  for (const row of rows) {
    try {
      const vecBuf = await decrypt(row.encryptedVector, key);
      const contentBuf = await decrypt(row.encryptedContent, key);
      const titleBuf = await decrypt(row.encryptedTitle, key);
      results.push({
        docId: row.docId,
        chunkId: row.chunkId,
        vector: new Float32Array(vecBuf),
        content: dec.decode(contentBuf),
        title: dec.decode(titleBuf),
      });
    } catch {
      // 单条解密失败不阻断整体搜索
    }
  }
  return results;
}

/** 删除指定文档的所有 chunks */
export async function deleteDoc(docId: string, db?: IDBDatabase): Promise<void> {
  const database = db ?? (await openDB());
  const tx = database.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const index = store.index('docId');

  await new Promise<void>((res, rej) => {
    const req = index.getAllKeys(docId);
    req.onsuccess = () => {
      for (const key of req.result) store.delete(key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    };
    req.onerror = () => rej(req.error);
  });
}

/** 清空整个向量库 */
export async function clearAll(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).clear();
  await new Promise<void>((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

/*
 * 手动验证步骤：
 * 1. DevTools → Application → IndexedDB → rustcloud-rag-v1 → chunks
 * 2. 索引后应看到 encryptedVector / encryptedContent / encryptedTitle 均为 Blob（密文）
 * 3. docId 字段可见，但内容无语义
 * 4. 登出后重新登录，getAllEntries 仍能正常解密（密钥确定性派生）
 */
