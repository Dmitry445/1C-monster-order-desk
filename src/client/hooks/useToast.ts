import { useCallback, useState } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  action?: {
    label: string;
    handler: () => void;
  };
}

const TOAST_TIMEOUT = Number(import.meta.env.VITE_TOAST_TIMEOUT ?? 5000);

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', action?: Toast['action']) => {
      const id = `toast-${Date.now()}-${Math.random()}`;
      const toast: Toast = { id, message, type, action };

      setToasts(prev => [...prev, toast]);

      if (action === undefined) {
        setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== id));
        }, TOAST_TIMEOUT);
      }
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, showToast, removeToast };
}
