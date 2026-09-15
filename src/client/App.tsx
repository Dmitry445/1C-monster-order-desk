import { lazy, Suspense, useEffect, useState } from 'react';
import type { Customer, OrderSearchResponse } from '../shared/types';
import './App.css';
import { BrandHeader } from './components/BrandHeader';
import { ConfirmationStep } from './components/ConfirmationStep';
import { CustomerForm } from './components/CustomerForm';
import { IssueSummary } from './components/IssueSummary';
import { OrderLinesTable } from './components/OrderLinesTable';
import { OrderSearch } from './components/OrderSearch';
import { OrderSummary } from './components/OrderSummary';
import { Settings } from './components/Settings';
import { SuccessState } from './components/SuccessState';
import { Alert } from './components/ui/Alert';
import { Button } from './components/ui/Button';
import { Card } from './components/ui/Card';
import type { WorkflowState } from './types/workflow';
import { declineFullNameClient } from './utils/nameFormat';
import { blobToBase64, savePdfInBrowser } from './utils/pdfHelpers';

const PDFViewer = lazy(() =>
  import('./components/PDFViewer').then(module => ({
    default: module.PDFViewer
  }))
);

function decodeDocumentNumber(encodedNumber: string | null): string {
  if (encodedNumber === null || encodedNumber === '') {
    return 'Неизвестен';
  }

  try {
    const bytes = Uint8Array.from(window.atob(encodedNumber), character => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return 'Неизвестен';
  }
}

export function App() {
  const [workflowState, setWorkflowState] = useState<WorkflowState>('idle');
  const [orderData, setOrderData] = useState<OrderSearchResponse | null>(null);
  const [orderRef, setOrderRef] = useState<string>('');
  const [customer, setCustomer] = useState<Customer>({
    lastName: '',
    firstName: '',
    middleName: '',
    phone: '',
    email: ''
  });
  const [error, setError] = useState('');
  const [documentNumber, setDocumentNumber] = useState<string>('');
  const [documentAlreadyExists, setDocumentAlreadyExists] = useState(false);
  const [pdfSaved, setPdfSaved] = useState<boolean | null>(true);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [isViewingPdf, setIsViewingPdf] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = window.localStorage.getItem('monster-order-theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('monster-order-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (window.desktopBridge?.isElectron === true) {
      document.documentElement.classList.add('is-electron');
    }
  }, []);
  const [connectionStatus, setConnectionStatus] = useState<
    'connected' | 'disconnected' | 'degraded' | 'checking'
  >('checking');
  const [connectionDetail, setConnectionDetail] = useState<string>('');

  useEffect(() => {
    const openSettingsIfNotConfigured = async () => {
      if (window.desktopBridge === undefined) {
        return;
      }

      try {
        const config = await window.desktopBridge.getConfig();
        const hasCompleteConfig =
          (config.odataBaseUrl ?? '').trim() !== '' &&
          (config.odataUsername ?? '').trim() !== '' &&
          (config.odataPassword ?? '').trim() !== '';

        if (!hasCompleteConfig) {
          setIsSettingsOpen(true);
        }
      } catch {
        // Игнорируем ошибку чтения конфигурации при старте
      }
    };

    void openSettingsIfNotConfigured();
  }, []);

  const checkStatus = async () => {
    try {
      const response = await fetch('/api/documents/status');
      if (response.ok) {
        const data = (await response.json()) as {
          status: 'connected' | 'disconnected' | 'degraded';
          detail?: string;
        };
        setConnectionStatus(data.status);
        setConnectionDetail(data.detail ?? '');
      } else {
        setConnectionStatus('disconnected');
        setConnectionDetail('');
      }
    } catch {
      setConnectionStatus('disconnected');
      setConnectionDetail('');
    }
  };

  useEffect(() => {
    void checkStatus();
    const connectionCheckInterval = Number(import.meta.env.VITE_CONNECTION_CHECK_INTERVAL ?? 30000);
    const interval = setInterval(() => {
      void checkStatus();
    }, connectionCheckInterval);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const handleSearchOrder = async (searchRef: string) => {
    setWorkflowState('loading-order');
    setError('');
    setOrderRef(searchRef);

    try {
      const response = await fetch('/api/documents/orders/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderRef: searchRef })
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({ message: undefined }))) as {
          message?: string;
        };
        throw new Error(errorData.message ?? 'Не удалось загрузить заказ');
      }

      const data = (await response.json()) as OrderSearchResponse;
      setOrderData(data);
      setWorkflowState('order-loaded');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(errorMessage);
      setWorkflowState('error');
    }
  };

  const handleCheckDocument = async () => {
    if (orderData === null || orderRef === '') return;

    setWorkflowState('checking');
    setError('');

    try {
      const response = await fetch('/api/documents/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderRef,
          customer
        })
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({ message: undefined }))) as {
          message?: string;
        };
        throw new Error(errorData.message ?? 'Не удалось проверить документ');
      }

      const data = (await response.json()) as { alreadyExists: boolean; documentNumber: string };
      setDocumentNumber(data.documentNumber);
      setDocumentAlreadyExists(data.alreadyExists);

      if (data.alreadyExists) {
        setWorkflowState('confirm-existing');
      } else {
        void handleGenerateDocument();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(errorMessage);
      setWorkflowState('error');
    }
  };

  const handleGenerateDocument = async (
    options: { saveFile?: boolean; openViewer?: boolean } = {}
  ) => {
    if (orderData === null || orderRef === '') return;

    const saveFile = options.saveFile ?? true;
    const openViewer = options.openViewer ?? false;
    setWorkflowState('generating');
    setError('');

    try {
      const response = await fetch('/api/documents/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderRef,
          customer
        })
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({ message: undefined }))) as {
          message?: string;
        };
        throw new Error(errorData.message ?? 'Не удалось сформировать документ');
      }

      const docNumber = decodeDocumentNumber(response.headers.get('X-Document-Number'));

      const blob = await response.blob();
      const defaultName = `order-${orderData.order.number}.pdf`;
      const base64Data = await blobToBase64(blob);
      setPdfBase64(base64Data);

      if (saveFile) {
        if (window.desktopBridge?.isElectron === true) {
          const saveResult = await window.desktopBridge.savePdf({
            defaultName,
            base64Data
          });

          if (saveResult.canceled === true) {
            setPdfSaved(false);
          } else {
            setPdfSaved(true);
          }

          if (typeof saveResult.error === 'string' && saveResult.error.length > 0) {
            throw new Error(saveResult.error);
          }
        } else {
          savePdfInBrowser(blob, defaultName);
          setPdfSaved(true);
        }
      } else {
        setPdfSaved(null);
      }

      setDocumentNumber(docNumber);
      setWorkflowState('success');
      if (openViewer || (saveFile && window.desktopBridge?.isElectron === true)) {
        setIsViewingPdf(true);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(errorMessage);
      setWorkflowState('error');
    }
  };

  const handleReset = () => {
    setWorkflowState('idle');
    setOrderData(null);
    setOrderRef('');
    setCustomer({
      lastName: '',
      firstName: '',
      middleName: '',
      phone: '',
      email: ''
    });
    setError('');
    setDocumentNumber('');
    setDocumentAlreadyExists(false);
    setPdfSaved(true);
    setPdfBase64(null);
    setIsViewingPdf(false);
  };

  const handleSavePdf = async () => {
    if (pdfBase64 === null || orderData === null) return;
    const defaultName = `order-${orderData.order.number}.pdf`;
    try {
      if (window.desktopBridge?.isElectron === true) {
        const result = await window.desktopBridge.savePdf({
          defaultName,
          base64Data: pdfBase64
        });
        if (result.success) {
          setPdfSaved(true);
        } else if (result.canceled === true) {
          setPdfSaved(false);
        } else if (typeof result.error === 'string' && result.error.length > 0) {
          setError(result.error);
        }
      } else {
        savePdfInBrowser(pdfBase64, defaultName);
        setPdfSaved(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения файла');
    }
  };

  const getPreviewName = (): string => {
    if (customer.lastName.trim() === '' || customer.firstName.trim() === '') {
      return '';
    }

    return declineFullNameClient(customer.lastName, customer.firstName, customer.middleName ?? '');
  };

  const hasInsufficientStock =
    orderData?.lines.some(line => line.stockStatus === 'insufficient') ?? false;
  const hasUnknownStock = orderData?.lines.some(line => line.stockStatus === 'unknown') ?? false;
  const currentStep =
    workflowState === 'idle' || workflowState === 'error'
      ? 1
      : workflowState === 'order-loaded'
        ? 2
        : workflowState === 'ready-to-generate' || workflowState === 'checking'
          ? 3
          : 4;

  return (
    <div className="app">
      <BrandHeader
        warehouse={orderData?.order.warehouse}
        connectionStatus={connectionStatus}
        connectionDetail={connectionDetail}
        theme={theme}
        onToggleTheme={() => setTheme(current => (current === 'dark' ? 'light' : 'dark'))}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <main className="app-main">
        {workflowState !== 'idle' && (
          <nav className="workflow-progress" aria-label="Этап выдачи заказа">
            {[
              ['Заказ', 1],
              ['Получатель', 2],
              ['Подтверждение', 3],
              ['Готово', 4]
            ].map(([label, step]) => (
              <div
                className={`workflow-progress__step ${currentStep >= Number(step) ? 'is-active' : ''}`}
                key={label}
              >
                <span className="workflow-progress__number">{step}</span>
                <span>{label}</span>
              </div>
            ))}
          </nav>
        )}
        {workflowState === 'idle' && <OrderSearch onSearch={handleSearchOrder} loading={false} />}

        {workflowState === 'loading-order' && (
          <Card>
            <div className="loading-state" role="status" aria-live="polite">
              <div className="loading-spinner" />
              <p>Загрузка заказа...</p>
            </div>
          </Card>
        )}

        {workflowState === 'order-loaded' && orderData !== null && (
          <div className="app-layout">
            <div className="app-layout__main">
              <Card>
                <OrderSummary order={orderData.order} />
                <OrderLinesTable lines={orderData.lines} totals={orderData.totals} />
              </Card>

              <CustomerForm
                customer={customer}
                onChange={setCustomer}
                onSubmit={() => setWorkflowState('ready-to-generate')}
                loading={false}
                previewName={getPreviewName()}
                submitLabel="Перейти к подтверждению"
              />
            </div>

            <aside className="app-layout__sidebar">
              <IssueSummary
                totals={orderData.totals}
                hasInsufficientStock={hasInsufficientStock}
                hasUnknownStock={hasUnknownStock}
              />
            </aside>
          </div>
        )}

        {workflowState === 'ready-to-generate' && orderData !== null && (
          <ConfirmationStep
            order={orderData.order}
            customer={customer}
            totals={orderData.totals}
            declinedName={getPreviewName()}
            hasInsufficientStock={hasInsufficientStock}
            hasUnknownStock={hasUnknownStock}
            onConfirm={handleCheckDocument}
            onBack={() => setWorkflowState('order-loaded')}
            loading={false}
          />
        )}

        {workflowState === 'checking' && (
          <Card>
            <div className="loading-state" role="status" aria-live="polite">
              <div className="loading-spinner" />
              <p>Проверка документа реализации в 1С...</p>
            </div>
          </Card>
        )}

        {workflowState === 'confirm-existing' && orderData !== null && (
          <Card>
            <Alert variant="info" title="Документ реализации уже существует">
              Документ реализации <strong>№{documentNumber}</strong> уже был создан ранее для этого
              заказа.
            </Alert>
            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
              <Button
                type="button"
                variant="primary"
                onClick={() => void handleGenerateDocument({ saveFile: true })}
              >
                Скачать PDF
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleGenerateDocument({ saveFile: false, openViewer: true })}
              >
                Просмотреть PDF
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setWorkflowState('ready-to-generate')}
              >
                Назад к подтверждению
              </Button>
            </div>
          </Card>
        )}

        {workflowState === 'generating' && (
          <Card>
            <div className="loading-state" role="status" aria-live="polite">
              <div className="loading-spinner" />
              <p>Создание документа реализации в 1С и загрузка PDF...</p>
            </div>
          </Card>
        )}

        {workflowState === 'success' && orderData !== null && (
          <SuccessState
            orderNumber={orderData.order.number}
            documentNumber={documentNumber}
            alreadyExists={documentAlreadyExists}
            pdfSaved={pdfSaved}
            canViewPdf={pdfBase64 !== null}
            onViewPdf={() => setIsViewingPdf(true)}
            canSave={pdfBase64 !== null}
            onSave={() => void handleSavePdf()}
            onNewOrder={handleReset}
          />
        )}

        {workflowState === 'error' && error !== '' && (
          <>
            <Alert variant="error" title="Ошибка">
              {error}
            </Alert>
            <Card>
              <div className="form-actions">
                <button onClick={handleReset} className="btn btn-secondary">
                  Начать заново
                </button>
              </div>
            </Card>
          </>
        )}
      </main>

      {isViewingPdf && pdfBase64 !== null && (
        <Suspense
          fallback={
            <div className="pdf-viewer-backdrop" role="dialog" aria-modal="true" aria-busy="true">
              <div className="pdf-viewer-modal">
                <div className="loading-state" role="status" aria-live="polite">
                  <div className="loading-spinner" />
                  <p>Загрузка просмотра PDF...</p>
                </div>
              </div>
            </div>
          }
        >
          <PDFViewer
            pdfBase64={pdfBase64}
            orderNumber={orderData?.order.number}
            onClose={() => setIsViewingPdf(false)}
            onError={msg => {
              setIsViewingPdf(false);
              setError(msg);
              setWorkflowState('error');
            }}
          />
        </Suspense>
      )}

      {isSettingsOpen && (
        <Settings
          onClose={() => setIsSettingsOpen(false)}
          onSaved={() => {
            setIsSettingsOpen(false);
            void checkStatus();
          }}
        />
      )}
    </div>
  );
}
