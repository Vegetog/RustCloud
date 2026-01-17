// SharePage: Access shared documents via public links

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { apiService } from '../services/api';
import { CryptoService } from '../services/crypto';

export function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareData, setShareData] = useState<any>(null);
  const [password, setPassword] = useState('');
  const [passwordRequired, setPasswordRequired] = useState(false);

  useEffect(() => {
    loadShare();
  }, [token]);

  const loadShare = async () => {
    if (!token) {
      setError('无效的分享链接');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiService.accessShare(token, password || undefined);
      setShareData(response.data.data);
      setLoading(false);
    } catch (err: any) {
      const status = err.response?.status;
      const message = err.response?.data?.message;

      if (status === 401 && message?.includes('password')) {
        setPasswordRequired(true);
        setError('此分享链接需要密码');
      } else if (status === 404) {
        setError('分享链接不存在或已过期');
      } else if (status === 403) {
        setError('访问次数已用尽');
      } else {
        setError(message || '无法访问分享链接');
      }
      setLoading(false);
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadShare();
  };

  const handleDownload = async () => {
    if (!shareData || !token) return;

    setLoading(true);
    setError(null);

    try {
      const crypto = new CryptoService();

      // 1. Extract document key from URL fragment
      const documentKeyBase64 = window.location.hash.substring(1); // Remove '#'
      if (!documentKeyBase64) {
        throw new Error('分享链接无效：缺少解密密钥');
      }

      // 2. Convert base64 document key to ArrayBuffer
      const documentKeyBuffer = crypto.base64ToArrayBuffer(documentKeyBase64);

      // 3. Import document key as AES-GCM key
      const documentKey = await window.crypto.subtle.importKey(
        'raw',
        documentKeyBuffer,
        'AES-GCM',
        false,
        ['decrypt']
      );

      // 4. Download encrypted file content using share download endpoint
      const downloadUrl = `/api/v1/shares/access/${token}/download${
        password ? `?password=${encodeURIComponent(password)}` : ''
      }`;
      const contentResponse = await fetch(downloadUrl);
      if (!contentResponse.ok) {
        throw new Error('文件下载失败');
      }
      const encryptedContent = await contentResponse.arrayBuffer();

      // 5. Decrypt file content
      const contentNonceBuffer = crypto.base64ToArrayBuffer(shareData.content_nonce);
      const decryptedContent = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: contentNonceBuffer },
        documentKey,
        encryptedContent
      );

      // 6. Decrypt file name
      const nameNonceBuffer = crypto.base64ToArrayBuffer(shareData.name_nonce);
      const encryptedNameBuffer = crypto.base64ToArrayBuffer(shareData.encrypted_name);
      const nameBuffer = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: nameNonceBuffer },
        documentKey,
        encryptedNameBuffer
      );
      const fileName = new TextDecoder().decode(nameBuffer);

      // 7. Trigger browser download
      const blob = new Blob([decryptedContent]);
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = fileName;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setLoading(false);
    } catch (err: any) {
      console.error('Download failed:', err);
      setError(err.message || '文件下载失败');
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '600px', margin: '100px auto', padding: '20px', textAlign: 'center' }}>
        <h2>加载中...</h2>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '600px', margin: '100px auto', padding: '20px' }}>
      <h1>RustCloud - 文件分享</h1>

      {error && (
        <div
          style={{
            padding: '15px',
            marginTop: '20px',
            backgroundColor: '#fee',
            color: '#c33',
            borderRadius: '4px',
          }}
        >
          {error}
        </div>
      )}

      {passwordRequired && !shareData && (
        <form onSubmit={handlePasswordSubmit} style={{ marginTop: '20px' }}>
          <div style={{ marginBottom: '15px' }}>
            <label htmlFor="password" style={{ display: 'block', marginBottom: '5px' }}>
              请输入访问密码
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '16px',
                border: '1px solid #ddd',
                borderRadius: '4px',
              }}
              placeholder="输入密码"
            />
          </div>
          <button
            type="submit"
            style={{
              padding: '10px 20px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            访问
          </button>
        </form>
      )}

      {shareData && (
        <div style={{ marginTop: '30px' }}>
          <div
            style={{
              padding: '20px',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              marginBottom: '20px',
            }}
          >
            <h3>文件信息</h3>
            <p>
              <strong>文件大小:</strong> {shareData.size || 'Unknown'} 字节
            </p>
            <p>
              <strong>类型:</strong> {shareData.mime_type || 'Unknown'}
            </p>
          </div>

          <button
            onClick={handleDownload}
            style={{
              width: '100%',
              padding: '15px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '16px',
              cursor: 'pointer',
            }}
          >
            下载文件
          </button>

          <div
            style={{
              marginTop: '30px',
              padding: '15px',
              backgroundColor: '#e7f3ff',
              borderRadius: '4px',
              fontSize: '14px',
            }}
          >
            <strong>🔒 隐私保护:</strong> 文件在浏览器本地解密，确保端到端加密安全。
          </div>
        </div>
      )}
    </div>
  );
}
