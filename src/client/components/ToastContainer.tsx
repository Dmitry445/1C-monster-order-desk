import type { Toast } from '../hooks/useToast';
import './ToastContainer.css';

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" role="region" aria-live="polite" aria-label="Уведомления">
      {toasts.map(toast => (
        <div key={toast.id} className={`toast toast--${toast.type}`} role="alert">
          <div className="toast__message">{toast.message}</div>
          <div className="toast__actions">
            {toast.action !== undefined && (
              <button
                className="toast__action-btn"
                onClick={() => {
                  if (toast.action !== undefined) {
                    toast.action.handler();
                    onRemove(toast.id);
                  }
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button
              className="toast__close-btn"
              onClick={() => onRemove(toast.id)}
              aria-label="Закрыть уведомление"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
