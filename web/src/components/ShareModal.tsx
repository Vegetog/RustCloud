// 分享弹窗：创建分享链接并授予用户权限

import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react';
import { isAxiosError } from 'axios';
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
  Users,
  Link as LinkIcon,
  Shield,
} from 'lucide-react';
import { apiService } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { CryptoService } from '../services/crypto';
import type { Identity } from '../types/identity';

interface ShareModalProps {
  documentId: string;
  encryptedKey: string;
  onClose: () => void;
}

type ShareTab = 'link' | 'user' | 'identity';

interface SharedUser {
  user_id: string;
  user_email: string;
  permission_level: string;
  granted_at: string;
}

interface LinkSharingContentProps {
  error: string | null;
  shareLink: string | null;
  copied: boolean;
  useExpiration: boolean;
  setUseExpiration: Dispatch<SetStateAction<boolean>>;
  expirationHours: number;
  setExpirationHours: Dispatch<SetStateAction<number>>;
  useMaxAccess: boolean;
  setUseMaxAccess: Dispatch<SetStateAction<boolean>>;
  maxAccessCount: number;
  setMaxAccessCount: Dispatch<SetStateAction<number>>;
  onCopy: () => void;
}

interface UserSharingContentProps {
  error: string | null;
  targetEmail: string;
  setTargetEmail: Dispatch<SetStateAction<string>>;
  permissionLevel: 'read' | 'write';
  setPermissionLevel: Dispatch<SetStateAction<'read' | 'write'>>;
  sharedUsers: SharedUser[];
  loadingUsers: boolean;
  grantingPermission: boolean;
  onGrantPermission: () => void;
  onRevokePermission: (userId: string) => void;
}

interface IdentitySharingContentProps {
  error: string | null;
  identities: Identity[];
  loadingIdentities: boolean;
  selectedIdentityId: string | null;
  setSelectedIdentityId: Dispatch<SetStateAction<string | null>>;
  identityPermissionLevel: 'read' | 'write';
  setIdentityPermissionLevel: Dispatch<SetStateAction<'read' | 'write'>>;
  grantingIdentity: boolean;
  identityResult: { success: number; failed: string[] } | null;
  onGrantIdentity: () => void;
}

export function ShareModal({ documentId, encryptedKey, onClose }: ShareModalProps) {
  const { privateKey, publicKey } = useAuthStore();
  const [activeTab, setActiveTab] = useState<ShareTab>('link');
  const [error, setError] = useState<string | null>(null);

  // 链接分享状态（现有）
  const [loading, setLoading] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [useExpiration, setUseExpiration] = useState(false);
  const [expirationHours, setExpirationHours] = useState(24);
  const [useMaxAccess, setUseMaxAccess] = useState(false);
  const [maxAccessCount, setMaxAccessCount] = useState(10);

  // 用户分享状态（新增）
  const [targetEmail, setTargetEmail] = useState('');
  const [permissionLevel, setPermissionLevel] = useState<'read' | 'write'>('read');
  const [grantingPermission, setGrantingPermission] = useState(false);
  const [sharedUsers, setSharedUsers] = useState<SharedUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // 身份分享状态
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [loadingIdentities, setLoadingIdentities] = useState(false);
  const [selectedIdentityId, setSelectedIdentityId] = useState<string | null>(null);
  const [identityPermissionLevel, setIdentityPermissionLevel] = useState<'read' | 'write'>('read');
  const [grantingIdentity, setGrantingIdentity] = useState(false);
  const [identityResult, setIdentityResult] = useState<{ success: number; failed: string[] } | null>(null);

  // 切换到用户标签时加载已授权用户
  const loadSharedUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const response = await apiService.getDocumentPermissions(documentId);
      setSharedUsers(response.data.data);
    } catch (err) {
      console.error('Failed to load shared users:', err);
      setError('获取授权列表失败');
    } finally {
      setLoadingUsers(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (activeTab === 'user') {
      void loadSharedUsers();
    }
  }, [activeTab, loadSharedUsers]);

  // 切换到身份标签时加载身份列表
  const loadIdentities = useCallback(async () => {
    setLoadingIdentities(true);
    try {
      const response = await apiService.listIdentities();
      setIdentities(response.data.data.identities);
    } catch (err) {
      console.error('Failed to load identities:', err);
      setError('获取身份列表失败');
    } finally {
      setLoadingIdentities(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'identity') {
      void loadIdentities();
    }
  }, [activeTab, loadIdentities]);

  const handleCreateShare = async () => {
    if (!privateKey || !publicKey) {
      setError('请先登录');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const crypto = new CryptoService();

      // 1. 用用户私钥解密文档密钥
      const encryptedKeyBuffer = crypto.base64ToArrayBuffer(encryptedKey);
      const documentKeyBuffer = await window.crypto.subtle.decrypt(
        { name: 'RSA-OAEP' },
        privateKey,
        encryptedKeyBuffer
      );

      // 2. 将文档密钥转换为 base64 用于 URL 片段
      const documentKeyBase64 = crypto.arrayBufferToBase64(documentKeyBuffer);

      // 3. 用用户公钥重新加密文档密钥（用于 API 存储）
      const shareEncryptedKey = crypto.arrayBufferToBase64(encryptedKeyBuffer);

      // 4. 计算过期秒数（后端字段为 expires_in）
      let expiresIn: number | null = null;
      if (useExpiration) {
        expiresIn = expirationHours * 3600;
      }

      // 6. 通过 API 创建分享链接
      const response = await apiService.createShare({
        document_id: documentId,
        encrypted_key: shareEncryptedKey,
        expires_in: expiresIn,
        max_access_count: useMaxAccess ? maxAccessCount : null,
      });

      const shareToken = response.data.data.access_token;

      // 7. 生成含文档密钥 片段的分享链接（实现零知识）
      const shareUrl = `${window.location.origin}/share/${shareToken}#${documentKeyBase64}`;

      setShareLink(shareUrl);
      setLoading(false);
    } catch (err) {
      console.error('Failed to create share:', err);
      const message = isAxiosError(err)
        ? ((err.response?.data as { message?: string } | undefined)?.message || err.message)
        : err instanceof Error
          ? err.message
          : '创建分享链接失败';
      setError(message);
      setLoading(false);
    }
  };

  const handleGrantPermission = async () => {
    if (!privateKey || !targetEmail) {
      setError('请输入有效的用户邮箱');
      return;
    }

    setGrantingPermission(true);
    setError(null);

    try {
      const crypto = new CryptoService();

      // 1. 获取目标用户的公钥
      const publicKeyResponse = await apiService.getUserPublicKey(targetEmail);
      const targetPublicKey = publicKeyResponse.data.data.public_key;

      // 2. 为目标用户重新加密文档密钥
      const reEncryptedKey = await crypto.reEncryptDocumentKey(
        encryptedKey,
        privateKey,
        targetPublicKey
      );

      // 3. 授予权限
      await apiService.grantPermission(documentId, {
        user_email: targetEmail,
        permission_level: permissionLevel,
        encrypted_key: reEncryptedKey,
      });

      // 4. 刷新用户列表
      await loadSharedUsers();

      // 5. 清空表单
      setTargetEmail('');
      setPermissionLevel('read');

      setGrantingPermission(false);
    } catch (err) {
      console.error('Failed to grant permission:', err);
      const errorMsg = isAxiosError(err)
        ? ((err.response?.data as { message?: string } | undefined)?.message || err.message)
        : err instanceof Error
          ? err.message
          : '授权失败';

      if (errorMsg.includes('User not found')) {
        setError('用户不存在，请检查邮箱地址');
      } else if (errorMsg.includes('already has access')) {
        setError('该用户已拥有此文档的访问权限');
      } else {
        setError(errorMsg);
      }

      setGrantingPermission(false);
    }
  };

  const handleRevokePermission = async (userId: string) => {
    if (!window.confirm('确定要撤销此用户的访问权限吗?')) {
      return;
    }

    try {
      await apiService.revokePermission(documentId, userId);
      await loadSharedUsers();
    } catch (err) {
      console.error('Failed to revoke permission:', err);
      const message = isAxiosError(err)
        ? ((err.response?.data as { message?: string } | undefined)?.message || err.message)
        : err instanceof Error
          ? err.message
          : '撤销权限失败';
      setError(message);
    }
  };

  const handleGrantIdentity = async () => {
    if (!privateKey || !selectedIdentityId) {
      setError('请选择一个身份');
      return;
    }

    setGrantingIdentity(true);
    setError(null);
    setIdentityResult(null);

    try {
      const crypto = new CryptoService();

      // 1. 获取身份下的用户列表
      const identityResponse = await apiService.getIdentity(selectedIdentityId);
      const identityUsers = identityResponse.data.data.users;

      if (identityUsers.length === 0) {
        setError('该身份下没有用户');
        setGrantingIdentity(false);
        return;
      }

      let successCount = 0;
      const failedEmails: string[] = [];

      // 2. 并行为所有用户授权（提高性能）
      const results = await Promise.allSettled(
        identityUsers.map(async (identityUser) => {
          // 获取目标用户的公钥
          const publicKeyResponse = await apiService.getUserPublicKey(identityUser.user_email);
          const targetPublicKey = publicKeyResponse.data.data.public_key;

          // 用私钥解密文档密钥，再用目标用户公钥重新加密
          const reEncryptedKey = await crypto.reEncryptDocumentKey(
            encryptedKey,
            privateKey,
            targetPublicKey
          );

          // 授予权限
          await apiService.grantPermission(documentId, {
            user_email: identityUser.user_email,
            permission_level: identityPermissionLevel,
            encrypted_key: reEncryptedKey,
          });

          return identityUser.user_email;
        })
      );

      for (const [i, result] of results.entries()) {
        if (result.status === 'fulfilled') {
          successCount++;
        } else {
          console.error(`Failed to grant permission to ${identityUsers[i].user_email}:`, result.reason);
          failedEmails.push(identityUsers[i].user_email);
        }
      }

      setIdentityResult({ success: successCount, failed: failedEmails });
      setGrantingIdentity(false);
    } catch (err) {
      console.error('Failed to grant identity permission:', err);
      const errorMsg = isAxiosError(err)
        ? ((err.response?.data as { message?: string } | undefined)?.message || err.message)
        : err instanceof Error
          ? err.message
          : '身份分享失败';
      setError(errorMsg);
      setGrantingIdentity(false);
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
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in"
        onClick={onClose}
      >
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
                <h2 className="text-lg font-semibold text-slate-900">文档分享</h2>
                <p className="text-xs text-slate-500">零知识端到端加密</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {/* 标签导航 */}
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setActiveTab('link')}
              className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'link'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LinkIcon className="w-4 h-4" />
              <span>链接分享</span>
            </button>
            <button
              onClick={() => setActiveTab('user')}
              className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'user'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>指定用户</span>
            </button>
            <button
              onClick={() => setActiveTab('identity')}
              className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'identity'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>指定身份</span>
            </button>
          </div>

          {/* 内容区 */}
          <div className="p-6">
            {activeTab === 'link' ? (
              <LinkSharingContent
                error={error}
                shareLink={shareLink}
                copied={copied}
                useExpiration={useExpiration}
                setUseExpiration={setUseExpiration}
                expirationHours={expirationHours}
                setExpirationHours={setExpirationHours}
                useMaxAccess={useMaxAccess}
                setUseMaxAccess={setUseMaxAccess}
                maxAccessCount={maxAccessCount}
                setMaxAccessCount={setMaxAccessCount}
                onCopy={handleCopy}
              />
            ) : activeTab === 'user' ? (
              <UserSharingContent
                error={error}
                targetEmail={targetEmail}
                setTargetEmail={setTargetEmail}
                permissionLevel={permissionLevel}
                setPermissionLevel={setPermissionLevel}
                sharedUsers={sharedUsers}
                loadingUsers={loadingUsers}
                grantingPermission={grantingPermission}
                onGrantPermission={handleGrantPermission}
                onRevokePermission={handleRevokePermission}
              />
            ) : (
              <IdentitySharingContent
                error={error}
                identities={identities}
                loadingIdentities={loadingIdentities}
                selectedIdentityId={selectedIdentityId}
                setSelectedIdentityId={setSelectedIdentityId}
                identityPermissionLevel={identityPermissionLevel}
                setIdentityPermissionLevel={setIdentityPermissionLevel}
                grantingIdentity={grantingIdentity}
                identityResult={identityResult}
                onGrantIdentity={handleGrantIdentity}
              />
            )}
          </div>

          {/* 底部按钮 */}
          <div className="flex space-x-3 p-6 border-t border-slate-200">
            {activeTab === 'link' && !shareLink ? (
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

// 链接分享标签组件
function LinkSharingContent({
  error,
  shareLink,
  copied,
  useExpiration,
  setUseExpiration,
  expirationHours,
  setExpirationHours,
  useMaxAccess,
  setUseMaxAccess,
  maxAccessCount,
  setMaxAccessCount,
  onCopy,
}: LinkSharingContentProps) {
  return (
    <div className="space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-700">{error}</div>
        </div>
      )}

      {!shareLink ? (
        <>
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
                  文档密钥在 URL 片段中传输，服务器无法解密您的文件。
                </p>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-start space-x-3">
            <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-emerald-900 mb-1">分享链接已生成</p>
              <p className="text-xs text-emerald-700">复制链接并分享给需要访问的人</p>
            </div>
          </div>

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
                onClick={onCopy}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center space-x-2 ${
                  copied ? 'bg-emerald-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
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

          <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
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
            {!useExpiration && !useMaxAccess && (
              <p className="text-slate-500">无限制分享</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// 用户分享标签组件
function UserSharingContent({
  error,
  targetEmail,
  setTargetEmail,
  permissionLevel,
  setPermissionLevel,
  sharedUsers,
  loadingUsers,
  grantingPermission,
  onGrantPermission,
  onRevokePermission,
}: UserSharingContentProps) {
  return (
    <div className="space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-700">{error}</div>
        </div>
      )}

      {/* 邮箱输入 */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">用户邮箱</label>
        <input
          type="email"
          value={targetEmail}
          onChange={(e) => setTargetEmail(e.target.value)}
          placeholder="user@example.com"
          className="w-full border border-slate-200 rounded-lg py-2.5 px-4 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
        />
      </div>

      {/* 权限级别 */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">权限级别</label>
        <div className="flex space-x-3">
          <button
            onClick={() => setPermissionLevel('read')}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              permissionLevel === 'read'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            只读
          </button>
          <button
            onClick={() => setPermissionLevel('write')}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              permissionLevel === 'write'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            读写
          </button>
        </div>
      </div>

      {/* 授权按钮 */}
      <button
        onClick={onGrantPermission}
        disabled={!targetEmail || grantingPermission}
        className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors shadow-lg shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
      >
        {grantingPermission ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>授权中...</span>
          </>
        ) : (
          <span>授予权限</span>
        )}
      </button>

      {/* 已授权用户列表 */}
      <div className="space-y-3 border-t border-slate-200 pt-4">
        <h4 className="text-sm font-medium text-slate-700">已授权用户</h4>

        {loadingUsers ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
          </div>
        ) : sharedUsers.length === 0 ? (
          <div className="text-center py-8">
            <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">尚未与其他用户分享</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sharedUsers.map((user: SharedUser) => (
              <div
                key={user.user_id}
                className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">
                    {user.user_email}
                  </div>
                  <div className="text-xs text-slate-500">
                    {user.permission_level === 'read' ? '只读' : user.permission_level === 'write' ? '读写' : '所有者'}
                  </div>
                </div>
                {user.permission_level !== 'owner' && (
                  <button
                    onClick={() => onRevokePermission(user.user_id)}
                    className="ml-3 p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="撤销权限"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 安全提示 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <Lock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-blue-900">
            <p className="font-medium mb-1">零知识密钥重加密</p>
            <p className="text-blue-700">
              文档密钥在本地重新加密后分享，服务器无法解密您的文件内容。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// 身份分享标签组件
function IdentitySharingContent({
  error,
  identities,
  loadingIdentities,
  selectedIdentityId,
  setSelectedIdentityId,
  identityPermissionLevel,
  setIdentityPermissionLevel,
  grantingIdentity,
  identityResult,
  onGrantIdentity,
}: IdentitySharingContentProps) {
  return (
    <div className="space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-700">{error}</div>
        </div>
      )}

      {identityResult && (
        <div className={`rounded-lg p-4 flex items-start space-x-3 ${
          identityResult.failed.length === 0
            ? 'bg-emerald-50 border border-emerald-200'
            : 'bg-amber-50 border border-amber-200'
        }`}>
          <CheckCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
            identityResult.failed.length === 0 ? 'text-emerald-600' : 'text-amber-600'
          }`} />
          <div className="text-sm">
            <p className={identityResult.failed.length === 0 ? 'text-emerald-900' : 'text-amber-900'}>
              成功授权 {identityResult.success} 位用户
            </p>
            {identityResult.failed.length > 0 && (
              <p className="text-amber-700 mt-1">
                以下用户授权失败（可能已拥有权限）：{identityResult.failed.join(', ')}
              </p>
            )}
          </div>
        </div>
      )}

      {/* 身份选择 */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">选择身份</label>
        {loadingIdentities ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
          </div>
        ) : identities.length === 0 ? (
          <div className="text-center py-8">
            <Shield className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">尚未创建身份</p>
            <p className="text-xs text-slate-400 mt-1">请先在身份管理页面创建身份并添加用户</p>
          </div>
        ) : (
          <div className="space-y-2">
            {identities.map((identity) => (
              <button
                key={identity.id}
                onClick={() => setSelectedIdentityId(identity.id === selectedIdentityId ? null : identity.id)}
                className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all text-left ${
                  selectedIdentityId === identity.id
                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/20'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className={`p-1.5 rounded-lg ${
                    selectedIdentityId === identity.id ? 'bg-blue-100' : 'bg-slate-100'
                  }`}>
                    <Shield className={`w-4 h-4 ${
                      selectedIdentityId === identity.id ? 'text-blue-600' : 'text-slate-500'
                    }`} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-900">{identity.name}</div>
                    {identity.description && (
                      <div className="text-xs text-slate-500">{identity.description}</div>
                    )}
                  </div>
                </div>
                <span className="text-xs text-slate-400">{identity.user_count} 位用户</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 权限级别 */}
      {identities.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">权限级别</label>
          <div className="flex space-x-3">
            <button
              onClick={() => setIdentityPermissionLevel('read')}
              className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                identityPermissionLevel === 'read'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              只读
            </button>
            <button
              onClick={() => setIdentityPermissionLevel('write')}
              className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                identityPermissionLevel === 'write'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              读写
            </button>
          </div>
        </div>
      )}

      {/* 授权按钮 */}
      {identities.length > 0 && (
        <button
          onClick={onGrantIdentity}
          disabled={!selectedIdentityId || grantingIdentity}
          className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors shadow-lg shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
        >
          {grantingIdentity ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>授权中...</span>
            </>
          ) : (
            <span>向身份成员授权</span>
          )}
        </button>
      )}

      {/* 安全提示 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <Lock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-blue-900">
            <p className="font-medium mb-1">零知识密钥重加密</p>
            <p className="text-blue-700">
              文档密钥将为身份中的每个用户单独重加密，服务器无法解密您的文件内容。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
