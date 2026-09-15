import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import type { PrinterInfo } from '../../../electron/preload';
import { printPdfInBrowser, savePdfInBrowser } from '../utils/pdfHelpers';
import './PDFViewer.css';
import { Button } from './ui/Button';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface PDFViewerProps {
  pdfBase64: string;
  orderNumber?: string;
  onClose: () => void;
  onPrinted?: (printerName?: string) => void;
  onSaved?: (filePath?: string) => void;
  onError?: (errorMessage: string) => void;
}

export function PDFViewer({
  pdfBase64,
  orderNumber = '',
  onClose,
  onPrinted,
  onSaved,
  onError
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.1);
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('');
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const pdfData = useMemo(() => {
    try {
      const binaryString = window.atob(pdfBase64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return { data: bytes };
    } catch {
      return null;
    }
  }, [pdfBase64]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    return () => previousFocus?.focus();
  }, []);

  useEffect(() => {
    let isMounted = true;
    const bridge = window.desktopBridge;
    if (bridge?.isElectron === true && bridge.getPrinters !== undefined) {
      bridge
        .getPrinters()
        .then(list => {
          if (!isMounted) return;
          setPrinters(list);
          const defaultP = list.find(p => p.isDefault === true) ?? list[0];
          if (defaultP !== undefined) {
            setSelectedPrinter(defaultP.name);
          }
        })
        .catch(() => {
          // Игнорируем ошибку получения списка принтеров
        });
    }
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      } else if (event.key === 'ArrowRight' && pageNumber < numPages) {
        setPageNumber(prev => Math.min(prev + 1, numPages));
      } else if (event.key === 'ArrowLeft' && pageNumber > 1) {
        setPageNumber(prev => Math.max(prev - 1, 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, pageNumber, numPages]);

  const handleDocumentLoadSuccess = ({ numPages: nextNumPages }: { numPages: number }) => {
    setNumPages(nextNumPages);
    setPageNumber(1);
  };

  const handleDocumentLoadError = (error: Error) => {
    onError?.(`Не удалось отобразить PDF документ: ${error.message}`);
  };

  const handleZoomIn = () => {
    setScale(prev => Math.min(Math.round((prev + 0.15) * 100) / 100, 2.5));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(Math.round((prev - 0.15) * 100) / 100, 0.6));
  };

  const handleZoomReset = () => {
    setScale(1.0);
  };

  const handlePrint = async () => {
    setIsPrinting(true);
    try {
      if (window.desktopBridge?.isElectron === true) {
        let targetPrinter = selectedPrinter;
        const bridge = window.desktopBridge;
        if (targetPrinter === '' && bridge.getPrinters !== undefined) {
          const freshPrinters = await bridge.getPrinters();
          const def = freshPrinters.find(p => p.isDefault === true) ?? freshPrinters[0];
          if (def !== undefined) {
            targetPrinter = def.name;
          }
        }

        const result = await window.desktopBridge.printPdf({
          base64Data: pdfBase64,
          deviceName: targetPrinter !== '' ? targetPrinter : undefined,
          silent: targetPrinter !== ''
        });

        if (result.success) {
          onPrinted?.(targetPrinter !== '' ? targetPrinter : 'Системный диалог печати');
        } else {
          onError?.(result.error ?? 'Ошибка отправки на печать');
        }
      } else {
        const result = await printPdfInBrowser(pdfBase64);
        if (result.success) {
          onPrinted?.('Браузерная печать');
        } else {
          onError?.(result.error ?? 'Ошибка отправки на печать в браузере');
        }
      }
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Неизвестная ошибка печати');
    } finally {
      setIsPrinting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    const fileName = `order-${orderNumber !== '' ? orderNumber : 'nakladnaya'}.pdf`;
    try {
      if (window.desktopBridge?.isElectron === true) {
        const result = await window.desktopBridge.savePdf({
          defaultName: fileName,
          base64Data: pdfBase64
        });
        if (result.success && typeof result.filePath === 'string' && result.filePath.length > 0) {
          onSaved?.(result.filePath);
        } else if (
          result.canceled !== true &&
          typeof result.error === 'string' &&
          result.error.length > 0
        ) {
          onError?.(result.error);
        }
      } else {
        savePdfInBrowser(pdfBase64, fileName);
        onSaved?.(fileName);
      }
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Ошибка сохранения файла');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="pdf-viewer-backdrop"
      onClick={event => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-viewer-title"
    >
      <div className="pdf-viewer-modal">
        <div className="pdf-viewer__toolbar">
          <div className="pdf-viewer__title-group">
            <h3 id="pdf-viewer-title" className="pdf-viewer__title">
              Накладная {orderNumber !== '' ? `по заказу № ${orderNumber}` : ''}
            </h3>
          </div>

          <div className="pdf-viewer__controls">
            {numPages > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPageNumber(prev => Math.max(prev - 1, 1))}
                  disabled={pageNumber <= 1}
                  aria-label="Предыдущая страница"
                >
                  ◀
                </Button>
                <span className="pdf-viewer__page-info">
                  Стр. {pageNumber} из {numPages}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPageNumber(prev => Math.min(prev + 1, numPages))}
                  disabled={pageNumber >= numPages}
                  aria-label="Следующая страница"
                >
                  ▶
                </Button>
              </>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={handleZoomOut}
              disabled={scale <= 0.6}
              title="Уменьшить"
            >
              −
            </Button>
            <span
              className="pdf-viewer__scale-info"
              onClick={handleZoomReset}
              title="Сбросить масштаб"
              style={{ cursor: 'pointer' }}
            >
              {Math.round(scale * 100)}%
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleZoomIn}
              disabled={scale >= 2.5}
              title="Увеличить"
            >
              +
            </Button>
          </div>

          <div className="pdf-viewer__actions">
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handlePrint()}
              disabled={isPrinting}
            >
              {isPrinting ? 'Печать...' : 'Печать'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleSave()}
              disabled={isSaving}
            >
              {isSaving ? 'Сохранение...' : 'Сохранить PDF'}
            </Button>
            <Button
              ref={closeButtonRef}
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Закрыть просмотр PDF"
              title="Закрыть (Esc)"
            >
              ✕
            </Button>
          </div>
        </div>

        {printers.length > 0 && (
          <div className="pdf-viewer__printer-banner">
            <span>Принтер для быстрой печати:</span>
            <select
              className="pdf-viewer__printer-select"
              value={selectedPrinter}
              onChange={e => setSelectedPrinter(e.target.value)}
            >
              {printers.map(p => (
                <option key={p.name} value={p.name}>
                  {p.displayName !== '' ? p.displayName : p.name}{' '}
                  {p.isDefault === true ? '(по умолчанию)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="pdf-viewer__body">
          {pdfData !== null ? (
            <Document
              file={pdfData}
              onLoadSuccess={handleDocumentLoadSuccess}
              loading={<div className="pdf-viewer__loading">Загрузка PDF документа...</div>}
              error={<div className="pdf-viewer__error">Не удалось отобразить PDF документ</div>}
              onLoadError={handleDocumentLoadError}
              className="pdf-viewer__document"
            >
              <Page
                pageNumber={pageNumber}
                scale={scale}
                className="pdf-viewer__page"
                renderTextLayer={true}
                renderAnnotationLayer={true}
              />
            </Document>
          ) : (
            <div className="pdf-viewer__error">Данные PDF отсутствуют или повреждены</div>
          )}
        </div>
      </div>
    </div>
  );
}
