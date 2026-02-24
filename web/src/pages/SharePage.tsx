// 分享页面：通过公开链接访问文档

import { useState, useEffect, useCallback } from 'react';
import { formatFileSize } from '../utils/format';
import { isAxiosError } from 'axios';
import { useParams } from 'react-router-dom';
import {
  Cloud,
  Lock,
  Download,
  Loader2,
  AlertCircle,
  Key,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import { apiService } from '../services/api';
import { CryptoService } from '../services/crypto';

interface ShareAccessData {
  document_id: string;
  encrypted_key: string;
  encrypted_name: string;
  name_nonce: string;
  content_nonce: string;
  content_hash: string;
  size: number;
  mime_type: string;
}

export function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareData, setShareData] = useState<ShareAccessData | null>(null);
  const [password, setPassword] = useState('');
  const [passwordRequired, setPasswordRequired] = useState(false);

  const loadShare = useCallback(async (passwordOverride?: string) => {
    if (!token) {
      setError('无效的分享链接');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiService.accessShare(token, passwordOverride || undefined);
      setShareData(response.data.data);
      setLoading(false);
    } catch (err) {
      const status = isAxiosError(err) ? err.response?.status : undefined;
      const message = isAxiosError(err)
        ? (err.response?.data as { message?: string } | undefined)?.message
        : err instanceof Error
          ? err.message
          : undefined;

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
  }, [token]);

  useEffect(() => {
    loadShare();
  }, [loadShare]);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadShare(password);
  };

  const handleDownload = async () => {
    if (!shareData || !token) return;

    setLoading(true);
    setError(null);

    try {
      const crypto = new CryptoService();

      // 从 URL 片段 中提取文档密钥
      const documentKeyBase64 = window.location.hash.substring(1);
      if (!documentKeyBase64) {
        throw new Error('分享链接无效：缺少解密密钥');
      }

      // 转换并导入文档密钥
      const documentKeyBuffer = crypto.base64ToArrayBuffer(documentKeyBase64);
      const documentKey = await window.crypto.subtle.importKey(
        'raw',
        documentKeyBuffer,
        'AES-GCM',
        false,
        ['decrypt']
      );

      // 下载加密文件
      const downloadUrl = `/api/v1/shares/access/${token}/download${
        password ? `?password=${encodeURIComponent(password)}` : ''
      }`;
      const contentResponse = await fetch(downloadUrl);
      if (!contentResponse.ok) {
        throw new Error('文件下载失败');
      }
      const encryptedContent = await contentResponse.arrayBuffer();

      // 解密文件内容
      const contentNonceBuffer = crypto.base64ToArrayBuffer(shareData.content_nonce);
      const decryptedContent = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: contentNonceBuffer },
        documentKey,
        encryptedContent
      );

      // 解密文件名
      const nameNonceBuffer = crypto.base64ToArrayBuffer(shareData.name_nonce);
      const encryptedNameBuffer = crypto.base64ToArrayBuffer(shareData.encrypted_name);
      const nameBuffer = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: nameNonceBuffer },
        documentKey,
        encryptedNameBuffer
      );
      const fileName = new TextDecoder().decode(nameBuffer);

      // 触发下载
      const blob = new Blob([decryptedContent]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setLoading(false);
    } catch (err) {
      console.error('Download failed:', err);
      setError(err instanceof Error ? err.message : '文件下载失败');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      {/* 标志 */}
      <div className="absolute top-6 left-6 flex items-center space-x-3">
        <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2 rounded-lg shadow-lg shadow-blue-500/30">
          <Cloud className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight text-slate-900">RustCloud</h1>
          <p className="text-xs text-slate-500">安全文件分享</p>
        </div>
      </div>

      {/* 主卡片 */}
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* 头部 */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-6 text-white">
          <div className="flex items-center space-x-3 mb-2">
            <Lock className="w-6 h-6" />
            <h2 className="text-xl font-bold">加密文件分享</h2>
          </div>
          <p className="text-blue-100 text-sm">端到端加密 · 零知识架构</p>
        </div>

        {/* 内容区 */}
        <div className="p-6">
          {loading && !shareData ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
              <p className="text-slate-500">正在加载...</p>
            </div>
          ) : error && !passwordRequired ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">无法访问</h3>
              <p className="text-slate-600 text-center">{error}</p>
            </div>
          ) : passwordRequired && !shareData ? (
            /* 密码验证表单 */
            <div className="py-4">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Key className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">需要访问密码</h3>
                <p className="text-slate-600 text-sm">此文件受密码保护，请输入密码以继续</p>
              </div>

              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    分享密码
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="输入密码"
                    className="w-full border border-slate-200 rounded-lg py-2.5 px-4 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-medium shadow-lg shadow-blue-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>验证中...</span>
                    </>
                  ) : (
                    <span>验证密码</span>
                  )}
                </button>
              </form>
            </div>
          ) : shareData ? (
            /* 文件信息和下载 */
            <div className="space-y-6">
              <div className="flex items-center space-x-4 p-4 bg-slate-50 rounded-lg">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 mb-1">加密文件</div>
                  <div className="flex items-center space-x-4 text-xs text-slate-500">
                    <span>{formatFileSize(shareData.size)}</span>
                    <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                    <span>{shareData.mime_type}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleDownload}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-medium shadow-lg shadow-blue-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>下载中...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5" />
                    <span>下载文件</span>
                  </>
                )}
              </button>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <ShieldCheck className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-blue-900">
                    <p className="font-medium mb-1">安全保证</p>
                    <p className="text-blue-700">
                      文件在您的浏览器本地解密，服务器无法访问文件内容。所有操作均通过端到端加密保护。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* 底部版权 */}
      <div className="absolute bottom-6 text-xs text-slate-500">
        &copy; 2025 RustCloud - 零知识加密云存储
      </div>
    </div>
  );
}
