/**
 * RAG 集成入口：对外暴露文档保存/删除钩子和手动重建接口。
 * 由 DocumentEditorModal 在保存成功后调用 onDocumentSaved。
 */

import { indexDocument } from './searchEngine';
import { deleteDoc, clearAll } from './vectorStore';
import { apiService } from '../services/api';
import { CryptoService } from '../services/crypto';
import { useAuthStore } from '../stores/authStore';

// 每个 docId 独立防抖，避免快速多次保存重复索引
const debounceHandles = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 30_000; // 30 秒

/**
 * 文档保存后调用。内部防抖 30 秒，同一文档 30 秒内多次保存只触发一次索引。
 * 异步 fire-and-forget，不阻塞保存流程。
 */
export function onDocumentSaved(
  docId: string,
  title: string,
  fullText: string,
  masterKey: CryptoKey
): void {
  const existing = debounceHandles.get(docId);
  if (existing) clearTimeout(existing);

  const handle = setTimeout(async () => {
    debounceHandles.delete(docId);
    try {
      await indexDocument(docId, title, fullText, masterKey);
    } catch (e) {
      console.warn('[RAG] 文档索引失败，下次保存时重试：', e);
    }
  }, DEBOUNCE_MS);

  debounceHandles.set(docId, handle);
}

/** 文档删除后调用，从向量库移除对应 chunks */
export async function onDocumentDeleted(docId: string): Promise<void> {
  try {
    await deleteDoc(docId);
  } catch (e) {
    console.warn('[RAG] 向量索引清除失败：', e);
  }
}

/**
 * 手动重建所有文档的向量索引。
 * 用于首次部署或索引损坏时调用。
 * 需要用户已登录（privateKey + masterKey 可用）。
 */
export async function rebuildAllIndexes(
  onProgress?: (current: number, total: number, title: string) => void
): Promise<void> {
  const { privateKey, masterKey } = useAuthStore.getState();
  if (!privateKey || !masterKey) {
    throw new Error('请先登录后再重建索引');
  }

  const crypto = new CryptoService();

  // 获取文档列表（最多取 200 篇，够用）
  const listResp = await apiService.getDocuments({ page: 1, page_size: 200 });
  const documents = listResp.data.data.documents;
  if (!documents.length) return;

  // 重建前清空旧索引
  await clearAll();

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    let title = doc.decrypted_name ?? doc.encrypted_name;

    try {
      // 解密标题
      if (doc.encrypted_name && doc.name_nonce && doc.encrypted_key) {
        title = await crypto.decryptFileName(
          doc.encrypted_name,
          doc.name_nonce,
          doc.encrypted_key,
          privateKey
        );
      }

      onProgress?.(i + 1, documents.length, title);

      // 下载并解密内容
      const detailResp = await apiService.getDocumentDetail(doc.id);
      const detail = detailResp.data.data;

      if (!detail.document.content_nonce) continue; // 旧文件跳过

      const contentResp = await apiService.downloadDocument(doc.id);
      const decrypted = await crypto.decryptDocument(
        contentResp.data as ArrayBuffer,
        detail.document.encrypted_name,
        detail.document.name_nonce,
        detail.document.content_nonce,
        detail.encrypted_key,
        privateKey
      );

      const fullText = new TextDecoder().decode(decrypted.content);
      await indexDocument(doc.id, title, fullText, masterKey);
    } catch (e) {
      console.warn(`[RAG] 文档 ${doc.id} (${title}) 索引失败，已跳过：`, e);
    }
  }
}

/*
 * 手动验证步骤：
 * 1. 触发首次索引：在 DevTools console 执行
 *    import('/src/rag/ragIntegration.ts').then(m => m.rebuildAllIndexes(console.log))
 * 2. 保存一篇文档后等 30 秒，观察 IndexedDB 中出现新 chunks
 * 3. 删除文档后调用 onDocumentDeleted(docId)，IndexedDB 对应记录消失
 */
