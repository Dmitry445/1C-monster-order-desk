import React from 'react';
import logoImage from '../assets/monster-ads-logo.png';
import '../components/ui/Button.css';
import './BrandHeader.css';

export interface BrandHeaderProps {
  title?: string;
  warehouse?: string;
  connectionStatus?: 'connected' | 'disconnected' | 'degraded' | 'checking';
  connectionDetail?: string;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  onOpenSettings?: () => void;
}

export const BrandHeader: React.FC<BrandHeaderProps> = ({
  title = 'Выдача заказов',
  warehouse,
  connectionStatus = 'connected',
  connectionDetail,
  theme = 'light',
  onToggleTheme,
  onOpenSettings
}) => {
  const connectionLabels = {
    connected: '1С подключена',
    disconnected: '1С не доступна',
    degraded: '1С частично доступна',
    checking: 'Проверка связи'
  };

  return (
    <header className="brand-header">
      <div className="brand-header-container">
        <div className="brand-header-left">
          <div className="brand-logo brand-header__logo">
            <img src={logoImage} alt="Monster Ads" className="brand-logo-image" />
          </div>
          <h1 className="brand-header-title">{title}</h1>
          {warehouse !== undefined && warehouse !== '' && (
            <span className="warehouse-info"> • Склад: {warehouse}</span>
          )}
        </div>
        <div className="brand-header-right">
          {onToggleTheme !== undefined && (
            <button
              type="button"
              className="theme-toggle btn btn-ghost btn-sm"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
              title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            >
              <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
              <span className="theme-toggle__label">{theme === 'dark' ? 'Светлая' : 'Тёмная'}</span>
            </button>
          )}
          {onOpenSettings !== undefined && window.desktopBridge !== undefined && (
            <button
              type="button"
              className="settings-button btn btn-ghost btn-sm"
              onClick={onOpenSettings}
              aria-label="Настройки подключения к 1С"
              title="Настройки"
            >
              <span aria-hidden="true">⚙</span>
              <span className="settings-button__label">Настройки</span>
            </button>
          )}
          <div
            className={`connection-indicator connection-status ${connectionStatus}`}
            aria-live="polite"
          >
            <span className="connection-indicator-dot" aria-hidden="true"></span>
            <span>
              {connectionLabels[connectionStatus]}
              {connectionDetail !== undefined &&
                connectionDetail !== '' &&
                ` (${connectionDetail})`}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
