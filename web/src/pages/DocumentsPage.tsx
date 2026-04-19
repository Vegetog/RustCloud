// 文档管理主页面

import { useEffect, useRef, useState } from 'react';
import { formatFileSize } from '../utils/format';
import { isAxiosError } from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Cloud,
  Home,
  Folder,
  FolderOpen,
  Lock,
  Trash2,
  Search,
  Plus,
  FolderPlus,
  Download,
  Share2,
  FileText,
  Image as ImageIcon,
  File,
  Code,
  Code2,
  LogOut,
  Upload,
  X,
  Loader2,
  ShieldCheck,
  AlertCircle,
  Eye,
  Info,
  Users,
  User,
  Inbox,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useDocumentStore } from '../stores/documentStore';
import { useFolderStore } from '../stores/folderStore';
import { ShareModal } from '../components/ShareModal';
import { PreviewModal } from '../components/PreviewModal';
import { DocumentEditorModal } from '../components/DocumentEditorModal';
import { AISettingsModal } from '../components/AISettingsModal';
import { apiService } from '../services/api';
import { CryptoService } from '../services/crypto';
import type { Document } from '../types/document';

type DocumentWithEncryptedKey = Document & { encrypted_key: string };

type ViewMode = 'all' | 'mine' | 'shared';

const VIEW_NAMES: Record<ViewMode, string> = {
  all: '全部文件',
  mine: '我的文件',
  shared: '分享给我的',
};

export function DocumentsPage() {
  const navigate = useNavigate();
  const { folderId } = useParams<{ folderId?: string }>();

  const { user, logout } = useAuthStore();
  const {
    documents,
    loading: docLoading,
    error: docError,
    uploadProgress,
    loadDocuments,
    uploadDocument,
    downloadDocument,
    deleteDocument,
    clearError: clearDocError,
  } = useDocumentStore();

  const {
    folders,
    currentFolder,
    loading: folderLoading,
    error: folderError,
    loadFolders,
    loadCurrentFolder,
    createFolder,
    deleteFolder,
    clearError: clearFolderError,
  } = useFolderStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState<ViewMode>('all');

  // 分享弹窗
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [shareDocumentId, setShareDocumentId] = useState<string | null>(null);
  const [shareEncryptedKey, setShareEncryptedKey] = useState<string | null>(null);

  // 预览 / 编辑弹窗
  const [previewDocument, setPreviewDocument] = useState<DocumentWithEncryptedKey | null>(null);
  const [editingDocument, setEditingDocument] = useState<DocumentWithEncryptedKey | null>(null);

  // 新建文件夹弹窗
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);

  const loading = docLoading || folderLoading;
  const error = docError || folderError;

  // 当 folderId 变化时重新加载
  useEffect(() => {
    loadFolders(folderId ?? null);
    // 文件夹视图：只显示当前目录文件；根目录可按视图模式过滤
    if (folderId) {
      loadDocuments(1, folderId);
      loadCurrentFolder(folderId);
    } else {
      loadDocuments(1, null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId]);

  const clearError = () => {
    clearDocError();
    clearFolderError();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 100 * 1024 * 1024) {
      useDocumentStore.setState({ error: '文件大小超过 100MB 限制' });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    try {
      await uploadDocument(file, folderId ?? null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch {
      // 错误由状态仓库处理
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleShare = async (documentId: string) => {
    try {
      const response = await apiService.getDocumentDetail(documentId);
      const encryptedKey = response.data.data.encrypted_key;
      setShareDocumentId(documentId);
      setShareEncryptedKey(encryptedKey);
      setShareModalOpen(true);
    } catch (err) {
      const message = isAxiosError(err)
        ? ((err.response?.data as { message?: string } | undefined)?.message || err.message)
        : err instanceof Error ? err.message : '未知错误';
      alert('获取文档信息失败：' + message);
    }
  };

  const handleCloseShareModal = () => {
    setShareModalOpen(false);
    setShareDocumentId(null);
    setShareEncryptedKey(null);
  };

  const handlePreview = async (doc: Document) => {
    try {
      const response = await apiService.getDocumentDetail(doc.id);
      setPreviewDocument({ ...doc, encrypted_key: response.data.data.encrypted_key });
    } catch (err) {
      const message = isAxiosError(err)
        ? ((err.response?.data as { message?: string } | undefined)?.message || err.message)
        : err instanceof Error ? err.message : '未知错误';
      alert('获取文档信息失败：' + message);
    }
  };

  const isTextFile = (mimeType: string): boolean => {
    return (
      mimeType.startsWith('text/') ||
      mimeType === 'application/json' ||
      mimeType === 'application/javascript' ||
      mimeType === 'application/typescript' ||
      mimeType === 'application/x-yaml' ||
      mimeType === 'application/xml'
    );
  };

  const handleEdit = async (doc: Document) => {
    try {
      const { privateKey } = useAuthStore.getState();
      if (!privateKey) { alert('私钥未找到，请重新登录'); return; }

      const response = await apiService.getDocumentDetail(doc.id);
      const documentDetail = response.data.data;
      const crypto = new CryptoService();

      const encryptedKeyBuffer = crypto.base64ToArrayBuffer(documentDetail.encrypted_key);
      const documentKeyBuffer = await window.crypto.subtle.decrypt(
        { name: 'RSA-OAEP' }, privateKey, encryptedKeyBuffer
      );
      const documentKey = await window.crypto.subtle.importKey(
        'raw', documentKeyBuffer, 'AES-GCM', false, ['decrypt']
      );
      const nameNonceBuffer = crypto.base64ToArrayBuffer(doc.name_nonce);
      const decryptedNameBuffer = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: nameNonceBuffer },
        documentKey,
        crypto.base64ToArrayBuffer(doc.encrypted_name)
      );
      const decryptedName = new TextDecoder().decode(decryptedNameBuffer);
      setEditingDocument({ ...doc, encrypted_key: documentDetail.encrypted_key, decrypted_name: decryptedName });
    } catch (err) {
      console.error('Edit error:', err);
      const message = isAxiosError(err)
        ? ((err.response?.data as { message?: string } | undefined)?.message || err.message)
        : err instanceof Error ? err.message : '未知错误';
      alert('获取文档信息失败：' + message);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      await createFolder(newFolderName.trim(), folderId ?? null);
      setNewFolderOpen(false);
      setNewFolderName('');
    } catch {
      // 错误已在 store 处理
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleDeleteFolder = async (targetFolderId: string) => {
    if (!window.confirm('确定要删除这个文件夹吗？文件夹内的文件将移到根目录，子文件夹将被删除。')) return;
    try {
      // 第二个参数是当前所在目录（刷新用），不是被删除的文件夹
      await deleteFolder(targetFolderId, folderId ?? null);
    } catch {
      // 错误已在 store 处理
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return ImageIcon;
    if (mimeType.startsWith('text/') || mimeType.includes('javascript') || mimeType.includes('json')) return Code;
    if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('word')) return FileText;
    return File;
  };

  const getFileColor = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return 'bg-orange-50 text-orange-500';
    if (mimeType.startsWith('text/') || mimeType.includes('javascript')) return 'bg-slate-100 text-slate-600';
    if (mimeType.includes('pdf') || mimeType.includes('document')) return 'bg-blue-50 text-blue-500';
    return 'bg-slate-100 text-slate-500';
  };

  const filteredDocuments = documents.filter((doc) => {
    // 在文件夹内不按视图模式过滤
    if (!folderId) {
      if (view === 'mine' && doc.permission_level !== 'owner') return false;
      if (view === 'shared' && doc.permission_level === 'owner') return false;
    }
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return doc.decrypted_name?.toLowerCase().includes(query);
  });

  const filteredFolders = folders.filter((folder) => {
    if (!searchQuery) return true;
    return folder.decrypted_name?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const itemCount = filteredFolders.length + filteredDocuments.length;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* 侧边栏 */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 shrink-0">
        <div className="p-6 flex items-center space-x-3 text-white border-b border-slate-800">
          <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2 rounded-lg shadow-lg shadow-blue-500/30">
            <Cloud className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">RustCloud</h1>
            <p className="text-xs text-slate-400">零知识加密</p>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-1 mt-4">
          {(['all', 'mine', 'shared'] as ViewMode[]).map((v) => {
            const Icon = v === 'all' ? Home : v === 'mine' ? User : Inbox;
            const isActive = !folderId && view === v;
            return (
              <button
                key={v}
                onClick={() => { setView(v); navigate('/documents'); }}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-900/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium text-sm">{VIEW_NAMES[v]}</span>
              </button>
            );
          })}
          <div className="my-2 border-t border-slate-800" />
          <button
            onClick={() => navigate('/identities')}
            className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <Users className="w-5 h-5" />
            <span className="font-medium text-sm">身份管理</span>
          </button>
          <button
            onClick={() => setAiSettingsOpen(true)}
            className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <Sparkles className="w-5 h-5" />
            <span className="font-medium text-sm">AI 设置</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center space-x-3 mb-3 px-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-medium text-sm">
              {user?.email?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{user?.email?.split('@')[0] || 'User'}</div>
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
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0 z-10">
          <div className="flex items-center text-sm font-medium text-slate-500 min-w-0">
            {/* 面包屑 */}
            {folderId ? (
              <div className="flex items-center space-x-1 min-w-0">
                <button
                  onClick={() => navigate('/documents')}
                  className="text-blue-600 hover:text-blue-700 hover:underline whitespace-nowrap"
                >
                  全部文件
                </button>
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-slate-800 truncate max-w-48">
                  {currentFolder?.decrypted_name || '文件夹'}
                </span>
              </div>
            ) : (
              <span className="text-slate-800">{VIEW_NAMES[view]}</span>
            )}
            <span className="ml-2 text-slate-400">·</span>
            <span className="ml-2 whitespace-nowrap">{itemCount} 个项目</span>
          </div>

          {/* 搜索框 */}
          <div className="flex-1 max-w-lg mx-8 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索文件..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-100 border-none rounded-lg py-2 pl-10 pr-4 text-sm focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"
            />
          </div>

          {/* 操作按钮组 */}
          <div className="flex items-center space-x-2">
            {/* 新建文件夹按钮 */}
            <button
              onClick={() => setNewFolderOpen(true)}
              disabled={loading}
              className="flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-100 transition-all disabled:opacity-50"
              title="新建文件夹"
            >
              <FolderPlus className="w-4 h-4" />
              <span className="hidden sm:inline">新建文件夹</span>
            </button>

            {/* 上传按钮 */}
            <div className="relative group">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg shadow-blue-500/30 flex items-center space-x-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                <span>上传文件</span>
              </button>
              <div className="absolute right-0 top-full mt-2 w-56 bg-slate-800 text-slate-200 text-xs rounded-lg p-3 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <div className="flex items-center space-x-1.5 mb-1.5 text-slate-300 font-medium">
                  <Info className="w-3 h-3" />
                  <span>上传须知</span>
                </div>
                <ul className="space-y-1 text-slate-400">
                  <li>支持所有文件类型</li>
                  <li>单文件最大 100MB</li>
                  <li>文件将在本地加密后上传</li>
                  {folderId && <li className="text-blue-400">将上传到当前文件夹</li>}
                </ul>
              </div>
            </div>
            <input ref={fileInputRef} type="file" onChange={handleFileSelect} style={{ display: 'none' }} />
          </div>
        </header>

        {/* 内容区域 */}
        <div className="flex-1 p-8 overflow-y-auto">
          {/* 上传进度 */}
          {uploadProgress > 0 && uploadProgress < 100 && (
            <div className="mb-6 bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
              <div className="flex items-center space-x-3 mb-2">
                <Upload className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-medium text-slate-700">
                  {uploadProgress === 10 && '正在加密文件...'}
                  {uploadProgress === 50 && '正在上传...'}
                  {uploadProgress > 50 && uploadProgress < 100 && '上传中...'}
                </span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 transition-all duration-300 ease-out" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 shadow-sm flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 text-sm text-red-700">{error}</div>
              <button onClick={clearError} className="text-red-400 hover:text-red-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* 加载中 */}
          {loading && folders.length === 0 && documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
              <p className="text-slate-500">加载中...</p>
            </div>
          ) : filteredFolders.length === 0 && filteredDocuments.length === 0 ? (
            // 空状态
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                {view === 'shared'
                  ? <Inbox className="w-10 h-10 text-slate-400" />
                  : <Folder className="w-10 h-10 text-slate-400" />}
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">
                {view === 'shared' ? '暂无分享文件' : folderId ? '此文件夹为空' : '还没有文档'}
              </h3>
              <p className="text-slate-500 text-sm mb-6">
                {view === 'shared'
                  ? '当其他用户与您共享文件后，将在此处显示'
                  : '点击上传按钮上传文件，或新建文件夹来整理内容'}
              </p>
              {view !== 'shared' && (
                <div className="flex space-x-3">
                  <button
                    onClick={() => setNewFolderOpen(true)}
                    className="flex items-center space-x-2 px-5 py-2.5 rounded-lg text-sm font-medium border border-slate-300 text-slate-700 hover:bg-slate-100 transition-all"
                  >
                    <FolderPlus className="w-4 h-4" />
                    <span>新建文件夹</span>
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium shadow-lg shadow-blue-500/30 flex items-center space-x-2 transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    <span>上传文件</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* 文件夹区域 */}
              {filteredFolders.length > 0 && (
                <div className="mb-6">
                  <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                    文件夹
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredFolders.map((folder) => (
                      <div
                        key={folder.id}
                        className="group bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md hover:border-blue-200 hover:-translate-y-0.5 transition-all cursor-pointer relative"
                        onClick={() => navigate(`/documents/folder/${folder.id}`)}
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div className="p-2 rounded-lg bg-yellow-50 text-yellow-500">
                            <FolderOpen className="w-6 h-6" />
                          </div>
                          {folder.permission_level === 'owner' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }}
                              className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-all rounded"
                              title="删除文件夹"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <h3
                          className="font-medium text-slate-700 text-sm truncate mb-1"
                          title={folder.decrypted_name}
                        >
                          {folder.decrypted_name || '(加密文件夹)'}
                        </h3>
                        <div className="text-xs text-slate-400">{formatDate(folder.created_at)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 文件区域 */}
              {filteredDocuments.length > 0 && (
                <div>
                  {filteredFolders.length > 0 && (
                    <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                      文件
                    </h2>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
                    {filteredDocuments.map((doc) => {
                      const FileIcon = getFileIcon(doc.mime_type);
                      const colorClass = getFileColor(doc.mime_type);
                      return (
                        <div
                          key={doc.id}
                          className="group bg-white border border-slate-200 rounded-xl p-4 hover:shadow-lg hover:-translate-y-1 transition-all relative"
                        >
                          <div className="flex justify-between items-start mb-4">
                            <div className={`p-2 rounded-lg ${colorClass}`}>
                              <FileIcon className="w-6 h-6" />
                            </div>
                            <Lock className="w-3.5 h-3.5 text-emerald-500" />
                          </div>
                          <h3 className="font-medium text-slate-700 text-sm truncate mb-1" title={doc.decrypted_name}>
                            {doc.decrypted_name || doc.encrypted_name.substring(0, 20) + '...'}
                          </h3>
                          <div className="flex justify-between items-center text-xs text-slate-400 mb-3">
                            <span>{formatFileSize(doc.size)}</span>
                            <span>{formatDate(doc.created_at)}</span>
                          </div>
                          <div className="mb-3">
                            <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${
                              doc.permission_level === 'owner' ? 'bg-green-100 text-green-700'
                                : doc.permission_level === 'write' ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {doc.permission_level === 'owner' ? '拥有者' : doc.permission_level === 'write' ? '读写' : '只读'}
                            </span>
                          </div>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handlePreview(doc)}
                              className="flex-1 flex items-center justify-center space-x-1 px-3 py-2 bg-purple-50 text-purple-600 hover:bg-purple-100 rounded-lg text-xs font-medium transition-colors"
                              title="预览"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>预览</span>
                            </button>
                            <button
                              onClick={() => downloadDocument(doc.id)}
                              className="flex-1 flex items-center justify-center space-x-1 px-3 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-medium transition-colors"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>下载</span>
                            </button>
                            {(doc.permission_level === 'write' || doc.permission_level === 'owner') && isTextFile(doc.mime_type) && (
                              <button
                                onClick={() => handleEdit(doc)}
                                className="flex-1 flex items-center justify-center space-x-1 px-3 py-2 bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-lg text-xs font-medium transition-colors"
                                title="编辑内容"
                              >
                                <Code2 className="w-3.5 h-3.5" />
                                <span>编辑</span>
                              </button>
                            )}
                            {doc.permission_level === 'owner' && (
                              <>
                                <button
                                  onClick={() => handleShare(doc.id)}
                                  className="px-3 py-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg text-xs font-medium transition-colors"
                                  title="分享"
                                >
                                  <Share2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={async () => { if (window.confirm('确定要删除这个文件吗？')) await deleteDocument(doc.id); }}
                                  className="px-3 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-xs font-medium transition-colors"
                                  title="删除"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 安全提示 */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <ShieldCheck className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-blue-900">
                    <p className="font-medium mb-1">零知识加密保证</p>
                    <p className="text-blue-700">
                      所有文件在浏览器本地加密后上传，服务器无法查看您的文件内容。密钥仅存储在内存中，页面刷新后将需要重新登录。
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {/* 新建文件夹弹窗 */}
      {newFolderOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">新建文件夹</h2>
            <input
              type="text"
              placeholder="文件夹名称"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); }}
              autoFocus
              className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 mb-4"
            />
            <div className="flex space-x-3">
              <button
                onClick={() => { setNewFolderOpen(false); setNewFolderName(''); }}
                className="flex-1 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim() || creatingFolder}
                className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {creatingFolder ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                <span>{creatingFolder ? '创建中...' : '创建'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 分享弹窗 */}
      {shareModalOpen && shareDocumentId && shareEncryptedKey && (
        <ShareModal
          documentId={shareDocumentId}
          encryptedKey={shareEncryptedKey}
          onClose={handleCloseShareModal}
        />
      )}

      {/* 预览弹窗 */}
      {previewDocument && (
        <PreviewModal
          documentId={previewDocument.id}
          fileName={previewDocument.decrypted_name || previewDocument.encrypted_name}
          mimeType={previewDocument.mime_type}
          encryptedKey={previewDocument.encrypted_key}
          encryptedName={previewDocument.encrypted_name}
          nameNonce={previewDocument.name_nonce}
          contentNonce={previewDocument.content_nonce}
          onClose={() => setPreviewDocument(null)}
        />
      )}

      {/* 编辑器弹窗 */}
      {editingDocument && (
        <DocumentEditorModal
          documentId={editingDocument.id}
          fileName={editingDocument.decrypted_name || editingDocument.encrypted_name}
          encryptedKey={editingDocument.encrypted_key}
          encryptedName={editingDocument.encrypted_name}
          nameNonce={editingDocument.name_nonce}
          contentNonce={editingDocument.content_nonce}
          permissionLevel={editingDocument.permission_level as 'owner' | 'write' | 'read'}
          onClose={() => setEditingDocument(null)}
          onSuccess={() => loadDocuments(1, folderId ?? null)}
        />
      )}

      {/* AI 设置弹窗 */}
      <AISettingsModal isOpen={aiSettingsOpen} onClose={() => setAiSettingsOpen(false)} />
    </div>
  );
}
