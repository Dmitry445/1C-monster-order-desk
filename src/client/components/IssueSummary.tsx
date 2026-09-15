import type { OrderTotals } from '../../shared/types';
import './IssueSummary.css';
import { Badge } from './ui/Badge';
import { Card } from './ui/Card';

interface IssueSummaryProps {
  totals: OrderTotals;
  hasInsufficientStock: boolean;
  hasUnknownStock: boolean;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 2
  }).format(value);
}

export function IssueSummary({ totals, hasInsufficientStock, hasUnknownStock }: IssueSummaryProps) {
  return (
    <Card className="issue-summary">
      <h3 className="issue-summary__title">Итого</h3>

      <div className="issue-summary__grid">
        <div className="issue-summary__row">
          <span className="issue-summary__label">Позиций:</span>
          <span className="issue-summary__value">{totals.lineCount}</span>
        </div>

        <div className="issue-summary__row">
          <span className="issue-summary__label">Сумма без НДС:</span>
          <span className="issue-summary__value">{formatCurrency(totals.amount)}</span>
        </div>

        <div className="issue-summary__row">
          <span className="issue-summary__label">НДС:</span>
          <span className="issue-summary__value">{formatCurrency(totals.vatAmount)}</span>
        </div>

        <div className="issue-summary__row issue-summary__row--total">
          <span className="issue-summary__label">Сумма с НДС:</span>
          <span className="issue-summary__value">{formatCurrency(totals.amountWithVat)}</span>
        </div>
      </div>

      {(hasInsufficientStock || hasUnknownStock) && (
        <div className="issue-summary__warnings">
          {hasInsufficientStock && (
            <Badge variant="warning" className="issue-summary__warning">
              Недостаточно товара на складе
            </Badge>
          )}
          {hasUnknownStock && (
            <Badge variant="neutral" className="issue-summary__warning">
              Остаток некоторых позиций неизвестен
            </Badge>
          )}
        </div>
      )}
    </Card>
  );
}
