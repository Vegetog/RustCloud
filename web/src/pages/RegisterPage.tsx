// 注册页面：在客户端生成密钥

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export function RegisterPage() {
  const navigate = useNavigate();
  const { register, loading, error, clearError } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const validatePassword = (pwd: string): string => {
    if (pwd.length < 8) {
      return '密码至少需要 8 个字符';
    }
    if (!/[a-z]/.test(pwd)) {
      return '密码必须包含小写字母';
    }
    if (!/[A-Z]/.test(pwd)) {
      return '密码必须包含大写字母';
    }
    if (!/[0-9]/.test(pwd)) {
      return '密码必须包含数字';
    }
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setPasswordError('');

    // 校验密码
    const pwdError = validatePassword(password);
    if (pwdError) {
      setPasswordError(pwdError);
      return;
    }

    // 检查密码是否一致
    if (password !== confirmPassword) {
      setPasswordError('两次输入的密码不一致');
      return;
    }

    try {
      await register(email, password);
      navigate('/documents');
    } catch (err) {
      // 错误由 状态仓库处理
    }
  };

  return (
    <div style={{ maxWidth: '400px', margin: '100px auto', padding: '20px' }}>
      <h1>RustCloud - 注册</h1>
      <p style={{ color: '#666', marginBottom: '30px' }}>
        创建账号开始使用零知识加密云存储
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
            onChange={(e) => {
              setPassword(e.target.value);
              setPasswordError('');
            }}
            required
            style={{
              width: '100%',
              padding: '10px',
              fontSize: '16px',
              border: '1px solid #ddd',
              borderRadius: '4px',
            }}
            placeholder="至少8位，包含大小写字母和数字"
          />
          {password && (
            <div style={{ marginTop: '5px', fontSize: '12px' }}>
              <div>强度: {validatePassword(password) ? '弱' : '强'}</div>
            </div>
          )}
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="confirmPassword" style={{ display: 'block', marginBottom: '5px' }}>
            确认密码
          </label>
          <input
            type="password"
            id="confirmPassword"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setPasswordError('');
            }}
            required
            style={{
              width: '100%',
              padding: '10px',
              fontSize: '16px',
              border: '1px solid #ddd',
              borderRadius: '4px',
            }}
            placeholder="再次输入密码"
          />
        </div>

        {(passwordError || error) && (
          <div
            style={{
              padding: '10px',
              marginBottom: '20px',
              backgroundColor: '#fee',
              color: '#c33',
              borderRadius: '4px',
            }}
          >
            {passwordError || error}
          </div>
        )}

        {loading && (
          <div
            style={{
              marginBottom: '20px',
              padding: '15px',
              backgroundColor: '#e7f3ff',
              borderRadius: '4px',
            }}
          >
            <div style={{ marginBottom: '10px' }}>正在生成加密密钥...</div>
            <div style={{ fontSize: '14px', color: '#666' }}>
              ✓ 生成随机盐值<br />
              ✓ 派生主密钥 (PBKDF2)<br />
              ✓ 生成 RSA-2048 密钥对 (这可能需要几秒钟)<br />
              ✓ 加密私钥<br />
              ✓ 上传到服务器
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px',
            fontSize: '16px',
            backgroundColor: loading ? '#ccc' : '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? '注册中...' : '注册'}
        </button>
      </form>

      <div style={{ marginTop: '20px', textAlign: 'center' }}>
        <Link to="/login" style={{ color: '#007bff', textDecoration: 'none' }}>
          已有账号？点击登录
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
        <strong>零知识架构:</strong>
        <ul style={{ marginTop: '10px', paddingLeft: '20px' }}>
          <li>密钥生成完全在浏览器本地完成</li>
          <li>主密钥和私钥永不发送到服务器</li>
          <li>服务器无法解密您的任何文件</li>
          <li>即使服务器被攻破，您的数据仍然安全</li>
        </ul>
      </div>
    </div>
  );
}
