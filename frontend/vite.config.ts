import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Proxy dla kanałów WebSocket backendu
      '/ws': {
        target: 'ws://localhost:8001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          // Rozdziel ciężkie biblioteki dla lepszej wydajności
          'mantine': ['@mantine/core', '@mantine/hooks', '@mantine/notifications'],
          'charts': ['lightweight-charts', 'chart.js'],
          'vendor': ['react', 'react-dom'],
        },
      },
    },
  },
  define: {
    // Optymalizacja dla produkcji
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
})
