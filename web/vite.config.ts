import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Transformers.js 包含 WASM，Vite 预构建会报错，需要排除
    exclude: ['@xenova/transformers'],
  },
  server: {
    port: 3000,
    proxy: {
      '/ark-proxy': {
        target: 'https://ark.cn-beijing.volces.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/ark-proxy/, ''),
      },
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:8080',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
