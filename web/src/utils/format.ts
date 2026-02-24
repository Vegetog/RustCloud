// 通用格式化工具函数

import { AxiosError } from 'axios';

/**
 * 将字节数格式化为可读的文件大小字符串
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * 从错误对象中提取用户友好的错误消息
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof AxiosError) {
    const data = error.response?.data;
    if (data?.message) return data.message;
    if (data?.error) return data.error;
    if (error.message) return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}
