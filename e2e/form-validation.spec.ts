import { expect, test } from '@playwright/test';
import { DEMO_ORDER_GUID, fillCustomer, openOrder } from './helpers';

test.describe('Форма получателя', () => {
  test.beforeEach(async ({ page }) => {
    await openOrder(page);
  });

  test('принимает телефон с 8 и форматирует его в вид +7', async ({ page }) => {
    await page.getByLabel('Телефон').fill('89991234567');
    await expect(page.getByLabel('Телефон')).toHaveValue('+7 (999) 123-45-67');
  });

  test('показывает ошибку короткого телефона', async ({ page }) => {
    await fillCustomer(page, { phone: '+7999' });
    await page.getByRole('button', { name: 'Перейти к подтверждению' }).click();
    await expect(page.getByLabel('Телефон')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('.input-message-error')).toContainText('10 цифр');
  });

  test('проверяет email в браузере', async ({ page }) => {
    await page.getByLabel('Email').fill('invalid-email');
    expect(
      await page
        .getByLabel('Email')
        .evaluate((element: HTMLInputElement) => element.checkValidity())
    ).toBe(false);
    await page.getByLabel('Email').fill('user@mail.example.com');
    expect(
      await page
        .getByLabel('Email')
        .evaluate((element: HTMLInputElement) => element.checkValidity())
    ).toBe(true);
  });

  test('разрешает отправку без отчества', async ({ page }) => {
    await fillCustomer(page, { middleName: '' });
    await page.getByRole('button', { name: 'Перейти к подтверждению' }).click();
    await expect(page.locator('.confirmation-step')).toBeVisible();
    await expect(page.locator('.confirmation-step')).toContainText('Воронцову Петру');
  });
});

test.describe('Серверная проверка формы', () => {
  test('отклоняет неправильный email на preview', async ({ request }) => {
    const response = await request.post('/api/documents/preview', {
      data: {
        orderRef: DEMO_ORDER_GUID,
        customer: {
          lastName: 'Иванов',
          firstName: 'Иван',
          phone: '89991234567',
          email: 'invalid-email'
        }
      }
    });
    expect(response.status()).toBe(400);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe('INVALID_CUSTOMER');
  });

  test('отклоняет неправильный тип orderRef', async ({ request }) => {
    const response = await request.post('/api/documents/orders/search', {
      data: { orderRef: null }
    });
    expect(response.status()).toBe(400);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe('INVALID_REQUEST');
  });
});
