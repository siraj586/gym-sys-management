import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // The browser only talks to Vite; Vite forwards /api to Express.
    // Same origin in the browser means no CORS problems and simple cookies.
    proxy: { '/api': 'http://localhost:4000' },
  },
});
