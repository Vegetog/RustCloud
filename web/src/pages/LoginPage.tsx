// LoginPage: User login with password-based key derivation

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, loading, error, clearError } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    try {
      await login(email, password);
      navigate('/documents');
    } catch (err) {
      // Error is handled by the store
    }
  };

  return (
    <div style={{ maxWidth: '400px', margin: '100px auto', padding: '20px' }}>
      <h1>RustCloud - 登录</h1>
      <p style={{ color: '#666', marginBottom: '30px' }}>
        零知识端到端加密云存储
      </p>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="email" style={{ display: 'block', marginBottom: '5px' }}>
            邮箱
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '10px',
              fontSize: '16px',
              border: '1px solid #ddd',
              borderRadius: '4px',
            }}
            placeholder="your@email.com"
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="password" style={{ display: 'block', marginBottom: '5px' }}>
            密码
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

        {error && (
          <div
            style={{
              padding: '10px',
              marginBottom: '20px',
              backgroundColor: '#fee',
              color: '#c33',
              borderRadius: '4px',
            }}
          >
            {error}
          </div>
        )}

        {loading && (
          <div style={{ marginBottom: '20px', color: '#666' }}>
            正在派生密钥... (这可能需要几秒钟)
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px',
            fontSize: '16px',
            backgroundColor: loading ? '#ccc' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? '登录中...' : '登录'}
        </button>
      </form>

      <div style={{ marginTop: '20px', textAlign: 'center' }}>
        <Link to="/register" style={{ color: '#007bff', textDecoration: 'none' }}>
          还没有账号？点击注册
        </Link>
      </div>

      <div
        style={{
          marginTop: '40px',
          padding: '15px',
          backgroundColor: '#f8f9fa',
          borderRadius: '4px',
          fontSize: '14px',
          color: '#666',
        }}
      >
        <strong>安全提示:</strong> 您的主密钥和私钥仅存储在内存中，永不发送到服务器。
        页面刷新后需要重新登录。
      </div>
    </div>
  );
}
