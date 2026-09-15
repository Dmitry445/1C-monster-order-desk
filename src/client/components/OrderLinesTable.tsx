import type { OrderSearchResponse } from '../../shared/types';
import { formatVatDisplay } from '../../shared/vatFormat';
import './OrderLinesTable.css';
import { Badge } from './ui/Badge';

type OrderLine = OrderSearchResponse['lines'][0];
type Totals = OrderSearchResponse['totals'];

interface OrderLinesTableProps {
  lines: OrderLine[];
  totals: Totals;
}

export function OrderLinesTable({ lines, totals }: OrderLinesTableProps) {
  const getStockBadge = (line: OrderLine) => {
    switch (line.stockStatus) {
      case 'sufficient':
        return {
          variant: 'success' as const,
          label: `В наличии: ${line.stockBalance} из ${line.qty}`
        };
      case 'insufficient':
        return {
          variant: 'warning' as const,
          label: `Недостаточно: ${line.stockBalance} из ${line.qty}`
        };
      case 'unknown':
        return { variant: 'neutral' as const, label: 'Остаток не получен' };
    }
  };

  return (
    <div className="order-lines order-lines-table">
      <div className="order-lines__table-wrapper">
        <table className="order-lines__table">
          <thead>
            <tr>
              <th>Артикул</th>
              <th>Наименование</th>
              <th>Кол-во</th>
              <th>Ед.</th>
              <th>Остаток</th>
              <th>Цена</th>
              <th>Ставка НДС</th>
              <th>Сумма</th>
              <th>НДС</th>
              <th>С НДС</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const badge = getStockBadge(line);
              return (
                <tr key={index} className="order-line-row">
                  <td data-label="Артикул">{line.article}</td>
                  <td data-label="Наименование" className="order-lines__name">
                    {line.name}
                  </td>
                  <td data-label="Кол-во" className="order-lines__number">
                    {line.qty}
                  </td>
                  <td data-label="Ед.">{line.unit ?? 'Не получено'}</td>
                  <td data-label="Остаток">
                    <Badge
                      variant={badge.variant}
                      className={`stock-status-badge stock-status-badge--${line.stockStatus}`}
                    >
                      {badge.label}
                    </Badge>
                  </td>
                  <td data-label="Цена" className="order-lines__number">
                    {line.price.toFixed(2)}
                  </td>
                  <td data-label="Ставка НДС">{formatVatDisplay(line.vatName)}</td>
                  <td data-label="Сумма" className="order-lines__number">
                    {line.amount.toFixed(2)}
                  </td>
                  <td data-label="НДС" className="order-lines__number">
                    {line.vatAmount.toFixed(2)}
                  </td>
                  <td data-label="С НДС" className="order-lines__number">
                    {line.amountWithVat.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={7} className="order-lines__total-label">
                Итого ({totals.lineCount}{' '}
                {totals.lineCount === 1 ? 'позиция' : totals.lineCount < 5 ? 'позиции' : 'позиций'}
                ):
              </td>
              <td className="order-lines__number order-lines__total">{totals.amount.toFixed(2)}</td>
              <td className="order-lines__number order-lines__total">
                {totals.vatAmount.toFixed(2)}
              </td>
              <td className="order-lines__number order-lines__total">
                {totals.amountWithVat.toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
