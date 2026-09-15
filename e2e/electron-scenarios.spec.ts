import { _electron as electron, expect, test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const ARTIFACTS_DIR = path.resolve(process.cwd(), 'output-artifacts', 'electron');
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

test.describe('Electron E2E: Сквозное тестирование настольного приложения с сохранением скриншотов и PDF', () => {
  test('Запуск приложения в Electron, проверка bridge, UI сценарий и нативный экспорт PDF', async () => {
    // Запуск десктопного приложения через Playwright Electron API
    const electronApp = await electron.launch({
      args: [path.resolve(__dirname, '..', 'dist-electron', 'main.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test'
      },
      timeout: 60000
    });

    try {
      // Перехватываем системный диалог сохранения файлов в главном процессе Electron
      await electronApp.evaluate(({ dialog }, targetPdfDir: string) => {
        (dialog as unknown as { showSaveDialog: unknown }).showSaveDialog = async (
          browserWindowOrOptions: unknown,
          maybeOptions?: { defaultPath?: string }
        ) => {
          const hasOptionsInFirstArg =
            typeof browserWindowOrOptions === 'object' &&
            browserWindowOrOptions !== null &&
            'defaultPath' in browserWindowOrOptions;
          const options = hasOptionsInFirstArg
            ? (browserWindowOrOptions as { defaultPath?: string })
            : (maybeOptions ?? {});
          const defaultName = options.defaultPath ?? 'order.pdf';
          const cleanName = defaultName.split(/[/\\]/).pop() ?? 'order.pdf';
          const separator = targetPdfDir.includes('\\') ? '\\' : '/';
          const filePath = `${targetPdfDir}${separator}${cleanName}`;
          return {
            canceled: false,
            filePath
          };
        };
      }, PDF_DIR);

      const page = await electronApp.firstWindow();
      await page.waitForLoadState('domcontentloaded');

      // Шаг 1: Проверка наличия desktopBridge в окне Electron
      const isElectron = await page.evaluate(() => {
        const win = window as unknown as { desktopBridge?: { isElectron?: boolean } };
        return Boolean(win.desktopBridge?.isElectron);
      });
      expect(isElectron).toBe(true);

      // Шаг 2: Скриншот стартового экрана
      await expect(page.locator('.brand-header')).toBeVisible({ timeout: 30000 });
      await expect(page.getByRole('textbox', { name: 'Поиск заказа' })).toBeVisible({
        timeout: 30000
      });

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '01_electron_initial_screen.png'),
        fullPage: true
      });

      // Проходим цепочку тестовых заказов
      for (let i = 0; i < TEST_ORDERS.length; i++) {
        const orderNumber = TEST_ORDERS[i];
        if (orderNumber === undefined) {
          continue;
        }
        const safeOrderNumber = orderNumber.replace(/[^a-zA-Z0-9-_]/g, '_');

        if (i > 0) {
          const newOrderButton = page.getByRole('button', { name: 'Новый заказ' });
          await expect(newOrderButton).toBeVisible({ timeout: 10000 });
          await newOrderButton.click();
          await expect(page.getByRole('textbox', { name: 'Поиск заказа' })).toBeVisible({
            timeout: 30000
          });
        }

        const searchInput = page.getByRole('textbox', { name: 'Поиск заказа' });
        await expect(searchInput).toBeVisible({ timeout: 30000 });
        await searchInput.fill(orderNumber);

        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, `order_${safeOrderNumber}_01_search.png`),
          fullPage: true
        });

        await page.getByRole('button', { name: 'Найти заказ' }).click();

        // Ожидаем загрузки заказа
        await expect(page.locator('.order-summary')).toBeVisible({ timeout: 30000 });
        await expect(page.locator('.order-lines-table')).toBeVisible({ timeout: 30000 });

        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, `order_${safeOrderNumber}_02_loaded.png`),
          fullPage: true
        });

        // Заполняем данные получателя
        await page.getByLabel('Фамилия').fill('Воронцов');
        await page.getByLabel('Имя').fill('Пётр');
        await page.getByLabel('Отчество').fill('Аркадьевич');
        await page.getByLabel('Телефон').fill('89991234567');
        await page.getByLabel('Email').fill('vorontsov@example.com');

        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, `order_${safeOrderNumber}_03_customer_filled.png`),
          fullPage: true
        });

        // Переходим к подтверждению
        await page.getByRole('button', { name: 'Перейти к подтверждению' }).click();
        await expect(page.locator('.confirmation-step')).toBeVisible({ timeout: 30000 });

        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, `order_${safeOrderNumber}_04_confirmation.png`),
          fullPage: true
        });

        // Отправляем запрос на проверку / создание документа реализации в 1С
        await page.getByRole('button', { name: 'Сформировать документ и записать в 1С' }).click();

        const existingDocAlert = page.locator('.alert-info');
        const successState = page.locator('.success-state');
        const errorAlert = page.locator('.alert-error');

        await expect(existingDocAlert.or(successState).or(errorAlert)).toBeVisible({
          timeout: 60000
        });

        const isExisting = await existingDocAlert.isVisible().catch(() => false);
        const isSuccess = await successState.isVisible().catch(() => false);
        const isError = await errorAlert.isVisible().catch(() => false);

        if (isError) {
          await page.screenshot({
            path: path.join(SCREENSHOTS_DIR, `order_${safeOrderNumber}_05_error.png`),
            fullPage: true
          });
          await page.waitForTimeout(1000);
          continue;
        }

        if (isExisting) {
          await page.screenshot({
            path: path.join(SCREENSHOTS_DIR, `order_${safeOrderNumber}_05_already_exists.png`),
            fullPage: true
          });

          // Нажимаем Скачать PDF
          await page.getByRole('button', { name: 'Скачать PDF' }).click();

          // Ждем экрана успеха
          await expect(successState).toBeVisible({ timeout: 30000 });

          // Проверяем сохраненный через IPC PDF файл
          const expectedPdfPath = path.join(PDF_DIR, `order-${orderNumber}.pdf`);
          expect(fs.existsSync(expectedPdfPath)).toBe(true);
          const pdfBuffer = fs.readFileSync(expectedPdfPath);
          expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');

          await page.screenshot({
            path: path.join(SCREENSHOTS_DIR, `order_${safeOrderNumber}_06_success_screen.png`),
            fullPage: true
          });

          await page.waitForTimeout(1000);
        } else if (isSuccess) {
          const expectedPdfPath = path.join(PDF_DIR, `order-${orderNumber}.pdf`);
          expect(fs.existsSync(expectedPdfPath)).toBe(true);
          const pdfBuffer = fs.readFileSync(expectedPdfPath);
          expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');

          await page.screenshot({
            path: path.join(
              SCREENSHOTS_DIR,
              `order_${safeOrderNumber}_05_new_document_created.png`
            ),
            fullPage: true
          });

          await page.waitForTimeout(1000);
        }
      }
    } finally {
      await electronApp.close();
    }
  });

  test('Переключение тёмной темы в настольном приложении', async () => {
    const electronApp = await electron.launch({
      args: [path.resolve(__dirname, '..', 'dist-electron', 'main.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test'
      },
      timeout: 60000
    });

    try {
      const page = await electronApp.firstWindow();
      await page.waitForLoadState('domcontentloaded');

      await expect(page.locator('.brand-header')).toBeVisible({ timeout: 30000 });
      await expect(page.getByRole('textbox', { name: 'Поиск заказа' })).toBeVisible({
        timeout: 30000
      });

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'theme_01_light_initial.png'),
        fullPage: true
      });

      const htmlElement = page.locator('html');
      const initialTheme = await htmlElement.getAttribute('data-theme');
      expect(['light', 'dark']).toContain(initialTheme);

      const themeToggle = page.locator('button.theme-toggle');
      await expect(themeToggle).toBeVisible({ timeout: 10000 });

      await themeToggle.click();
      await page.waitForTimeout(500);

      const darkTheme = await htmlElement.getAttribute('data-theme');
      expect(darkTheme).toBe(initialTheme === 'light' ? 'dark' : 'light');

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'theme_02_after_toggle.png'),
        fullPage: true
      });

      await themeToggle.click();
      await page.waitForTimeout(500);

      const restoredTheme = await htmlElement.getAttribute('data-theme');
      expect(restoredTheme).toBe(initialTheme);

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'theme_03_restored.png'),
        fullPage: true
      });

      const searchInput = page.getByRole('textbox', { name: 'Поиск заказа' });
      await searchInput.fill('00ДМ-000101');
      await page.getByRole('button', { name: 'Найти заказ' }).click();

      await expect(page.locator('.order-summary')).toBeVisible({ timeout: 30000 });
      await expect(page.locator('.order-lines-table')).toBeVisible({ timeout: 30000 });

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'theme_04_order_in_initial_theme.png'),
        fullPage: true
      });

      await themeToggle.click();
      await page.waitForTimeout(500);

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'theme_05_order_in_toggled_theme.png'),
        fullPage: true
      });

      const savedTheme = await page.evaluate(() => {
        return localStorage.getItem('theme');
      });
      expect(savedTheme === null || ['light', 'dark'].includes(savedTheme)).toBe(true);
    } finally {
      await electronApp.close();
    }
  });
});
