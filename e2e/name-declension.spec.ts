import { expect, test } from '@playwright/test';
import { fillCustomer, goToConfirmation, openOrder } from './helpers';

test.describe('Склонение ФИО', () => {
  test('показывает мужское ФИО в дательном падеже', async ({ page }) => {
    await openOrder(page);
    await fillCustomer(page, {
      lastName: 'Воронцов',
      firstName: 'Пётр',
      middleName: 'Аркадьевич'
    });
    await expect(page.locator('.customer-form__preview-value')).toContainText(
      'Выдать Воронцову Петру Аркадьевичу'
    );
    await goToConfirmation(page);
    await expect(page.locator('.confirmation-step')).toContainText('Воронцову Петру Аркадьевичу');
  });

  test('склоняет женскую фамилию и имя', async ({ page }) => {
    await openOrder(page);
    await fillCustomer(page, {
      lastName: 'Иванова',
      firstName: 'Мария',
      middleName: 'Петровна'
    });
    await expect(page.locator('.customer-form__preview-value')).toContainText(
      'Выдать Ивановой Марии Петровне'
    );
  });
});
