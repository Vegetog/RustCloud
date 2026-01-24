// PreviewModal: Client-side document preview with zero-knowledge encryption

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

        console.log('[Preview] Downloading encrypted file...');
        // 1. 下载加密文件
        const response = await apiService.downloadDocument(documentId);
        console.log('[Preview] Downloaded:', response.data.byteLength, 'bytes');

        // 2. 客户端解密
        console.log('[Preview] Decrypting...');
        const { content } = await cryptoService.decryptDocument(
          response.data,
          encryptedName,
          nameNonce,
          contentNonce,
          encryptedKey,
          privateKey!  // Non-null assertion: already checked above
        );
        console.log('[Preview] Decrypted:', content.byteLength, 'bytes');

        // 3. 根据类型处理
        if (mimeType.startsWith('text/')) {
          // 文本文件：直接解码为字符串
          const text = new TextDecoder('utf-8').decode(content);
          setTextContent(text);
          console.log('[Preview] Loaded text content');
        } else {
          // 二进制文件：创建 Blob URL（完全离线）
          const blob = new Blob([content], { type: mimeType });
          const url = URL.createObjectURL(blob);
          setPreviewUrl(url);
          console.log('[Preview] Created Blob URL:', url);
        }

        setLoading(false);
      } catch (err: any) {
        console.error('[Preview] Failed:', err);
        // Check if it's a decryption error (likely due to content update)
        if (err.name === 'OperationError' || err.message?.includes('decrypt')) {
          setError('文件内容已更新，请关闭后刷新文档列表重试');
        } else {
          setError(err.message || '预览失败');
        }
        setLoading(false);
      }
    }

    loadPreview();

    // 清理：组件卸载时释放 Blob URL（安全实践）
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        console.log('[Preview] Revoked Blob URL');
      }
    };
  }, [documentId, contentNonce, nameNonce, encryptedName, encryptedKey, mimeType, privateKey]);

  const renderPreview = () => {
    // 图片预览
    if (mimeType.startsWith('image/')) {
      return (
        <img
          src={previewUrl!}
          alt={fileName}
          className="max-w-full max-h-full object-contain"
        />
      );
    }

    // PDF 预览（浏览器内置渲染器）
    if (mimeType === 'application/pdf') {
      return (
        <iframe
          src={previewUrl!}
          className="w-full h-full border-none"
          title={fileName}
        />
      );
    }

    // 视频预览
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

    // 音频预览
    if (mimeType.startsWith('audio/')) {
      return (
        <div className="flex flex-col items-center space-y-4">
          <div className="text-6xl">🎵</div>
          <audio src={previewUrl!} controls className="w-full max-w-md" />
          <div className="text-sm text-slate-600">{fileName}</div>
        </div>
      );
    }

    // 文本预览
    if (textContent) {
      return (
        <pre className="text-sm text-slate-900 whitespace-pre-wrap font-mono bg-slate-50 p-4 rounded-lg overflow-auto max-h-full">
          {textContent}
        </pre>
      );
    }

    // 不支持的类型
    return (
      <div className="text-center">
        <div className="text-4xl mb-4">📄</div>
        <div className="text-slate-500 mb-2">
          暂不支持预览此文件类型
        </div>
        <div className="text-sm text-slate-400">{mimeType}</div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full h-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center space-x-3 min-w-0 flex-1">
            <div className="text-lg font-semibold text-slate-900 truncate">
              {fileName}
            </div>
            <div className="text-sm text-slate-500 flex-shrink-0">{mimeType}</div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0"
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
              <div className="text-xs text-slate-400">
                文件在本地解密，完全安全
              </div>
            </div>
          ) : error ? (
            <div className="text-center max-w-md">
              {error.includes('已更新') ? (
                <>
                  <div className="text-amber-500 text-4xl mb-4">🔄</div>
                  <div className="text-lg font-medium text-amber-600 mb-2">内容已更新</div>
                  <div className="text-sm text-amber-600 mb-4">{error}</div>
                  <button
                    onClick={onClose}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    关闭并刷新列表
                  </button>
                </>
              ) : (
                <>
                  <div className="text-red-600 text-4xl mb-4">❌</div>
                  <div className="text-lg font-medium text-red-600 mb-2">预览失败</div>
                  <div className="text-sm text-red-500">{error}</div>
                </>
              )}
            </div>
          ) : (
            renderPreview()
          )}
        </div>

        {/* 底部提示 */}
        {!loading && !error && (
          <div className="border-t border-slate-200 p-3 text-center flex-shrink-0">
            <div className="text-xs text-slate-500">
              🔒 文件已在本地解密，服务器无法访问内容
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
