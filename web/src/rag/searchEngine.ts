/**
 * 搜索核心：文档索引 + 语义检索。
 * 所有操作在客户端完成，服务端只收到密文。
 */

import { chunkText } from './chunker';
import { embed } from './embedding';
import { putDocChunks, getAllEntries, deleteDoc, deriveVectorIndexKey } from './vectorStore';
import { rewriteQuery } from './queryRewriter';

export interface SearchConfig {
  apiKey: string;
  endpointId: string;
  topN?: number;
}

export interface SearchResult {
  docId: string;
  title: string;
  score: number;
  preview: string;       // 命中 chunk 原文前 200 字
  previewChunkId: string;
}

/** 计算两个归一化向量的余弦相似度 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * 索引单篇文档：分块 → embedding → 加密写入 IndexedDB。
 * 整篇重建，不做增量更新。
 * @param onProgress 可选进度回调，参数为 0-100 百分比
 */
export async function indexDocument(
  docId: string,
  title: string,
  fullText: string,
  masterKey: CryptoKey,
  onProgress?: (pct: number) => void
): Promise<void> {
  const vectorKey = await deriveVectorIndexKey(masterKey);
  const chunks = chunkText(fullText);

  if (chunks.length === 0) {
    // 内容为空时清除旧索引
    await deleteDoc(docId);
    return;
  }

  const entries: Array<{ chunkId: string; vector: Float32Array; content: string }> = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const vector = await embed(chunk.content);
    entries.push({ chunkId: chunk.chunkId, vector, content: chunk.content });
    onProgress?.(Math.round(((i + 1) / chunks.length) * 100));
  }

  await putDocChunks(docId, title, entries, vectorKey);
}

/**
 * 语义搜索：查询改写 → 多向量检索 → 按文档聚合 → 排序返回 topN。
 */
export async function search(
  query: string,
  masterKey: CryptoKey,
  config: SearchConfig
): Promise<SearchResult[]> {
  const topN = config.topN ?? 10;
  const vectorKey = await deriveVectorIndexKey(masterKey);

  // 1. 查询改写（失败时降级为原始 query）
  const queries = await rewriteQuery(query, config.apiKey, config.endpointId);

  // 2. 对每个查询词组生成 embedding
  const queryVectors = await Promise.all(queries.map(q => embed(q)));

  // 3. 读出所有解密后的 entries
  const entries = await getAllEntries(vectorKey);
  if (entries.length === 0) return [];

  // 4. 计算每个 entry 的最高相似度（取所有 query 向量的 max）
  const scored = entries.map(entry => {
    const score = queryVectors.reduce(
      (best, qv) => Math.max(best, cosineSimilarity(qv, entry.vector)),
      0
    );
    return { ...entry, score };
  });

  // 5. 按 docId 聚合：每篇文档取最高分 chunk
  const docMap = new Map<string, { title: string; score: number; preview: string; chunkId: string }>();

  for (const e of scored) {
    const existing = docMap.get(e.docId);
    if (!existing || e.score > existing.score) {
      docMap.set(e.docId, {
        title: e.title,
        score: e.score,
        preview: e.content.slice(0, 200),
        chunkId: e.chunkId,
      });
    }
  }

  // 6. 排序取 topN
  return Array.from(docMap.entries())
    .map(([docId, val]) => ({
      docId,
      title: val.title,
      score: val.score,
      preview: val.preview,
      previewChunkId: val.chunkId,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

/*
 * 手动验证步骤：
 * 1. 建 3 篇主题不同的文档，触发 indexDocument
 * 2. search("Redis 分布式锁") 应返回含 Redis 内容的文档排第一
 * 3. DevTools → Network：只看到 /ark-proxy/ 请求，无其他外部请求
 * 4. 故意删除一篇文档并调用 deleteDoc(docId)，再 search，该文档不再出现
 */
