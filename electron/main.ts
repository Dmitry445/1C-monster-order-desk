import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { ServerInstance, startServer } from '../src/server/index';

let mainWindow: BrowserWindow | null = null;
let serverInstance: ServerInstance | null = null;

interface AppConfig {
  odataBaseUrl?: string;
  odataUsername?: string;
  odataPassword?: string;
}

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

async function loadConfig(): Promise<AppConfig> {
  try {
    const configPath = getConfigPath();
    const data = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(data) as AppConfig;
  } catch {
    return {};
  }
}

async function saveConfig(config: AppConfig): Promise<void> {
  const configPath = getConfigPath();
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

function registerIpcHandlers(): void {
  ipcMain.handle('desktop:getApiBaseUrl', () => {
    return serverInstance ? `http://127.0.0.1:${serverInstance.port}` : '';
  });

  ipcMain.handle('desktop:getConfig', async () => {
    return await loadConfig();
  });

  ipcMain.handle('desktop:saveConfig', async (_event, config: AppConfig) => {
    await saveConfig(config);
    return { success: true };
  });

  ipcMain.handle(
    'desktop:savePdf',
    async (_event, options: { defaultName: string; base64Data: string }) => {
      try {
        if (!mainWindow) {
          return { success: false, error: 'Главное окно не инициализировано' };
        }

        const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
          title: 'Сохранить накладную в PDF',
          defaultPath: options.defaultName || 'nakladnaya.pdf',
          filters: [{ name: 'PDF Документы', extensions: ['pdf'] }]
        });

        if (canceled || !filePath) {
          return { success: false, canceled: true };
        }

        const buffer = Buffer.from(options.base64Data, 'base64');
        await fs.writeFile(filePath, buffer);

        return { success: true, filePath };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Неизвестная ошибка сохранения файла'
        };
      }
    }
  );

  ipcMain.handle('desktop:getPrinters', async () => {
    try {
      if (!mainWindow) {
        return [];
      }
      const printers = await mainWindow.webContents.getPrintersAsync();
      return printers.map(p => {
        const optionsRecord = p.options as Record<string, unknown> | undefined;
        const isDefault =
          Boolean((p as unknown as { isDefault?: boolean }).isDefault) ||
          optionsRecord?.['default'] === 'true' ||
          optionsRecord?.['is-default'] === 'true' ||
          optionsRecord?.['default'] === true;

        return {
          name: p.name,
          displayName: p.displayName,
          description: p.description,
          isDefault
        };
      });
    } catch {
      return [];
    }
  });

  ipcMain.handle(
    'desktop:printPdf',
    async (_event, options: { base64Data: string; silent?: boolean; deviceName?: string }) => {
      let printWindow: BrowserWindow | null = null;
      try {
        printWindow = new BrowserWindow({
          show: false,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            plugins: true
          }
        });

        const dataUrl = `data:application/pdf;base64,${options.base64Data}`;
        await printWindow.loadURL(dataUrl);

        return await new Promise<{ success: boolean; error?: string }>(resolve => {
          printWindow?.webContents.print(
            {
              silent:
                options.silent ??
                (options.deviceName !== undefined && options.deviceName.trim() !== ''),
              printBackground: true,
              ...(options.deviceName ? { deviceName: options.deviceName } : {})
            },
            (success, failureReason) => {
              if (printWindow) {
                printWindow.close();
                printWindow = null;
              }
              if (success) {
                resolve({ success: true });
              } else {
                resolve({ success: false, error: failureReason });
              }
            }
          );
        });
      } catch (error) {
        if (printWindow) {
          printWindow.close();
        }
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Ошибка отправки документа на печать'
        };
      }
    }
  );
}

async function createMainWindow(): Promise<BrowserWindow> {
  const preloadPath = path.join(__dirname, 'preload.js');
  const iconPath = path.join(app.getAppPath(), 'build/icon.ico');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    title: 'Monster Order Desk',
    icon: iconPath,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#182235',
      symbolColor: '#cbd5e1',
      height: 48
    },
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (!process.env.VITE_DEV_SERVER_URL) {
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' http://127.0.0.1:*; font-src 'self' data:"
          ]
        }
      });
    });
  }

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else if (serverInstance) {
    await mainWindow.loadURL(`http://127.0.0.1:${serverInstance.port}`);
  } else {
    await mainWindow.loadFile(path.join(app.getAppPath(), 'dist/client/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    registerIpcHandlers();

    try {
      const config = await loadConfig();
      if (config.odataBaseUrl) {
        process.env.ODATA_BASE_URL = config.odataBaseUrl;
      }
      if (config.odataUsername) {
        process.env.ODATA_USERNAME = config.odataUsername;
      }
      if (config.odataPassword) {
        process.env.ODATA_PASSWORD = config.odataPassword;
      }
      process.env.APP_BASE_PATH = app.getAppPath();

      const preferredPort = process.env.NODE_ENV === 'development' ? 3000 : 0;
      serverInstance = await startServer({
        port: preferredPort,
        appBasePath: app.getAppPath()
      });
      await createMainWindow();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Ошибка инициализации приложения:', err);
      dialog.showErrorBox(
        'Ошибка запуска сервера',
        `Не удалось инициализировать внутренний сервер: ${err instanceof Error ? err.message : String(err)}`
      );
      app.quit();
    }

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await createMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', async event => {
    if (serverInstance) {
      event.preventDefault();
      try {
        await serverInstance.stop();
        serverInstance = null;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Ошибка остановки сервера:', err);
      } finally {
        app.exit(0);
      }
    }
  });
}
