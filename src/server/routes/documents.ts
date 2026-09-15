import axios from 'axios';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { existsSync } from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { isValidEan13 } from '../../shared/barcode';
import type {
  DocumentGenerateRequest,
  DocumentGenerateResponse,
  DocumentPreviewResponse,
  OrderSearchRequest,
  OrderSearchResponse,
  ProductStockSearchResponse,
  StockStatus
} from '../../shared/types';
import { formatVatDisplay } from '../../shared/vatFormat';
import { calculateLineAmounts, calculateTotals } from '../services/calculations';
import {
  declineFullName,
  declineFullNameGenitive,
  formatPhone,
  normalizePhone
} from '../services/nameUtils';
import { ODataClient, type ODataOrder } from '../services/odataClient';

export const documentsRouter = Router();

let odataClientInstance: ODataClient | null = null;
let odataClientConfigKey: string | null = null;

function getODataClient(): ODataClient {
  const configKey = [
    process.env.ODATA_BASE_URL ?? '',
    process.env.ODATA_USERNAME ?? '',
    process.env.ODATA_PASSWORD ?? ''
  ].join('\u0000');

  if (odataClientInstance === null || odataClientConfigKey !== configKey) {
    odataClientInstance = new ODataClient();
    odataClientConfigKey = configKey;
  }

  return odataClientInstance;
}

const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const customerSchema = z.object({
  lastName: z.string().trim().min(1),
  firstName: z.string().trim().min(1),
  middleName: z.string().optional(),
  gender: z.enum(['м', 'ж']).optional(),
  phone: z.string().trim().min(1),
  email: z.string().trim().regex(emailPattern)
});

function parseCustomer(value: unknown) {
  const result = customerSchema.safeParse(value);
  if (!result.success || normalizePhone(result.data.phone) === '') {
    return null;
  }
  return result.data;
}

function errorDetails(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return `OData request failed (${error.response?.status ?? error.code ?? 'network'})`;
  }
  return error instanceof Error ? error.message : 'Unknown error';
}

function getPdfAssetsPath(): string {
  const basePaths = [process.env.APP_BASE_PATH, process.cwd()].filter(
    (value): value is string => value !== undefined && value !== ''
  );
  const candidates = basePaths.flatMap(basePath => [
    path.join(basePath, 'dist/server/assets'),
    path.join(basePath, 'src/server/assets')
  ]);
  const assetsPath = candidates.find(
    candidate =>
      existsSync(path.join(candidate, 'DejaVuSans.ttf')) &&
      existsSync(path.join(candidate, 'DejaVuSans-Bold.ttf'))
  );

  return assetsPath ?? path.join(process.cwd(), 'dist/server/assets');
}

async function findOrder(orderRef: string) {
  const client = getODataClient();
  return guidPattern.test(orderRef)
    ? client.getOrder(orderRef)
    : client.searchOrderByNumber(orderRef);
}

function determineStockStatus(qty: number, stockBalance: number | null | undefined): StockStatus {
  if (stockBalance === null || stockBalance === undefined) {
    return 'unknown';
  }
  return stockBalance >= qty ? 'sufficient' : 'insufficient';
}

async function enrichOrder(order: ODataOrder) {
  const client = getODataClient();

  if (!Array.isArray(order.Товары) || order.Товары.length === 0) {
    throw new Error('Заказ не содержит строк товаров');
  }

  let warehouseName = order.Склад;
  if (
    (warehouseName === undefined || warehouseName === '') &&
    order.Склад_Key !== undefined &&
    order.Склад_Key !== ''
  ) {
    try {
      const warehouse = await client.getWarehouse(order.Склад_Key);
      if (warehouse?.Description !== undefined && warehouse.Description !== '') {
        warehouseName = warehouse.Description;
      }
    } catch {
      // ignore
    }
  }
  warehouseName ??= '';

  const lines = await Promise.all(
    order.Товары.map(async line => {
      let stockBalance: number | null = null;
      try {
        stockBalance = await client.getStockBalance(
          line.Номенклатура_Key,
          line.Склад_Key ?? order.Склад_Key,
          line.Характеристика_Key
        );
      } catch {
        stockBalance = null;
      }

      let vatName = line.СтавкаНДС;
      if (
        (vatName === undefined || vatName === '') &&
        line.СтавкаНДС_Key !== undefined &&
        line.СтавкаНДС_Key !== ''
      ) {
        try {
          const fetchedRate = await client.getVatRateName(line.СтавкаНДС_Key);
          if (fetchedRate !== null && fetchedRate !== '') {
            vatName = fetchedRate;
          }
        } catch {
          // ignore
        }
      }

      if (vatName === undefined || vatName === '') {
        if (order.НалогообложениеНДС === 'НеОблагаетсяНДС' || line.СуммаНДС === 0) {
          vatName = order.НалогообложениеНДС === 'НеОблагаетсяНДС' ? 'Без НДС' : '0%';
        } else if (
          line.Сумма !== undefined &&
          line.Сумма > 0 &&
          line.СуммаНДС !== undefined &&
          line.СуммаНДС > 0
        ) {
          const ratio = line.СуммаНДС / line.Сумма;
          if (order.ЦенаВключаетНДС) {
            if (Math.abs(ratio - 22 / 122) < 0.01) vatName = '22/122';
            else if (Math.abs(ratio - 20 / 120) < 0.01) vatName = '20/120';
            else if (Math.abs(ratio - 10 / 110) < 0.01) vatName = '10/110';
            else vatName = '20%';
          } else {
            if (Math.abs(ratio - 0.22) < 0.02) vatName = '22%';
            else if (Math.abs(ratio - 0.2) < 0.02) vatName = '20%';
            else if (Math.abs(ratio - 0.1) < 0.02) vatName = '10%';
            else vatName = '20%';
          }
        } else {
          throw new Error(`Не удалось определить ставку НДС для строки ${line.Номенклатура_Key}`);
        }
      }

      let article = line.Артикул ?? '';
      let name = line.Номенклатура ?? '';
      let unit: string | null = null;

      if (line.Номенклатура_Key !== undefined && line.Номенклатура_Key !== '') {
        try {
          const product = await client.getProduct(line.Номенклатура_Key);
          if (product !== null) {
            if (article === '' && product.Артикул !== undefined) {
              article = product.Артикул;
            }
            if (name === '' && product.Description !== undefined) {
              name = product.Description;
            }
            if (product.ЕдиницаИзмерения_Key !== '') {
              unit = await client.getUnitName(product.ЕдиницаИзмерения_Key);
            }
          }
        } catch {
          // ignore
        }
      }

      if (name === '') name = 'Наименование не получено';

      const amounts = calculateLineAmounts(
        line.Количество,
        line.Цена,
        vatName,
        order.ЦенаВключаетНДС
      );

      const stockStatus = determineStockStatus(line.Количество, stockBalance);

      return {
        article,
        name,
        unit,
        qty: line.Количество,
        price: line.Цена,
        vatName,
        ...amounts,
        stockBalance,
        stockStatus
      };
    })
  );

  const totals = calculateTotals(lines);

  return {
    orderHeader: {
      number: order.Number,
      date: order.Date,
      warehouse: warehouseName,
      priceIncludesVat: order.ЦенаВключаетНДС,
      vatTaxation: order.НалогообложениеНДС
    },
    lines,
    totals: {
      ...totals,
      lineCount: lines.length
    }
  };
}

documentsRouter.get('/status', async (_req: Request, res: Response) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  try {
    const status = await getODataClient().checkDataAccess();
    if (!status.service) {
      res.json({ status: 'disconnected', detail: 'Сервис недоступен' });
    } else if (!status.data) {
      res.json({ status: 'degraded', detail: 'Данные недоступны' });
    } else {
      res.json({ status: 'connected' });
    }
  } catch (_error) {
    res.json({ status: 'disconnected', detail: 'Ошибка подключения' });
  }
});

documentsRouter.post('/test-connection', async (req: Request, res: Response) => {
  try {
    const { baseUrl, username, password } = (req.body ?? {}) as {
      baseUrl?: unknown;
      username?: unknown;
      password?: unknown;
    };

    if (
      typeof baseUrl !== 'string' ||
      baseUrl.trim() === '' ||
      typeof username !== 'string' ||
      username.trim() === '' ||
      typeof password !== 'string' ||
      password.trim() === ''
    ) {
      return res.status(400).json({
        code: 'INVALID_REQUEST',
        message: 'URL, логин и пароль обязательны для проверки подключения'
      });
    }

    const testClient = new ODataClient(baseUrl, username, password);
    const status = await testClient.checkDataAccess();

    if (!status.service) {
      return res.status(503).json({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Сервис OData недоступен по указанному адресу'
      });
    }

    if (!status.data) {
      return res.status(401).json({
        code: 'UNAUTHORIZED',
        message: 'Неверный логин или пароль, либо недостаточно прав доступа'
      });
    }

    return res.json({ status: 'connected', message: 'Подключение успешно' });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        return res.status(401).json({
          code: 'UNAUTHORIZED',
          message: 'Неверный логин или пароль'
        });
      }
      if (error.response?.status === 404) {
        return res.status(404).json({
          code: 'NOT_FOUND',
          message: 'Сервис OData не найден по указанному URL'
        });
      }
      if ((error.response?.status ?? 0) >= 500) {
        return res.status(503).json({
          code: 'SERVER_ERROR',
          message: 'Сервер 1С временно недоступен'
        });
      }
    }

    return res.status(500).json({
      code: 'CONNECTION_ERROR',
      message: 'Не удалось подключиться к серверу 1С. Проверьте параметры подключения.'
    });
  }
});

documentsRouter.post(
  '/orders/search',
  async (req: Request, res: Response): Promise<Response | void> => {
    try {
      const { orderRef } = (req.body ?? {}) as Partial<OrderSearchRequest>;

      if (typeof orderRef !== 'string' || orderRef.trim() === '') {
        return res.status(400).json({
          code: 'INVALID_REQUEST',
          message: 'Номер заказа обязателен',
          retryable: false
        });
      }

      let order;
      try {
        order = await findOrder(orderRef.trim());
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          return res.status(404).json({
            code: 'ORDER_NOT_FOUND',
            message: 'Заказ не найден',
            retryable: false
          });
        }
        throw error;
      }

      if (order === null || order === undefined) {
        return res.status(404).json({
          code: 'ORDER_NOT_FOUND',
          message: 'Заказ не найден',
          retryable: false
        });
      }

      const enriched = await enrichOrder(order);

      const response: OrderSearchResponse = {
        order: enriched.orderHeader,
        lines: enriched.lines,
        totals: enriched.totals
      };

      res.json(response);
    } catch (error) {
      console.error('Order search error:', errorDetails(error));
      const errorMessage =
        error instanceof Error && !axios.isAxiosError(error)
          ? error.message
          : 'Ошибка обращения к 1С';
      res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: errorMessage,
        retryable: true
      });
    }
  }
);

documentsRouter.get('/products/barcode/:barcode', async (req: Request, res: Response) => {
  const barcode = req.params.barcode?.trim() ?? '';

  if (!isValidEan13(barcode)) {
    return res
      .status(400)
      .json({ code: 'INVALID_BARCODE', message: 'Введите корректный EAN-13', retryable: false });
  }

  try {
    const client = getODataClient();
    const barcodeRecord = await client.findProductByBarcode(barcode);

    if (barcodeRecord === null) {
      return res
        .status(404)
        .json({ code: 'PRODUCT_NOT_FOUND', message: 'Товар не найден', retryable: false });
    }

    const product = await client.getProduct(barcodeRecord.Номенклатура_Key);
    if (product === null) {
      throw new Error('Номенклатура для штрихкода не найдена');
    }

    const [stockRows, unit] = await Promise.all([
      client.getStockBalancesByProduct(
        barcodeRecord.Номенклатура_Key,
        barcodeRecord.Характеристика_Key
      ),
      product.ЕдиницаИзмерения_Key === ''
        ? Promise.resolve(null)
        : client.getUnitName(product.ЕдиницаИзмерения_Key)
    ]);
    const balances = await Promise.all(
      stockRows.map(async row => {
        const warehouse = await client.getWarehouse(row.Склад_Key);
        const warehouseName = warehouse?.Description?.trim();
        return {
          warehouse: warehouseName === undefined || warehouseName === '' ? null : warehouseName,
          balance: row.ВНаличииBalance
        };
      })
    );
    const response: ProductStockSearchResponse = {
      barcode,
      article: product.Артикул,
      name: product.Description,
      unit,
      balances,
      totalBalance:
        balances.length === 0 ? null : balances.reduce((sum, row) => sum + row.balance, 0)
    };

    return res.json(response);
  } catch (error) {
    console.error('Barcode lookup error:', errorDetails(error));
    return res.status(502).json({
      code: 'ODATA_UNAVAILABLE',
      message: 'Сервис товаров временно недоступен',
      retryable: true
    });
  }
});

documentsRouter.post('/preview', async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { orderRef, customer: rawCustomer } = (req.body ??
      {}) as Partial<DocumentGenerateRequest>;

    if (
      typeof orderRef !== 'string' ||
      orderRef.trim() === '' ||
      rawCustomer === undefined ||
      rawCustomer === null
    ) {
      return res.status(400).json({
        code: 'INVALID_REQUEST',
        message: 'Не указаны обязательные поля',
        retryable: false
      });
    }
    if (!guidPattern.test(orderRef.trim())) {
      return res.status(400).json({
        code: 'INVALID_ORDER_REF',
        message: 'Для preview нужен Ref_Key заказа (GUID), а не номер документа',
        retryable: false
      });
    }
    const customer = parseCustomer(rawCustomer);
    if (customer === null) {
      return res.status(400).json({
        code: 'INVALID_CUSTOMER',
        message: 'Заполните обязательные поля получателя',
        retryable: false
      });
    }

    let order;
    try {
      order = await findOrder(orderRef.trim());
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return res
          .status(404)
          .json({ code: 'ORDER_NOT_FOUND', message: 'Заказ не найден', retryable: false });
      }
      throw error;
    }

    if (order === null || order === undefined) {
      return res
        .status(404)
        .json({ code: 'ORDER_NOT_FOUND', message: 'Заказ не найден', retryable: false });
    }

    const enriched = await enrichOrder(order);

    const response: DocumentPreviewResponse = {
      customer: {
        fullNameGenitive: declineFullNameGenitive(
          customer.lastName,
          customer.firstName,
          customer.middleName ?? '',
          customer.gender
        ),
        fullNameDative: declineFullName(
          customer.lastName,
          customer.firstName,
          customer.middleName ?? '',
          customer.gender
        ),
        phone: normalizePhone(customer.phone),
        email: customer.email.trim()
      },
      order: enriched.orderHeader,
      lines: enriched.lines,
      totals: enriched.totals
    };

    res.json(response);
  } catch (error) {
    console.error('Preview error:', errorDetails(error));
    const errorMessage =
      error instanceof Error && !axios.isAxiosError(error)
        ? error.message
        : 'Ошибка обращения к 1С';
    res.status(500).json({ code: 'INTERNAL_ERROR', message: errorMessage, retryable: true });
  }
});

documentsRouter.post('/check', async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { orderRef, customer: rawCustomer } = (req.body ??
      {}) as Partial<DocumentGenerateRequest>;

    if (
      typeof orderRef !== 'string' ||
      orderRef.trim() === '' ||
      rawCustomer === undefined ||
      rawCustomer === null
    ) {
      return res.status(400).json({
        code: 'INVALID_REQUEST',
        message: 'Не указаны обязательные поля',
        retryable: false
      });
    }

    const customer = parseCustomer(rawCustomer);
    if (customer === null) {
      return res.status(400).json({
        code: 'INVALID_CUSTOMER',
        message: 'Заполните все обязательные поля получателя',
        retryable: false
      });
    }

    const order = await findOrder(orderRef.trim());

    if (order === null || order === undefined) {
      return res.status(404).json({
        code: 'ORDER_NOT_FOUND',
        message: 'Заказ не найден',
        retryable: false
      });
    }

    const client = getODataClient();
    const existingDoc = await client.findSalesDocumentByOrder(order.Ref_Key);
    const alreadyExists = existingDoc !== null;

    const docRef = existingDoc?.Ref_Key ?? (await client.createSalesDocument(order.Ref_Key));
    const verification = await client.verifySalesDocument(docRef);

    if (!verification.exists) {
      return res.status(500).json({
        code: 'DOCUMENT_VERIFICATION_FAILED',
        message: 'Не удалось проверить созданный документ в 1С',
        retryable: true
      });
    }

    const documentNumber = verification.number ?? 'Без номера';

    return res.json({
      alreadyExists,
      documentNumber
    } satisfies DocumentGenerateResponse);
  } catch (error) {
    console.error('Check error:', errorDetails(error));
    return res.status(500).json({
      code: 'SERVER_ERROR',
      message: 'Ошибка при проверке документа',
      retryable: true
    });
  }
});

documentsRouter.post('/generate', async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { orderRef, customer: rawCustomer } = (req.body ??
      {}) as Partial<DocumentGenerateRequest>;

    if (
      typeof orderRef !== 'string' ||
      orderRef.trim() === '' ||
      rawCustomer === undefined ||
      rawCustomer === null
    ) {
      return res.status(400).json({
        code: 'INVALID_REQUEST',
        message: 'Не указаны обязательные поля',
        retryable: false
      });
    }

    const customer = parseCustomer(rawCustomer);
    if (customer === null) {
      return res.status(400).json({
        code: 'INVALID_CUSTOMER',
        message: 'Заполните все обязательные поля получателя',
        retryable: false
      });
    }

    const order = await findOrder(orderRef.trim());

    if (order === null || order === undefined) {
      return res.status(404).json({
        code: 'ORDER_NOT_FOUND',
        message: 'Заказ не найден',
        retryable: false
      });
    }

    const client = getODataClient();
    const existingDoc = await client.findSalesDocumentByOrder(order.Ref_Key);

    const { orderHeader, lines, totals } = await enrichOrder(order);

    const fullNameDative = declineFullName(
      customer.lastName,
      customer.firstName,
      customer.middleName ?? '',
      customer.gender
    );

    const docRef = existingDoc?.Ref_Key ?? (await client.createSalesDocument(order.Ref_Key));
    const verification = await client.verifySalesDocument(docRef);

    if (!verification.exists) {
      return res.status(500).json({
        code: 'DOCUMENT_VERIFICATION_FAILED',
        message: 'Не удалось проверить созданный документ в 1С',
        retryable: true
      });
    }

    const documentNumber = verification.number ?? 'Без номера';

    const safeOrderNumber = order.Number.replace(/[^a-zA-Z0-9-_]/g, '_');
    const filename = `order-${safeOrderNumber}.pdf`;
    const encodedFilename = encodeURIComponent(filename);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const assetsPath = getPdfAssetsPath();
    doc.registerFont('AppSans', path.join(assetsPath, 'DejaVuSans.ttf'));
    doc.registerFont('AppSans-Bold', path.join(assetsPath, 'DejaVuSans-Bold.ttf'));

    // Заголовок печатной формы и ссылка на созданный документ 1С
    doc.fontSize(18).font('AppSans-Bold').text('Накладная на отпуск товара', { align: 'center' });
    doc.moveDown(0.5);
    doc
      .fontSize(10)
      .font('AppSans')
      .text(`По документу реализации № ${documentNumber}`, { align: 'center' });
    doc.moveDown(1);

    // Информация о заказе
    doc.fontSize(12).font('AppSans-Bold').text('Заказ клиента', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(10).font('AppSans');
    doc.text(`Номер заказа: ${order.Number}`);
    doc.text(`Дата заказа: ${new Date(order.Date).toLocaleDateString('ru-RU')}`);
    doc.text(`Склад: ${orderHeader.warehouse}`);
    doc.moveDown(1);

    // Информация о получателе
    doc.fontSize(12).font('AppSans-Bold').text('Получатель', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(10).font('AppSans');
    doc.text(`Выдать: ${fullNameDative}`);
    doc.text(`Телефон: ${formatPhone(customer.phone)}`);
    doc.text(`Email: ${customer.email}`);
    doc.moveDown(1.5);

    // Таблица товаров
    doc.fontSize(12).font('AppSans-Bold').text('Товары к выдаче', { underline: true });
    doc.moveDown(0.5);

    const tableTop = doc.y;
    const colWidths = [54, 119, 38, 30, 52, 43, 56, 48, 67];
    const headers = [
      'Артикул',
      'Наименование',
      'Кол-во',
      'Ед.',
      'Цена',
      'Ставка',
      'Сумма',
      'НДС',
      'С НДС'
    ];

    const tableLeft = 40;
    const cellPadding = 3;
    const tableBottom = 700;
    const alignments = [
      'left',
      'left',
      'right',
      'center',
      'right',
      'center',
      'right',
      'right',
      'right'
    ] as const;

    const drawTableRow = (values: string[], rowY: number, bold: boolean): number => {
      doc.fontSize(8).font(bold ? 'AppSans-Bold' : 'AppSans');
      const rowHeight =
        Math.max(
          20,
          ...values.map((value, index) =>
            doc.heightOfString(value, {
              width: (colWidths[index] ?? 0) - cellPadding * 2,
              align: alignments[index]
            })
          )
        ) +
        cellPadding * 2;

      let cellX = tableLeft;
      values.forEach((value, index) => {
        const width = colWidths[index];
        const align = alignments[index];
        if (width !== undefined && align !== undefined) {
          doc.rect(cellX, rowY, width, rowHeight).lineWidth(0.5).stroke();
          doc.text(value, cellX + cellPadding, rowY + cellPadding, {
            width: width - cellPadding * 2,
            height: rowHeight - cellPadding * 2,
            align
          });
          cellX += width;
        }
      });

      return rowHeight;
    };

    let tableY = tableTop;
    tableY += drawTableRow(headers, tableY, true);

    lines.forEach(line => {
      const values = [
        line.article,
        line.name,
        line.qty.toString(),
        line.unit ?? '—',
        line.price.toFixed(2),
        formatVatDisplay(line.vatName),
        line.amount.toFixed(2),
        line.vatAmount.toFixed(2),
        line.amountWithVat.toFixed(2)
      ];

      doc.fontSize(8).font('AppSans');
      const requiredHeight =
        Math.max(
          20,
          ...values.map((value, index) =>
            doc.heightOfString(value, {
              width: (colWidths[index] ?? 0) - cellPadding * 2,
              align: alignments[index]
            })
          )
        ) +
        cellPadding * 2;

      if (tableY + requiredHeight > tableBottom) {
        doc.addPage();
        tableY = 50;
        tableY += drawTableRow(headers, tableY, true);
      }

      tableY += drawTableRow(values, tableY, false);
    });

    doc.y = tableY;

    // Итоговая линия
    doc.moveDown(0.5);
    const totalLineY = doc.y;
    doc.moveTo(40, totalLineY).lineTo(555, totalLineY).lineWidth(1.5).stroke();
    doc.moveDown(0.5);

    // Итоги
    doc.fontSize(11).font('AppSans-Bold');
    const totalsLabelX = 350;
    const totalsValueX = 455;
    const totalsValueWidth = 100;
    const totalsRowHeight = 18;
    let totalsY = doc.y;

    doc.text('Итого без НДС:', totalsLabelX, totalsY, { lineBreak: false });
    doc.text(`${totals.amount.toFixed(2)} ₽`, totalsValueX, totalsY, {
      width: totalsValueWidth,
      align: 'right',
      lineBreak: false
    });
    totalsY += totalsRowHeight;

    doc.text('НДС:', totalsLabelX, totalsY, { lineBreak: false });
    doc.text(`${totals.vatAmount.toFixed(2)} ₽`, totalsValueX, totalsY, {
      width: totalsValueWidth,
      align: 'right',
      lineBreak: false
    });
    totalsY += totalsRowHeight;

    doc.fontSize(12);
    doc.text('Всего с НДС:', totalsLabelX, totalsY, { lineBreak: false });
    doc.text(`${totals.amountWithVat.toFixed(2)} ₽`, totalsValueX, totalsY, {
      width: totalsValueWidth,
      align: 'right',
      lineBreak: false
    });
    doc.y = totalsY + totalsRowHeight;

    doc.moveDown(2);

    // Подписи
    doc.fontSize(10).font('AppSans');
    doc.text(`Всего позиций: ${lines.length}`, 50, doc.y);
    doc.moveDown(2);

    doc.text('Выдал: _________________ / _________________ /', 50, doc.y);
    doc.moveDown(0.3);
    doc.fontSize(8).text('(подпись)                    (расшифровка)', 80, doc.y);
    doc.moveDown(1.5);

    doc.fontSize(10);
    doc.text('Получил: _________________ / _________________ /', 50, doc.y);
    doc.moveDown(0.3);
    doc.fontSize(8).text('(подпись)                    (расшифровка)', 90, doc.y);

    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      doc.once('end', () => resolve(Buffer.concat(chunks)));
      doc.once('error', reject);
      doc.end();
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`
    );
    res.setHeader('X-Document-Number', Buffer.from(documentNumber).toString('base64'));
    return res.end(pdfBuffer);
  } catch (error) {
    console.error('Generate error:', errorDetails(error));
    const errorMessage =
      error instanceof Error && !axios.isAxiosError(error)
        ? error.message
        : 'Ошибка формирования документа';
    if (res.headersSent || res.writableEnded) {
      return;
    }
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: errorMessage,
      retryable: true
    });
  }
});
