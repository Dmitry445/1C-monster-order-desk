import type { DesktopBridge } from '../../electron/preload';

declare global {
  interface Window {
    desktopBridge?: DesktopBridge;
  }
}

export {};
