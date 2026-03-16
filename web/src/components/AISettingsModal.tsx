// AI 设置弹窗：配置 AI 提供商、API Key、Endpoint

import { useState, useEffect } from 'react';
import { X, Sparkles, Check, Trash2, ExternalLink } from 'lucide-react';
import {
  AI_PROVIDERS,
  getAIConfig,
  saveAIConfig,
  clearAIConfig,
  type AIProviderType,
} from '../services/aiProvider';

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AISettingsModal({ isOpen, onClose }: AISettingsModalProps) {
  const [provider, setProvider] = useState<AIProviderType>('volcengine');
  const [apiKey, setApiKey] = useState('');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [modelName, setModelName] = useState('');
  const [saved, setSaved] = useState(false);

  // 打开时加载已有配置
  useEffect(() => {
    if (!isOpen) return;
    const config = getAIConfig();
    if (config) {
      setProvider(config.provider);
      setApiKey(config.apiKey);
      setEndpointUrl(config.endpointUrl ?? '');
      setModelName(config.modelName ?? '');
    } else {
      setProvider('volcengine');
      setApiKey('');
      setEndpointUrl('');
      setModelName('');
    }
    setSaved(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const currentProvider = AI_PROVIDERS.find((p) => p.type === provider) ?? AI_PROVIDERS[0];

  const canSave =
    apiKey.trim() &&
    (provider !== 'openai-compatible' || endpointUrl.trim());

  const handleSave = () => {
    if (!canSave) return;
    saveAIConfig({
      provider,
      apiKey: apiKey.trim(),
      endpointUrl: provider === 'openai-compatible' ? endpointUrl.trim() : undefined,
      modelName: provider === 'openai-compatible' ? (modelName.trim() || undefined) : undefined,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = () => {
    clearAIConfig();
    setApiKey('');
    setEndpointUrl('');
    setModelName('');
    setSaved(false);
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
            <div className="p-2 bg-purple-100 rounded-lg">
              <Sparkles className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">AI 设置</h2>
              <p className="text-xs text-slate-500">配置 AI 总结服务</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-6 space-y-5">
          {/* 提供商选择 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">AI 提供商</label>
            <div className="space-y-2">
              {AI_PROVIDERS.map((p) => (
                <label
                  key={p.type}
                  className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    provider === p.type
                      ? 'border-purple-300 bg-purple-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="ai-provider"
                    value={p.type}
                    checked={provider === p.type}
                    onChange={() => setProvider(p.type)}
                    className="text-purple-600 focus:ring-purple-500"
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-800">{p.name}</div>
                    <div className="text-xs text-slate-500">{p.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={currentProvider.keyPlaceholder}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400"
            />
            {currentProvider.keyUrl && (
              <a
                href={currentProvider.keyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-1 mt-1.5 text-xs text-blue-500 hover:underline"
              >
                <span>获取 API Key</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <p className="text-xs text-slate-400 mt-1">仅存储于本地浏览器，不会上传到服务器</p>
          </div>

          {/* OpenAI 兼容额外字段 */}
          {provider === 'openai-compatible' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  API Endpoint URL <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={endpointUrl}
                  onChange={(e) => setEndpointUrl(e.target.value)}
                  placeholder="https://api.openai.com"
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400"
                />
                <p className="text-xs text-slate-400 mt-1">
                  填写 API 基础地址，系统会自动拼接 /v1/chat/completions
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  模型名称 <span className="text-slate-400 font-normal">(可选)</span>
                </label>
                <input
                  type="text"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="gpt-3.5-turbo"
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400"
                />
              </div>
            </>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-between p-6 border-t border-slate-200">
          <button
            onClick={handleClear}
            className="inline-flex items-center space-x-1.5 px-3 py-2 text-sm text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span>清除配置</span>
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saved ? (
              <>
                <Check className="w-4 h-4" />
                <span>已保存</span>
              </>
            ) : (
              <span>保存</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
