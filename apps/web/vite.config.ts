import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    proxy: {
      // 將 /api 轉發到後端，免去 CORS 與硬編碼網址
      '/api': {
        target: 'http://localhost:5179',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
});
