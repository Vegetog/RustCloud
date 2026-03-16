// AI 文档总结服务：浏览器直调火山引擎（Ark）DeepSeek API
// 文件内容在客户端解密后直接发送至火山引擎，不经过 RustCloud 服务器。

const ARK_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/responses';

// 按优先级排列，配额耗尽时自动降级
const ARK_MODELS = [
  'deepseek-v3-2-251201',
  'deepseek-v3-241226',
];

const STORAGE_KEY = 'rustcloud_ark_key';

export function getGeminiKey(): string | null {
  try {
    // 兼容旧键名
    return localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem('rustcloud_gemini_key');
  } catch {
    return null;
  }
}

export function saveGeminiKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key.trim());
  localStorage.removeItem('rustcloud_gemini_key'); // 清理旧键
}

export function clearGeminiKey(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('rustcloud_gemini_key');
}

export async function summarizeDocument(
  apiKey: string,
  content: string,
  fileName: string,
): Promise<string> {
  // 截断至 ~8000 字符，避免超出 token 限制
  const truncated =
    content.length > 8000 ? content.substring(0, 8000) + '\n\n…（内容已截断）' : content;

  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const isCode = [
    'js','jsx','ts','tsx','py','rs','go','java','c','cpp','h','hpp',
    'cs','php','rb','sh','bash','json','xml','html','css','scss','yaml','yml','toml','sql','kt','swift','dart','lua',
  ].includes(ext);

  const prompt = isCode
    ? `请对以下代码文件进行简洁的中文总结（不超过 250 字），包括：主要功能、关键模块/函数、技术栈。\n\n文件名：${fileName}\n\n内容：\n\`\`\`\n${truncated}\n\`\`\``
    : `请对以下文档内容进行简洁的中文总结（不超过 250 字），提炼核心要点和关键信息。\n\n文件名：${fileName}\n\n内容：\n${truncated}`;

  const body = {
    model: '',          // 每次循环时替换
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

    // 429 配额耗尽：尝试下一个模型
    if (response.status === 429) {
      lastError = message;
      continue;
    }

    throw new Error(`火山引擎 API 错误 ${response.status}：${message}`);
  }

  // 所有模型都 429
  throw new Error(`所有可用模型配额已耗尽，请稍后再试。\n最后错误：${lastError}`);
}
