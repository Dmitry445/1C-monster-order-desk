export type StockStatus = 'sufficient' | 'insufficient' | 'unknown';

export interface OrderLine {
  article: string;
  name: string;
  unit: string | null;
  qty: number;
  price: number;
  vatName: string;
  amount: number;
  vatAmount: number;
  amountWithVat: number;
  stockBalance?: number | null;
  stockStatus: StockStatus;
}

export interface OrderTotals {
  amount: number;
  vatAmount: number;
  amountWithVat: number;
  lineCount: number;
}

export interface Customer {
  lastName: string;
  firstName: string;
  middleName?: string;
  gender?: 'м' | 'ж';
  phone: string;
  email: string;
}

export interface Order {
  number: string;
  date: string;
  warehouse: string;
  priceIncludesVat: boolean;
  vatTaxation: string;
}

export interface OrderSearchRequest {
  orderRef: string;
}

export interface OrderSearchResponse {
  order: Order;
  lines: OrderLine[];
  totals: OrderTotals;
}

export interface ProductStockBalance {
  warehouse: string | null;
  balance: number;
}

export interface ProductStockSearchResponse {
  barcode: string;
  article: string;
  name: string;
  unit: string | null;
  balances: ProductStockBalance[];
  totalBalance: number | null;
}

export interface DocumentPreviewRequest {
  orderRef: string;
  customer: Customer;
}

export interface DocumentPreviewResponse {
  customer: {
    fullNameGenitive: string;
    fullNameDative: string;
    phone: string;
    email: string;
  };
  order: Order;
  lines: OrderLine[];
  totals: OrderTotals;
}

export interface DocumentGenerateRequest {
  orderRef: string;
  customer: Customer;
}

export interface DocumentGenerateResponse {
  alreadyExists: boolean;
  documentNumber: string;
}

export interface ApiError {
  code: string;
  message: string;
  retryable: boolean;
}
