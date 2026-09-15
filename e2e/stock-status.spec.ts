import { expect, test } from '@playwright/test';
import { openOrder } from './helpers';

test.describe('Статусы остатков', () => {
  test('показывает недостаточный остаток для первой строки демо-заказа', async ({ page }) => {
    await openOrder(page);
    const firstBadge = page.locator('.stock-status-badge').first();
    await expect(firstBadge).toHaveClass(/stock-status-badge--insufficient/);
    await expect(firstBadge).toContainText('Недостаточно');
    await expect(firstBadge).toContainText('2 из 3');
    await expect(page.locator('.issue-summary')).toContainText('Недостаточно товара');
  });

  test('показывает достаточный остаток для остальных строк', async ({ page }) => {
    await openOrder(page);
    await expect(page.locator('.stock-status-badge--sufficient')).toHaveCount(3);
    await expect(page.locator('.stock-status-badge--sufficient').first()).toContainText(
      'В наличии'
    );
  });

  test('отображает остаток неизвестным, если сервер не вернул значение', async ({ page }) => {
    await page.route('**/api/documents/orders/search', async route => {
      const response = await route.fetch();
      const body = (await response.json()) as { lines: Array<Record<string, unknown>> };
      body.lines[0] = { ...body.lines[0], stockBalance: null, stockStatus: 'unknown' };
      await route.fulfill({ response, json: body });
    });
    await openOrder(page);
    await expect(page.locator('.stock-status-badge--unknown')).toHaveCount(1);
    await expect(page.locator('.stock-status-badge--unknown')).toContainText('Остаток не получен');
  });
});
