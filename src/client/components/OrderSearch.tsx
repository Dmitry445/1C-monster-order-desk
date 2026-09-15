import { useState } from 'react';
import { isValidEan13 } from '../../shared/barcode';
import { DEMO_BARCODES } from '../../shared/demoBarcodes';
import type { ApiError, ProductStockSearchResponse } from '../../shared/types';
import './OrderSearch.css';
import { Alert } from './ui/Alert';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Input } from './ui/Input';

interface OrderSearchProps {
  onSearch: (orderRef: string) => void;
  loading: boolean;
}

type InputType = 'guid' | 'number' | 'barcode' | 'invalid-barcode' | 'unknown';

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function detectInputType(value: string): InputType {
  const trimmed = value.trim();

  if (trimmed === '') {
    return 'unknown';
  }

  if (GUID_PATTERN.test(trimmed)) {
    return 'guid';
  }

  if (/^\d{13}$/.test(trimmed)) {
    return isValidEan13(trimmed) ? 'barcode' : 'invalid-barcode';
  }

  return 'number';
}

function getPlaceholderForType(type: InputType): string {
  switch (type) {
    case 'guid':
      return 'Идентификатор заказа из 1С';
    case 'number':
      return 'Номер заказа';
    case 'barcode':
    case 'invalid-barcode':
      return 'Штрихкод товара EAN-13';
    case 'unknown':
      return 'Номер заказа, идентификатор из 1С или штрихкод EAN-13';
  }
}

export function OrderSearch({ onSearch, loading }: OrderSearchProps) {
  const [searchValue, setSearchValue] = useState('');
  const [detectedType, setDetectedType] = useState<InputType>('unknown');
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeError, setBarcodeError] = useState('');
  const [product, setProduct] = useState<ProductStockSearchResponse | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchValue(newValue);
    setDetectedType(detectInputType(newValue));
    setBarcodeError('');
    setProduct(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchValue.trim();
    if (trimmed === '') return;

    if (detectedType === 'invalid-barcode') {
      setBarcodeError('Введите EAN-13 с верной контрольной цифрой');
      setProduct(null);
      return;
    }

    if (detectedType !== 'barcode') {
      onSearch(trimmed);
      return;
    }

    setBarcodeLoading(true);
    setBarcodeError('');
    setProduct(null);
    void fetch(`/api/documents/products/barcode/${encodeURIComponent(trimmed)}`)
      .then(async response => {
        if (!response.ok) {
          const error = (await response.json().catch(() => null)) as ApiError | null;
          throw new Error(error?.message ?? 'Не удалось получить остаток');
        }
        return response.json() as Promise<ProductStockSearchResponse>;
      })
      .then(setProduct)
      .catch((error: unknown) => {
        setBarcodeError(error instanceof Error ? error.message : 'Не удалось получить остаток');
      })
      .finally(() => setBarcodeLoading(false));
  };

  const handleClear = () => {
    setSearchValue('');
    setDetectedType('unknown');
    setBarcodeError('');
    setProduct(null);
  };

  const busy = loading || barcodeLoading;

  return (
    <Card>
      <form onSubmit={handleSubmit} className="order-search">
        <div className="order-search__input-row">
          <Input
            value={searchValue}
            onChange={handleChange}
            placeholder={getPlaceholderForType(detectedType)}
            disabled={busy}
            required
            autoFocus
            aria-label="Поиск заказа или товара"
            error={barcodeError}
          />

          <Button type="submit" variant="primary" disabled={busy || searchValue.trim() === ''}>
            {busy
              ? 'Поиск...'
              : detectedType === 'barcode' || detectedType === 'invalid-barcode'
                ? 'Проверить остаток'
                : 'Найти заказ'}
          </Button>
        </div>

        <div className="order-search__demo-barcodes">
          {DEMO_BARCODES.map(item => (
            <Button
              key={item.barcode}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchValue(item.barcode);
                setDetectedType(detectInputType(item.barcode));
                setBarcodeError('');
                setProduct(null);
              }}
            >
              {item.productName}, {item.barcode}
            </Button>
          ))}
        </div>

        {searchValue !== '' && !busy && (
          <Button
            type="button"
            variant="ghost"
            onClick={handleClear}
            className="order-search__clear"
          >
            Очистить
          </Button>
        )}

        {product !== null && (
          <section className="product-stock" aria-live="polite">
            <div className="product-stock__heading">
              <div>
                <h2>{product.name}</h2>
                {product.article !== '' && <p>Артикул: {product.article}</p>}
              </div>
              <strong>
                Всего:{' '}
                {product.totalBalance === null
                  ? 'не получено'
                  : `${product.totalBalance.toLocaleString('ru-RU')} ${product.unit ?? ''}`.trim()}
              </strong>
            </div>

            {product.balances.length === 0 ? (
              <Alert variant="warning" title="Остаток не получен">
                В 1С нет строк остатка для этой номенклатуры и характеристики.
              </Alert>
            ) : (
              <dl className="product-stock__balances">
                {product.balances.map((row, index) => (
                  <div key={`${row.warehouse ?? 'unknown'}-${index}`}>
                    <dt>{row.warehouse ?? 'Название склада не получено'}</dt>
                    <dd>
                      {row.balance.toLocaleString('ru-RU')} {product.unit ?? ''}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        )}
      </form>
    </Card>
  );
}
