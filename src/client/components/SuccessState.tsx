import './SuccessState.css';
import { Alert } from './ui/Alert';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

interface SuccessStateProps {
  orderNumber: string;
  documentNumber: string;
  alreadyExists?: boolean;
  onNewOrder: () => void;
  pdfSaved?: boolean | null;
  canViewPdf?: boolean;
  onViewPdf?: () => void;
  canSave?: boolean;
  onSave?: () => void;
}

export function SuccessState({
  orderNumber,
  documentNumber,
  alreadyExists = false,
  onNewOrder,
  pdfSaved = true,
  canViewPdf = false,
  onViewPdf,
  canSave = false,
  onSave
}: SuccessStateProps) {
  return (
    <div className="success-state">
      <Alert
        variant={alreadyExists ? 'info' : 'success'}
        title={alreadyExists ? 'Документ уже был создан ранее' : 'Документ успешно создан'}
      >
        <div className="success-state__content">
          <p>
            Заказ <strong>{orderNumber}</strong> обработан
          </p>
          <p>
            {alreadyExists
              ? `Документ реализации №${documentNumber} ранее создан в 1С`
              : `Документ реализации ${documentNumber} создан в 1С`}
          </p>
          <p>
            {pdfSaved === null
              ? 'PDF-документ открыт для просмотра'
              : pdfSaved
                ? 'PDF-документ сохранён'
                : 'Документ создан, но сохранение PDF отменено'}
          </p>
        </div>
      </Alert>

      <Card>
        <div className="success-state__actions">
          {canViewPdf && onViewPdf !== undefined && (
            <Button
              variant="secondary"
              onClick={onViewPdf}
              aria-label="Просмотреть PDF"
              data-testid="view-pdf-btn"
            >
              Просмотреть PDF
            </Button>
          )}
          {canSave && onSave !== undefined && (
            <Button variant="secondary" onClick={onSave}>
              Сохранить PDF
            </Button>
          )}
          <Button variant="primary" onClick={onNewOrder}>
            Новый заказ
          </Button>
        </div>
      </Card>
    </div>
  );
}
