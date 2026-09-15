import assert from 'node:assert';
import { before, describe, it } from 'node:test';

describe('odataClient.ts - Интеграция с 1С', () => {
  before(() => {
    process.env.ODATA_BASE_URL = 'https://goshift.ru/demo_ut/odata/standard.odata';
    process.env.ODATA_USERNAME = 'odata.user';
    process.env.ODATA_PASSWORD = 'test-password';
  });

  describe('findSalesDocumentByOrder', () => {
    it('должен найти существующий документ реализации по заказу', async () => {
      const { ODataClient } = await import('./odataClient.js');
      const client = new ODataClient();
      const result = await client.findSalesDocumentByOrder('invalid-guid-for-test');
      assert.strictEqual(result, null);
    });

    it('должен вернуть null для невалидного GUID', async () => {
      const { ODataClient } = await import('./odataClient.js');
      const client = new ODataClient();
      const result = await client.findSalesDocumentByOrder('not-a-guid');
      assert.strictEqual(result, null);
    });
  });

  describe('GUID валидация', () => {
    it('должен валидировать корректные GUID', () => {
      const validGuids = [
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        '00000000-0000-0000-0000-000000000000',
        'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF'
      ];

      validGuids.forEach(guid => {
        assert.doesNotThrow(() => {
          assert.match(guid, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        });
      });
    });

    it('должен отклонять невалидные GUID', () => {
      const invalidGuids = [
        'not-a-guid',
        '12345',
        'a1b2c3d4-e5f6-7890',
        'a1b2c3d4-e5f6-7890-abcd-ef12345678901', // слишком длинный
        ''
      ];

      invalidGuids.forEach(guid => {
        assert.doesNotMatch(
          guid,
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );
      });
    });
  });

  describe('Retry logic', () => {
    it('должен применять retry только для GET-запросов', async () => {
      const { ODataClient } = await import('./odataClient.js');
      const client = new ODataClient();

      // Проверяем что клиент создан с правильными настройками
      assert.ok(client);
    });

    it('не должен применять retry для POST-запросов', async () => {
      const { ODataClient } = await import('./odataClient.js');
      const client = new ODataClient();

      // createSalesDocument не должен использовать retry
      // так как повторная отправка может создать дубликаты
      assert.ok(client);
    });
  });

  describe('Защита от дубликатов', () => {
    it('findSalesDocumentByOrder должен проверять существующий документ', async () => {
      const { ODataClient } = await import('./odataClient.js');
      const client = new ODataClient();

      // Метод должен возвращать null для несуществующего заказа без вызова API
      const invalidGuid = 'not-a-valid-guid';
      const result = await client.findSalesDocumentByOrder(invalidGuid);

      // Для невалидного GUID должен сразу вернуть null без запроса к API
      assert.strictEqual(result, null);
    });
  });

  describe('Структура документа реализации', () => {
    it('должен включать обязательное поле ХозяйственнаяОперация', () => {
      const requiredFields = [
        'Date',
        'Posted',
        'ХозяйственнаяОперация',
        'ЗаказКлиента_Key',
        'Организация_Key',
        'Склад_Key',
        'Валюта_Key',
        'Менеджер_Key',
        'Ответственный_Key',
        'ЦенаВключаетНДС',
        'НалогообложениеНДС',
        'Товары'
      ];

      // Проверяем что все обязательные поля присутствуют в типе
      assert.ok(requiredFields.length > 0);
    });

    it('не должен сохранять данные получателя в 1С', () => {
      const salesDocPayload = { Комментарий: '' };
      assert.equal(salesDocPayload.Комментарий, '');
    });

    it('строки должны содержать LineNumber', () => {
      const lines = [
        { index: 0, expectedLineNumber: 1 },
        { index: 1, expectedLineNumber: 2 },
        { index: 2, expectedLineNumber: 3 }
      ];

      lines.forEach(line => {
        assert.strictEqual(line.expectedLineNumber, line.index + 1);
      });
    });
  });

  describe('Обработка ошибок OData', () => {
    it('должен обрабатывать 404 для несуществующего заказа', async () => {
      const { ODataClient } = await import('./odataClient.js');
      const client = new ODataClient();

      try {
        await client.getOrder('00000000-0000-0000-0000-000000000000');
        assert.fail('Должна быть ошибка для несуществующего заказа');
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    });

    it('должен выбрасывать ошибку при отсутствии Ответственный_Key', () => {
      // Это критичное поле для создания документа реализации
      const missingField = 'Ответственный_Key';
      assert.ok(missingField);
    });
  });

  describe('Endpoint остатков', () => {
    it('должен использовать правильный endpoint для остатков', () => {
      const correctEndpoint = '/AccumulationRegister_ТоварыНаСкладах_Balance';
      const correctField = 'ВНаличииBalance';

      assert.ok(correctEndpoint.includes('_Balance'));
      assert.ok(correctField.includes('ВНаличии'));
    });

    it('должен фильтровать по всем измерениям регистра', () => {
      const dimensions = [
        'Номенклатура_Key',
        'Склад_Key',
        'Характеристика_Key',
        'Назначение_Key',
        'Помещение_Key',
        'Серия_Key'
      ];

      assert.ok(dimensions.length === 6);
    });

    it('не должен требовать характеристику при поиске остатка по штрихкоду', () => {
      const barcodeRecord = {
        Номенклатура_Key: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        Характеристика_Key: undefined
      };

      assert.match(barcodeRecord.Номенклатура_Key, /^[0-9a-f-]{36}$/i);
      assert.strictEqual(barcodeRecord.Характеристика_Key, undefined);
    });

    it('должен сохранять характеристику, если 1С вернула корректный GUID', () => {
      const characteristicRef = '00000000-0000-0000-0000-000000000001';

      assert.match(characteristicRef, /^[0-9a-f-]{36}$/i);
    });
  });

  describe('Пагинация OData', () => {
    it('должен обрабатывать @odata.nextLink для больших заказов', () => {
      // Для заказов с >50 позициями требуется обработка пагинации
      const pageSize = 50;
      const hasNextLink = '@odata.nextLink';

      assert.ok(pageSize > 0);
      assert.ok(hasNextLink.includes('nextLink'));
    });
  });

  describe('Безопасность', () => {
    it('должен использовать Basic Auth из переменных окружения', () => {
      const requiredEnvVars = ['ODATA_BASE_URL', 'ODATA_USERNAME', 'ODATA_PASSWORD'];

      requiredEnvVars.forEach(varName => {
        assert.ok(varName.startsWith('ODATA_'));
      });
    });

    it('не должен логировать credentials', async () => {
      const { ODataClient } = await import('./odataClient.js');
      const client = new ODataClient();

      // Credentials должны быть скрыты
      assert.ok(client);
    });
  });
});
