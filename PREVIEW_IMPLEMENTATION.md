# 文档预览功能实现示例

## 完整的 PreviewModal 组件

```typescript
// web/src/components/PreviewModal.tsx
import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { apiService } from '../services/api';
import { cryptoService } from '../services/crypto';
import { useAuthStore } from '../stores/authStore';

interface PreviewModalProps {
  documentId: string;
  fileName: string;
  mimeType: string;
  encryptedKey: string;
  encryptedName: string;
  nameNonce: string;
  contentNonce: string;
  onClose: () => void;
}

export function PreviewModal({
  documentId,
  fileName,
  mimeType,
  encryptedKey,
  encryptedName,
  nameNonce,
  contentNonce,
  onClose,
}: PreviewModalProps) {
  const { privateKey } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);

  useEffect(() => {
    if (!privateKey) {
      setError('未找到解密密钥');
      setLoading(false);
      return;
    }

    async function loadPreview() {
      try {
        setLoading(true);
        setError(null);

        // 1. 下载加密文件
        const response = await apiService.downloadDocument(documentId);
        console.log('Downloaded encrypted file, size:', response.data.byteLength);

        // 2. 客户端解密
        const { content } = await cryptoService.decryptDocument(
          response.data,
          encryptedName,
          nameNonce,
          contentNonce,
          encryptedKey,
          privateKey
        );
        console.log('Decrypted file, size:', content.byteLength);

        // 3. 根据类型处理
        if (mimeType.startsWith('text/')) {
          // 文本文件：直接解码为字符串
          const text = new TextDecoder('utf-8').decode(content);
          setTextContent(text);
        } else {
          // 二进制文件：创建 Blob URL
          const blob = new Blob([content], { type: mimeType });
          const url = URL.createObjectURL(blob);
          setPreviewUrl(url);
          console.log('Created Blob URL:', url);
        }

        setLoading(false);
      } catch (err: any) {
        console.error('Preview failed:', err);
        setError(err.message || '预览失败');
        setLoading(false);
      }
    }

    loadPreview();

    // 清理：组件卸载时释放 Blob URL
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        console.log('Revoked Blob URL');
      }
    };
  }, [documentId]);

  const renderPreview = () => {
    // 图片
    if (mimeType.startsWith('image/')) {
      return (
        <img
          src={previewUrl!}
          alt={fileName}
          className="max-w-full max-h-full object-contain"
        />
      );
    }

    // PDF
    if (mimeType === 'application/pdf') {
      return (
        <iframe
          src={previewUrl!}
          className="w-full h-full border-none"
          title={fileName}
        />
      );
    }

    // 视频
    if (mimeType.startsWith('video/')) {
      return (
        <video
          src={previewUrl!}
          controls
          className="max-w-full max-h-full"
        >
          您的浏览器不支持视频预览
        </video>
      );
    }

    // 音频
    if (mimeType.startsWith('audio/')) {
      return (
        <div className="flex flex-col items-center space-y-4">
          <div className="text-2xl">🎵</div>
          <audio src={previewUrl!} controls className="w-full max-w-md" />
        </div>
      );
    }

    // 文本
    if (textContent) {
      return (
        <pre className="text-sm text-slate-900 whitespace-pre-wrap font-mono bg-slate-50 p-4 rounded-lg overflow-auto max-h-full">
          {textContent}
        </pre>
      );
    }

    return (
      <div className="text-slate-500">
        暂不支持预览此文件类型：{mimeType}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full h-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <div className="flex items-center space-x-3">
            <div className="text-lg font-semibold text-slate-900 truncate">
              {fileName}
            </div>
            <div className="text-sm text-slate-500">{mimeType}</div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-4">
          {loading ? (
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              <div className="text-sm text-slate-600">正在解密并加载预览...</div>
            </div>
          ) : error ? (
            <div className="text-center">
              <div className="text-red-600 text-lg mb-2">❌</div>
              <div className="text-sm text-red-600">{error}</div>
            </div>
          ) : (
            renderPreview()
          )}
        </div>
      </div>
    </div>
  );
}
```

## 在 DocumentsPage 中集成

```typescript
// web/src/pages/DocumentsPage.tsx

// 1. 添加状态
const [previewDocument, setPreviewDocument] = useState<Document | null>(null);

// 2. 添加预览处理函数
const handlePreview = (doc: Document) => {
  setPreviewDocument(doc);
};

// 3. 在文档操作菜单中添加预览按钮
<button
  onClick={() => handlePreview(doc)}
  className="flex items-center space-x-2 px-3 py-2 hover:bg-slate-100 rounded-lg"
>
  <Eye className="w-4 h-4" />
  <span>预览</span>
</button>

// 4. 渲染预览模态框
{previewDocument && (
  <PreviewModal
    documentId={previewDocument.id}
    fileName={previewDocument.encrypted_name}
    mimeType={previewDocument.mime_type}
    encryptedKey={previewDocument.encrypted_key}
    encryptedName={previewDocument.encrypted_name}
    nameNonce={previewDocument.name_nonce}
    contentNonce={previewDocument.content_nonce}
    onClose={() => setPreviewDocument(null)}
  />
)}
```

## 安全性说明

### ✅ 保持零知识架构

1. **服务器永远看不到明文**
   - MinIO 只存储加密数据
   - 网络传输的是加密数据
   - API 服务器无法解密

2. **客户端解密**
   - 使用用户的私钥解密
   - 解密过程在浏览器内存中完成
   - 明文只存在于 JavaScript 内存

3. **Blob URL 的临时性**
   - 只在当前页面会话中有效
   - 关闭预览后立即失效
   - 不会保存到磁盘或缓存

4. **内存清理**
   ```typescript
   // 组件卸载时清理
   useEffect(() => {
     return () => {
       if (previewUrl) URL.revokeObjectURL(previewUrl);
       // 浏览器会回收 Blob 对象占用的内存
     };
   }, []);
   ```

### 🔒 安全验证

可以通过以下方式验证安全性：

1. **网络抓包**
   ```bash
   # 使用 Chrome DevTools → Network
   # 查看 /documents/:id/download 响应
   # 应该看到的是二进制乱码，无法识别内容
   ```

2. **服务器日志**
   ```bash
   # 服务器只记录文件 ID 和大小
   # 不记录文件内容或明文信息
   ```

3. **浏览器存储检查**
   ```javascript
   // Chrome DevTools → Application
   // 检查 IndexedDB, LocalStorage, SessionStorage
   // 不应该有任何明文内容
   ```

## 支持的文件类型

| 类型 | MIME | 预览方式 | 依赖 |
|------|------|---------|------|
| JPEG | image/jpeg | `<img>` | 原生 |
| PNG | image/png | `<img>` | 原生 |
| GIF | image/gif | `<img>` | 原生 |
| PDF | application/pdf | `<iframe>` | 原生 |
| TXT | text/plain | `<pre>` | 原生 |
| MP4 | video/mp4 | `<video>` | 原生 |
| MP3 | audio/mpeg | `<audio>` | 原生 |
| Markdown | text/markdown | 渲染后显示 | 需要 `marked` 库 |
| 代码文件 | text/* | 语法高亮 | 需要 `highlight.js` |

## 高级功能扩展

### 1. PDF 增强预览

```bash
npm install react-pdf pdfjs-dist
```

```typescript
import { Document, Page } from 'react-pdf';

// 支持翻页、缩放、搜索
<Document file={previewUrl}>
  <Page pageNumber={pageNumber} scale={scale} />
</Document>
```

### 2. 代码文件语法高亮

```bash
npm install react-syntax-highlighter
```

```typescript
import SyntaxHighlighter from 'react-syntax-highlighter';

<SyntaxHighlighter language="javascript">
  {textContent}
</SyntaxHighlighter>
```

### 3. Markdown 渲染

```bash
npm install marked
```

```typescript
import { marked } from 'marked';

const html = marked.parse(textContent);
<div dangerouslySetInnerHTML={{ __html: html }} />
```
