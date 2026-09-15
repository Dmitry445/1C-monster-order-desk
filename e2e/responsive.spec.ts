import { expect, test } from '@playwright/test';
import { openOrder } from './helpers';

test.describe('Адаптивность интерфейса', () => {
  test('показывает поиск и кнопку на узком экране', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await expect(page.getByRole('textbox', { name: 'Поиск заказа или товара' })).toBeVisible();
    const inputBox = await page
      .getByRole('textbox', { name: 'Поиск заказа или товара' })
      .boundingBox();
    const buttonBox = await page.getByRole('button', { name: 'Найти заказ' }).boundingBox();
    expect(inputBox?.width).toBeGreaterThan(200);
    expect(inputBox?.height).toBeGreaterThanOrEqual(44);
    expect(buttonBox?.height).toBeGreaterThanOrEqual(44);
  });

  test('показывает строки и статусы остатков на мобильном', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await openOrder(page);
    await expect(page.locator('.order-line-row')).toHaveCount(4);
    await expect(page.locator('.stock-status-badge')).toHaveCount(4);
    await expect(page.locator('.order-lines__table-wrapper')).toBeVisible();
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(380);
  });

  test('показывает классическую таблицу на desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openOrder(page);
    await expect(page.locator('.order-lines__table thead')).toBeVisible();
    await expect(page.locator('.order-lines__table tbody tr')).toHaveCount(4);
  });
});
