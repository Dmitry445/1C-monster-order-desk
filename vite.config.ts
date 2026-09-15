import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import electron from 'vite-plugin-electron/simple';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const serverPort = env.PORT || process.env.PORT || '3000';
  const isElectron = process.env.ELECTRON === 'true';

  return {
    plugins: [
      react(),
      ...(isElectron
        ? [
            electron({
              main: {
                entry: 'electron/main.ts'
              },
              preload: {
                input: 'electron/preload.ts'
              }
            })
          ]
        : [])
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src/client')
      }
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: `http://localhost:${serverPort}`,
          changeOrigin: true
        }
      }
    },
    build: {
      outDir: 'dist/client'
    }
  };
});
