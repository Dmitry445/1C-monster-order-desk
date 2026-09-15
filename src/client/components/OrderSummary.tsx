import './OrderSummary.css';

interface OrderSummaryProps {
  order: {
    number: string;
    date: string;
    warehouse: string;
    priceIncludesVat: boolean;
    vatTaxation: string;
  };
}

function formatVatTaxation(value: string): string {
  if (value === 'НеОблагаетсяНДС') return 'Без НДС';
  if (value === 'ПродажаОблагаетсяНДС') return 'Облагается НДС';
  return value;
}

export function OrderSummary({ order }: OrderSummaryProps) {
  return (
    <div className="order-summary">
      <h2 className="order-summary__title">Заказ {order.number}</h2>
      <div className="order-summary__details">
        <div className="order-summary__detail">
          <span className="order-summary__label">Дата:</span>
          <span className="order-summary__value">
            {new Date(order.date).toLocaleDateString('ru-RU')}
          </span>
        </div>
        <div className="order-summary__detail">
          <span className="order-summary__label">Склад:</span>
          <span className="order-summary__value">{order.warehouse}</span>
        </div>
        <div className="order-summary__detail">
          <span className="order-summary__label">Цена указана:</span>
          <span className="order-summary__value">
            {order.priceIncludesVat ? 'С НДС' : 'Без НДС'}
          </span>
        </div>
        <div className="order-summary__detail">
          <span className="order-summary__label">Налогообложение:</span>
          <span className="order-summary__value">{formatVatTaxation(order.vatTaxation)}</span>
        </div>
      </div>
    </div>
  );
}
