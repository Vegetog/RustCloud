// 分享页面：通过公开链接访问文档或文件夹

import { useState, useEffect, useCallback, useRef } from 'react';
import { formatFileSize } from '../utils/format';
import { isAxiosError } from 'axios';
import { useParams } from 'react-router-dom';
import {
  Cloud,
  Lock,
  Download,
  Loader2,
  AlertCircle,
  FileText,
  ShieldCheck,
  Folder,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { apiService } from '../services/api';
import { CryptoService } from '../services/crypto';
import type { FolderShareManifest, ManifestDocumentItem, ManifestFolderItem } from '../types/folder';

// ===== 类型定义 =====

interface DocumentShareData {
  kind: 'document';
  document_id: string;
  encrypted_key: string;
  encrypted_name: string;
  name_nonce: string;
  content_nonce: string;
  size: number;
  mime_type: string;
}

interface FolderShareData {
  kind: 'folder';
  folder_id: string;
  ephemeral_pubkey: string;
  manifest: FolderShareManifest;
  eskPrivKey: CryptoKey;
}

type ShareData = DocumentShareData | FolderShareData;

// ===== 文件夹树节点 =====

interface FolderNode {
  folder: ManifestFolderItem;
  decryptedName: string;
  children: FolderNode[];
  documents: (ManifestDocumentItem & { decryptedName: string })[];
}

// ===== 主组件 =====

export function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareData, setShareData] = useState<ShareData | null>(null);
  const initialLoadDoneRef = useRef(false);

  const loadShare = useCallback(async () => {
    if (!token) {
      setError('无效的分享链接');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const crypto = new CryptoService();
      const response = await apiService.accessShare(token);
      const data = response.data.data;

      if (data.target_type === 1) {
        // 文件夹分享：从 URL fragment 提取临时私钥
        const fragment = window.location.hash;
        const eskMatch = fragment.match(/esk=([A-Za-z0-9+/=]+)/);
        if (!eskMatch) {
          setError('分享链接无效：缺少解密密钥（URL 片段）');
          setLoading(false);
          return;
        }
        const eskBase64 = eskMatch[1];
        const eskPrivKey = await crypto.importPrivateKeyPKCS8(eskBase64);

        // 解析 manifest
        const manifest: FolderShareManifest = JSON.parse(data.manifest!);

        setShareData({
          kind: 'folder',
          folder_id: data.folder_id!,
          ephemeral_pubkey: data.ephemeral_pubkey!,
          manifest,
          eskPrivKey,
        });
      } else {
        // 文档分享
        setShareData({
          kind: 'document',
          document_id: data.document_id!,
          encrypted_key: data.encrypted_key!,
          encrypted_name: data.encrypted_name!,
          name_nonce: data.name_nonce!,
          content_nonce: data.content_nonce!,
          size: data.size!,
          mime_type: data.mime_type!,
        });
      }

      setLoading(false);
    } catch (err) {
      const status = isAxiosError(err) ? err.response?.status : undefined;
      const message = isAxiosError(err)
        ? (err.response?.data as { message?: string } | undefined)?.message
        : err instanceof Error ? err.message : undefined;

      if (status === 404) setError('分享链接不存在或已过期');
      else if (status === 410) setError('访问次数已用尽');
      else setError(message || '无法访问分享链接');
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (initialLoadDoneRef.current) return;
    initialLoadDoneRef.current = true;
    loadShare();
  }, [loadShare]);

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
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* 头部 */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-6 text-white">
          <div className="flex items-center space-x-3 mb-2">
            <Lock className="w-6 h-6" />
            <h2 className="text-xl font-bold">
              {shareData?.kind === 'folder' ? '加密文件夹分享' : '加密文件分享'}
            </h2>
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
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">无法访问</h3>
              <p className="text-slate-600 text-center">{error}</p>
            </div>
          ) : shareData?.kind === 'document' ? (
            <DocumentShareView shareData={shareData} token={token!} />
          ) : shareData?.kind === 'folder' ? (
            <FolderShareView shareData={shareData} token={token!} />
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

// ===== 文档分享视图 =====

function DocumentShareView({ shareData, token }: { shareData: DocumentShareData; token: string }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);

    try {
      const crypto = new CryptoService();

      // 从 URL 片段中提取文档密钥
      const documentKeyBase64 = window.location.hash.substring(1);
      if (!documentKeyBase64) throw new Error('分享链接无效：缺少解密密钥');

      const documentKeyBuffer = crypto.base64ToArrayBuffer(documentKeyBase64);
      const documentKey = await window.crypto.subtle.importKey(
        'raw', documentKeyBuffer, 'AES-GCM', false, ['decrypt']
      );

      // 下载加密文件
      const downloadUrl = `/api/v1/shares/access/${token}/download`;
      const contentResponse = await fetch(downloadUrl);
      if (!contentResponse.ok) throw new Error('文件下载失败');
      const encryptedContent = await contentResponse.arrayBuffer();

      // 解密文件内容
      const contentNonceBuffer = crypto.base64ToArrayBuffer(shareData.content_nonce);
      const decryptedContent = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: contentNonceBuffer }, documentKey, encryptedContent
      );

      // 解密文件名
      const nameNonceBuffer = crypto.base64ToArrayBuffer(shareData.name_nonce);
      const encryptedNameBuffer = crypto.base64ToArrayBuffer(shareData.encrypted_name);
      const nameBuffer = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: nameNonceBuffer }, documentKey, encryptedNameBuffer
      );
      const fileName = new TextDecoder().decode(nameBuffer);

      triggerDownload(decryptedContent, fileName);
    } catch (err) {
      setError(err instanceof Error ? err.message : '文件下载失败');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4 p-4 bg-slate-50 rounded-lg">
        <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
          <FileText className="w-6 h-6 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-900 mb-1">加密文件</div>
          <div className="flex items-center space-x-4 text-xs text-slate-500">
            <span>{formatFileSize(shareData.size)}</span>
            <span className="w-1 h-1 bg-slate-300 rounded-full" />
            <span>{shareData.mime_type}</span>
          </div>
        </div>
      </div>

      <button
        onClick={handleDownload}
        disabled={downloading}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-medium shadow-lg shadow-blue-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
      >
        {downloading
          ? <><Loader2 className="w-5 h-5 animate-spin" /><span>下载中...</span></>
          : <><Download className="w-5 h-5" /><span>下载文件</span></>
        }
      </button>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
      )}

      <SecurityNotice />
    </div>
  );
}

// ===== 文件夹分享视图 =====

function FolderShareView({ shareData, token }: { shareData: FolderShareData; token: string }) {
  const [tree, setTree] = useState<FolderNode[]>([]);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [building, setBuilding] = useState(true);

  // 构建解密后的文件夹树
  useEffect(() => {
    const buildTree = async () => {
      setBuilding(true);
      try {
        const crypto = new CryptoService();
        const { manifest, eskPrivKey } = shareData;

        // 解密所有文件夹名
        const decryptedFolders: (ManifestFolderItem & { decryptedName: string })[] =
          await Promise.all(
            manifest.folders.map(async (f) => {
              const nameBuffer = await window.crypto.subtle.decrypt(
                { name: 'RSA-OAEP' }, eskPrivKey,
                crypto.base64ToArrayBuffer(f.encrypted_name)
              );
              return { ...f, decryptedName: new TextDecoder().decode(nameBuffer) };
            })
          );

        // 解密所有文档名（DEK 解密后用 AES-GCM 解密文件名）
        const decryptedDocs: (ManifestDocumentItem & { decryptedName: string })[] =
          await Promise.all(
            manifest.documents.map(async (d) => {
              try {
                const dekBuffer = await window.crypto.subtle.decrypt(
                  { name: 'RSA-OAEP' }, eskPrivKey,
                  crypto.base64ToArrayBuffer(d.encrypted_key)
                );
                const aesKey = await window.crypto.subtle.importKey(
                  'raw', dekBuffer, 'AES-GCM', false, ['decrypt']
                );
                const nameNonce = crypto.base64ToArrayBuffer(d.name_nonce);
                const encName = crypto.base64ToArrayBuffer(d.encrypted_name);
                const nameBuffer = await window.crypto.subtle.decrypt(
                  { name: 'AES-GCM', iv: nameNonce }, aesKey, encName
                );
                return { ...d, decryptedName: new TextDecoder().decode(nameBuffer) };
              } catch {
                return { ...d, decryptedName: `[无法解密] ${d.id.slice(0, 8)}` };
              }
            })
          );

        // 构建树结构（以 root_folder_id 为根）
        const rootId = manifest.root_folder_id;
        const folderMap = new Map(decryptedFolders.map((f) => [f.id, f]));

        const buildNode = (folderId: string): FolderNode | null => {
          const folder = folderMap.get(folderId);
          if (!folder) return null;
          const children: FolderNode[] = decryptedFolders
            .filter((f) => f.parent_id === folderId)
            .map((f) => buildNode(f.id))
            .filter((n): n is FolderNode => n !== null);
          const documents = decryptedDocs.filter((d) => d.folder_id === folderId);
          return { folder, decryptedName: folder.decryptedName, children, documents };
        };

        const rootNode = buildNode(rootId);
        setTree(rootNode ? [rootNode] : []);
      } catch (err) {
        setBuildError(err instanceof Error ? err.message : '无法解密文件夹内容');
      } finally {
        setBuilding(false);
      }
    };

    void buildTree();
  }, [shareData]);

  if (building) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
        <p className="text-slate-500">正在解密文件夹内容...</p>
      </div>
    );
  }

  if (buildError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
        {buildError}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">以下内容均在浏览器本地解密，服务器无法查看文件名和内容。</p>
      <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
        {tree.map((node) => (
          <FolderNodeView key={node.folder.id} node={node} token={token} eskPrivKey={shareData.eskPrivKey} />
        ))}
        {tree.length === 0 && (
          <div className="p-6 text-center text-slate-500 text-sm">该文件夹为空</div>
        )}
      </div>
      <SecurityNotice />
    </div>
  );
}

// ===== 文件夹节点递归视图 =====

function FolderNodeView({
  node, token, eskPrivKey, depth = 0,
}: {
  node: FolderNode;
  token: string;
  eskPrivKey: CryptoKey;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasContent = node.children.length > 0 || node.documents.length > 0;

  return (
    <div>
      <div
        className={`flex items-center space-x-2 px-4 py-3 hover:bg-slate-50 cursor-pointer select-none`}
        style={{ paddingLeft: `${16 + depth * 20}px` }}
        onClick={() => setExpanded(!expanded)}
      >
        {hasContent
          ? (expanded ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />)
          : <span className="w-4 h-4 flex-shrink-0" />
        }
        <Folder className="w-4 h-4 text-yellow-500 flex-shrink-0" />
        <span className="text-sm font-medium text-slate-800">{node.decryptedName}</span>
        <span className="text-xs text-slate-400 ml-auto">
          {node.documents.length > 0 ? `${node.documents.length} 个文件` : ''}
        </span>
      </div>

      {expanded && (
        <>
          {node.documents.map((doc) => (
            <DocumentNodeView
              key={doc.id}
              doc={doc}
              token={token}
              eskPrivKey={eskPrivKey}
              depth={depth + 1}
            />
          ))}
          {node.children.map((child) => (
            <FolderNodeView
              key={child.folder.id}
              node={child}
              token={token}
              eskPrivKey={eskPrivKey}
              depth={depth + 1}
            />
          ))}
        </>
      )}
    </div>
  );
}

// ===== 文档节点视图 =====

function DocumentNodeView({
  doc, token, eskPrivKey, depth,
}: {
  doc: ManifestDocumentItem & { decryptedName: string };
  token: string;
  eskPrivKey: CryptoKey;
  depth: number;
}) {
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDownloading(true);
    try {
      const crypto = new CryptoService();

      // 解密 DEK
      const dekBuffer = await window.crypto.subtle.decrypt(
        { name: 'RSA-OAEP' }, eskPrivKey,
        crypto.base64ToArrayBuffer(doc.encrypted_key)
      );
      const aesKey = await window.crypto.subtle.importKey(
        'raw', dekBuffer, 'AES-GCM', false, ['decrypt']
      );

      // 下载加密内容
      const downloadResp = await apiService.downloadFolderShareDocument(token, doc.id);
      const encryptedContent = downloadResp.data as ArrayBuffer;

      // 解密内容
      const contentNonce = crypto.base64ToArrayBuffer(doc.content_nonce);
      const decryptedContent = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: contentNonce }, aesKey, encryptedContent
      );

      triggerDownload(decryptedContent, doc.decryptedName);
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 3000);
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="flex items-center space-x-2 px-4 py-2.5 hover:bg-slate-50 group"
      style={{ paddingLeft: `${16 + depth * 20}px` }}
    >
      <span className="w-4 h-4 flex-shrink-0" />
      <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
      <span className="text-sm text-slate-700 flex-1 truncate">{doc.decryptedName}</span>
      <div className="flex items-center space-x-3 text-xs text-slate-400">
        <span>{formatFileSize(doc.size)}</span>
      </div>
      <button
        onClick={handleDownload}
        disabled={downloading}
        className="ml-2 p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
        title="下载文件"
      >
        {downloading
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : downloaded
            ? <span className="text-emerald-600 text-xs font-medium">✓</span>
            : <Download className="w-4 h-4" />
        }
      </button>
    </div>
  );
}

// ===== 工具函数 =====

function triggerDownload(content: ArrayBuffer, fileName: string) {
  const blob = new Blob([content]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function SecurityNotice() {
  return (
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
  );
}
