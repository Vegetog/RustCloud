import { useState, useEffect } from 'react';
import { X, Loader2, Save, Code2, AlertCircle, Lock } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { CryptoService } from '../services/crypto';
import { apiService } from '../services/api';
import { useAuthStore } from '../stores/authStore';

interface DocumentEditorModalProps {
  documentId: string;
  fileName: string;
  encryptedKey: string;
  encryptedName: string;
  nameNonce: string;
  contentNonce: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function DocumentEditorModal({
  documentId,
  fileName,
  encryptedKey,
  encryptedName,
  nameNonce,
  contentNonce,
  onClose,
  onSuccess,
}: DocumentEditorModalProps) {
  const { privateKey } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [content, setContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Lock-related state
  const [lockId, setLockId] = useState<string | null>(null);
  const [version, setVersion] = useState<number>(0);
  const [lockError, setLockError] = useState<string | null>(null);
  const [isHeartbeatActive, setIsHeartbeatActive] = useState(false);

  // 验证必需参数
  if (!documentId || !fileName || !encryptedKey || !privateKey) {
    console.error('Missing required props:', {
      documentId,
      fileName,
      encryptedKey: !!encryptedKey,
      privateKey: !!privateKey,
    });
  }

  // 从文件名推断语言
  const getLanguage = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'py': 'python',
      'rs': 'rust',
      'go': 'go',
      'java': 'java',
      'c': 'c',
      'cpp': 'cpp',
      'h': 'c',
      'hpp': 'cpp',
      'cs': 'csharp',
      'php': 'php',
      'rb': 'ruby',
      'sh': 'shell',
      'bash': 'shell',
      'json': 'json',
      'xml': 'xml',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'md': 'markdown',
      'yaml': 'yaml',
      'yml': 'yaml',
      'toml': 'toml',
      'sql': 'sql',
      'txt': 'plaintext',
    };
    return languageMap[ext || ''] || 'plaintext';
  };

  // 1. 获取编辑锁
  useEffect(() => {
    async function acquireLock() {
      try {
        const response = await apiService.acquireLock(documentId);
        const data = response.data.data;

        if (data.locked) {
          setLockId(data.lock_id!);
          setVersion(data.version!);
          setIsHeartbeatActive(true);
        } else {
          setLockError(`文档正在被 ${data.locked_by} 编辑（${data.locked_at}）`);
          setLoading(false);
        }
      } catch (err: any) {
        console.error('Failed to acquire lock:', err);

        // 处理 409 锁冲突 - 提取锁持有者信息
        if (err.response?.status === 409) {
          const data = err.response.data?.data;
          if (data?.locked_by) {
            setLockError(`文档正在被 ${data.locked_by} 编辑`);
          } else {
            setLockError('文档正在被其他用户编辑');
          }
        } else {
          setLockError('获取编辑锁失败：' + (err.response?.data?.error?.message || err.message || '未知错误'));
        }
        setLoading(false);
      }
    }

    acquireLock();
  }, [documentId]);

  // 2. 心跳续期（每10秒）
  useEffect(() => {
    if (!isHeartbeatActive || !lockId) return;

    const interval = setInterval(async () => {
      try {
        await apiService.extendLock(documentId, lockId);
      } catch (err) {
        console.error('Heartbeat failed:', err);
        setLockError('连接丢失 - 您的更改可能无法保存');
        setLockId(null);  // 清除锁ID，避免两条消息同时显示
        setIsHeartbeatActive(false);
      }
    }, 10000); // 10 seconds

    return () => clearInterval(interval);
  }, [isHeartbeatActive, lockId, documentId]);

  // 3. 卸载时释放锁
  useEffect(() => {
    return () => {
      if (lockId) {
        apiService.releaseLock(documentId, lockId).catch(console.error);
      }
    };
  }, [lockId, documentId]);

  // 4. 加载文档内容（仅在获取锁后）
  useEffect(() => {
    if (!lockId) return; // Wait for lock to be acquired

    async function loadContent() {
      try {
        setLoading(true);
        setError(null);

        // 验证必需参数
        if (!privateKey) {
          throw new Error('私钥未找到，请重新登录');
        }

        if (!encryptedKey) {
          throw new Error('文档密钥未找到');
        }

        // 1. 下载加密文件
        const response = await apiService.downloadDocument(documentId);
        const encryptedData = response.data;

        // 2. 解密文件
        const crypto = new CryptoService();
        const decrypted = await crypto.decryptDocument(
          encryptedData,
          encryptedName,
          nameNonce,
          contentNonce,
          encryptedKey,
          privateKey
        );

        // 3. 将二进制内容转为文本
        const textContent = new TextDecoder('utf-8').decode(decrypted.content);
        setContent(textContent);
        setOriginalContent(textContent);
        setLoading(false);
      } catch (err: any) {
        console.error('Failed to load document:', err);
        setError('加载文档失败：' + (err.message || '未知错误'));
        setLoading(false);
      }
    }

    loadContent();
  }, [lockId, documentId, encryptedKey, encryptedName, nameNonce, contentNonce, privateKey]);

  // 检测内容变化
  useEffect(() => {
    setHasChanges(content !== originalContent);
  }, [content, originalContent]);

  // 保存文档
  const handleSave = async () => {
    // Verify lock status
    if (!lockId) {
      setError('无编辑锁 - 无法保存');
      return;
    }

    if (!hasChanges) {
      setError('内容未修改');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const crypto = new CryptoService();

      if (!privateKey) {
        throw new Error('私钥未找到，请重新登录');
      }

      // 1. 用私钥解密 document key
      const encryptedKeyBuffer = crypto.base64ToArrayBuffer(encryptedKey);
      const documentKeyBuffer = await window.crypto.subtle.decrypt(
        { name: 'RSA-OAEP' },
        privateKey,
        encryptedKeyBuffer
      );

      // 2. 导入 document key 为 AES 密钥
      const documentKey = await window.crypto.subtle.importKey(
        'raw',
        documentKeyBuffer,
        'AES-GCM',
        false,
        ['encrypt']
      );

      // 3. 将文本转为二进制
      const contentBuffer = new TextEncoder().encode(content);

      // 4. 加密文件内容（生成新的 nonce）
      const newContentNonce = window.crypto.getRandomValues(new Uint8Array(12));
      const encryptedContent = await window.crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: newContentNonce,
        },
        documentKey,
        contentBuffer
      );

      // 5. 上传加密文件到 MinIO
      const blob = new Blob([encryptedContent]);
      const uploadResponse = await apiService.uploadFile(blob, 'encrypted');
      const newStoragePath = uploadResponse.data.data.storage_path;

      // 6. 计算新的 content hash
      const hashBuffer = await window.crypto.subtle.digest(
        'SHA-256',
        encryptedContent
      );
      const contentHash = crypto.arrayBufferToBase64(hashBuffer);

      // 7. 更新文档元数据（包含锁和版本信息）
      await apiService.updateDocument(documentId, {
        content_nonce: crypto.arrayBufferToBase64(newContentNonce.buffer as ArrayBuffer),
        content_hash: contentHash,
        storage_path: newStoragePath,
        size: blob.size,
        expected_version: version,
        lock_id: lockId,
      });

      // 8. 成功
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to save document:', err);

      // Handle conflicts
      if (err.response?.status === 409) {
        const msg = err.response.data?.error?.message || '文档已被他人修改';
        setError(`保存冲突：${msg}。请刷新后重试。`);
      } else {
        setError(
          '保存失败：' + (err.response?.data?.error?.message || err.message || '未知错误')
        );
      }
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              <Code2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">编辑文档</h2>
              <p className="text-sm text-slate-500">{fileName}</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Lock status indicator */}
            {lockId && (
              <div className="flex items-center space-x-1.5 text-green-600 text-xs font-medium">
                <Lock className="w-4 h-4" />
                <span>已获取编辑锁</span>
              </div>
            )}

            {lockError && (
              <div className="flex items-center space-x-1.5 text-red-600 text-xs font-medium">
                <AlertCircle className="w-4 h-4" />
                <span>{lockError}</span>
              </div>
            )}

            {hasChanges && (
              <span className="text-xs text-amber-600 font-medium">
                • 未保存
              </span>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mt-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-700">{error}</div>
          </div>
        )}

        {/* Editor */}
        <div className="flex-1 overflow-hidden p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
          ) : (
            <Editor
              height="100%"
              language={getLanguage(fileName)}
              value={content}
              onChange={(value) => setContent(value || '')}
              theme="vs-light"
              options={{
                fontSize: 14,
                minimap: { enabled: true },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                automaticLayout: true,
              }}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex space-x-3 p-6 border-t border-slate-200">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges || loading}
            className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors shadow-lg shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>保存中...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>保存</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
