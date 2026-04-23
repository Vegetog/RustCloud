/**
 * 浏览器端 Embedding 服务，懒加载 Xenova/all-MiniLM-L6-v2（384 维）。
 * 模型文件约 500MB，首次使用时从 HuggingFace CDN 下载并缓存到 Cache Storage。
 *
 * 安全说明：所有推理在浏览器本地完成，原文不离开客户端。
 */

// 阻止 Transformers.js 尝试加载本地模型
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TransformersModule = any;

export interface LoadingState {
  progress: number; // 0-100
  ready: boolean;
  error: string | null;
}

type StateListener = (state: LoadingState) => void;

const listeners = new Set<StateListener>();
let currentState: LoadingState = { progress: 0, ready: false, error: null };

function setState(patch: Partial<LoadingState>) {
  currentState = { ...currentState, ...patch };
  for (const fn of listeners) fn({ ...currentState });
}

/** 订阅模型加载状态变化，立即回调当前状态，返回取消订阅函数 */
export function subscribeToLoadingState(fn: StateListener): () => void {
  fn({ ...currentState });
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let extractor: any = null;
let loadPromise: Promise<void> | null = null;

async function loadModel(): Promise<void> {
  try {
    // 动态导入避免 Vite 打包时静态分析 WASM 报错
    const { pipeline, env } = (await import('@xenova/transformers')) as TransformersModule;
    env.allowLocalModels = false;

    extractor = await pipeline(
      'feature-extraction',
      'Xenova/bge-m3',
      {
        progress_callback: (info: { status: string; progress?: number }) => {
          if (info.status === 'progress' && typeof info.progress === 'number') {
            setState({ progress: Math.round(info.progress) });
          }
        },
      }
    );

    setState({ progress: 100, ready: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    setState({ error: '模型加载失败，请检查网络：' + msg });
    loadPromise = null; // 允许重试
    throw new Error('模型加载失败，请检查网络：' + msg);
  }
}

/** 确保模型已加载，可在 UI 挂载时提前调用以预热 */
export async function ensureReady(): Promise<void> {
  if (extractor) return;
  if (!loadPromise) loadPromise = loadModel();
  await loadPromise;
}

/**
 * 对文本生成 384 维 embedding 向量。
 * 首次调用会触发模型下载（约 23MB）。
 */
export async function embed(text: string): Promise<Float32Array> {
  await ensureReady();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  // output.data 是 Float32Array，shape [384]
  return output.data as Float32Array;
}

/*
 * 手动验证步骤：
 * 1. 打开 DevTools → Network，过滤 HuggingFace CDN 请求
 * 2. 调用 embed("hello world")，观察模型下载进度（约 23MB）
 * 3. embed 应返回 Float32Array，length 为 384
 * 4. 第二次调用 embed 不应再下载（Cache Storage 命中）
 */
