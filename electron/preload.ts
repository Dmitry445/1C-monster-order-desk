import { contextBridge, ipcRenderer } from 'electron';

export interface PrinterInfo {
  name: string;
  displayName: string;
  description: string;
  isDefault?: boolean;
}

export interface AppConfig {
  odataBaseUrl?: string;
  odataUsername?: string;
  odataPassword?: string;
}

export interface DesktopBridge {
  isElectron: boolean;
  savePdf: (options: {
    defaultName: string;
    base64Data: string;
  }) => Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }>;
  printPdf: (options: {
    base64Data: string;
    silent?: boolean;
    deviceName?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  getPrinters: () => Promise<PrinterInfo[]>;
  getApiBaseUrl: () => Promise<string>;
  getConfig: () => Promise<AppConfig>;
  saveConfig: (config: AppConfig) => Promise<{ success: boolean }>;
}

const desktopBridge: DesktopBridge = {
  isElectron: true,
  savePdf: options => ipcRenderer.invoke('desktop:savePdf', options),
  printPdf: options => ipcRenderer.invoke('desktop:printPdf', options),
  getPrinters: () => ipcRenderer.invoke('desktop:getPrinters'),
  getApiBaseUrl: () => ipcRenderer.invoke('desktop:getApiBaseUrl'),
  getConfig: () => ipcRenderer.invoke('desktop:getConfig'),
  saveConfig: config => ipcRenderer.invoke('desktop:saveConfig', config)
};

contextBridge.exposeInMainWorld('desktopBridge', desktopBridge);
