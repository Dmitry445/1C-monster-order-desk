export interface DemoBarcode {
  barcode: string;
  productName: string;
}

export const DEMO_BARCODES: [DemoBarcode, ...DemoBarcode[]] = [
  {
    barcode: '4600100000014',
    productName: 'Бумага офисная А4, 500 листов'
  },
  {
    barcode: '4600100000021',
    productName: 'Ручка шариковая синяя'
  },
  {
    barcode: '4600100000038',
    productName: 'Папка-регистратор 75 мм'
  }
];
