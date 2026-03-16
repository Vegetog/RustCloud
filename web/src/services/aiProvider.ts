// AI 提供商配置：支持多种 AI 服务的统一配置管理

export type AIProviderType = 'volcengine' | 'openai-compatible';

export interface AIProviderConfig {
  provider: AIProviderType;
  apiKey: string;
  endpointUrl?: string;   // openai-compatible 时必填
  modelName?: string;      // openai-compatible 时可选
}

export const AI_PROVIDERS = [
  {
    type: 'volcengine' as const,
    name: '火山引擎 DeepSeek',
    description: '内容发送至火山引擎 DeepSeek，不经过 RustCloud 服务器',
    keyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
    keyPlaceholder: '输入火山引擎 API Key',
  },
  {
    type: 'openai-compatible' as const,
    name: 'OpenAI 兼容 API',
    description: '内容发送至您配置的 API 端点，不经过 RustCloud 服务器',
    keyUrl: '',
    keyPlaceholder: '输入 API Key',
  },
] as const;

const STORAGE_KEY = 'rustcloud_ai_config';

export function getAIConfig(): AIProviderConfig | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored) as AIProviderConfig;

    // 一次性迁移旧版 key
    const oldKey =
      localStorage.getItem('rustcloud_ark_key') ??
      localStorage.getItem('rustcloud_gemini_key');
    if (oldKey) {
      const config: AIProviderConfig = { provider: 'volcengine', apiKey: oldKey };
      saveAIConfig(config);
      localStorage.removeItem('rustcloud_ark_key');
      localStorage.removeItem('rustcloud_gemini_key');
      return config;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveAIConfig(config: AIProviderConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function clearAIConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function getProviderInfo(type: AIProviderType) {
  return AI_PROVIDERS.find((p) => p.type === type) ?? AI_PROVIDERS[0];
}
