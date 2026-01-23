// LoginPage: User login with password-based key derivation

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Cloud, Mail, Key, CheckCircle, Loader2, ShieldCheck, Lock } from 'lucide-react';
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
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row font-sans text-slate-800">
      {/* 左侧品牌区 */}
      <div className="bg-slate-900 relative overflow-hidden flex flex-col justify-between p-8 lg:p-12 min-h-[300px] lg:min-h-screen lg:w-5/12 xl:w-1/2">
        {/* 背景装饰 */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 bg-indigo-600/20 rounded-full blur-3xl"></div>

        {/* Logo */}
        <div className="relative z-10 flex items-center space-x-3">
          <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2.5 rounded-xl shadow-lg shadow-blue-500/30">
            <Cloud className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">RustCloud</h1>
            <p className="text-xs text-slate-400 font-medium tracking-wide">零知识加密云存储</p>
          </div>
        </div>

        {/* 中间内容 */}
        <div className="relative z-10 my-auto py-12 lg:py-0">
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-6 leading-tight">
            端到端加密<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
              零知识架构
            </span>
          </h2>
          <div className="space-y-4">
            {[
              { icon: Lock, text: 'AES-256-GCM 端到端加密' },
              { icon: ShieldCheck, text: 'RSA-2048 非对称加密' },
              { icon: CheckCircle, text: '细粒度权限控制' },
              { icon: CheckCircle, text: '安全文件分享' },
            ].map((item, idx) => (
              <div key={idx} className="flex items-center space-x-3 text-slate-300">
                <div className="p-1 rounded-full bg-emerald-500/10 text-emerald-400">
                  <item.icon className="w-4 h-4" />
                </div>
                <span className="text-sm">{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 底部版权 */}
        <div className="relative z-10 text-xs text-slate-500">
          &copy; 2025 RustCloud - 毕业设计项目
        </div>
      </div>

      {/* 右侧表单区 */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 lg:p-12 bg-white">
        <div className="w-full max-w-md space-y-8">
          {/* 标题 */}
          <div className="text-center lg:text-left">
            <h2 className="text-2xl font-bold text-slate-900">欢迎回来</h2>
            <p className="text-slate-500 text-sm mt-2">
              输入凭据以访问您的加密保险箱
            </p>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm animate-in fade-in">
              {error}
            </div>
          )}

          {/* 表单 */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">邮箱</label>
              <div className="relative group">
                <Mail className="absolute left-3 top-3 w-5 h-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  placeholder="your@email.com"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">密码</label>
              <div className="relative group">
                <Key className="absolute left-3 top-3 w-5 h-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full border border-slate-200 rounded-lg py-2.5 pl-10 pr-4 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {loading && (
              <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg text-sm flex items-center space-x-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>正在派生密钥... (这可能需要几秒钟)</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg shadow-lg shadow-blue-500/30 flex justify-center items-center space-x-2 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>登录中...</span>
                </>
              ) : (
                <span>登录</span>
              )}
            </button>
          </form>

          {/* 注册链接 */}
          <div className="text-center">
            <Link
              to="/register"
              className="text-blue-600 hover:text-blue-700 text-sm font-medium transition-colors"
            >
              还没有账号？点击注册
            </Link>
          </div>

          {/* 安全提示 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <ShieldCheck className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-blue-900">
                <p className="font-medium mb-1">零知识加密保证</p>
                <p className="text-blue-700 mb-2">
                  您的主密钥和私钥仅存储在内存中，永不发送到服务器。所有文件在客户端加密，服务器无法访问您的数据。
                </p>
                <p className="text-blue-600 text-[11px]">
                  ⚠️ 刷新页面或关闭浏览器将清除内存中的密钥，需要重新登录才能访问文件。这是零知识架构的安全保障。
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
