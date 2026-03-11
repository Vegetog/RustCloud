// 身份管理页面

import { useEffect, useState, useCallback } from 'react';
import { isAxiosError } from 'axios';
import { useNavigate } from 'react-router-dom';
import {
  Cloud,
  Home,
  Users,
  Plus,
  Trash2,
  Edit3,
  UserPlus,
  UserMinus,
  LogOut,
  Loader2,
  AlertCircle,
  X,
  ChevronLeft,
  Shield,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { apiService } from '../services/api';
import type { Identity, IdentityUser, GrantedIdentity } from '../types/identity';

export function IdentitiesPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  // 标签页状态：'managed' = 我管理的身份, 'granted' = 我被授予的身份
  const [activeTab, setActiveTab] = useState<'managed' | 'granted'>('managed');

  // 身份列表状态
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 被授予的身份列表状态
  const [grantedIdentities, setGrantedIdentities] = useState<GrantedIdentity[]>([]);
  const [loadingGranted, setLoadingGranted] = useState(false);

  // 创建身份弹窗
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [creating, setCreating] = useState(false);

  // 编辑身份弹窗
  const [editingIdentity, setEditingIdentity] = useState<Identity | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [updating, setUpdating] = useState(false);

  // 身份详情视图
  const [selectedIdentity, setSelectedIdentity] = useState<Identity | null>(null);
  const [identityUsers, setIdentityUsers] = useState<IdentityUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // 添加用户弹窗
  const [showAddUsersModal, setShowAddUsersModal] = useState(false);
  const [addEmailsInput, setAddEmailsInput] = useState('');
  const [addingUsers, setAddingUsers] = useState(false);

  const loadIdentities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiService.listIdentities();
      setIdentities(response.data.data.identities);
    } catch (err) {
      const message = isAxiosError(err)
        ? ((err.response?.data as { error?: { message?: string } })?.error?.message || err.message)
        : err instanceof Error ? err.message : '未知错误';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadGrantedIdentities = useCallback(async () => {
    setLoadingGranted(true);
    try {
      const response = await apiService.listGrantedIdentities();
      setGrantedIdentities(response.data.data.identities);
    } catch {
      // 静默失败，不影响主页面
    } finally {
      setLoadingGranted(false);
    }
  }, []);

  useEffect(() => {
    loadIdentities();
    loadGrantedIdentities();
  }, [loadIdentities, loadGrantedIdentities]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // 创建身份
  const handleCreate = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      await apiService.createIdentity({
        name: createName.trim(),
        description: createDescription.trim() || undefined,
      });
      setShowCreateModal(false);
      setCreateName('');
      setCreateDescription('');
      await loadIdentities();
    } catch (err) {
      const message = isAxiosError(err)
        ? ((err.response?.data as { error?: { message?: string } })?.error?.message || err.message)
        : err instanceof Error ? err.message : '创建失败';
      alert('创建身份失败：' + message);
    } finally {
      setCreating(false);
    }
  };

  // 更新身份
  const handleUpdate = async () => {
    if (!editingIdentity || !editName.trim()) return;
    setUpdating(true);
    try {
      await apiService.updateIdentity(editingIdentity.id, {
        name: editName.trim(),
        description: editDescription.trim() || null,
      });
      setEditingIdentity(null);
      await loadIdentities();
      if (selectedIdentity?.id === editingIdentity.id) {
        setSelectedIdentity({
          ...selectedIdentity,
          name: editName.trim(),
          description: editDescription.trim() || undefined,
        });
      }
    } catch (err) {
      const message = isAxiosError(err)
        ? ((err.response?.data as { error?: { message?: string } })?.error?.message || err.message)
        : err instanceof Error ? err.message : '更新失败';
      alert('更新身份失败：' + message);
    } finally {
      setUpdating(false);
    }
  };

  // 删除身份
  const handleDelete = async (identity: Identity) => {
    if (!confirm(`确定要删除身份「${identity.name}」吗？此操作不可撤销。`)) return;
    try {
      await apiService.deleteIdentity(identity.id);
      if (selectedIdentity?.id === identity.id) {
        setSelectedIdentity(null);
        setIdentityUsers([]);
      }
      await loadIdentities();
    } catch (err) {
      const message = isAxiosError(err)
        ? ((err.response?.data as { error?: { message?: string } })?.error?.message || err.message)
        : err instanceof Error ? err.message : '删除失败';
      alert('删除身份失败：' + message);
    }
  };

  // 查看身份详情
  const handleSelectIdentity = async (identity: Identity) => {
    setSelectedIdentity(identity);
    setLoadingUsers(true);
    try {
      const response = await apiService.listIdentityUsers(identity.id);
      setIdentityUsers(response.data.data);
    } catch (err) {
      const message = isAxiosError(err)
        ? ((err.response?.data as { error?: { message?: string } })?.error?.message || err.message)
        : err instanceof Error ? err.message : '加载失败';
      alert('获取用户列表失败：' + message);
    } finally {
      setLoadingUsers(false);
    }
  };

  // 批量添加用户
  const handleBatchAddUsers = async () => {
    if (!selectedIdentity || !addEmailsInput.trim()) return;
    const emails = addEmailsInput
      .split(/[,;\n]+/)
      .map((e) => e.trim())
      .filter((e) => e.length > 0);
    if (emails.length === 0) return;

    setAddingUsers(true);
    try {
      const response = await apiService.batchAddUsersToIdentity(selectedIdentity.id, {
        user_emails: emails,
      });
      const result = response.data.data;
      if (result.failed_emails.length > 0) {
        alert(
          `成功添加 ${result.success_count} 个用户。\n以下邮箱添加失败：\n${result.failed_emails.join('\n')}`
        );
      }
      setShowAddUsersModal(false);
      setAddEmailsInput('');
      await handleSelectIdentity(selectedIdentity);
      await loadIdentities();
    } catch (err) {
      const message = isAxiosError(err)
        ? ((err.response?.data as { error?: { message?: string } })?.error?.message || err.message)
        : err instanceof Error ? err.message : '添加失败';
      alert('批量添加用户失败：' + message);
    } finally {
      setAddingUsers(false);
    }
  };

  // 批量移除用户
  const handleRemoveUser = async (email: string) => {
    if (!selectedIdentity) return;
    if (!confirm(`确定要将用户「${email}」从此身份中移除吗？`)) return;
    try {
      await apiService.batchRemoveUsersFromIdentity(selectedIdentity.id, {
        user_emails: [email],
      });
      await handleSelectIdentity(selectedIdentity);
      await loadIdentities();
    } catch (err) {
      const message = isAxiosError(err)
        ? ((err.response?.data as { error?: { message?: string } })?.error?.message || err.message)
        : err instanceof Error ? err.message : '移除失败';
      alert('移除用户失败：' + message);
    }
  };

  const openEditModal = (identity: Identity) => {
    setEditName(identity.name);
    setEditDescription(identity.description || '');
    setEditingIdentity(identity);
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* 侧边栏 */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 shrink-0">
        {/* 标志 */}
        <div className="p-6 flex items-center space-x-3 text-white border-b border-slate-800">
          <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2 rounded-lg shadow-lg shadow-blue-500/30">
            <Cloud className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">RustCloud</h1>
            <p className="text-xs text-slate-400">零知识加密</p>
          </div>
        </div>

        {/* 导航 */}
        <nav className="flex-1 px-4 space-y-1 mt-4">
          <button
            onClick={() => navigate('/documents')}
            className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <Home className="w-5 h-5" />
            <span className="font-medium text-sm">全部文件</span>
          </button>
          <button
            className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all bg-blue-600 text-white shadow-md shadow-blue-900/20"
          >
            <Users className="w-5 h-5 text-white" />
            <span className="font-medium text-sm">身份管理</span>
          </button>
        </nav>

        {/* 用户信息和登出 */}
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center space-x-3 mb-3 px-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-medium text-sm">
              {user?.email?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">
                {user?.email?.split('@')[0] || 'User'}
              </div>
              <div className="text-xs text-slate-400 truncate">{user?.email}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center space-x-2 px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>登出</span>
          </button>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* 顶部栏 */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-4">
            {selectedIdentity && (
              <button
                onClick={() => {
                  setSelectedIdentity(null);
                  setIdentityUsers([]);
                }}
                className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-slate-500" />
              </button>
            )}
            <h2 className="text-lg font-semibold text-slate-800">
              {selectedIdentity ? selectedIdentity.name : '身份管理'}
            </h2>
            {selectedIdentity && (
              <span className="text-sm text-slate-400">
                {identityUsers.length} 位用户
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {selectedIdentity ? (
              <>
                <button
                  onClick={() => setShowAddUsersModal(true)}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>添加用户</span>
                </button>
              </>
            ) : activeTab === 'managed' ? (
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                <Plus className="w-4 h-4" />
                <span>新建身份</span>
              </button>
            ) : null}
          </div>
        </header>

        {/* 标签页（非详情视图时显示） */}
        {!selectedIdentity && (
          <div className="bg-white border-b border-slate-200 px-6">
            <div className="flex space-x-1">
              <button
                onClick={() => setActiveTab('managed')}
                className={`flex items-center space-x-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'managed'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>我管理的身份</span>
                {identities.length > 0 && (
                  <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${
                    activeTab === 'managed' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {identities.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('granted')}
                className={`flex items-center space-x-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'granted'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <Shield className="w-4 h-4" />
                <span>我被授予的身份</span>
                {grantedIdentities.length > 0 && (
                  <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${
                    activeTab === 'granted' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {grantedIdentities.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="mx-6 mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <span className="text-sm text-red-700">{error}</span>
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-4 h-4 text-red-400 hover:text-red-600" />
            </button>
          </div>
        )}

        {/* 内容区 */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          ) : selectedIdentity ? (
            /* 身份详情视图 - 用户列表 */
            <div className="space-y-4">
              {/* 身份信息卡片 */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800">{selectedIdentity.name}</h3>
                    {selectedIdentity.description && (
                      <p className="text-sm text-slate-500 mt-1">{selectedIdentity.description}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-2">
                      创建于 {new Date(selectedIdentity.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => openEditModal(selectedIdentity)}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="编辑身份"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(selectedIdentity)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="删除身份"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* 用户列表 */}
              {loadingUsers ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                </div>
              ) : identityUsers.length === 0 ? (
                <div className="text-center py-16">
                  <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500">该身份下暂无用户</p>
                  <p className="text-sm text-slate-400 mt-1">点击「添加用户」开始分配</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                          用户邮箱
                        </th>
                        <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                          分配时间
                        </th>
                        <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                          操作
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {identityUsers.map((iu) => (
                        <tr key={iu.user_id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-medium text-xs">
                                {iu.user_email.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-sm text-slate-700">{iu.user_email}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-sm text-slate-500">
                            {new Date(iu.assigned_at).toLocaleString()}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <button
                              onClick={() => handleRemoveUser(iu.user_email)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="移除用户"
                            >
                              <UserMinus className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : activeTab === 'managed' ? (
            /* 我管理的身份 */
            identities.length === 0 ? (
              /* 空状态 */
              <div className="text-center py-20">
                <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-600 mb-2">暂无身份</h3>
                <p className="text-sm text-slate-400 mb-6">创建身份来批量管理用户组</p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center space-x-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>新建身份</span>
                </button>
              </div>
            ) : (
              /* 身份列表 */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {identities.map((identity) => (
                  <div
                    key={identity.id}
                    className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => handleSelectIdentity(identity)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <div className="bg-blue-50 p-2.5 rounded-lg">
                          <Users className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-slate-800">{identity.name}</h3>
                          <p className="text-xs text-slate-400">{identity.user_count} 位用户</p>
                        </div>
                      </div>
                      <div
                        className="flex items-center space-x-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => openEditModal(identity)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="编辑"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(identity)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="删除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {identity.description && (
                      <p className="text-sm text-slate-500 line-clamp-2">{identity.description}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-3">
                      {new Date(identity.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )
          ) : (
            /* 我被授予的身份 */
            loadingGranted ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              </div>
            ) : grantedIdentities.length === 0 ? (
              <div className="text-center py-20">
                <Shield className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-600 mb-2">暂无被授予的身份</h3>
                <p className="text-sm text-slate-400">当其他用户将您添加到身份中时，将在此处显示</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {grantedIdentities.map((identity) => (
                  <div
                    key={identity.id}
                    className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="bg-indigo-50 p-2.5 rounded-lg">
                        <Shield className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-800">{identity.name}</h3>
                        <p className="text-xs text-slate-400">
                          授予于 {new Date(identity.assigned_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    {identity.description && (
                      <p className="text-sm text-slate-500 line-clamp-2 mb-3">{identity.description}</p>
                    )}
                    <div className="pt-3 border-t border-slate-100">
                      <p className="text-xs text-slate-400">
                        创建于 {new Date(identity.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </main>

      {/* 创建身份弹窗 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800">新建身份</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">身份名称</label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="例如：开发团队"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">描述（可选）</label>
                <textarea
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  placeholder="身份描述..."
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !createName.trim()}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
              >
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>创建</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑身份弹窗 */}
      {editingIdentity && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800">编辑身份</h3>
              <button
                onClick={() => setEditingIdentity(null)}
                className="p-1 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">身份名称</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">描述（可选）</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setEditingIdentity(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleUpdate}
                disabled={updating || !editName.trim()}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
              >
                {updating && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>保存</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 批量添加用户弹窗 */}
      {showAddUsersModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800">批量添加用户</h3>
              <button
                onClick={() => setShowAddUsersModal(false)}
                className="p-1 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  用户邮箱（每行一个，或用逗号分隔）
                </label>
                <textarea
                  value={addEmailsInput}
                  onChange={(e) => setAddEmailsInput(e.target.value)}
                  placeholder={"user1@example.com\nuser2@example.com\nuser3@example.com"}
                  rows={5}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm resize-none font-mono"
                  autoFocus
                />
              </div>
              <p className="text-xs text-slate-400">
                支持逗号、分号或换行分隔的多个邮箱地址
              </p>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowAddUsersModal(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleBatchAddUsers}
                disabled={addingUsers || !addEmailsInput.trim()}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
              >
                {addingUsers && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>添加</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
