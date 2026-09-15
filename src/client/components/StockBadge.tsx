import './StockBadge.css';

export type StockStatus = 'available' | 'insufficient' | 'no-data';

interface StockBadgeProps {
  balance: number | undefined;
  required: number;
}

function getStockStatus(balance: number | undefined, required: number): StockStatus {
  if (balance === undefined) return 'no-data';
  return balance >= required ? 'available' : 'insufficient';
}

function getStockLabel(status: StockStatus, balance: number | undefined): string {
  if (status === 'no-data') return 'Нет данных';
  if (status === 'insufficient') return `Недостаточно: ${balance}`;
  return `В наличии: ${balance}`;
}

export function StockBadge({ balance, required }: StockBadgeProps) {
  const status = getStockStatus(balance, required);
  const label = getStockLabel(status, balance);

  return (
    <span className={`stock-badge stock-badge--${status}`} role="status" aria-label={label}>
      {label}
    </span>
  );
}
