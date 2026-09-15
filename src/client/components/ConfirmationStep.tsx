import type { Customer, OrderSearchResponse } from '../../shared/types';
import './ConfirmationStep.css';
import { Alert } from './ui/Alert';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

interface ConfirmationStepProps {
  order: OrderSearchResponse['order'];
  customer: Customer;
  totals: OrderSearchResponse['totals'];
  declinedName: string;
  hasInsufficientStock: boolean;
  hasUnknownStock: boolean;
  onConfirm: () => void;
  onBack: () => void;
  loading: boolean;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 2
  }).format(value);
}

export function ConfirmationStep({
  order,
  customer,
  totals,
  declinedName,
  hasInsufficientStock,
  hasUnknownStock,
  onConfirm,
  onBack,
  loading
}: ConfirmationStepProps) {
  return (
    <div className="confirmation-step">
      <Card>
        <h2 className="confirmation-step__title">Подтверждение выдачи заказа</h2>
        <p className="confirmation-step__subtitle">
          Проверьте данные перед записью документа реализации в 1С
        </p>

        {(hasInsufficientStock || hasUnknownStock) && (
          <div className="confirmation-step__warnings">
            {hasInsufficientStock && (
              <Alert variant="warning" title="Внимание: недостаточный остаток">
                На складе недостаточно товара для части позиций заказа. Выдача будет оформлена на
                заказанное количество.
              </Alert>
            )}
            {hasUnknownStock && (
              <Alert variant="warning" title="Внимание: остаток не подтверждён">
                Остаток некоторых позиций не был получен из 1С. Убедитесь в физическом наличии
                товара на складе.
              </Alert>
            )}
          </div>
        )}

        <div className="confirmation-step__details">
          <div className="confirmation-step__section">
            <h3 className="confirmation-step__section-title">Данные заказа</h3>
            <div className="confirmation-step__row">
              <span className="confirmation-step__label">Номер заказа:</span>
              <span className="confirmation-step__value">{order.number}</span>
            </div>
            <div className="confirmation-step__row">
              <span className="confirmation-step__label">Склад:</span>
              <span className="confirmation-step__value">{order.warehouse}</span>
            </div>
            <div className="confirmation-step__row">
              <span className="confirmation-step__label">Позиций к выдаче:</span>
              <span className="confirmation-step__value">
                <Badge variant="neutral">{totals.lineCount}</Badge>
              </span>
            </div>
            <div className="confirmation-step__row">
              <span className="confirmation-step__label">Итоговая сумма:</span>
              <span className="confirmation-step__value confirmation-step__value--total">
                {formatCurrency(totals.amountWithVat)}
              </span>
            </div>
          </div>

          <div className="confirmation-step__section">
            <h3 className="confirmation-step__section-title">Данные получателя</h3>
            <div className="confirmation-step__row">
              <span className="confirmation-step__label">Выдать:</span>
              <span className="confirmation-step__value">
                {declinedName !== '' ? `Выдать ${declinedName}` : 'Не указано'}
              </span>
            </div>
            <div className="confirmation-step__row">
              <span className="confirmation-step__label">Телефон:</span>
              <span className="confirmation-step__value">{customer.phone}</span>
            </div>
            <div className="confirmation-step__row">
              <span className="confirmation-step__label">Email:</span>
              <span className="confirmation-step__value">{customer.email}</span>
            </div>
          </div>
        </div>

        <div className="confirmation-step__actions">
          <Button variant="primary" onClick={onConfirm} disabled={loading}>
            {loading ? 'Создание документа...' : 'Сформировать документ и записать в 1С'}
          </Button>
          <Button variant="secondary" onClick={onBack} disabled={loading}>
            Назад к редактированию
          </Button>
        </div>
      </Card>
    </div>
  );
}
