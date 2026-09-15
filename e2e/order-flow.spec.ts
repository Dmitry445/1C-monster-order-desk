import { expect, test } from '@playwright/test';
import {
  DEMO_ORDER_GUID,
  DEMO_ORDER_NUMBER,
  fillCustomer,
  goToConfirmation,
  openOrder
} from './helpers';

test.describe('Основной сценарий выдачи', () => {
  test('показывает шапку и состояние соединения', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.brand-header')).toBeVisible();
    await expect(page.locator('.brand-header__logo img')).toHaveAttribute('alt', 'Monster Ads');
    await expect(page.locator('.connection-status')).toBeVisible();
    await expect(page.locator('.brand-header-title')).toHaveText('Выдача заказов');
  });

  test('загружает заказ по номеру и показывает все строки', async ({ page }) => {
    await openOrder(page);
    await expect(page.locator('.order-summary')).toContainText(DEMO_ORDER_NUMBER);
    await expect(page.locator('.order-line-row')).toHaveCount(4);
    await expect(page.locator('.stock-status-badge')).toHaveCount(4);
    await expect(page.locator('.issue-summary')).toContainText('Итого');
  });

  test('загружает тот же заказ по GUID через API', async ({ request }) => {
    const response = await request.post('/api/documents/orders/search', {
      data: { orderRef: DEMO_ORDER_GUID }
    });
    expect(response.ok()).toBeTruthy();
    const body = (await response.json()) as { order: { number: string }; lines: unknown[] };
    expect(body.order.number).toBe(DEMO_ORDER_NUMBER);
    expect(body.lines).toHaveLength(4);
  });

  test('проводит пользователя через подтверждение и сохраняет введённые данные', async ({
    page
  }) => {
    await openOrder(page);
    await fillCustomer(page);
    await goToConfirmation(page);
    await expect(page.locator('.confirmation-step')).toContainText('Воронцову Петру Аркадьевичу');
    await expect(page.locator('.confirmation-step')).toContainText('+7 (999) 123-45-67');
    await page.getByRole('button', { name: 'Назад к редактированию' }).click();
    await expect(page.getByLabel('Фамилия')).toHaveValue('Воронцов');
    await expect(page.getByLabel('Email')).toHaveValue('vorontsov@example.com');
  });

  test('создаёт документ и скачивает PDF', async ({ page }) => {
    await openOrder(page);
    await fillCustomer(page);
    // В демо-базе для эталонного заказа уже есть документ. Для проверки
    // именно ветки создания подменяем только ответ проверки существования;
    // сам запрос генерации и переход интерфейса остаются настоящими.
    await page.route('**/api/documents/check', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ alreadyExists: false, documentNumber: '' })
      });
    });
    await page.route('**/api/documents/generate', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        headers: { 'X-Document-Number': 'RE0wMDAx' },
        body: '%PDF-1.4 mock pdf'
      });
    });
    await goToConfirmation(page);
    const responsePromise = page.waitForResponse(response =>
      response.url().endsWith('/api/documents/generate')
    );
    await page.getByRole('button', { name: 'Сформировать документ и записать в 1С' }).click();
    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toContain('application/pdf');
    await expect(page.locator('.success-state')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('.success-state')).toContainText('Документ успешно создан');
    await expect(page.locator('.success-state')).toContainText('DM0001');
  });

  test('открывает и закрывает просмотр PDF-накладной после создания', async ({ page }) => {
    await openOrder(page);
    await fillCustomer(page);
    await page.route('**/api/documents/check', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ alreadyExists: false, documentNumber: '' })
      });
    });
    await page.route('**/api/documents/generate', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        headers: { 'X-Document-Number': 'RE0wMDAx' },
        body: '%PDF-1.4 mock pdf'
      });
    });
    await goToConfirmation(page);
    await page.getByRole('button', { name: 'Сформировать документ и записать в 1С' }).click();
    await expect(page.locator('.success-state')).toBeVisible({ timeout: 60000 });

    const viewPdfBtn = page.getByRole('button', { name: /просмотреть pdf|просмотр накладной/i });
    await expect(viewPdfBtn).toBeVisible();
    await expect(page.getByRole('button', { name: 'Печать накладной' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Сохранить PDF' })).toBeVisible();

    await viewPdfBtn.click();
    const pdfModal = page.locator('.pdf-viewer-modal');
    await expect(pdfModal).toBeVisible();
    await expect(page.locator('.pdf-viewer__title')).toContainText('Накладная');
    await expect(pdfModal.getByRole('button', { name: 'Печать', exact: true })).toBeVisible();
    await expect(pdfModal.getByRole('button', { name: 'Сохранить PDF' })).toBeVisible();

    await pdfModal.getByRole('button', { name: 'Закрыть' }).click();
    await expect(pdfModal).not.toBeVisible();
  });
});

test.describe('Ошибки и проверка формы', () => {
  test('показывает 404 для неизвестного заказа', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Поиск заказа или товара' }).fill('99999999');
    await page.getByRole('button', { name: 'Найти заказ' }).click();
    await expect(page.locator('.alert-error')).toContainText('Заказ не найден', {
      timeout: 30000
    });
  });

  test('показывает ошибки обязательных полей, кроме отчества', async ({ page }) => {
    await openOrder(page);
    await page.getByRole('button', { name: 'Перейти к подтверждению' }).click();
    await expect(page.locator('input:invalid')).toHaveCount(4);
    await expect(page.getByLabel('Отчество')).not.toHaveAttribute('aria-invalid', 'true');
  });
});
