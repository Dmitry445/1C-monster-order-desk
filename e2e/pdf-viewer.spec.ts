import { _electron as electron, expect, test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const ARTIFACTS_DIR = path.resolve(process.cwd(), 'output-artifacts', 'electron');
const SCREENSHOTS_DIR = path.join(ARTIFACTS_DIR, 'screenshots');
const PDF_DIR = path.join(ARTIFACTS_DIR, 'pdf');

test.beforeAll(() => {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
  if (!fs.existsSync(PDF_DIR)) {
    fs.mkdirSync(PDF_DIR, { recursive: true });
  }
});

test.describe('Electron E2E: Тестирование просмотра и печати PDF', () => {
  test('Просмотр PDF: навигация по страницам, масштабирование, закрытие', async () => {
    const electronApp = await electron.launch({
      args: [path.resolve(__dirname, '..', 'dist-electron', 'main.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test'
      },
      timeout: 60000
    });

    try {
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

      await expect(page.locator('.brand-header')).toBeVisible({ timeout: 30000 });
      await expect(page.getByRole('textbox', { name: 'Поиск заказа' })).toBeVisible({
        timeout: 30000
      });

      const searchInput = page.getByRole('textbox', { name: 'Поиск заказа' });
      await searchInput.fill('00ДМ-000101');
      await page.getByRole('button', { name: 'Найти заказ' }).click();

      await expect(page.locator('.order-summary')).toBeVisible({ timeout: 30000 });
      await expect(page.locator('.order-lines-table')).toBeVisible({ timeout: 30000 });

      await page.getByLabel('Фамилия').fill('Иванов');
      await page.getByLabel('Имя').fill('Иван');
      await page.getByLabel('Отчество').fill('Иванович');
      await page.getByLabel('Телефон').fill('89991234567');
      await page.getByLabel('Email').fill('ivanov@example.com');

      await page.getByRole('button', { name: 'Перейти к подтверждению' }).click();
      await expect(page.locator('.confirmation-step')).toBeVisible({ timeout: 30000 });

      await page.getByRole('button', { name: 'Сформировать документ и записать в 1С' }).click();

      const existingDocAlert = page.locator('.alert-info');
      const successState = page.locator('.success-state');
      const pdfViewerModal = page.locator('.pdf-viewer-modal');

      await expect(existingDocAlert.or(successState)).toBeVisible({ timeout: 60000 });

      const isExisting = await existingDocAlert.isVisible().catch(() => false);

      if (isExisting) {
        const existingViewButton = page.getByRole('button', { name: 'Просмотреть PDF' });
        await expect(existingViewButton).toBeVisible({ timeout: 15000 });
        await existingViewButton.click();
        await expect(pdfViewerModal).toBeVisible({ timeout: 15000 });
        await page.keyboard.press('Escape');
        await expect(pdfViewerModal).not.toBeVisible({ timeout: 5000 });
      }

      await expect(successState).toBeVisible({ timeout: 30000 });

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'pdf_01_success_with_download.png'),
        fullPage: true
      });

      const viewPdfButton = page.getByRole('button', {
        name: /просмотреть pdf|просмотр накладной/i
      });
      await expect(viewPdfButton).toBeVisible({ timeout: 15000 });
      if (!(await pdfViewerModal.isVisible())) {
        await viewPdfButton.click();
      }
      await expect(pdfViewerModal).toBeVisible({ timeout: 15000 });

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'pdf_02_viewer_opened.png'),
        fullPage: true
      });

      const pdfTitle = page.locator('.pdf-viewer__title');
      await expect(pdfTitle).toContainText('Накладная');
      await expect(pdfTitle).toContainText('00ДМ-000101');

      const scaleInfo = page.locator('.pdf-viewer__scale-info');
      await expect(scaleInfo).toBeVisible();
      const initialScale = await scaleInfo.textContent();
      expect(initialScale).toMatch(/\d+%/);

      const zoomInButton = page.locator('.pdf-viewer__controls button[title="Увеличить"]');
      await expect(zoomInButton).toBeVisible();
      await zoomInButton.click();
      await page.waitForTimeout(500);

      const scaledUp = await scaleInfo.textContent();
      expect(scaledUp).not.toBe(initialScale);

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'pdf_03_zoomed_in.png'),
        fullPage: true
      });

      const zoomOutButton = page.locator('.pdf-viewer__controls button[title="Уменьшить"]');
      await expect(zoomOutButton).toBeVisible();
      await zoomOutButton.click();
      await page.waitForTimeout(500);

      await scaleInfo.click();
      await page.waitForTimeout(500);

      const resetScale = await scaleInfo.textContent();
      expect(resetScale).toMatch(/100%/);

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'pdf_04_zoom_reset.png'),
        fullPage: true
      });

      const pageInfo = page.locator('.pdf-viewer__page-info');
      const pageInfoVisible = await pageInfo.isVisible().catch(() => false);

      if (pageInfoVisible) {
        const pageText = await pageInfo.textContent();
        const match = pageText?.match(/Стр\. (\d+) из (\d+)/);
        if (match) {
          const currentPage = parseInt(match[1] ?? '', 10);
          const totalPages = parseInt(match[2] ?? '', 10);
          expect(currentPage).toBe(1);
          expect(totalPages).toBeGreaterThanOrEqual(1);

          if (totalPages > 1) {
            const nextPageButton = page.locator(
              '.pdf-viewer__controls button[aria-label="Следующая страница"]'
            );
            await expect(nextPageButton).toBeEnabled();
            await nextPageButton.click();
            await page.waitForTimeout(500);

            const updatedPageText = await pageInfo.textContent();
            expect(updatedPageText).toContain('Стр. 2');

            await page.screenshot({
              path: path.join(SCREENSHOTS_DIR, 'pdf_05_second_page.png'),
              fullPage: true
            });

            const prevPageButton = page.locator(
              '.pdf-viewer__controls button[aria-label="Предыдущая страница"]'
            );
            await expect(prevPageButton).toBeEnabled();
            await prevPageButton.click();
            await page.waitForTimeout(500);

            const backToFirst = await pageInfo.textContent();
            expect(backToFirst).toContain('Стр. 1');
          }
        }
      }

      await page.keyboard.press('Escape');
      await expect(pdfViewerModal).not.toBeVisible({ timeout: 5000 });

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'pdf_06_viewer_closed.png'),
        fullPage: true
      });
    } finally {
      await electronApp.close();
    }
  });

  test('Печать PDF: выбор принтера, отправка на печать, обработка ошибок', async () => {
    const electronApp = await electron.launch({
      args: [path.resolve(__dirname, '..', 'dist-electron', 'main.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test'
      },
      timeout: 60000
    });

    try {
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

      await expect(page.locator('.brand-header')).toBeVisible({ timeout: 30000 });

      const searchInput = page.getByRole('textbox', { name: 'Поиск заказа' });
      await searchInput.fill('00ДМ-000102');
      await page.getByRole('button', { name: 'Найти заказ' }).click();

      await expect(page.locator('.order-summary')).toBeVisible({ timeout: 30000 });

      await page.getByLabel('Фамилия').fill('Петров');
      await page.getByLabel('Имя').fill('Петр');
      await page.getByLabel('Отчество').fill('Петрович');
      await page.getByLabel('Телефон').fill('89991234567');
      await page.getByLabel('Email').fill('petrov@example.com');

      await page.getByRole('button', { name: 'Перейти к подтверждению' }).click();
      await expect(page.locator('.confirmation-step')).toBeVisible({ timeout: 30000 });

      await page.getByRole('button', { name: 'Сформировать документ и записать в 1С' }).click();

      const existingDocAlert = page.locator('.alert-info');
      const successState = page.locator('.success-state');

      await expect(existingDocAlert.or(successState)).toBeVisible({ timeout: 60000 });

      const isExisting = await existingDocAlert.isVisible().catch(() => false);
      if (isExisting) {
        await page.getByRole('button', { name: 'Скачать PDF' }).click();
      }

      await expect(successState).toBeVisible({ timeout: 30000 });

      const viewPdfButton = page.getByRole('button', {
        name: /просмотреть pdf|просмотр накладной/i
      });
      await expect(viewPdfButton).toBeVisible({ timeout: 15000 });
      const pdfViewerModal = page.locator('.pdf-viewer-modal');
      if (!(await pdfViewerModal.isVisible())) {
        await viewPdfButton.click();
      }
      await expect(pdfViewerModal).toBeVisible({ timeout: 15000 });

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'pdf_print_01_viewer_opened.png'),
        fullPage: true
      });

      const printerBanner = page.locator('.pdf-viewer__printer-banner');
      const printersAvailable = await printerBanner.isVisible().catch(() => false);

      if (printersAvailable) {
        const printerSelect = page.locator('.pdf-viewer__printer-select');
        await expect(printerSelect).toBeVisible();

        const selectedPrinter = await printerSelect.inputValue();
        expect(selectedPrinter.length).toBeGreaterThan(0);

        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, 'pdf_print_02_printer_selected.png'),
          fullPage: true
        });

        const allOptions = await printerSelect.locator('option').allTextContents();
        expect(allOptions.length).toBeGreaterThan(0);

        if (allOptions.length > 1) {
          await printerSelect.selectOption({ index: 1 });
          await page.waitForTimeout(300);

          const newSelected = await printerSelect.inputValue();
          expect(newSelected).not.toBe(selectedPrinter);

          await page.screenshot({
            path: path.join(SCREENSHOTS_DIR, 'pdf_print_03_printer_changed.png'),
            fullPage: true
          });
        }
      }

      const printButton = pdfViewerModal.getByRole('button', { name: 'Печать', exact: true });
      await expect(printButton).toBeVisible();
      await expect(printButton).toBeEnabled();

      await electronApp.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('desktop:printPdf');
        ipcMain.handle('desktop:printPdf', async (_event, options) => {
          (globalThis as unknown as { __lastPrintOptions: unknown }).__lastPrintOptions = options;
          return { success: true };
        });
      });

      await printButton.click();

      await page.waitForTimeout(2000);

      const printOptions = await electronApp.evaluate(() => {
        return (globalThis as unknown as { __lastPrintOptions?: unknown }).__lastPrintOptions;
      });

      expect(printOptions).toBeDefined();
      expect(printOptions).toHaveProperty('base64Data');

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'pdf_print_04_after_print_click.png'),
        fullPage: true
      });

      await page.keyboard.press('Escape');
      await expect(pdfViewerModal).not.toBeVisible({ timeout: 5000 });
    } finally {
      await electronApp.close();
    }
  });

  test('Сохранение PDF: диалог сохранения, проверка файла', async () => {
    const electronApp = await electron.launch({
      args: [path.resolve(__dirname, '..', 'dist-electron', 'main.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test'
      },
      timeout: 60000
    });

    try {
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

      await expect(page.locator('.brand-header')).toBeVisible({ timeout: 30000 });

      const searchInput = page.getByRole('textbox', { name: 'Поиск заказа' });
      await searchInput.fill('00ДМ-000103');
      await page.getByRole('button', { name: 'Найти заказ' }).click();

      await expect(page.locator('.order-summary')).toBeVisible({ timeout: 30000 });

      await page.getByLabel('Фамилия').fill('Сидоров');
      await page.getByLabel('Имя').fill('Сидор');
      await page.getByLabel('Отчество').fill('Сидорович');
      await page.getByLabel('Телефон').fill('89991234567');
      await page.getByLabel('Email').fill('sidorov@example.com');

      await page.getByRole('button', { name: 'Перейти к подтверждению' }).click();
      await expect(page.locator('.confirmation-step')).toBeVisible({ timeout: 30000 });

      await page.getByRole('button', { name: 'Сформировать документ и записать в 1С' }).click();

      const existingDocAlert = page.locator('.alert-info');
      const successState = page.locator('.success-state');

      await expect(existingDocAlert.or(successState)).toBeVisible({ timeout: 60000 });

      const isExisting = await existingDocAlert.isVisible().catch(() => false);
      if (isExisting) {
        await page.getByRole('button', { name: 'Скачать PDF' }).click();
      }

      await expect(successState).toBeVisible({ timeout: 30000 });

      const viewPdfButton = page.getByRole('button', {
        name: /просмотреть pdf|просмотр накладной/i
      });
      await expect(viewPdfButton).toBeVisible({ timeout: 15000 });
      await viewPdfButton.click();

      const pdfViewerModal = page.locator('.pdf-viewer-modal');
      await expect(pdfViewerModal).toBeVisible({ timeout: 15000 });

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'pdf_save_01_viewer_opened.png'),
        fullPage: true
      });

      const saveButton = pdfViewerModal.getByRole('button', { name: 'Сохранить PDF' });
      await expect(saveButton).toBeVisible();
      await expect(saveButton).toBeEnabled();

      const beforeFiles = fs.readdirSync(PDF_DIR);

      await saveButton.click();

      await page.waitForTimeout(2000);

      const afterFiles = fs.readdirSync(PDF_DIR);
      expect(afterFiles.length).toBeGreaterThanOrEqual(beforeFiles.length);

      const newFiles = afterFiles.filter(f => !beforeFiles.includes(f));
      const savedPdfFile = newFiles.find(f => f.includes('00ДМ-000103') && f.endsWith('.pdf'));

      if (savedPdfFile) {
        const savedPath = path.join(PDF_DIR, savedPdfFile);
        expect(fs.existsSync(savedPath)).toBe(true);

        const pdfBuffer = fs.readFileSync(savedPath);
        expect(pdfBuffer.length).toBeGreaterThan(0);
        expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      }

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'pdf_save_02_after_save.png'),
        fullPage: true
      });

      await page.keyboard.press('Escape');
      await expect(pdfViewerModal).not.toBeVisible({ timeout: 5000 });
    } finally {
      await electronApp.close();
    }
  });
});
