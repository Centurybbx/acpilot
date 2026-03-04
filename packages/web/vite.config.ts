import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/healthz': 'http://127.0.0.1:3141',
      '/agents': 'http://127.0.0.1:3141',
      '/sessions': 'http://127.0.0.1:3141',
      '/auth': 'http://127.0.0.1:3141',
      '/ws': {
        target: 'ws://127.0.0.1:3141',
        ws: true
      }
    }
  }
});
