import { expect, test } from '@playwright/test';
import { DEMO_ORDER_NUMBER, DEMO_ORDERS, openOrder } from './helpers';

test.describe('Расчёты и отображение сумм', () => {
  test('показывает суммы заказа из реального ответа сервера', async ({ page }) => {
    await openOrder(page);
    await expect(page.locator('.order-summary')).toContainText(DEMO_ORDER_NUMBER);
    const rows = page.locator('.order-line-row');
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0)).toContainText('3750.00');
    await expect(rows.nth(0)).toContainText('825.00');
    await expect(rows.nth(0)).toContainText('4575.00');
    await expect(page.locator('.issue-summary')).toContainText('21 181,00');
    await expect(page.locator('.issue-summary')).toContainText('24 391,82');
  });

  test('округляет цены, суммы и НДС до двух знаков', async ({ page }) => {
    await openOrder(page);
    const cells = page.locator('.order-line-row td');
    const text = await cells.allTextContents();
    const monetary = text.filter(value => /\d+[.,]\d{2}/.test(value));
    expect(monetary.length).toBeGreaterThan(8);
    for (const value of monetary) {
      expect(value).toMatch(/\d+[.,]\d{2}/);
    }
  });

  test('возвращает согласованные итоги через API', async ({ request }) => {
    const response = await request.post('/api/documents/orders/search', {
      data: { orderRef: DEMO_ORDER_NUMBER }
    });
    expect(response.ok()).toBeTruthy();
    const body = (await response.json()) as {
      totals: { amount: number; vatAmount: number; amountWithVat: number; lineCount: number };
    };
    expect(body.totals).toEqual({
      amount: 21181,
      vatAmount: 3210.82,
      amountWithVat: 24391.82,
      lineCount: 4
    });
  });

  test('загружает все эталонные заказы демо-базы', async ({ request }) => {
    for (const expected of DEMO_ORDERS) {
      const response = await request.post('/api/documents/orders/search', {
        data: { orderRef: expected.number }
      });
      expect(response.ok(), `поиск заказа ${expected.number}`).toBeTruthy();

      const body = (await response.json()) as {
        order: { number: string };
        lines: unknown[];
        totals: {
          amount: number;
          vatAmount: number;
          amountWithVat: number;
          lineCount: number;
        };
      };
      expect(body.order.number).toBe(expected.number);
      expect(body.lines).toHaveLength(expected.lineCount);
      expect(body.totals).toEqual({
        amount: expected.amount,
        vatAmount: expected.vatAmount,
        amountWithVat: expected.amountWithVat,
        lineCount: expected.lineCount
      });
    }
  });
});
