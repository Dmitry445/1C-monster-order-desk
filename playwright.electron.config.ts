import { defineConfig } from '@playwright/test';
import path from 'path';

export default defineConfig({
  testDir: './e2e',
  testMatch: ['electron-scenarios.spec.ts', 'pdf-viewer.spec.ts'],
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 120000,
  use: {
    actionTimeout: 30000
  },
  projects: [
    {
      name: 'electron',
      use: {
        // Используем локально установленный Electron
        executablePath: path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe')
      }
    }
  ]
});
