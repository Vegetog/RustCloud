// AI 文档总结服务：支持多种 AI 提供商
// 文件内容在客户端解密后直接发送至 AI 服务，不经过 RustCloud 服务器。

import type { AIProviderConfig } from './aiProvider';

// ── 火山引擎 ──────────────────────────────────────────────

// 开发环境走 Vite 代理避免 CORS，生产环境直连
const ARK_API_URL = import.meta.env.DEV
  ? '/ark-proxy/api/v3/responses'
  : 'https://ark.cn-beijing.volces.com/api/v3/responses';

const ARK_MODELS = [
  'deepseek-v3-2-251201',
  'deepseek-v3-241226',
];

// ── Prompt 构建 ──────────────────────────────────────────

function buildPrompt(content: string, fileName: string): string {
  const truncated =
    content.length > 8000 ? content.substring(0, 8000) + '\n\n…（内容已截断）' : content;

  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const isCode = [
    'js','jsx','ts','tsx','py','rs','go','java','c','cpp','h','hpp',
    'cs','php','rb','sh','bash','json','xml','html','css','scss','yaml','yml','toml','sql','kt','swift','dart','lua',
  ].includes(ext);

  return isCode
    ? `请对以下代码文件进行简洁的中文总结（不超过 250 字），包括：主要功能、关键模块/函数、技术栈。\n\n文件名：${fileName}\n\n内容：\n\`\`\`\n${truncated}\n\`\`\``
    : `请对以下文档内容进行简洁的中文总结（不超过 250 字），提炼核心要点和关键信息。\n\n文件名：${fileName}\n\n内容：\n${truncated}`;
}

// ── 火山引擎调用 ─────────────────────────────────────────

async function summarizeViaVolcengine(
  apiKey: string,
  content: string,
  fileName: string,
): Promise<string> {
  const prompt = buildPrompt(content, fileName);

  const body = {
    model: '',
    stream: false,
    input: [
      {
        role: 'user',
        content: [{ type: 'input_text', text: prompt }],
      },
    ],
  };

  let lastError = '';

  for (const model of ARK_MODELS) {
    const payload = { ...body, model };

    const response = await fetch(ARK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        output?: Array<{
          type?: string;
          content?: Array<{ type?: string; text?: string }>;
        }>;
      };
      const text = data.output
        ?.find((o) => o.type === 'message')
        ?.content
        ?.find((c) => c.type === 'output_text')
        ?.text;
      if (!text) throw new Error('模型未返回有效内容');
      return text;
    }

    let message = `HTTP ${response.status}`;
    try {
      const err = (await response.json()) as { error?: { message?: string } };
      message = err.error?.message ?? message;
    } catch { /* ignore */ }

    if (response.status === 400) throw new Error(`请求无效：${message}`);
    if (response.status === 401 || response.status === 403)
      throw new Error(`API Key 无效或无权限：${message}`);

    if (response.status === 429) {
      lastError = message;
      continue;
    }

    throw new Error(`火山引擎 API 错误 ${response.status}：${message}`);
  }

  throw new Error(`所有可用模型配额已耗尽，请稍后再试。\n最后错误：${lastError}`);
}

// ── OpenAI 兼容调用 ──────────────────────────────────────

async function summarizeViaOpenAICompatible(
  apiKey: string,
  endpointUrl: string,
  modelName: string,
  content: string,
  fileName: string,
): Promise<string> {
  const prompt = buildPrompt(content, fileName);

  // 确保 URL 以 /v1/chat/completions 结尾
  const baseUrl = endpointUrl.replace(/\/+$/, '');
  const url = baseUrl.endsWith('/v1/chat/completions')
    ? baseUrl
    : baseUrl.endsWith('/v1')
      ? `${baseUrl}/chat/completions`
      : `${baseUrl}/v1/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelName,
      stream: false,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const err = (await response.json()) as { error?: { message?: string } };
      message = err.error?.message ?? message;
    } catch { /* ignore */ }

    if (response.status === 401 || response.status === 403)
      throw new Error(`API Key 无效或无权限：${message}`);
    throw new Error(`API 错误 ${response.status}：${message}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('模型未返回有效内容');
  return text;
}

// ── 统一入口 ─────────────────────────────────────────────

export async function summarizeDocument(
  config: AIProviderConfig,
  content: string,
  fileName: string,
): Promise<string> {
  switch (config.provider) {
    case 'volcengine':
      return summarizeViaVolcengine(config.apiKey, content, fileName);
    case 'openai-compatible':
      return summarizeViaOpenAICompatible(
        config.apiKey,
        config.endpointUrl ?? '',
        config.modelName ?? 'gpt-3.5-turbo',
        content,
        fileName,
      );
    default:
      throw new Error(`不支持的 AI 提供商：${config.provider}`);
  }
}
