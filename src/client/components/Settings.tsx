import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import '../styles/Settings.css';

interface SettingsProps {
  onClose: () => void;
  onSaved: () => void;
}

export function Settings({ onClose, onSaved }: SettingsProps) {
  const [odataBaseUrl, setOdataBaseUrl] = useState('');
  const [odataUsername, setOdataUsername] = useState('');
  const [odataPassword, setOdataPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadSettings() {
      if (window.desktopBridge !== undefined) {
        const config = await window.desktopBridge.getConfig();
        setOdataBaseUrl(config.odataBaseUrl ?? '');
        setOdataUsername(config.odataUsername ?? '');
        setOdataPassword(config.odataPassword ?? '');
      }
    }
    void loadSettings();
  }, []);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setSaving(true);

    try {
      if (window.desktopBridge === undefined) {
        throw new Error('Настройки доступны только в десктопной версии');
      }

      // Проверка подключения перед сохранением
      const testResponse = await fetch('/api/documents/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: odataBaseUrl,
          username: odataUsername,
          password: odataPassword
        })
      });

      if (!testResponse.ok) {
        const errorData = (await testResponse.json().catch(() => ({}))) as {
          message?: string;
          code?: string;
        };

        if (testResponse.status === 401) {
          throw new Error(
            'Неверный логин или пароль. Проверьте учётные данные и попробуйте снова.'
          );
        } else if (testResponse.status === 404) {
          throw new Error(
            'Сервис OData не найден по указанному URL. Проверьте адрес и попробуйте снова.'
          );
        } else if (testResponse.status >= 500) {
          throw new Error('Сервер 1С временно недоступен. Попробуйте позже.');
        } else {
          throw new Error(
            errorData.message ??
              `Не удалось подключиться к 1С (код ${testResponse.status}). Проверьте параметры подключения.`
          );
        }
      }

      await window.desktopBridge.saveConfig({
        odataBaseUrl,
        odataUsername,
        odataPassword
      });

      setSuccessMessage('Настройки сохранены. Перезапустите приложение для применения изменений.');
      onSaved();
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        setError(
          'Не удалось проверить подключение: сервер приложения недоступен. Убедитесь, что приложение запущено.'
        );
      } else {
        setError(err instanceof Error ? err.message : 'Ошибка сохранения настроек');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-overlay">
      <div className="settings-modal">
        <div className="settings-header">
          <h2>Настройки подключения к 1С</h2>
          <button type="button" className="settings-close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        <form onSubmit={handleSave} className="settings-form">
          <div className="settings-field">
            <label htmlFor="odataBaseUrl">URL OData сервиса 1С</label>
            <input
              type="url"
              id="odataBaseUrl"
              value={odataBaseUrl}
              onChange={e => setOdataBaseUrl(e.target.value)}
              placeholder="https://example.com/odata/standard.odata"
              required
            />
            <small>Пример: https://goshift.ru/demo_ut/odata/standard.odata</small>
          </div>

          <div className="settings-field">
            <label htmlFor="odataUsername">Логин</label>
            <input
              type="text"
              id="odataUsername"
              value={odataUsername}
              onChange={e => setOdataUsername(e.target.value)}
              placeholder="odata.user"
              required
            />
          </div>

          <div className="settings-field">
            <label htmlFor="odataPassword">Пароль</label>
            <input
              type="password"
              id="odataPassword"
              value={odataPassword}
              onChange={e => setOdataPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {error !== null && error !== '' && <div className="settings-error">{error}</div>}
          {successMessage !== null && successMessage !== '' && (
            <div className="settings-success">{successMessage}</div>
          )}

          <div className="settings-actions">
            <button type="button" onClick={onClose} className="settings-cancel">
              Отмена
            </button>
            <button type="submit" disabled={saving} className="settings-save">
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
