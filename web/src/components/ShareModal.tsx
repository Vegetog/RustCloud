// ShareModal: Dialog for creating share links

import { useState } from 'react';
import { apiService } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { CryptoService } from '../services/crypto';

interface ShareModalProps {
  documentId: string;
  encryptedKey: string;
  onClose: () => void;
}

export function ShareModal({ documentId, encryptedKey, onClose }: ShareModalProps) {
  const { privateKey, publicKey } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);

  // Form state
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [useExpiration, setUseExpiration] = useState(false);
  const [expirationHours, setExpirationHours] = useState(24);
  const [useMaxAccess, setUseMaxAccess] = useState(false);
  const [maxAccessCount, setMaxAccessCount] = useState(10);

  const handleCreateShare = async () => {
    if (!privateKey || !publicKey) {
      setError('请先登录');
      return;
    }

    if (usePassword && !password) {
      setError('请输入分享密码');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const crypto = new CryptoService();

      // 1. Decrypt document key with user's private key
      const encryptedKeyBuffer = crypto.base64ToArrayBuffer(encryptedKey);
      const documentKeyBuffer = await window.crypto.subtle.decrypt(
        { name: 'RSA-OAEP' },
        privateKey,
        encryptedKeyBuffer
      );

      // 2. Convert document key to base64 for URL fragment
      // This allows public share links to decrypt files without user authentication
      const documentKeyBase64 = crypto.arrayBufferToBase64(documentKeyBuffer);

      // 3. Re-encrypt document key with user's public key (for API storage)
      const shareEncryptedKey = crypto.arrayBufferToBase64(encryptedKeyBuffer);

      // 3. Calculate expiration time
      let expiresAt: string | null = null;
      if (useExpiration) {
        const expireDate = new Date();
        expireDate.setHours(expireDate.getHours() + expirationHours);
        expiresAt = expireDate.toISOString();
      }

      // 4. Hash password if provided
      let passwordHash: string | null = null;
      if (usePassword && password) {
        // Simple SHA-256 hash of password (in production, use proper key derivation)
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
        passwordHash = Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
      }

      // 5. Create share link via API
      const response = await apiService.createShare({
        document_id: documentId,
        encrypted_key: shareEncryptedKey,
        password_hash: passwordHash,
        expires_at: expiresAt,
        max_access_count: useMaxAccess ? maxAccessCount : null,
      });

      const shareToken = response.data.data.access_token;

      // 6. Generate share URL with document key in fragment (for zero-knowledge)
      // The document key is in the URL fragment (#key), which never gets sent to the server
      // This maintains zero-knowledge: the server cannot decrypt the file
      const shareUrl = `${window.location.origin}/share/${shareToken}#${documentKeyBase64}`;

      setShareLink(shareUrl);
      setLoading(false);
    } catch (err: any) {
      console.error('Failed to create share:', err);
      setError(err.response?.data?.message || '创建分享链接失败');
      setLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (shareLink) {
      navigator.clipboard.writeText(shareLink);
      alert('分享链接已复制到剪贴板');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          padding: '30px',
          borderRadius: '8px',
          maxWidth: '500px',
          width: '90%',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0 }}>创建分享链接</h2>

        {error && (
          <div
            style={{
              padding: '10px',
              marginBottom: '15px',
              backgroundColor: '#fee',
              color: '#c33',
              borderRadius: '4px',
            }}
          >
            {error}
          </div>
        )}

        {shareLink ? (
          // Share link created successfully
          <div>
            <div
              style={{
                padding: '15px',
                backgroundColor: '#d4edda',
                borderRadius: '4px',
                marginBottom: '15px',
              }}
            >
              <strong>✅ 分享链接已创建</strong>
            </div>

            <div
              style={{
                padding: '10px',
                backgroundColor: '#f8f9fa',
                borderRadius: '4px',
                marginBottom: '15px',
                wordBreak: 'break-all',
                fontFamily: 'monospace',
                fontSize: '14px',
              }}
            >
              {shareLink}
            </div>

            <button
              onClick={handleCopyLink}
              style={{
                width: '100%',
                padding: '12px',
                marginBottom: '10px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '16px',
              }}
            >
              复制链接
            </button>

            <button
              onClick={onClose}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '16px',
              }}
            >
              关闭
            </button>

            {usePassword && (
              <div
                style={{
                  marginTop: '15px',
                  padding: '10px',
                  backgroundColor: '#fff3cd',
                  borderRadius: '4px',
                  fontSize: '14px',
                }}
              >
                <strong>⚠️ 提示:</strong> 请将访问密码单独发送给接收者
              </div>
            )}
          </div>
        ) : (
          // Share creation form
          <div>
            {/* Password Protection */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                <input
                  type="checkbox"
                  checked={usePassword}
                  onChange={(e) => setUsePassword(e.target.checked)}
                  style={{ marginRight: '10px' }}
                />
                <span>设置访问密码</span>
              </label>

              {usePassword && (
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="输入访问密码"
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px',
                  }}
                />
              )}
            </div>

            {/* Expiration Time */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                <input
                  type="checkbox"
                  checked={useExpiration}
                  onChange={(e) => setUseExpiration(e.target.checked)}
                  style={{ marginRight: '10px' }}
                />
                <span>设置过期时间</span>
              </label>

              {useExpiration && (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <input
                    type="number"
                    value={expirationHours}
                    onChange={(e) => setExpirationHours(Number(e.target.value))}
                    min="1"
                    max="720"
                    style={{
                      width: '100px',
                      padding: '10px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '14px',
                      marginRight: '10px',
                    }}
                  />
                  <span>小时后过期</span>
                </div>
              )}
            </div>

            {/* Max Access Count */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                <input
                  type="checkbox"
                  checked={useMaxAccess}
                  onChange={(e) => setUseMaxAccess(e.target.checked)}
                  style={{ marginRight: '10px' }}
                />
                <span>限制访问次数</span>
              </label>

              {useMaxAccess && (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <input
                    type="number"
                    value={maxAccessCount}
                    onChange={(e) => setMaxAccessCount(Number(e.target.value))}
                    min="1"
                    max="1000"
                    style={{
                      width: '100px',
                      padding: '10px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '14px',
                      marginRight: '10px',
                    }}
                  />
                  <span>次访问后失效</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleCreateShare}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: loading ? '#ccc' : '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '16px',
                }}
              >
                {loading ? '创建中...' : '创建分享'}
              </button>

              <button
                onClick={onClose}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '16px',
                }}
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
