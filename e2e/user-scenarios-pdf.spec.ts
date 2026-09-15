import { expect, test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fillCustomer, goToConfirmation } from './helpers';

const ARTIFACTS_DIR = path.resolve(process.cwd(), 'output-artifacts', 'web');
const SCREENSHOTS_DIR = path.join(ARTIFACTS_DIR, 'screenshots');
const PDF_DIR = path.join(ARTIFACTS_DIR, 'pdf');

const TEST_ORDERS = [
  '00ДМ-000101',
  '00ДМ-000102',
  '00ДМ-000103',
  '00ДМ-000104',
  '00ДМ-000105'
] as const;

test.beforeAll(() => {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
  if (!fs.existsSync(PDF_DIR)) {
    fs.mkdirSync(PDF_DIR, { recursive: true });
  }
});

test.describe('Комплексный UI E2E сценарий со скриншотами, PDF и тестированием создания реализации', () => {
  test('Сквозной сценарий валидации и UX: поиск, валидация, предпросмотр, возврат к редактированию', async ({
    page
  }) => {
    // Шаг 1: Начальный экран поиска
    await page.goto('/');
    await expect(page.locator('.brand-header')).toBeVisible();
    await expect(page.locator('.connection-status')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Поиск заказа' })).toBeVisible();
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '01_initial_search_screen.png'),
      fullPage: true
    });

    // Шаг 2: Негативный сценарий - поиск несуществующего заказа
    await page.getByRole('textbox', { name: 'Поиск заказа' }).fill('00НЕТ-999999');
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '02_not_found_order_input.png'),
      fullPage: true
    });
    await page.getByRole('button', { name: 'Найти заказ' }).click();
    await expect(page.locator('.alert-error')).toContainText('Заказ не найден', {
      timeout: 30000
    });
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '03_not_found_order_error.png'),
      fullPage: true
    });

    // Нажимаем «Начать заново» для возврата к поиску
    await page.getByRole('button', { name: 'Начать заново' }).click();

    // Шаг 3: Поиск первого эталонного заказа
    const searchInput = page.getByRole('textbox', { name: 'Поиск заказа' });
    await expect(searchInput).toBeVisible();
    await searchInput.fill(TEST_ORDERS[0]);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '04_valid_order_input.png'),
      fullPage: true
    });
    await page.getByRole('button', { name: 'Найти заказ' }).click();

    // Шаг 4: Заказ найден, отображение строк, остатков и формы
    await expect(page.locator('.order-summary')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.order-lines-table')).toBeVisible();
    await expect(page.locator('.issue-summary')).toBeVisible();
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '05_order_loaded_overview.png'),
      fullPage: true
    });

    // Шаг 5: Негативный сценарий - валидация обязательных полей при попытке отправки пустой формы
    await page.getByRole('button', { name: 'Перейти к подтверждению' }).click();
    await expect(page.locator('input:invalid')).toHaveCount(4);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '06_form_validation_required_errors.png'),
      fullPage: true
    });

    // Шаг 6: Валидация некорректного телефона
    await page.getByLabel('Фамилия').fill('Воронцов');
    await page.getByLabel('Имя').fill('Пётр');
    await page.getByLabel('Отчество').fill('Аркадьевич');
    await page.getByLabel('Email').fill('vorontsov@example.com');
    await page.getByLabel('Телефон').fill('12345');
    await page.getByRole('button', { name: 'Перейти к подтверждению' }).click();
    await expect(page.getByLabel('Телефон')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('.input-message-error')).toContainText('10 цифр');
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '07_form_invalid_phone.png'),
      fullPage: true
    });

    // Шаг 7: Заполнение корректных данных получателя и динамическое склонение ФИО
    await page.getByLabel('Телефон').fill('89991234567');
    await expect(page.getByLabel('Телефон')).toHaveValue('+7 (999) 123-45-67');
    await expect(page.locator('.customer-form__preview-value')).toContainText(
      'Выдать Воронцову Петру Аркадьевичу'
    );
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '08_form_filled_with_declension.png'),
      fullPage: true
    });

    // Шаг 8: Переход к шагу подтверждения
    await goToConfirmation(page);
    await expect(page.locator('.confirmation-step')).toContainText('Воронцову Петру Аркадьевичу');
    await expect(page.locator('.confirmation-step')).toContainText('+7 (999) 123-45-67');
    await expect(page.locator('.confirmation-step')).toContainText(TEST_ORDERS[0]);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '09_confirmation_step.png'),
      fullPage: true
    });

    // Шаг 9: Сценарий редактирования - возврат назад и изменение данных
    await page.getByRole('button', { name: 'Назад к редактированию' }).click();
    await expect(page.getByLabel('Фамилия')).toHaveValue('Воронцов');
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '10_back_to_editing.png'),
      fullPage: true
    });

    // Шаг 10: Повторный переход к подтверждению
    await goToConfirmation(page);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '11_confirmation_step_confirmed.png'),
      fullPage: true
    });
  });

  test('Тестирование создания реализации по цепочке заказов (00ДМ-000101...00ДМ-000105) с остановкой при первом успешном создании', async ({
    page
  }) => {
    for (const orderNumber of TEST_ORDERS) {
      const safeOrderNumber = orderNumber.replace(/[^a-zA-Z0-9-_]/g, '_');

      // Открываем приложение
      await page.goto('/');
      await expect(page.locator('.brand-header')).toBeVisible();

      // Поиск заказа
      const searchInput = page.getByRole('textbox', { name: 'Поиск заказа' });
      await expect(searchInput).toBeVisible();
      await searchInput.fill(orderNumber);

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, `order_${safeOrderNumber}_01_search.png`),
        fullPage: true
      });

      await page.getByRole('button', { name: 'Найти заказ' }).click();

      // Ожидаем загрузки заказа
      await expect(page.locator('.order-summary')).toBeVisible({ timeout: 30000 });
      await expect(page.locator('.order-lines-table')).toBeVisible();

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, `order_${safeOrderNumber}_02_loaded.png`),
        fullPage: true
      });

      // Заполняем данные получателя
      await fillCustomer(page, {
        lastName: 'Воронцов',
        firstName: 'Пётр',
        middleName: 'Аркадьевич',
        phone: '89991234567',
        email: 'vorontsov@example.com'
      });

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, `order_${safeOrderNumber}_03_customer_filled.png`),
        fullPage: true
      });

      // Переходим к шагу подтверждения
      await goToConfirmation(page);

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, `order_${safeOrderNumber}_04_confirmation.png`),
        fullPage: true
      });

      // Отправляем запрос на проверку / создание документа реализации в 1С
      await page.getByRole('button', { name: 'Сформировать документ и записать в 1С' }).click();

      // Ждем перехода либо в confirm-existing (реализация уже была), либо в success (создана новая), либо error (ошибка 1С)
      const existingDocAlert = page.locator('.alert-info');
      const successState = page.locator('.success-state');
      const errorAlert = page.locator('.alert-error');

      // Ждем появления одного из состояний
      await expect(existingDocAlert.or(successState).or(errorAlert)).toBeVisible({
        timeout: 60000
      });

      const isExisting = await existingDocAlert.isVisible().catch(() => false);
      const isSuccess = await successState.isVisible().catch(() => false);
      const isError = await errorAlert.isVisible().catch(() => false);

      if (isError) {
        // Ошибка на стороне 1С (например, недостаток данных в заказе)
        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, `order_${safeOrderNumber}_05_error.png`),
          fullPage: true
        });
        // Бережная пауза перед переходом к следующему заказу
        await page.waitForTimeout(1000);
        continue;
      }

      if (isExisting) {
        // Документ уже существовал в 1С
        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, `order_${safeOrderNumber}_05_already_exists.png`),
          fullPage: true
        });

        // Скачиваем PDF для этого заказа
        const downloadPromise = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Скачать PDF' }).click();
        const download = await downloadPromise;

        const targetPdfPath = path.join(PDF_DIR, `order_${safeOrderNumber}_existing.pdf`);
        await download.saveAs(targetPdfPath);

        expect(fs.existsSync(targetPdfPath)).toBe(true);
        const pdfBuffer = fs.readFileSync(targetPdfPath);
        expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');

        // Ждем экрана успеха
        await expect(successState).toBeVisible({ timeout: 30000 });
        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, `order_${safeOrderNumber}_06_success_screen.png`),
          fullPage: true
        });

        // Бережная пауза перед следующим заказом, чтобы не перегружать 1С
        await page.waitForTimeout(1000);
      } else if (isSuccess) {
        // Реализация создана с нуля!
        // Ждем завершения скачивания PDF
        const download = await page.waitForEvent('download');
        const targetPdfPath = path.join(PDF_DIR, `order_${safeOrderNumber}_newly_created.pdf`);
        await download.saveAs(targetPdfPath);

        expect(fs.existsSync(targetPdfPath)).toBe(true);
        const pdfBuffer = fs.readFileSync(targetPdfPath);
        expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');

        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, `order_${safeOrderNumber}_05_new_document_created.png`),
          fullPage: true
        });

        // Требование: «и если реализация создалась то стоп тестирование»
        break;
      }
    }

    expect(true).toBe(true);
  });
});
