/**
 * 查询改写：将用户口语化描述扩展为 3-5 个语义等价的检索词组。
 * 调用火山引擎方舟 DeepSeek-V3，通过 Vite 代理 /ark-proxy 转发避免 CORS。
 *
 * 错误降级：任何失败均返回 [原始 query]，不阻断主搜索流程。
 */

const ARK_URL = '/ark-proxy/api/v3/chat/completions';

const SYSTEM_PROMPT = `你是一个搜索助手。用户在搜索自己的文档笔记，输入了一句口语化描述。
请生成 3-5 个语义等价的查询词组，用于向量检索。
要求：
- 只输出 JSON 数组，不要任何解释
- 涵盖原查询的核心概念和可能的同义表达
示例输入："那个讲 Redis 分布式锁的笔记"
示例输出：["Redis 分布式锁","Redisson 实现","SETNX 加锁","分布式互斥","Redis 锁机制"]`;

/**
 * 将 query 改写为多个语义等价的检索词组。
 * @returns [原始 query, ...改写词组]，失败时返回 [原始 query]
 */
export async function rewriteQuery(
  query: string,
  apiKey: string,
  endpointId: string
): Promise<string[]> {
  if (!apiKey || !endpointId) {
    console.warn('[RAG] API Key 或 Endpoint ID 未配置，跳过查询改写');
    return [query];
  }

  try {
    const resp = await fetch(ARK_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: endpointId,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: query },
        ],
        temperature: 0.3,
        max_tokens: 200,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      if (resp.status === 401 || resp.status === 403) {
        console.warn('[RAG] API Key 无效或 Endpoint ID 错误，降级为原始查询');
      } else {
        console.warn(`[RAG] 查询改写请求失败 (${resp.status}): ${text}`);
      }
      return [query];
    }

    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? '';

    // 提取 JSON 数组（可能被 markdown 代码块包裹）
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('响应中未找到 JSON 数组');

    const rewrites = JSON.parse(jsonMatch[0]) as unknown;
    if (!Array.isArray(rewrites)) throw new Error('解析结果不是数组');

    const stringRewrites = (rewrites as unknown[])
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0);

    return [query, ...stringRewrites];
  } catch (e) {
    console.warn('[RAG] 查询改写失败，使用原始查询：', e);
    return [query];
  }
}

/*
 * 手动验证步骤：
 * 1. 故意传错误 API Key，控制台应输出 "API Key 无效或 Endpoint ID 错误" 并降级
 * 2. 传正确配置，rewriteQuery("Redis 分布式锁笔记", key, ep) 应返回 5+ 个词组
 * 3. DevTools → Network 只应看到 /ark-proxy/... 请求（Vite 转发到火山引擎）
 */
