// ShareModal: Dialog for creating share links

import { useState } from 'react';
import {
  X,
  Lock,
  Clock,
  Hash,
  Copy,
  CheckCircle,
  Loader2,
  AlertCircle,
  Share2,
} from 'lucide-react';
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
  const [copied, setCopied] = useState(false);

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
      const documentKeyBase64 = crypto.arrayBufferToBase64(documentKeyBuffer);

      // 3. Re-encrypt document key with user's public key (for API storage)
      const shareEncryptedKey = crypto.arrayBufferToBase64(encryptedKeyBuffer);

      // 4. Calculate expiration time
      let expiresAt: string | null = null;
      if (useExpiration) {
        const expireDate = new Date();
        expireDate.setHours(expireDate.getHours() + expirationHours);
        expiresAt = expireDate.toISOString();
      }

      // 5. Hash password if provided
      let passwordHash: string | null = null;
      if (usePassword && password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
        passwordHash = Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
      }

      // 6. Create share link via API
      const response = await apiService.createShare({
        document_id: documentId,
        encrypted_key: shareEncryptedKey,
        password_hash: passwordHash,
        expires_at: expiresAt,
        max_access_count: useMaxAccess ? maxAccessCount : null,
      });

      const shareToken = response.data.data.access_token;

      // 7. Generate share URL with document key in fragment (for zero-knowledge)
      const shareUrl = `${window.location.origin}/share/${shareToken}#${documentKeyBase64}`;

      setShareLink(shareUrl);
      setLoading(false);
    } catch (err: any) {
      console.error('Failed to create share:', err);
      setError(err.response?.data?.message || '创建分享链接失败');
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (shareLink) {
      navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      {/* 背景遮罩 */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in"
        onClick={onClose}
      >
        {/* 弹窗 */}
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-in zoom-in-95"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 头部 */}
          <div className="flex items-center justify-between p-6 border-b border-slate-200">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <Share2 className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">创建分享链接</h2>
                <p className="text-xs text-slate-500">零知识端到端加密分享</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {/* 内容 */}
          <div className="p-6 space-y-5">
            {/* 错误提示 */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-700">{error}</div>
              </div>
            )}

            {!shareLink ? (
              <>
                {/* 密码保护 */}
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      id="usePassword"
                      checked={usePassword}
                      onChange={(e) => setUsePassword(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-2 focus:ring-blue-500/20"
                    />
                    <label htmlFor="usePassword" className="flex items-center space-x-2 cursor-pointer">
                      <Lock className="w-4 h-4 text-slate-600" />
                      <span className="text-sm font-medium text-slate-700">设置访问密码</span>
                    </label>
                  </div>
                  {usePassword && (
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="输入分享密码"
                      className="w-full border border-slate-200 rounded-lg py-2.5 px-4 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                  )}
                </div>

                {/* 有效期 */}
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      id="useExpiration"
                      checked={useExpiration}
                      onChange={(e) => setUseExpiration(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-2 focus:ring-blue-500/20"
                    />
                    <label htmlFor="useExpiration" className="flex items-center space-x-2 cursor-pointer">
                      <Clock className="w-4 h-4 text-slate-600" />
                      <span className="text-sm font-medium text-slate-700">设置有效期</span>
                    </label>
                  </div>
                  {useExpiration && (
                    <div className="flex items-center space-x-3">
                      <input
                        type="number"
                        value={expirationHours}
                        onChange={(e) => setExpirationHours(Number(e.target.value))}
                        min="1"
                        max="720"
                        className="flex-1 border border-slate-200 rounded-lg py-2.5 px-4 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      />
                      <span className="text-sm text-slate-600">小时</span>
                    </div>
                  )}
                </div>

                {/* 访问次数限制 */}
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      id="useMaxAccess"
                      checked={useMaxAccess}
                      onChange={(e) => setUseMaxAccess(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-2 focus:ring-blue-500/20"
                    />
                    <label htmlFor="useMaxAccess" className="flex items-center space-x-2 cursor-pointer">
                      <Hash className="w-4 h-4 text-slate-600" />
                      <span className="text-sm font-medium text-slate-700">限制访问次数</span>
                    </label>
                  </div>
                  {useMaxAccess && (
                    <div className="flex items-center space-x-3">
                      <input
                        type="number"
                        value={maxAccessCount}
                        onChange={(e) => setMaxAccessCount(Number(e.target.value))}
                        min="1"
                        max="1000"
                        className="flex-1 border border-slate-200 rounded-lg py-2.5 px-4 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      />
                      <span className="text-sm text-slate-600">次</span>
                    </div>
                  )}
                </div>

                {/* 安全提示 */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <Lock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-blue-900">
                      <p className="font-medium mb-1">零知识分享</p>
                      <p className="text-blue-700">
                        文档密钥在 URL 片段中传输，服务器无法解密您的文件。分享链接包含解密所需的全部信息。
                      </p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              /* 分享链接生成成功 */
              <>
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-start space-x-3">
                  <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-emerald-900 mb-1">
                      分享链接已生成
                    </p>
                    <p className="text-xs text-emerald-700">
                      复制链接并分享给需要访问的人
                    </p>
                  </div>
                </div>

                {/* 分享链接 */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">分享链接</label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={shareLink}
                      readOnly
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-lg py-2.5 px-4 text-sm font-mono text-slate-600"
                    />
                    <button
                      onClick={handleCopy}
                      className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center space-x-2 ${
                        copied
                          ? 'bg-emerald-600 text-white'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      {copied ? (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          <span>已复制</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>复制</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* 分享信息 */}
                <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
                  {usePassword && (
                    <div className="flex items-center space-x-2 text-slate-600">
                      <Lock className="w-4 h-4" />
                      <span>密码保护已启用</span>
                    </div>
                  )}
                  {useExpiration && (
                    <div className="flex items-center space-x-2 text-slate-600">
                      <Clock className="w-4 h-4" />
                      <span>{expirationHours} 小时后过期</span>
                    </div>
                  )}
                  {useMaxAccess && (
                    <div className="flex items-center space-x-2 text-slate-600">
                      <Hash className="w-4 h-4" />
                      <span>最多访问 {maxAccessCount} 次</span>
                    </div>
                  )}
                  {!usePassword && !useExpiration && !useMaxAccess && (
                    <p className="text-slate-500">无限制分享</p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* 底部按钮 */}
          <div className="flex space-x-3 p-6 border-t border-slate-200">
            {!shareLink ? (
              <>
                <button
                  onClick={onClose}
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  取消
                </button>
                <button
                  onClick={handleCreateShare}
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors shadow-lg shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>生成中...</span>
                    </>
                  ) : (
                    <span>生成分享链接</span>
                  )}
                </button>
              </>
            ) : (
              <button
                onClick={onClose}
                className="w-full px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium text-sm transition-colors"
              >
                完成
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
