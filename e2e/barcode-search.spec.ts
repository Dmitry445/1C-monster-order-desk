import { expect, test } from '@playwright/test';
import { DEMO_BARCODES } from '../src/shared/demoBarcodes';

const [demoProduct] = DEMO_BARCODES;

test.describe('Поиск остатка по штрихкоду', () => {
  test('сервер отклоняет EAN-13 с неверной контрольной цифрой', async ({ request }) => {
    const response = await request.get('/api/documents/products/barcode/4607034764585');
    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'INVALID_BARCODE',
      retryable: false
    });
  });

  test('показывает номенклатуру и остатки по складам', async ({ page }) => {
    await page.route(`**/api/documents/products/barcode/${demoProduct.barcode}`, route =>
      route.fulfill({
        json: {
          barcode: demoProduct.barcode,
          article: 'АРТ-001',
          name: demoProduct.productName,
          unit: 'шт',
          balances: [
            { warehouse: 'Центральный склад', balance: 12 },
            { warehouse: 'Резервный склад', balance: 3 }
          ],
          totalBalance: 15
        }
      })
    );

    await page.goto('/');
    for (const item of DEMO_BARCODES) {
      await expect(
        page.getByRole('button', { name: `${item.productName}, ${item.barcode}` })
      ).toBeVisible();
    }
    await page
      .getByRole('button', { name: `${demoProduct.productName}, ${demoProduct.barcode}` })
      .click();
    await expect(page.getByRole('textbox', { name: 'Поиск заказа или товара' })).toHaveValue(
      demoProduct.barcode
    );
    await page.getByRole('button', { name: 'Проверить остаток' }).click();

    await expect(page.getByRole('heading', { name: demoProduct.productName })).toBeVisible();
    await expect(page.locator('.product-stock')).toContainText('Центральный склад');
    await expect(page.locator('.product-stock')).toContainText('Всего: 15 шт');
  });

  test('направляет номер заказа в поиск заказа', async ({ page }) => {
    let orderRequestSent = false;
    let barcodeRequestSent = false;
    await page.route('**/api/documents/orders/search', route => {
      orderRequestSent = true;
      return route.fulfill({
        status: 404,
        json: { code: 'ORDER_NOT_FOUND', message: 'Заказ не найден', retryable: false }
      });
    });
    await page.route('**/api/documents/products/barcode/**', route => {
      barcodeRequestSent = true;
      return route.abort();
    });

    await page.goto('/');
    await page.getByRole('textbox', { name: 'Поиск заказа или товара' }).fill('00ДМ-000101');
    await page.getByRole('button', { name: 'Найти заказ' }).click();

    await expect(page.getByRole('alert')).toContainText('Заказ не найден');
    expect(orderRequestSent).toBe(true);
    expect(barcodeRequestSent).toBe(false);
  });

  test('не отправляет EAN-13 с неверной контрольной цифрой', async ({ page }) => {
    let barcodeRequestSent = false;
    let orderRequestSent = false;
    await page.route('**/api/documents/products/barcode/**', route => {
      barcodeRequestSent = true;
      return route.abort();
    });
    await page.route('**/api/documents/orders/search', route => {
      orderRequestSent = true;
      return route.abort();
    });

    await page.goto('/');
    await page.getByRole('textbox', { name: 'Поиск заказа или товара' }).fill('4607034764585');
    await page.getByRole('button', { name: 'Проверить остаток' }).click();

    await expect(page.getByRole('alert')).toContainText('верной контрольной цифрой');
    expect(barcodeRequestSent).toBe(false);
    expect(orderRequestSent).toBe(false);
  });
});
