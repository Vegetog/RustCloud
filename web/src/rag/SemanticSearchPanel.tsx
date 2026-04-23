import { useState, useEffect, useRef } from 'react';
import { Search, FileText, Settings, X, Loader2, Clock } from 'lucide-react';
import { search, type SearchResult } from './searchEngine';
import { subscribeToLoadingState, ensureReady, type LoadingState } from './embedding';
import { useAuthStore } from '../stores/authStore';

const LS_API_KEY = 'rag-api-key';
const LS_ENDPOINT_ID = 'rag-endpoint-id';

interface Props {
  onDocumentClick: (docId: string) => void;
}

interface Config {
  apiKey: string;
  endpointId: string;
}

function loadConfig(): Config {
  return {
    apiKey: localStorage.getItem(LS_API_KEY) ?? '',
    endpointId: localStorage.getItem(LS_ENDPOINT_ID) ?? '',
  };
}

function saveConfig(cfg: Config) {
  localStorage.setItem(LS_API_KEY, cfg.apiKey);
  localStorage.setItem(LS_ENDPOINT_ID, cfg.endpointId);
}

export function SemanticSearchPanel({ onDocumentClick }: Props) {
  const { masterKey } = useAuthStore();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  const [modelState, setModelState] = useState<LoadingState>({ progress: 0, ready: false, error: null });
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState<Config>(loadConfig);
  const [configDraft, setConfigDraft] = useState<Config>(loadConfig);

  const inputRef = useRef<HTMLInputElement>(null);

  // 订阅模型加载状态 + 预热
  useEffect(() => {
    const unsub = subscribeToLoadingState(setModelState);
    ensureReady().catch(() => {}); // fire and forget
    return unsub;
  }, []);

  const handleSearch = async () => {
    if (!query.trim() || searching) return;
    if (!masterKey) {
      setSearchError('请先登录');
      return;
    }
    if (!modelState.ready) {
      setSearchError('语义模型尚未加载完成，请稍候');
      return;
    }

    setSearching(true);
    setSearchError(null);
    setElapsedMs(null);
    const t0 = performance.now();

    try {
      const res = await search(query.trim(), masterKey, {
        apiKey: config.apiKey,
        endpointId: config.endpointId,
        topN: 10,
      });
      setResults(res);
      setElapsedMs(Math.round(performance.now() - t0));
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : '搜索失败');
    } finally {
      setSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleSaveConfig = () => {
    saveConfig(configDraft);
    setConfig(configDraft);
    setShowConfig(false);
  };

  const scoreLabel = (score: number) => `${Math.round(score * 100)}%`;

  const scoreColor = (score: number) => {
    if (score >= 0.7) return 'text-green-600 bg-green-50';
    if (score >= 0.5) return 'text-yellow-600 bg-yellow-50';
    return 'text-slate-500 bg-slate-100';
  };

  return (
    <div className="flex flex-col h-full">
      {/* 搜索框 */}
      <div className="p-4 border-b border-slate-200">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="描述你想找的文档，例如：那篇讲 Redis 分布式锁的笔记"
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={searching}
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={!query.trim() || searching || !modelState.ready}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
          >
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            搜索
          </button>
          <button
            onClick={() => { setConfigDraft(config); setShowConfig(true); }}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            title="配置 API"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        {/* 模型加载状态 */}
        {!modelState.ready && !modelState.error && (
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="w-3 h-3 animate-spin" />
            正在加载语义模型...
            {modelState.progress > 0 && (
              <span className="font-mono">{modelState.progress}%</span>
            )}
          </div>
        )}
        {modelState.error && (
          <p className="mt-2 text-xs text-red-500">{modelState.error}</p>
        )}
      </div>

      {/* 结果区域 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {/* 耗时 + 结果数 */}
        {elapsedMs !== null && !searching && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400 pb-1">
            <Clock className="w-3 h-3" />
            找到 {results.length} 篇文档，耗时 {elapsedMs < 1000 ? `${elapsedMs}ms` : `${(elapsedMs / 1000).toFixed(1)}s`}
          </div>
        )}

        {/* 错误 */}
        {searchError && (
          <div className="text-sm text-red-500 py-2">{searchError}</div>
        )}

        {/* 搜索中 */}
        {searching && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-sm">正在语义检索...</span>
          </div>
        )}

        {/* 无结果 */}
        {!searching && elapsedMs !== null && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
            <Search className="w-8 h-8 opacity-30" />
            <span className="text-sm">未找到相关文档</span>
            <span className="text-xs">尝试换一种描述方式</span>
          </div>
        )}

        {/* 空状态（未搜索） */}
        {!searching && elapsedMs === null && (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-300">
            <Search className="w-10 h-10 opacity-40" />
            <span className="text-sm">用自然语言描述你想找的文档</span>
          </div>
        )}

        {/* 结果列表 */}
        {!searching && results.map(r => (
          <button
            key={r.docId}
            onClick={() => onDocumentClick(r.docId)}
            className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all group"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-slate-400 shrink-0 group-hover:text-blue-500 transition-colors" />
                <span className="text-sm font-medium text-slate-800 truncate">{r.title || '未命名文档'}</span>
              </div>
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-md shrink-0 ${scoreColor(r.score)}`}>
                {scoreLabel(r.score)}
              </span>
            </div>
            {r.preview && (
              <p className="mt-1.5 text-xs text-slate-500 line-clamp-2 pl-6 leading-relaxed">
                {r.preview}
              </p>
            )}
          </button>
        ))}
      </div>

      {/* 配置弹窗 */}
      {showConfig && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-slate-800">DeepSeek API 配置</h3>
              <button onClick={() => setShowConfig(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  API Key
                </label>
                <input
                  type="password"
                  value={configDraft.apiKey}
                  onChange={e => setConfigDraft(p => ({ ...p, apiKey: e.target.value }))}
                  placeholder="your-ark-api-key"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  推理接入点 ID（Endpoint ID）
                </label>
                <input
                  type="text"
                  value={configDraft.endpointId}
                  onChange={e => setConfigDraft(p => ({ ...p, endpointId: e.target.value }))}
                  placeholder="ep-xxxxxxxxxxxxxxxx-xxxxx"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1.5 text-xs text-slate-400">
                  在火山引擎方舟控制台创建推理接入点，绑定 DeepSeek-V3 模型后获得
                </p>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowConfig(false)}
                className="flex-1 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveConfig}
                className="flex-1 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/*
 * 手动验证步骤：
 * 1. 点击设置图标，输入 API Key 和 Endpoint ID，刷新后应自动恢复（localStorage）
 * 2. 模型加载时搜索按钮应 disabled，进度条显示百分比
 * 3. 搜索结果点击后触发 onDocumentClick 回调，父组件跳转到对应文档
 * 4. 传入错误 API Key 后搜索，控制台警告但 UI 仍返回结果（降级检索）
 */
