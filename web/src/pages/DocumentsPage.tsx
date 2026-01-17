// DocumentsPage: Main page for document management

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useDocumentStore } from '../stores/documentStore';

export function DocumentsPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const {
    documents,
    total,
    loading,
    error,
    uploadProgress,
    loadDocuments,
    uploadDocument,
    downloadDocument,
    deleteDocument,
    clearError,
  } = useDocumentStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDocuments(1);
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await uploadDocument(file);
      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      // Error is handled by the store
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString('zh-CN');
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '30px',
          padding: '20px',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>我的文档</h1>
          <p style={{ margin: '5px 0 0 0', color: '#666' }}>
            {user?.email} | 共 {total} 个文档
          </p>
        </div>
        <button
          onClick={handleLogout}
          style={{
            padding: '10px 20px',
            backgroundColor: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          登出
        </button>
      </div>

      {/* Upload Section */}
      <div style={{ marginBottom: '30px' }}>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          id="fileInput"
        />
        <label htmlFor="fileInput">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            style={{
              padding: '12px 24px',
              backgroundColor: loading ? '#ccc' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '16px',
            }}
          >
            {loading ? '上传中...' : '上传文件'}
          </button>
        </label>

        {uploadProgress > 0 && uploadProgress < 100 && (
          <div style={{ marginTop: '10px' }}>
            <div
              style={{
                width: '100%',
                height: '20px',
                backgroundColor: '#e9ecef',
                borderRadius: '4px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${uploadProgress}%`,
                  height: '100%',
                  backgroundColor: '#007bff',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
            <div style={{ marginTop: '5px', fontSize: '14px', color: '#666' }}>
              {uploadProgress === 10 && '正在加密文件...'}
              {uploadProgress === 50 && '正在上传...'}
              {uploadProgress === 100 && '上传完成！'}
            </div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div
          style={{
            padding: '15px',
            marginBottom: '20px',
            backgroundColor: '#fee',
            color: '#c33',
            borderRadius: '4px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{error}</span>
          <button
            onClick={clearError}
            style={{
              padding: '5px 10px',
              backgroundColor: 'transparent',
              border: '1px solid #c33',
              color: '#c33',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            关闭
          </button>
        </div>
      )}

      {/* Document List */}
      {loading && documents.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px', color: '#666' }}>
          加载中...
        </div>
      ) : documents.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '50px',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            color: '#666',
          }}
        >
          <h3>还没有文档</h3>
          <p>点击"上传文件"按钮开始上传您的第一个加密文件</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              backgroundColor: 'white',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              borderRadius: '8px',
              overflow: 'hidden',
            }}
          >
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                <th style={{ padding: '15px', textAlign: 'left' }}>文件名</th>
                <th style={{ padding: '15px', textAlign: 'left' }}>大小</th>
                <th style={{ padding: '15px', textAlign: 'left' }}>类型</th>
                <th style={{ padding: '15px', textAlign: 'left' }}>上传时间</th>
                <th style={{ padding: '15px', textAlign: 'left' }}>权限</th>
                <th style={{ padding: '15px', textAlign: 'center' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr
                  key={doc.id}
                  style={{
                    borderBottom: '1px solid #dee2e6',
                  }}
                >
                  <td style={{ padding: '15px' }}>
                    <div style={{ fontSize: '12px', color: '#999', fontFamily: 'monospace' }}>
                      {doc.encrypted_name.substring(0, 16)}...
                    </div>
                    <div style={{ fontSize: '10px', color: '#ccc', marginTop: '2px' }}>
                      (加密)
                    </div>
                  </td>
                  <td style={{ padding: '15px' }}>{formatFileSize(doc.size)}</td>
                  <td style={{ padding: '15px' }}>{doc.mime_type || 'unknown'}</td>
                  <td style={{ padding: '15px', fontSize: '14px' }}>
                    {formatDate(doc.created_at)}
                  </td>
                  <td style={{ padding: '15px' }}>
                    <span
                      style={{
                        padding: '4px 8px',
                        backgroundColor:
                          doc.permission_level === 'owner'
                            ? '#28a745'
                            : doc.permission_level === 'write'
                            ? '#ffc107'
                            : '#6c757d',
                        color: 'white',
                        borderRadius: '4px',
                        fontSize: '12px',
                      }}
                    >
                      {doc.permission_level === 'owner'
                        ? '拥有者'
                        : doc.permission_level === 'write'
                        ? '读写'
                        : '只读'}
                    </span>
                  </td>
                  <td style={{ padding: '15px', textAlign: 'center' }}>
                    <button
                      onClick={() => downloadDocument(doc.id)}
                      style={{
                        padding: '6px 12px',
                        marginRight: '5px',
                        backgroundColor: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '14px',
                      }}
                    >
                      下载
                    </button>
                    {doc.permission_level === 'owner' && (
                      <button
                        onClick={async () => {
                          if (window.confirm('确定要删除这个文件吗？')) {
                            await deleteDocument(doc.id);
                          }
                        }}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#dc3545',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '14px',
                        }}
                      >
                        删除
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Security Notice */}
      <div
        style={{
          marginTop: '40px',
          padding: '15px',
          backgroundColor: '#e7f3ff',
          borderRadius: '4px',
          fontSize: '14px',
          color: '#004085',
        }}
      >
        <strong>🔒 安全提示:</strong> 所有文件在浏览器本地加密后上传，服务器无法查看您的文件内容。
        密钥仅存储在内存中，页面刷新后将需要重新登录。
      </div>
    </div>
  );
}
