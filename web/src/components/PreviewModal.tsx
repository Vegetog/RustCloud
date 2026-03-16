// 预览弹窗：零知识加密的客户端文档预览

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Loader2, Code2, FileText, Sparkles, KeyRound, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import hljs from 'highlight.js';
import 'highlight.js/styles/atom-one-dark.css';
import { renderAsync as renderDocx } from 'docx-preview';
import { init as initPptx } from 'pptx-preview';
import * as XLSX from 'xlsx';
import { apiService } from '../services/api';
import { cryptoService } from '../services/crypto';
import { useAuthStore } from '../stores/authStore';
import { summarizeDocument, getGeminiKey, saveGeminiKey, clearGeminiKey } from '../services/gemini';

interface PreviewModalProps {
  documentId: string;
  fileName: string;
  mimeType: string;
  encryptedKey: string;
  encryptedName: string;
  nameNonce: string;
  contentNonce: string;
  onClose: () => void;
}

export function PreviewModal({
  documentId,
  fileName,
  mimeType,
  encryptedKey,
  encryptedName,
  nameNonce,
  contentNonce,
  onClose,
}: PreviewModalProps) {
  const { privateKey } = useAuthStore();
  const [loading, setLoading] = useState(Boolean(privateKey));
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [markdownView, setMarkdownView] = useState(true); // true: 渲染, false: 源代码
  // 解密后的真实文件名（encrypted_name 形如 base64，解密后才有扩展名）
  const [decryptedFileName, setDecryptedFileName] = useState(fileName);
  // docx 原始 buffer（由 renderAsync 渲染到 DOM）
  const [docxBuffer, setDocxBuffer] = useState<ArrayBuffer | null>(null);
  const [docxRendering, setDocxRendering] = useState(false);
  const docxContainerRef = useRef<HTMLDivElement | null>(null);
  // pptx：解密后的原始 buffer，由 pptx-preview 渲染
  const [pptxBuffer, setPptxBuffer] = useState<ArrayBuffer | null>(null);
  const pptxContainerRef = useRef<HTMLDivElement | null>(null);
  const pptxPreviewerRef = useRef<ReturnType<typeof initPptx> | null>(null);
  // xlsx：各工作表 HTML
  const [xlsxData, setXlsxData] = useState<{ sheetNames: string[]; sheets: string[] } | null>(null);
  const [activeXlsxSheet, setActiveXlsxSheet] = useState(0);
  const previewUrlRef = useRef<string | null>(null);

  // AI 总结状态
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [needApiKey, setNeedApiKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');

  const CODE_EXTENSIONS = [
    'js', 'jsx', 'ts', 'tsx',
    'py', 'rs', 'go', 'java',
    'c', 'cpp', 'h', 'hpp', 'cc', 'cxx',
    'cs', 'php', 'rb',
    'sh', 'bash', 'zsh', 'ps1',
    'json', 'xml', 'html', 'css', 'scss', 'sass',
    'yaml', 'yml', 'toml', 'ini', 'sql', 'kt', 'swift', 'dart', 'lua',
  ] as const;

  const getExt = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';

  // 不可预览的旧版二进制 Office 格式
  const LEGACY_OFFICE_EXTS = ['doc', 'ppt', 'xls', 'pps'];

  // 根据解密后文件名检测文件类型（useCallback 保持稳定引用，避免 exhaustive-deps 误报）
  const detectFileType = useCallback((name: string) => {
    const ext = getExt(name);
    const isCode = CODE_EXTENSIONS.includes(ext as typeof CODE_EXTENSIONS[number]);
    const isMarkdown = name.endsWith('.md') || name.endsWith('.markdown');
    const isPlainText = ext === 'txt' || mimeType.startsWith('text/');
    const isDocx = ext === 'docx';
    const isPptx = ext === 'pptx';
    const isXlsx = ext === 'xlsx';
    const isLegacyOffice = LEGACY_OFFICE_EXTS.includes(ext);
    return {
      isCode, isMarkdown,
      isText: isCode || isMarkdown || isPlainText,
      isDocx, isPptx, isXlsx, isLegacyOffice,
    };
  }, [mimeType]);

  // 获取代码语言（用于 highlight.js）
  const getLanguage = (name: string): string => {
    const ext = getExt(name);
    const languageMap: Record<string, string> = {
      'js': 'javascript', 'jsx': 'javascript',
      'ts': 'typescript', 'tsx': 'typescript',
      'py': 'python',
      'rs': 'rust',
      'go': 'go',
      'java': 'java',
      'c': 'c', 'h': 'c',
      'cpp': 'cpp', 'hpp': 'cpp', 'cc': 'cpp', 'cxx': 'cpp',
      'cs': 'csharp',
      'php': 'php',
      'rb': 'ruby',
      'sh': 'bash', 'bash': 'bash', 'zsh': 'bash',
      'json': 'json',
      'xml': 'xml',
      'html': 'html',
      'css': 'css',
      'scss': 'scss', 'sass': 'scss',
      'yaml': 'yaml', 'yml': 'yaml',
      'toml': 'toml',
      'sql': 'sql',
      'kt': 'kotlin',
      'swift': 'swift',
      'dart': 'dart',
      'lua': 'lua',
    };
    return languageMap[ext] || 'plaintext';
  };

  useEffect(() => {
    if (!privateKey) return;

    async function loadPreview() {
      try {
        setLoading(true);
        setError(null);

        // 1. 下载加密文件
        const response = await apiService.downloadDocument(documentId);

        // 2. 客户端解密
        const { content, fileName: decryptedName } = await cryptoService.decryptDocument(
          response.data,
          encryptedName,
          nameNonce,
          contentNonce,
          encryptedKey,
          privateKey!  // Non-null assertion: already checked above
        );
        setDecryptedFileName(decryptedName);

        // 3. 用解密后的真实文件名判断类型
        const { isText, isDocx, isPptx, isXlsx, isLegacyOffice } = detectFileType(decryptedName);
        if (isDocx) {
          // .docx：由 docx-preview 在客户端渲染
          setDocxBuffer(content.slice(0));
        } else if (isPptx) {
          // .pptx：存储 buffer，由 pptx-preview useEffect 渲染
          setPptxBuffer(content.slice(0));
        } else if (isXlsx) {
          // .xlsx：SheetJS 解析 → 各 sheet 转 HTML 表格
          const workbook = XLSX.read(new Uint8Array(content), { type: 'array' });
          const sheets = workbook.SheetNames.map(name =>
            XLSX.utils.sheet_to_html(workbook.Sheets[name])
          );
          setXlsxData({ sheetNames: workbook.SheetNames, sheets });
          setActiveXlsxSheet(0);
        } else if (isLegacyOffice) {
          // 旧版二进制格式：仅展示提示
          setDocxBuffer(null);
        } else if (isText) {
          const text = new TextDecoder('utf-8').decode(content);
          setTextContent(text);
        } else {
          // 二进制文件：创建 Blob URL（完全离线）
          const blob = new Blob([content], { type: mimeType });
          const url = URL.createObjectURL(blob);
          if (previewUrlRef.current) {
            URL.revokeObjectURL(previewUrlRef.current);
          }
          previewUrlRef.current = url;
          setPreviewUrl(url);
        }

        setLoading(false);
      } catch (err) {
        console.error('[Preview] Failed:', err);
        const message = err instanceof Error ? err.message : '预览失败';
        // 检查是否为解密错误（可能是内容已更新）
        if (err instanceof Error && (err.name === 'OperationError' || err.message.includes('decrypt'))) {
          setError('文件内容已更新，请关闭后刷新文档列表重试');
        } else {
          setError(message);
        }
        setLoading(false);
      }
    }

    loadPreview();

    // 清理：组件卸载时释放 Blob URL，并重置 Office 预览 state
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      setPptxBuffer(null);
      setXlsxData(null);
      setActiveXlsxSheet(0);
    };
  }, [documentId, contentNonce, nameNonce, encryptedName, encryptedKey, mimeType, privateKey, detectFileType]);

  // docx 渲染：buffer 就绪且容器已挂载后执行（仅支持 .docx）
  useEffect(() => {
    if (!docxBuffer || !docxContainerRef.current) return;

    const ext = getExt(decryptedFileName);
    if (ext !== 'docx') return;

    setDocxRendering(true);
    const container = docxContainerRef.current;
    container.innerHTML = '';

    renderDocx(docxBuffer, container, undefined, {
      className: 'docx-preview-inner',
      ignoreWidth: false,
      ignoreHeight: false,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
    })
      .then(() => setDocxRendering(false))
      .catch((err) => {
        console.error('[docx-preview] render error:', err);
        setDocxRendering(false);
        setError('Office 文件解析失败，建议转换为 PDF 后预览');
      });
  }, [decryptedFileName, docxBuffer]);

  // pptx 渲染：buffer 就绪且容器已挂载后执行
  useEffect(() => {
    if (!pptxBuffer || !pptxContainerRef.current) return;
    const container = pptxContainerRef.current;

    const doRender = (width: number) => {
      container.innerHTML = '';
      if (pptxPreviewerRef.current) {
        pptxPreviewerRef.current.destroy();
        pptxPreviewerRef.current = null;
      }
      // width 必须传像素值，否则库内部会设置 `width: undefinedpx` 导致容器塌陷全黑
      const previewer = initPptx(container, { mode: 'list', width });
      pptxPreviewerRef.current = previewer;
      previewer.preview(pptxBuffer!).catch((err) => {
        console.error('[pptx-preview] render error:', err);
        setError('PPTX 文件解析失败，建议转换为 PDF 后预览');
      });
    };

    const w = container.clientWidth;
    if (w > 0) {
      doRender(w);
    } else {
      // 容器尚未完成布局，等首次获得宽度后再渲染
      const ro = new ResizeObserver((entries) => {
        const width = entries[0]?.contentRect.width;
        if (width > 0) {
          ro.disconnect();
          doRender(width);
        }
      });
      ro.observe(container);
      return () => ro.disconnect();
    }

    return () => {
      if (pptxPreviewerRef.current) {
        pptxPreviewerRef.current.destroy();
        pptxPreviewerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pptxBuffer]);

  // --- AI 总结 ---
  const canSummarize = !loading && !error && textContent !== null;

  const doSummarize = async (key: string) => {
    if (!textContent) return;
    setAiLoading(true);
    setAiError(null);
    setAiSummary(null);
    try {
      const result = await summarizeDocument(key, textContent, decryptedFileName);
      setAiSummary(result);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI 请求失败');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiClick = () => {
    if (aiLoading) return;  // 防止加载中重复触发
    // 已有总结时切换面板显示/隐藏
    if (aiSummary && !aiError) {
      setShowAiPanel((prev) => !prev);
      return;
    }
    setShowAiPanel(true);
    setAiError(null);
    const key = getGeminiKey();
    if (!key) {
      setNeedApiKey(true);
      return;
    }
    setNeedApiKey(false);
    doSummarize(key);
  };

  const handleApiKeyConfirm = () => {
    const key = apiKeyInput.trim();
    if (!key) return;
    saveGeminiKey(key);
    setNeedApiKey(false);
    setApiKeyInput('');
    doSummarize(key);
  };

  const renderPreview = () => {
    // 图片预览
    if (mimeType.startsWith('image/')) {
      return (
        <img
          src={previewUrl!}
          alt={fileName}
          className="max-w-full max-h-full object-contain"
        />
      );
    }

    // PDF 预览（浏览器内置渲染器）
    if (mimeType === 'application/pdf') {
      return (
        <iframe
          src={previewUrl!}
          className="w-full h-full border-none"
          title={fileName}
        />
      );
    }

    // 视频预览
    if (mimeType.startsWith('video/')) {
      return (
        <video
          src={previewUrl!}
          controls
          className="max-w-full max-h-full"
        >
          您的浏览器不支持视频预览
        </video>
      );
    }

    // 音频预览
    if (mimeType.startsWith('audio/')) {
      return (
        <div className="flex flex-col items-center space-y-4">
          <div className="text-6xl">🎵</div>
          <audio src={previewUrl!} controls className="w-full max-w-md" />
          <div className="text-sm text-slate-600">{decryptedFileName}</div>
        </div>
      );
    }

    // pptx：pptx-preview 视觉渲染
    if (pptxBuffer !== null) {
      return (
        <div className="w-full h-full overflow-auto bg-slate-50">
          <div ref={pptxContainerRef} className="w-full" />
        </div>
      );
    }

    // xlsx：工作表表格预览
    if (xlsxData !== null) {
      return (
        <div className="w-full h-full flex flex-col overflow-hidden">
          {xlsxData.sheetNames.length > 1 && (
            <div className="flex border-b border-slate-200 bg-slate-50 overflow-x-auto flex-shrink-0">
              {xlsxData.sheetNames.map((name, i) => (
                <button
                  key={name}
                  onClick={() => setActiveXlsxSheet(i)}
                  className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-r border-slate-200 transition-colors ${
                    activeXlsxSheet === i
                      ? 'bg-white text-green-600 border-b-2 border-b-green-600'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
          <div className="flex-1 overflow-auto p-2">
            <div
              className="xlsx-table-wrapper"
              dangerouslySetInnerHTML={{ __html: xlsxData.sheets[activeXlsxSheet] ?? '' }}
            />
          </div>
        </div>
      );
    }

    // docx 预览（docx-preview 客户端渲染，零知识，仅支持 .docx）
    const ext = getExt(decryptedFileName);
    if (ext === 'docx' && docxBuffer !== null) {
      return (
        <div className="w-full h-full flex flex-col overflow-hidden">
          {docxRendering && (
            <div className="flex items-center justify-center py-4 space-x-2 bg-slate-50 border-b border-slate-200">
              <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
              <span className="text-sm text-slate-500">正在渲染文档...</span>
            </div>
          )}
          <div className="flex-1 overflow-auto bg-white p-4">
            <div
              ref={docxContainerRef}
              className="max-w-4xl mx-auto"
              style={{ minHeight: '200px' }}
            />
          </div>
        </div>
      );
    }

    // 旧版二进制 Office 格式（无法预览）
    const { isLegacyOffice } = detectFileType(decryptedFileName);
    if (isLegacyOffice) {
      const formatMap: Record<string, string> = {
        doc: 'Word 97-2003 (.doc)',
        ppt: 'PowerPoint 97-2003 (.ppt)',
        xls: 'Excel 97-2003 (.xls)',
        pps: 'PowerPoint 放映 (.pps)',
      };
      const targetFmt: Record<string, string> = {
        doc: '.docx', ppt: '.pptx', xls: '.xlsx', pps: '.pptx',
      };
      return (
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4">📄</div>
          <div className="text-lg font-medium text-slate-700 mb-2">
            {formatMap[ext] ?? ext.toUpperCase()} 格式
          </div>
          <div className="text-sm text-slate-500 mb-4">
            此为旧版二进制格式，浏览器端无法直接解析。
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-700">
            💡 建议：用 Microsoft Office 或 WPS 将文件另存为{' '}
            <strong>{targetFmt[ext] ?? '.pdf'}</strong> 或导出为{' '}
            <strong>.pdf</strong> 后重新上传，即可在线预览。
          </div>
        </div>
      );
    }

    // Markdown 预览
    if (detectFileType(decryptedFileName).isMarkdown && textContent) {
      if (markdownView) {
        return (
          <div className="w-full h-full overflow-auto">
            <article className="prose prose-sm max-w-none p-6 bg-white">
              <ReactMarkdown
                components={{
                  code: (props: React.ComponentPropsWithoutRef<'code'> & { inline?: boolean; node?: unknown }) => {
                    const { inline, className, children } = props;
                    const match = /language-(\w+)/.exec(className || '');
                    const lang = match ? match[1] : 'plaintext';
                    
                    if (inline) {
                      return <code className="bg-slate-100 px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>;
                    }
                    
                    const codeString = String(children).replace(/\n$/, '');
                    const highlighted = hljs.highlight(codeString, { language: lang, ignoreIllegals: true }).value;
                    
                    return (
                      <pre className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
                        <code
                          dangerouslySetInnerHTML={{ __html: highlighted }}
                          className="text-sm text-white font-mono"
                        />
                      </pre>
                    );
                  },
                  h1: ({ children }) => <h1 className="text-3xl font-bold mb-4 mt-6">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-2xl font-bold mb-3 mt-5">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-xl font-bold mb-2 mt-4">{children}</h3>,
                  h4: ({ children }) => <h4 className="text-lg font-bold mb-2 mt-3">{children}</h4>,
                  p: ({ children }) => <p className="mb-4 leading-relaxed">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc list-inside mb-4 space-y-1">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal list-inside mb-4 space-y-1">{children}</ol>,
                  li: ({ children }) => <li className="ml-4">{children}</li>,
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-slate-300 bg-slate-50 pl-4 py-2 my-4 italic text-slate-700">
                      {children}
                    </blockquote>
                  ),
                  a: ({ href, children }) => (
                    <a href={href} className="text-blue-600 hover:text-blue-800 underline" target="_blank" rel="noopener noreferrer">
                      {children}
                    </a>
                  ),
                  img: ({ src, alt }) => (
                    <img src={src} alt={alt} className="max-w-full h-auto my-4 rounded-lg" />
                  ),
                  table: ({ children }) => (
                    <table className="border-collapse border border-slate-300 my-4 w-full">
                      {children}
                    </table>
                  ),
                  th: ({ children }) => (
                    <th className="border border-slate-300 bg-slate-100 px-4 py-2 text-left">{children}</th>
                  ),
                  td: ({ children }) => (
                    <td className="border border-slate-300 px-4 py-2">{children}</td>
                  ),
                }}
              >
                {textContent}
              </ReactMarkdown>
            </article>
          </div>
        );
      } else {
        // Markdown 源代码预览
        return (
          <div className="w-full h-full overflow-auto">
            <pre className="text-sm text-slate-900 whitespace-pre-wrap font-mono bg-slate-50 p-6 rounded-lg">
              {textContent}
            </pre>
          </div>
        );
      }
    }

    // 代码文件预览（带语法高亮）
    if (detectFileType(decryptedFileName).isCode && textContent) {
      const language = getLanguage(decryptedFileName);
      const highlighted = hljs.highlight(textContent, { language, ignoreIllegals: true }).value;
      
      return (
        <div className="w-full h-full overflow-auto bg-slate-900">
          <div className="inline-block w-full min-h-full">
            <pre className="text-sm font-mono p-6 m-0 leading-relaxed">
              <code
                dangerouslySetInnerHTML={{ __html: highlighted }}
                className="text-slate-100"
              />
            </pre>
          </div>
        </div>
      );
    }

    // 纯文本预览
    if (textContent) {
      return (
        <pre className="text-sm text-slate-900 whitespace-pre-wrap font-mono bg-slate-50 p-6 rounded-lg max-h-full overflow-auto w-full">
          {textContent}
        </pre>
      );
    }

    // 不支持的类型
    return (
      <div className="text-center">
        <div className="text-4xl mb-4">📄</div>
        <div className="text-slate-500 mb-2">
          暂不支持预览此文件类型
        </div>
        <div className="text-sm text-slate-400">{mimeType}</div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full h-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center space-x-3 min-w-0 flex-1">
            <div className="text-lg font-semibold text-slate-900 truncate">
              {decryptedFileName}
            </div>
            <div className="text-sm text-slate-500 flex-shrink-0">{mimeType}</div>
          </div>

          {/* Markdown 预览标签页 */}
          {detectFileType(decryptedFileName).isMarkdown && textContent && (
            <div className="flex items-center space-x-2 mr-2">
              <button
                onClick={() => setMarkdownView(true)}
                className={`flex items-center space-x-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  markdownView
                    ? 'bg-blue-100 text-blue-600'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>渲染</span>
              </button>
              <button
                onClick={() => setMarkdownView(false)}
                className={`flex items-center space-x-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  !markdownView
                    ? 'bg-blue-100 text-blue-600'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Code2 className="w-4 h-4" />
                <span>源代码</span>
              </button>
            </div>
          )}

          {/* AI 总结按鈕（仅对文本类文件显示） */}
          {canSummarize && (
            <button
              onClick={handleAiClick}
              title="AI 总结（DeepSeek）"
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all mr-2 ${
                showAiPanel
                  ? 'bg-purple-100 text-purple-600'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>AI 总结</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-4">
          {loading ? (
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              <div className="text-sm text-slate-600">正在解密并加载预览...</div>
              <div className="text-xs text-slate-400">
                文件在本地解密，完全安全
              </div>
            </div>
          ) : error ? (
            <div className="text-center max-w-md">
              {error.includes('已更新') ? (
                <>
                  <div className="text-amber-500 text-4xl mb-4">🔄</div>
                  <div className="text-lg font-medium text-amber-600 mb-2">内容已更新</div>
                  <div className="text-sm text-amber-600 mb-4">{error}</div>
                  <button
                    onClick={onClose}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    关闭并刷新列表
                  </button>
                </>
              ) : (
                <>
                  <div className="text-red-600 text-4xl mb-4">❌</div>
                  <div className="text-lg font-medium text-red-600 mb-2">预览失败</div>
                  <div className="text-sm text-red-500">{error}</div>
                </>
              )}
            </div>
          ) : !privateKey ? (
            <div className="text-center max-w-md">
              <div className="text-red-600 text-4xl mb-4">🔐</div>
              <div className="text-lg font-medium text-red-600 mb-2">未找到解密密钥</div>
              <div className="text-sm text-red-500">请重新登录后再试</div>
            </div>
          ) : (
            renderPreview()
          )}
        </div>

        {/* AI 总结面板 */}
        {showAiPanel && !loading && !error && (
          <div className="border-t border-purple-100 bg-gradient-to-b from-purple-50 to-white flex-shrink-0 flex flex-col max-h-64">
            {/* 面板头部 */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-purple-100 flex-shrink-0">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-purple-500" />
                <span className="text-sm font-semibold text-purple-700">AI 总结</span>
                <span className="text-xs text-slate-400">内容发送至火山引擎 DeepSeek，不经过 RustCloud 服务器</span>
              </div>
              <button
                onClick={() => setShowAiPanel(false)}
                className="p-1 hover:bg-purple-100 rounded transition-colors"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            {/* 面板内容 */}
            {needApiKey ? (
              <div className="flex items-center space-x-2 p-4">
                <KeyRound className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleApiKeyConfirm()}
                  placeholder="输入您的火山引擎 API Key（仅存储于本地浏览器）"
                  className="flex-1 text-sm border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                  autoFocus
                />
                <button
                  onClick={handleApiKeyConfirm}
                  disabled={!apiKeyInput.trim()}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
                >
                  确认
                </button>
                <a
                  href="https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-500 hover:underline whitespace-nowrap"
                >
                  获取 Key ↗
                </a>
              </div>
            ) : aiLoading ? (
              <div className="flex items-center justify-center space-x-2 py-6">
                <Loader2 className="w-4 h-4 text-purple-500 animate-spin" />
                <span className="text-sm text-slate-500">正在生成总结...</span>
              </div>
            ) : aiError ? (
              <div className="flex items-start space-x-2 p-4">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 text-sm">
                  <p className="text-red-600 mb-1.5">{aiError}</p>
                  <div className="flex items-center space-x-3 text-xs">
                    <button
                      onClick={() => { setAiError(null); const k = getGeminiKey(); if (k) doSummarize(k); else setNeedApiKey(true); }}
                      className="text-purple-600 hover:underline"
                    >
                      重试
                    </button>
                    <button
                      onClick={() => { clearGeminiKey(); setAiError(null); setNeedApiKey(true); setApiKeyInput(''); }}
                      className="text-slate-500 hover:underline"
                    >
                      更改 API Key
                    </button>
                  </div>
                </div>
              </div>
            ) : aiSummary ? (
              <div className="overflow-auto flex-1 p-4">
                <div className="prose prose-sm prose-slate max-w-none text-sm leading-relaxed
                  [&_h1]:text-base [&_h1]:font-semibold [&_h1]:mt-2 [&_h1]:mb-1
                  [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-2 [&_h2]:mb-1
                  [&_h3]:text-sm [&_h3]:font-medium [&_h3]:mt-1.5 [&_h3]:mb-0.5
                  [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1
                  [&_li]:my-0.5 [&_strong]:font-semibold [&_code]:bg-purple-50 [&_code]:px-1 [&_code]:rounded">
                  <ReactMarkdown>{aiSummary}</ReactMarkdown>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* 底部提示 */}
        {!loading && !error && (
          <div className="border-t border-slate-200 p-3 text-center flex-shrink-0">
            <div className="text-xs text-slate-500">
              🔒 文件已在本地解密，服务器无法访问内容
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
