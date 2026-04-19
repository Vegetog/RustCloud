// 分享弹窗：支持单文档分享和文件夹分享（用户间 E2EE 重加密）

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
  FolderOpen,
} from 'lucide-react';
import { apiService } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { CryptoService } from '../services/crypto';
import type { Identity } from '../types/identity';
import type {
  ShareFolderKeyEntry,
  ShareDocumentKeyEntry,
  ManifestFolderItem,
  ManifestDocumentItem,
  FolderShareManifest,
} from '../types/folder';

// ===== Props =====

interface ShareModalProps {
  /** 文档模式：传 documentId + encryptedKey */
  documentId?: string;
  encryptedKey?: string;
  /** 文件夹模式：传 folderId */
  folderId?: string;
  onClose: () => void;
}

type ShareTab = 'link' | 'user' | 'identity';

interface SharedUser {
  user_id: string;
  user_email: string;
  permission_level: string;
  granted_at: string;
}

// ===== 子组件 Props =====

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
  isFolderMode: boolean;
  linkProgress: { current: number; total: number } | null;
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
  progress: { current: number; total: number } | null;
  onGrantPermission: () => void;
  onRevokePermission: (userId: string) => void;
  isFolderMode: boolean;
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
  progress: { current: number; total: number } | null;
  onGrantIdentity: () => void;
  isFolderMode: boolean;
}

// ===== 主组件 =====

export function ShareModal({ documentId, encryptedKey, folderId, onClose }: ShareModalProps) {
  const { privateKey, publicKey } = useAuthStore();
  const isFolderMode = !!folderId;

  const [activeTab, setActiveTab] = useState<ShareTab>('link');
  const [error, setError] = useState<string | null>(null);

  // 链接分享状态
  const [loading, setLoading] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [useExpiration, setUseExpiration] = useState(false);
  const [expirationHours, setExpirationHours] = useState(24);
  const [useMaxAccess, setUseMaxAccess] = useState(false);
  const [maxAccessCount, setMaxAccessCount] = useState(10);
  const [linkProgress, setLinkProgress] = useState<{ current: number; total: number } | null>(null);

  // 用户分享状态
  const [targetEmail, setTargetEmail] = useState('');
  const [permissionLevel, setPermissionLevel] = useState<'read' | 'write'>('read');
  const [grantingPermission, setGrantingPermission] = useState(false);
  const [sharedUsers, setSharedUsers] = useState<SharedUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [grantProgress, setGrantProgress] = useState<{ current: number; total: number } | null>(null);

  // 身份分享状态
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [loadingIdentities, setLoadingIdentities] = useState(false);
  const [selectedIdentityId, setSelectedIdentityId] = useState<string | null>(null);
  const [identityPermissionLevel, setIdentityPermissionLevel] = useState<'read' | 'write'>('read');
  const [grantingIdentity, setGrantingIdentity] = useState(false);
  const [identityResult, setIdentityResult] = useState<{ success: number; failed: string[] } | null>(null);
  const [identityProgress, setIdentityProgress] = useState<{ current: number; total: number } | null>(null);

  // 切换到用户标签时加载已授权用户（文档模式）
  const loadSharedUsers = useCallback(async () => {
    if (isFolderMode) return;
    setLoadingUsers(true);
    try {
      const response = await apiService.getDocumentPermissions(documentId!);
      setSharedUsers(response.data.data);
    } catch (err) {
      console.error('Failed to load shared users:', err);
      setError('获取授权列表失败');
    } finally {
      setLoadingUsers(false);
    }
  }, [documentId, isFolderMode]);

  useEffect(() => {
    if (activeTab === 'user') void loadSharedUsers();
  }, [activeTab, loadSharedUsers]);

  // 加载身份列表
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
    if (activeTab === 'identity') void loadIdentities();
  }, [activeTab, loadIdentities]);

  // ===== 辅助：构造文件夹快照重加密数据 =====

  const buildFolderSharePayload = async (
    targetPublicKeyBase64: string,
  ): Promise<{ folder_keys: ShareFolderKeyEntry[]; document_keys: ShareDocumentKeyEntry[] }> => {
    const crypto = new CryptoService();

    // 拉取子树快照
    const snapshotRes = await apiService.getFolderSnapshot(folderId!);
    const snapshot = snapshotRes.data.data;

    // 导入目标用户公钥
    const targetPubKeyBuffer = crypto.base64ToArrayBuffer(targetPublicKeyBase64);
    const targetPubKey = await window.crypto.subtle.importKey(
      'spki',
      targetPubKeyBuffer,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['encrypt']
    );

    const totalItems = snapshot.folders.length + snapshot.documents.length;
    let done = 0;
    setGrantProgress({ current: 0, total: totalItems });

    // 重加密文件夹名（RSA-OAEP 解密后再用目标公钥加密）
    const folder_keys: ShareFolderKeyEntry[] = await Promise.all(
      snapshot.folders.map(async (f) => {
        // 用 owner 私钥解密文件夹名
        const nameBuffer = await window.crypto.subtle.decrypt(
          { name: 'RSA-OAEP' },
          privateKey!,
          crypto.base64ToArrayBuffer(f.encrypted_name)
        );
        // 用目标公钥重加密
        const reEncrypted = await window.crypto.subtle.encrypt(
          { name: 'RSA-OAEP' },
          targetPubKey,
          nameBuffer
        );
        setGrantProgress({ current: ++done, total: totalItems });
        return {
          folder_id: f.id,
          encrypted_name: crypto.arrayBufferToBase64(reEncrypted),
        };
      })
    );

    // 重加密文档 DEK（RSA-OAEP 解密后再用目标公钥加密）
    const document_keys: ShareDocumentKeyEntry[] = await Promise.all(
      snapshot.documents.map(async (d) => {
        const reEncryptedKey = await crypto.reEncryptDocumentKey(
          d.encrypted_key,
          privateKey!,
          targetPublicKeyBase64
        );
        setGrantProgress({ current: ++done, total: totalItems });
        return {
          document_id: d.id,
          encrypted_key: reEncryptedKey,
        };
      })
    );

    return { folder_keys, document_keys };
  };

  // ===== 构造文件夹公开链接 manifest =====

  const buildFolderShareManifest = async (
    ephemeralPubKey: CryptoKey
  ): Promise<FolderShareManifest> => {
    const crypto = new CryptoService();
    const snapshotRes = await apiService.getFolderSnapshot(folderId!);
    const snapshot = snapshotRes.data.data;

    const totalItems = snapshot.folders.length + snapshot.documents.length;
    let done = 0;
    setLinkProgress({ current: 0, total: totalItems });

    // 重加密文件夹名（owner 私钥解密 → 临时公钥加密）
    const folders: ManifestFolderItem[] = await Promise.all(
      snapshot.folders.map(async (f) => {
        const nameBuffer = await window.crypto.subtle.decrypt(
          { name: 'RSA-OAEP' }, privateKey!, crypto.base64ToArrayBuffer(f.encrypted_name)
        );
        const reEncrypted = await window.crypto.subtle.encrypt(
          { name: 'RSA-OAEP' }, ephemeralPubKey, nameBuffer
        );
        setLinkProgress({ current: ++done, total: totalItems });
        return {
          id: f.id,
          parent_id: f.parent_id ?? null,
          encrypted_name: crypto.arrayBufferToBase64(reEncrypted),
        };
      })
    );

    // 重加密文档 DEK（owner 私钥解密 → 临时公钥加密）
    // encrypted_name/name_nonce/content_nonce/size/mime_type 保持原值（AES-GCM，DEK 解密后可用）
    const documents: ManifestDocumentItem[] = await Promise.all(
      snapshot.documents.map(async (d) => {
        const dekBuffer = await window.crypto.subtle.decrypt(
          { name: 'RSA-OAEP' }, privateKey!, crypto.base64ToArrayBuffer(d.encrypted_key)
        );
        const reEncryptedDek = await window.crypto.subtle.encrypt(
          { name: 'RSA-OAEP' }, ephemeralPubKey, dekBuffer
        );
        setLinkProgress({ current: ++done, total: totalItems });
        return {
          id: d.id,
          folder_id: d.folder_id ?? null,
          encrypted_key: crypto.arrayBufferToBase64(reEncryptedDek),
          encrypted_name: d.encrypted_name,
          name_nonce: d.name_nonce,
          content_nonce: d.content_nonce,
          size: d.size,
          mime_type: d.mime_type,
        };
      })
    );

    return { root_folder_id: snapshot.root_folder_id, folders, documents };
  };

  // ===== 文件夹公开链接分享 =====

  const handleCreateFolderShare = async () => {
    if (!privateKey) { setError('请先登录'); return; }
    setLoading(true);
    setError(null);
    setShareLink(null);
    setLinkProgress(null);
    try {
      const crypto = new CryptoService();

      // 生成临时密钥对
      const { publicKey: ephemeralPubKey, privateKey: ephemeralPrivKey } =
        await crypto.generateEphemeralKeyPair();

      // 构造 manifest（所有密钥均用临时公钥重加密）
      const manifest = await buildFolderShareManifest(ephemeralPubKey);

      // 导出临时密钥
      const ephemeralPubKeyBase64 = await crypto.exportPublicKeySPKI(ephemeralPubKey);
      const ephemeralPrivKeyBase64 = await crypto.exportPrivateKeyPKCS8(ephemeralPrivKey);

      // 创建分享记录
      const expiresIn = useExpiration ? expirationHours * 3600 : undefined;
      const response = await apiService.createFolderShare({
        folder_id: folderId!,
        ephemeral_pubkey: ephemeralPubKeyBase64,
        manifest,
        expires_in: expiresIn,
        max_access_count: useMaxAccess ? maxAccessCount : undefined,
      });

      const shareToken = response.data.data.access_token;
      // 临时私钥放 URL fragment，服务器永远收不到
      setShareLink(`${window.location.origin}/share/${shareToken}#esk=${ephemeralPrivKeyBase64}`);
    } catch (err) {
      const message = isAxiosError(err)
        ? ((err.response?.data as { message?: string } | undefined)?.message || err.message)
        : err instanceof Error ? err.message : '创建分享链接失败';
      setError(message);
    } finally {
      setLoading(false);
      setLinkProgress(null);
    }
  };

  // ===== 链接分享（文档模式） =====

  const handleCreateShare = async () => {
    if (!privateKey || !publicKey) { setError('请先登录'); return; }
    setLoading(true);
    setError(null);
    try {
      const crypto = new CryptoService();
      const encryptedKeyBuffer = crypto.base64ToArrayBuffer(encryptedKey!);
      const documentKeyBuffer = await window.crypto.subtle.decrypt(
        { name: 'RSA-OAEP' }, privateKey, encryptedKeyBuffer
      );
      const documentKeyBase64 = crypto.arrayBufferToBase64(documentKeyBuffer);
      const shareEncryptedKey = crypto.arrayBufferToBase64(encryptedKeyBuffer);
      let expiresIn: number | null = null;
      if (useExpiration) expiresIn = expirationHours * 3600;

      const response = await apiService.createShare({
        document_id: documentId!,
        encrypted_key: shareEncryptedKey,
        expires_in: expiresIn,
        max_access_count: useMaxAccess ? maxAccessCount : null,
      });
      const shareToken = response.data.data.access_token;
      setShareLink(`${window.location.origin}/share/${shareToken}#${documentKeyBase64}`);
    } catch (err) {
      const message = isAxiosError(err)
        ? ((err.response?.data as { message?: string } | undefined)?.message || err.message)
        : err instanceof Error ? err.message : '创建分享链接失败';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // ===== 用户间授权 =====

  const handleGrantPermission = async () => {
    if (!privateKey || !targetEmail) { setError('请输入有效的用户邮箱'); return; }
    setGrantingPermission(true);
    setError(null);
    setGrantProgress(null);

    try {
      const crypto = new CryptoService();
      const publicKeyResponse = await apiService.getUserPublicKey(targetEmail);
      const targetPublicKey = publicKeyResponse.data.data.public_key;

      if (isFolderMode) {
        // 文件夹模式：拉取快照 → 批量重加密 → 提交
        const payload = await buildFolderSharePayload(targetPublicKey);
        await apiService.shareFolder(folderId!, {
          target_email: targetEmail,
          permission_level: permissionLevel,
          ...payload,
        });
        setGrantProgress(null);
        setTargetEmail('');
        setPermissionLevel('read');
      } else {
        // 文档模式：单文件重加密
        const reEncryptedKey = await crypto.reEncryptDocumentKey(
          encryptedKey!,
          privateKey,
          targetPublicKey
        );
        await apiService.grantPermission(documentId!, {
          user_email: targetEmail,
          permission_level: permissionLevel,
          encrypted_key: reEncryptedKey,
        });
        await loadSharedUsers();
        setTargetEmail('');
        setPermissionLevel('read');
      }
    } catch (err) {
      console.error('Failed to grant permission:', err);
      const errorMsg = isAxiosError(err)
        ? ((err.response?.data as { message?: string } | undefined)?.message || err.message)
        : err instanceof Error ? err.message : '授权失败';
      setError(
        errorMsg.includes('User not found') ? '用户不存在，请检查邮箱地址' :
        errorMsg.includes('already has access') ? '该用户已拥有此文档的访问权限' :
        errorMsg
      );
    } finally {
      setGrantingPermission(false);
      setGrantProgress(null);
    }
  };

  const handleRevokePermission = async (userId: string) => {
    if (!window.confirm('确定要撤销此用户的访问权限吗?')) return;
    try {
      await apiService.revokePermission(documentId!, userId);
      await loadSharedUsers();
    } catch (err) {
      const message = isAxiosError(err)
        ? ((err.response?.data as { message?: string } | undefined)?.message || err.message)
        : err instanceof Error ? err.message : '撤销权限失败';
      setError(message);
    }
  };

  // ===== 身份授权 =====

  const handleGrantIdentity = async () => {
    if (!privateKey || !selectedIdentityId) { setError('请选择一个身份'); return; }
    setGrantingIdentity(true);
    setError(null);
    setIdentityResult(null);
    setIdentityProgress(null);

    try {
      const crypto = new CryptoService();
      const identityResponse = await apiService.getIdentity(selectedIdentityId);
      const identityUsers = identityResponse.data.data.users;

      if (identityUsers.length === 0) {
        setError('该身份下没有用户');
        return;
      }

      setIdentityProgress({ current: 0, total: identityUsers.length });
      let successCount = 0;
      const failedEmails: string[] = [];

      for (const [i, identityUser] of identityUsers.entries()) {
        try {
          const publicKeyResponse = await apiService.getUserPublicKey(identityUser.user_email);
          const targetPublicKey = publicKeyResponse.data.data.public_key;

          if (isFolderMode) {
            const payload = await buildFolderSharePayload(targetPublicKey);
            await apiService.shareFolder(folderId!, {
              target_email: identityUser.user_email,
              permission_level: identityPermissionLevel,
              ...payload,
            });
          } else {
            const reEncryptedKey = await crypto.reEncryptDocumentKey(
              encryptedKey!,
              privateKey,
              targetPublicKey
            );
            await apiService.grantPermission(documentId!, {
              user_email: identityUser.user_email,
              permission_level: identityPermissionLevel,
              encrypted_key: reEncryptedKey,
            });
          }
          successCount++;
        } catch (err) {
          console.error(`Failed to grant to ${identityUser.user_email}:`, err);
          failedEmails.push(identityUser.user_email);
        }
        setIdentityProgress({ current: i + 1, total: identityUsers.length });
      }

      setIdentityResult({ success: successCount, failed: failedEmails });
    } catch (err) {
      const errorMsg = isAxiosError(err)
        ? ((err.response?.data as { message?: string } | undefined)?.message || err.message)
        : err instanceof Error ? err.message : '身份分享失败';
      setError(errorMsg);
    } finally {
      setGrantingIdentity(false);
      setIdentityProgress(null);
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
            <div className={`p-2 rounded-lg ${isFolderMode ? 'bg-yellow-100' : 'bg-emerald-100'}`}>
              {isFolderMode
                ? <FolderOpen className="w-5 h-5 text-yellow-600" />
                : <Share2 className="w-5 h-5 text-emerald-600" />
              }
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {isFolderMode ? '文件夹分享' : '文档分享'}
              </h2>
              <p className="text-xs text-slate-500">零知识端到端加密</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* 标签导航 */}
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab('link')}
            className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'link' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LinkIcon className="w-4 h-4" />
            <span>链接分享</span>
          </button>
          <button
            onClick={() => setActiveTab('user')}
            className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'user' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>指定用户</span>
          </button>
          <button
            onClick={() => setActiveTab('identity')}
            className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'identity' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-600 hover:text-slate-900'
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
              isFolderMode={isFolderMode}
              linkProgress={linkProgress}
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
              progress={grantProgress}
              onGrantPermission={handleGrantPermission}
              onRevokePermission={handleRevokePermission}
              isFolderMode={isFolderMode}
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
              progress={identityProgress}
              onGrantIdentity={handleGrantIdentity}
              isFolderMode={isFolderMode}
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
                onClick={isFolderMode ? handleCreateFolderShare : handleCreateShare}
                disabled={loading}
                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors shadow-lg shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /><span>生成中...</span></>
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
  );
}

// ===== 进度条组件 =====

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-slate-500">
        <span>重加密进度</span>
        <span>{current} / {total}</span>
      </div>
      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ===== 链接分享 =====

function LinkSharingContent({
  error, shareLink, copied,
  useExpiration, setUseExpiration, expirationHours, setExpirationHours,
  useMaxAccess, setUseMaxAccess, maxAccessCount, setMaxAccessCount,
  onCopy, isFolderMode, linkProgress,
}: LinkSharingContentProps) {
  return (
    <div className="space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-700">{error}</div>
        </div>
      )}

      {linkProgress && <ProgressBar current={linkProgress.current} total={linkProgress.total} />}

      {isFolderMode && !shareLink && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start space-x-3">
          <Lock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-blue-900">
            <p className="font-medium mb-1">零知识文件夹公开链接</p>
            <p className="text-blue-700">
              系统将为此文件夹生成一次性临时密钥对。所有子项密钥在本地重加密后写入分享记录，
              临时私钥仅存于 URL 片段（不经过服务器）。任何拿到完整链接的人均可浏览并下载文件夹内容。
            </p>
          </div>
        </div>
      )}

      {!shareLink ? (
        <>
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <input type="checkbox" id="useExpiration" checked={useExpiration}
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
                <input type="number" value={expirationHours}
                  onChange={(e) => setExpirationHours(Number(e.target.value))}
                  min="1" max="720"
                  className="flex-1 border border-slate-200 rounded-lg py-2.5 px-4 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
                <span className="text-sm text-slate-600">小时</span>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <input type="checkbox" id="useMaxAccess" checked={useMaxAccess}
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
                <input type="number" value={maxAccessCount}
                  onChange={(e) => setMaxAccessCount(Number(e.target.value))}
                  min="1" max="1000"
                  className="flex-1 border border-slate-200 rounded-lg py-2.5 px-4 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
                <span className="text-sm text-slate-600">次</span>
              </div>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <Lock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-blue-900">
                <p className="font-medium mb-1">零知识分享</p>
                <p className="text-blue-700">文档密钥在 URL 片段中传输，服务器无法解密您的文件。</p>
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
              <input type="text" value={shareLink} readOnly
                className="flex-1 bg-slate-50 border border-slate-200 rounded-lg py-2.5 px-4 text-sm font-mono text-slate-600"
              />
              <button onClick={onCopy}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center space-x-2 ${
                  copied ? 'bg-emerald-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {copied ? <><CheckCircle className="w-4 h-4" /><span>已复制</span></> : <><Copy className="w-4 h-4" /><span>复制</span></>}
              </button>
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
            {useExpiration && (
              <div className="flex items-center space-x-2 text-slate-600">
                <Clock className="w-4 h-4" /><span>{expirationHours} 小时后过期</span>
              </div>
            )}
            {useMaxAccess && (
              <div className="flex items-center space-x-2 text-slate-600">
                <Hash className="w-4 h-4" /><span>最多访问 {maxAccessCount} 次</span>
              </div>
            )}
            {!useExpiration && !useMaxAccess && <p className="text-slate-500">无限制分享</p>}
          </div>
        </>
      )}
    </div>
  );
}

// ===== 用户分享 =====

function UserSharingContent({
  error, targetEmail, setTargetEmail, permissionLevel, setPermissionLevel,
  sharedUsers, loadingUsers, grantingPermission, progress,
  onGrantPermission, onRevokePermission, isFolderMode,
}: UserSharingContentProps) {
  return (
    <div className="space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-700">{error}</div>
        </div>
      )}

      {progress && <ProgressBar current={progress.current} total={progress.total} />}

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">用户邮箱</label>
        <input type="email" value={targetEmail} onChange={(e) => setTargetEmail(e.target.value)}
          placeholder="user@example.com"
          className="w-full border border-slate-200 rounded-lg py-2.5 px-4 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">权限级别</label>
        <div className="flex space-x-3">
          {(['read', 'write'] as const).map((lvl) => (
            <button key={lvl} onClick={() => setPermissionLevel(lvl)}
              className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                permissionLevel === lvl ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {lvl === 'read' ? '只读' : '读写'}
            </button>
          ))}
        </div>
      </div>

      <button onClick={onGrantPermission} disabled={!targetEmail || grantingPermission}
        className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors shadow-lg shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
      >
        {grantingPermission ? (
          <><Loader2 className="w-4 h-4 animate-spin" /><span>{isFolderMode ? '重加密中...' : '授权中...'}</span></>
        ) : (
          <span>{isFolderMode ? '分享文件夹' : '授予权限'}</span>
        )}
      </button>

      {/* 已授权用户列表（仅文档模式） */}
      {!isFolderMode && (
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
              {sharedUsers.map((u) => (
                <div key={u.user_id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{u.user_email}</div>
                    <div className="text-xs text-slate-500">
                      {u.permission_level === 'read' ? '只读' : u.permission_level === 'write' ? '读写' : '所有者'}
                    </div>
                  </div>
                  {u.permission_level !== 'owner' && (
                    <button onClick={() => onRevokePermission(u.user_id)}
                      className="ml-3 p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors" title="撤销权限"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <Lock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-blue-900">
            <p className="font-medium mb-1">零知识密钥重加密</p>
            <p className="text-blue-700">
              {isFolderMode
                ? '文件夹内所有文件的密钥在本地重加密后分享，服务器无法解密任何内容。'
                : '文档密钥在本地重新加密后分享，服务器无法解密您的文件内容。'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== 身份分享 =====

function IdentitySharingContent({
  error, identities, loadingIdentities,
  selectedIdentityId, setSelectedIdentityId,
  identityPermissionLevel, setIdentityPermissionLevel,
  grantingIdentity, identityResult, progress,
  onGrantIdentity, isFolderMode,
}: IdentitySharingContentProps) {
  return (
    <div className="space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-700">{error}</div>
        </div>
      )}

      {progress && <ProgressBar current={progress.current} total={progress.total} />}

      {identityResult && (
        <div className={`rounded-lg p-4 flex items-start space-x-3 ${
          identityResult.failed.length === 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'
        }`}>
          <CheckCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${identityResult.failed.length === 0 ? 'text-emerald-600' : 'text-amber-600'}`} />
          <div className="text-sm">
            <p className={identityResult.failed.length === 0 ? 'text-emerald-900' : 'text-amber-900'}>
              成功授权 {identityResult.success} 位用户
            </p>
            {identityResult.failed.length > 0 && (
              <p className="text-amber-700 mt-1">以下用户授权失败：{identityResult.failed.join(', ')}</p>
            )}
          </div>
        </div>
      )}

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
              <button key={identity.id}
                onClick={() => setSelectedIdentityId(identity.id === selectedIdentityId ? null : identity.id)}
                className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all text-left ${
                  selectedIdentityId === identity.id
                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/20'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className={`p-1.5 rounded-lg ${selectedIdentityId === identity.id ? 'bg-blue-100' : 'bg-slate-100'}`}>
                    <Shield className={`w-4 h-4 ${selectedIdentityId === identity.id ? 'text-blue-600' : 'text-slate-500'}`} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-900">{identity.name}</div>
                    {identity.description && <div className="text-xs text-slate-500">{identity.description}</div>}
                  </div>
                </div>
                <span className="text-xs text-slate-400">{identity.user_count} 位用户</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {identities.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">权限级别</label>
          <div className="flex space-x-3">
            {(['read', 'write'] as const).map((lvl) => (
              <button key={lvl} onClick={() => setIdentityPermissionLevel(lvl)}
                className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  identityPermissionLevel === lvl ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {lvl === 'read' ? '只读' : '读写'}
              </button>
            ))}
          </div>
        </div>
      )}

      {identities.length > 0 && (
        <button onClick={onGrantIdentity} disabled={!selectedIdentityId || grantingIdentity}
          className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors shadow-lg shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
        >
          {grantingIdentity ? (
            <><Loader2 className="w-4 h-4 animate-spin" /><span>{isFolderMode ? '重加密中...' : '授权中...'}</span></>
          ) : (
            <span>{isFolderMode ? '向身份成员分享文件夹' : '向身份成员授权'}</span>
          )}
        </button>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <Lock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-blue-900">
            <p className="font-medium mb-1">零知识密钥重加密</p>
            <p className="text-blue-700">
              {isFolderMode
                ? '文件夹内所有文件的密钥将为身份中的每个用户单独重加密，服务器无法解密任何内容。'
                : '文档密钥将为身份中的每个用户单独重加密，服务器无法解密您的文件内容。'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
