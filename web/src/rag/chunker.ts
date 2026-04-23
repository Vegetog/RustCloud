export interface Chunk {
  chunkId: string;
  content: string;
  startOffset: number;
  endOffset: number;
}

/**
 * 将文档文本切分为语义块，优先按段落切分，段落过长时用滑窗切分。
 * overlap 保证相邻块有内容重叠，避免跨块语义断裂。
 */
export function chunkText(text: string, options?: { size?: number; overlap?: number }): Chunk[] {
  const size = options?.size ?? 400;
  const overlap = options?.overlap ?? 50;
  if (!text.trim()) return [];

  // 第一步：段落拆分 + 超长段落滑窗预处理
  const rawParagraphs = text.split(/\n\s*\n/);
  const segments: Array<{ text: string; offset: number }> = [];
  let pos = 0;

  for (const para of rawParagraphs) {
    const trimmed = para.trim();
    if (trimmed) {
      if (trimmed.length > size) {
        // 超长段落：滑窗切分
        for (let i = 0; i < trimmed.length; i += size - overlap) {
          const slice = trimmed.slice(i, i + size);
          segments.push({ text: slice, offset: pos + i });
        }
      } else {
        segments.push({ text: trimmed, offset: pos });
      }
    }
    pos += para.length + 2; // +2 for \n\n separator (approximate)
  }

  // 第二步：合并小段落到 size 以内，形成最终 chunks
  const chunks: Chunk[] = [];
  let buf = '';
  let bufStart = 0;

  const flush = () => {
    const trimmed = buf.trim();
    if (trimmed) {
      chunks.push({
        chunkId: `chunk-${chunks.length}`,
        content: trimmed,
        startOffset: bufStart,
        endOffset: bufStart + buf.length,
      });
    }
    buf = '';
  };

  for (const seg of segments) {
    const sep = buf ? '\n\n' : '';
    if (buf && buf.length + sep.length + seg.text.length > size) {
      flush();
      bufStart = seg.offset;
      buf = seg.text;
    } else {
      if (!buf) bufStart = seg.offset;
      buf += sep + seg.text;
    }
  }
  flush();

  return chunks;
}

/*
 * 手动验证步骤：
 * 1. import { chunkText } from './chunker'; 在浏览器 console 执行
 * 2. chunkText("段落一\n\n段落二\n\n段落三") 应返回 1-2 个 chunks
 * 3. chunkText("a".repeat(1000)) 应返回多个 chunks，每个不超过 size
 */
