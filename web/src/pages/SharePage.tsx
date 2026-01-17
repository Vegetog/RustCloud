// SharePage: Access shared documents via public links

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { apiService } from '../services/api';

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
    if (!shareData) return;

    try {
      // For share links, we need to get the shareKey from URL fragment
      // and decrypt the document using that key instead of the user's private key
      // This is a simplified version - full implementation would require
      // extracting shareKey from window.location.hash and implementing
      // share-specific decryption logic
      alert('下载功能正在开发中。完整实现需要从 URL fragment 中提取 shareKey 进行解密。');
    } catch (err: any) {
      setError('下载失败');
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
              <strong>文件大小:</strong> {shareData.document?.size || 'Unknown'}
            </p>
            <p>
              <strong>类型:</strong> {shareData.document?.mime_type || 'Unknown'}
            </p>
            <p>
              <strong>分享时间:</strong>{' '}
              {shareData.created_at
                ? new Date(shareData.created_at).toLocaleString('zh-CN')
                : 'Unknown'}
            </p>
            {shareData.max_access_count && (
              <p>
                <strong>访问次数:</strong> {shareData.access_count || 0} /{' '}
                {shareData.max_access_count}
              </p>
            )}
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
