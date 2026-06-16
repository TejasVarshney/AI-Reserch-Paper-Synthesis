import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// During development the React app runs on Vite's dev server and proxies
// API calls to the Express backend (default :4000). In production the app
// is built to dist/ and served by that same backend.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
