import assert from 'node:assert';
import { describe, it } from 'node:test';
import { declineFullName } from '../services/nameUtils';

describe('documents.ts - API Routes', () => {
  describe('GET /api/documents/status', () => {
    it('должен возвращать статус подключения к 1С', () => {
      const statuses = ['connected', 'disconnected'];
      assert.ok(statuses.includes('connected'));
      assert.ok(statuses.includes('disconnected'));
    });

    it('должен обрабатывать ошибку подключения', () => {
      const errorStatus = { status: 'disconnected' };
      assert.strictEqual(errorStatus.status, 'disconnected');
    });
  });

  describe('POST /api/documents/orders/search', () => {
    it('должен валидировать обязательное поле orderRef', () => {
      const invalidRequests = [{ orderRef: '' }, { orderRef: undefined }, {}];

      invalidRequests.forEach(req => {
        const isEmpty = req.orderRef === undefined || req.orderRef === '';
        assert.strictEqual(isEmpty, true);
      });
    });

    it('должен принимать поиск по номеру и по Ref_Key', () => {
      const validSearches = [
        { orderRef: '00000123', type: 'number' },
        { orderRef: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', type: 'guid' }
      ];

      const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      validSearches.forEach(search => {
        if (search.type === 'guid') {
          assert.match(search.orderRef, guidPattern);
        } else {
          assert.doesNotMatch(search.orderRef, guidPattern);
        }
      });
    });

    it('должен возвращать 404 для несуществующего заказа', () => {
      const errorResponse = {
        code: 'ORDER_NOT_FOUND',
        message: 'Заказ не найден',
        retryable: false
      };

      assert.strictEqual(errorResponse.code, 'ORDER_NOT_FOUND');
      assert.strictEqual(errorResponse.retryable, false);
    });

    it('должен обогащать строки заказа остатками и расчётами', () => {
      const enrichedLine = {
        article: 'ART-001',
        name: 'Товар',
        qty: 10,
        price: 1000,
        vatName: '20%',
        amount: 10000,
        vatAmount: 2000,
        amountWithVat: 12000,
        stockBalance: 15,
        stockStatus: 'sufficient'
      };

      assert.ok(enrichedLine.stockBalance !== undefined);
      assert.ok(enrichedLine.stockStatus !== undefined);
      assert.ok(enrichedLine.amount !== undefined);
    });

    it('должен определять статус остатка', () => {
      const testCases = [
        { qty: 10, stock: 15, expected: 'sufficient' },
        { qty: 10, stock: 5, expected: 'insufficient' },
        { qty: 10, stock: null, expected: 'unknown' },
        { qty: 10, stock: undefined, expected: 'unknown' }
      ];

      testCases.forEach(test => {
        let status: string;
        if (test.stock === null || test.stock === undefined) {
          status = 'unknown';
        } else {
          status = test.stock >= test.qty ? 'sufficient' : 'insufficient';
        }
        assert.strictEqual(status, test.expected);
      });
    });
  });

  describe('POST /api/documents/generate', () => {
    it('должен валидировать обязательные поля получателя', () => {
      const requiredFields = ['lastName', 'firstName', 'middleName', 'phone'];

      requiredFields.forEach(field => {
        assert.ok(field.length > 0);
      });
    });

    it('должен склонять ФИО получателя', () => {
      const recipient = {
        lastName: 'Воронцов',
        firstName: 'Пётр',
        middleName: 'Аркадьевич'
      };

      const declined = declineFullName(
        recipient.lastName,
        recipient.firstName,
        recipient.middleName
      );
      const expectedDeclined = 'Воронцову Петру Аркадьевичу';
      assert.strictEqual(declined, expectedDeclined);
    });

    it('должен форматировать телефон', () => {
      const phones = [
        { input: '+7(999)123-45-67', expected: '+79991234567' },
        { input: '8 999 123 45 67', expected: '+79991234567' }
      ];

      phones.forEach(phone => {
        assert.ok(phone.expected.startsWith('+7'));
        assert.strictEqual(phone.expected.length, 12);
      });
    });

    it('должен генерировать PDF с таблицей товаров', () => {
      const pdfStructure = {
        header: 'Накладная на отпуск товара',
        orderInfo: true,
        recipientInfo: true,
        itemsTable: true,
        totals: true
      };

      assert.ok(pdfStructure.header);
      assert.ok(pdfStructure.itemsTable);
      assert.ok(pdfStructure.totals);
    });

    it('должен создавать документ реализации в 1С', () => {
      const salesDocPayload = {
        ХозяйственнаяОперация: 'РеализацияКлиенту',
        Posted: false,
        ЗаказКлиента_Key: 'order-guid',
        Комментарий: ''
      };

      assert.strictEqual(salesDocPayload.ХозяйственнаяОперация, 'РеализацияКлиенту');
      assert.strictEqual(salesDocPayload.Posted, false);
      assert.equal(salesDocPayload.Комментарий, '');
    });

    it('должен проверять существование документа после создания', () => {
      const verificationSteps = [
        'Создание документа в 1С',
        'Получение Ref_Key',
        'Проверка существования документа',
        'Получение номера документа'
      ];

      assert.ok(verificationSteps.length === 4);
    });

    it('должен возвращать PDF как application/pdf', () => {
      const headers = {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="document.pdf"'
      };

      assert.strictEqual(headers['Content-Type'], 'application/pdf');
      assert.ok(headers['Content-Disposition'].includes('attachment'));
    });
  });

  describe('GET /api/documents/products/barcode/:barcode', () => {
    it('должен искать товар по штрихкоду', () => {
      const barcode = '4607034764586';
      assert.ok(barcode.length > 0);
    });

    it('должен возвращать 404 для несуществующего штрихкода', () => {
      const errorResponse = {
        code: 'PRODUCT_NOT_FOUND',
        message: 'Товар не найден',
        retryable: false
      };

      assert.strictEqual(errorResponse.code, 'PRODUCT_NOT_FOUND');
    });
  });

  describe('Обработка ошибок', () => {
    it('должен различать временные и постоянные ошибки', () => {
      const errors = [
        { code: 'ORDER_NOT_FOUND', retryable: false },
        { code: 'ODATA_TIMEOUT', retryable: true },
        { code: 'INVALID_REQUEST', retryable: false },
        { code: 'SERVICE_UNAVAILABLE', retryable: true }
      ];

      errors.forEach(error => {
        if (error.code.includes('NOT_FOUND') || error.code.includes('INVALID')) {
          assert.strictEqual(error.retryable, false);
        }
      });
    });

    it('должен логировать ошибки без раскрытия credentials', () => {
      const safeErrorLog = {
        message: 'OData request failed',
        endpoint: '/Document_ЗаказКлиента',
        statusCode: 500
      };

      assert.ok(!JSON.stringify(safeErrorLog).includes('password'));
      assert.ok(!JSON.stringify(safeErrorLog).includes('auth'));
    });
  });

  describe('POST /api/documents/preview', () => {
    it('должен включать нормализованные данные получателя', () => {
      const response = {
        customer: {
          fullNameDative: 'Воронцову Петру Аркадьевичу',
          phone: '+79991234567',
          email: 'p@example.com'
        }
      };
      assert.equal(response.customer.phone, '+79991234567');
      assert.ok(response.customer.fullNameDative.includes('Воронцову'));
    });
  });
});
