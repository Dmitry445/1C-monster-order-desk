import { expect, type Page } from '@playwright/test';

export const DEMO_ORDER_NUMBER = '00ДМ-000101';
export const DEMO_ORDER_GUID = '2da145f0-d5fc-11f1-a0b3-48df371887e9';

/** Эталонные заказы демо-базы из DEVELOPMENT.md. */
export const DEMO_ORDERS = [
  {
    number: '00ДМ-000101',
    lineCount: 4,
    amount: 21181,
    vatAmount: 3210.82,
    amountWithVat: 24391.82
  },
  {
    number: '00ДМ-000102',
    lineCount: 3,
    amount: 9384.7,
    vatAmount: 1957.74,
    amountWithVat: 11342.44
  },
  {
    number: '00ДМ-000103',
    lineCount: 4,
    amount: 3355.75,
    vatAmount: 738.27,
    amountWithVat: 4094.02
  },
  {
    number: '00ДМ-000104',
    lineCount: 2,
    amount: 4638.4,
    vatAmount: 1020.45,
    amountWithVat: 5658.85
  },
  { number: '00ДМ-000105', lineCount: 1, amount: 100, vatAmount: 22, amountWithVat: 122 }
] as const;

export async function openOrder(page: Page, orderRef = DEMO_ORDER_NUMBER): Promise<void> {
  await page.goto('/');
  const search = page.getByRole('textbox', { name: 'Поиск заказа или товара' });
  await expect(search).toBeVisible();
  await search.fill(orderRef);
  await page.getByRole('button', { name: 'Найти заказ' }).click();
  await expect(page.locator('.order-summary')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.order-lines-table')).toBeVisible();
}

export async function fillCustomer(
  page: Page,
  values: {
    lastName?: string;
    firstName?: string;
    middleName?: string;
    phone?: string;
    email?: string;
  } = {}
): Promise<void> {
  await page.getByLabel('Фамилия').fill(values.lastName ?? 'Воронцов');
  await page.getByLabel('Имя').fill(values.firstName ?? 'Пётр');
  if (values.middleName !== '') {
    await page.getByLabel('Отчество').fill(values.middleName ?? 'Аркадьевич');
  }
  await page.getByLabel('Телефон').fill(values.phone ?? '89991234567');
  await page.getByLabel('Email').fill(values.email ?? 'vorontsov@example.com');
}

export async function goToConfirmation(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Перейти к подтверждению' }).click();
  await expect(page.locator('.confirmation-step')).toBeVisible();
}
