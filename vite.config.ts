import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // Same-origin API so OAuth callbacks (http://localhost:3000/api/auth/*) reach the backend.
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
});
