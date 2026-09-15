import type { AxiosInstance } from 'axios';
import axios from 'axios';
import 'dotenv/config';

interface ODataOrderLine {
  НомерСтроки?: number;
  Номенклатура_Key: string;
  Артикул?: string;
  Номенклатура?: string;
  Количество: number;
  Цена: number;
  СтавкаНДС?: string;
  СтавкаНДС_Key?: string;
  LineNumber?: number | string;
  КодСтроки?: string | number;
  Сумма?: number;
  СуммаНДС?: number;
  СуммаСНДС?: number;
  Характеристика_Key?: string;
  Упаковка_Key?: string;
  КоличествоУпаковок?: number;
  Склад_Key?: string;
  ИдентификаторСтроки?: string;
  ВариантОбеспечения?: string;
  Отменено?: boolean;
}

interface ODataBarcode {
  Штрихкод: string;
  Номенклатура_Key: string;
  Характеристика_Key?: string;
  Упаковка_Key?: string;
}

interface ODataStockBalance {
  Склад_Key: string;
  ВНаличииBalance: number;
}

interface ODataProduct {
  Ref_Key: string;
  Code: string;
  Description: string;
  Артикул: string;
  ВидНоменклатуры_Key: string;
  ЕдиницаИзмерения_Key: string;
  DeletionMark: boolean;
}

interface ODataUnit {
  Ref_Key: string;
  Description: string;
}

interface ODataWarehouse {
  Ref_Key: string;
  Code: string;
  Description: string;
  ТипСклада: string;
  ИспользоватьОрдернуюСхемуПриОтгрузке: boolean;
}

interface ODataOrder {
  Ref_Key: string;
  Number: string;
  Date: string;
  Posted: boolean;
  Организация_Key: string;
  Валюта_Key: string;
  Менеджер_Key: string;
  Ответственный_Key?: string;
  Склад?: string;
  Склад_Key: string;
  ЦенаВключаетНДС: boolean;
  СуммаДокумента: number;
  НалогообложениеНДС: string;
  Контрагент_Key?: string;
  Партнер_Key?: string;
  Товары: ODataOrderLine[];
}

export type {
  ODataBarcode,
  ODataOrder,
  ODataOrderLine,
  ODataProduct,
  ODataStockBalance,
  ODataUnit,
  ODataWarehouse
};

export class ODataClient {
  private client: AxiosInstance;
  private retryCount = 3;
  private retryDelay = Number(process.env.ODATA_RETRY_DELAY ?? 1000);
  private requestTimeout = Number(process.env.ODATA_TIMEOUT ?? 15000);
  private connectionCheckTimeout = Number(process.env.ODATA_CONNECTION_CHECK_TIMEOUT ?? 5000);
  private vatRatesCache = new Map<string, string>();
  private productsCache = new Map<string, ODataProduct>();
  private unitsCache = new Map<string, string>();
  private unitsLoaded = false;
  private warehousesCache = new Map<string, ODataWarehouse>();
  private salesDocumentLocks = new Map<string, Promise<string>>();

  private static readonly guidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  constructor(baseURL?: string, username?: string, password?: string) {
    const effectiveBaseURL = baseURL ?? process.env.ODATA_BASE_URL;
    const effectiveUsername = username ?? process.env.ODATA_USERNAME;
    const effectivePassword = password ?? process.env.ODATA_PASSWORD;

    if (
      effectiveBaseURL === undefined ||
      effectiveBaseURL === '' ||
      effectiveUsername === undefined ||
      effectiveUsername === '' ||
      effectivePassword === undefined ||
      effectivePassword === ''
    ) {
      throw new Error('OData credentials not configured in environment');
    }

    this.client = axios.create({
      baseURL: effectiveBaseURL,
      auth: { username: effectiveUsername, password: effectivePassword },
      timeout: this.requestTimeout,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      }
    });
  }

  private async retryRequest<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let i = 0; i < this.retryCount; i++) {
      try {
        return await fn();
      } catch (error) {
        const normalizedError = error instanceof Error ? error : new Error(String(error));
        lastError = normalizedError;

        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        const retryable = status === undefined || status === 408 || status === 429 || status >= 500;
        if (retryable && i < this.retryCount - 1) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        } else if (!retryable) {
          throw normalizedError;
        }
      }
    }

    throw lastError;
  }

  async checkConnection(): Promise<boolean> {
    try {
      const response = await this.client.get('/?$format=json', {
        timeout: this.connectionCheckTimeout
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  async checkDataAccess(): Promise<{ service: boolean; data: boolean }> {
    const serviceAvailable = await this.checkConnection();

    if (!serviceAvailable) {
      return { service: false, data: false };
    }

    try {
      const response = await this.client.get('/Document_ЗаказКлиента?$format=json&$top=1', {
        timeout: this.connectionCheckTimeout
      });

      const isValidJson = typeof response.data === 'object' && response.data !== null;
      const dataAvailable = response.status === 200 && isValidJson;

      return { service: true, data: dataAvailable };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const responseData: unknown = error.response?.data;
        if (typeof responseData === 'string' && responseData.includes('502 Bad Gateway')) {
          return { service: true, data: false };
        }
      }
      return { service: true, data: false };
    }
  }

  async getMetadata(): Promise<unknown> {
    return this.retryRequest(async () => {
      const response = await this.client.get('/$metadata');
      return response.data as unknown;
    });
  }

  async getOrder(orderRef: string): Promise<ODataOrder | null> {
    if (!ODataClient.guidPattern.test(orderRef)) {
      throw new Error('Invalid order reference');
    }

    return this.retryRequest(async () => {
      const response = await this.client.get(
        `/Document_ЗаказКлиента(guid'${orderRef}')?$format=json&$expand=Товары`
      );
      const order = response.data as ODataOrder | null;
      if (order === null || order === undefined) return order;

      const lines: ODataOrderLine[] = [];
      let nextUrl: string | undefined =
        `/Document_ЗаказКлиента_Товары?$format=json&$filter=ЗаказКлиента_Key eq guid'${orderRef}'`;
      while (nextUrl !== undefined) {
        const currentUrl = nextUrl;
        const page = await this.retryRequest(() => this.client.get(currentUrl));
        const data = page.data as { value?: ODataOrderLine[]; '@odata.nextLink'?: string };
        lines.push(...(data.value ?? []));
        nextUrl = data['@odata.nextLink'];
      }
      if (lines.length > 0) order.Товары = lines;
      return order;
    });
  }

  async searchOrderByNumber(number: string): Promise<ODataOrder | null> {
    const order = await this.retryRequest(async () => {
      const trimmed = number.trim();
      const escapedNumber = trimmed.replace(/'/g, "''");

      let filterExpr = `Number eq '${encodeURIComponent(escapedNumber)}'`;
      if (!trimmed.startsWith('00')) {
        const withPrefix = `00${trimmed}`;
        const escapedWithPrefix = withPrefix.replace(/'/g, "''");
        filterExpr = `(Number eq '${encodeURIComponent(escapedNumber)}' or Number eq '${encodeURIComponent(escapedWithPrefix)}')`;
      }

      const response = await this.client.get(
        `/Document_ЗаказКлиента?$format=json&$filter=${filterExpr}&$expand=Товары`
      );
      const data = response.data as { value?: ODataOrder[] };

      if (data.value === undefined || data.value.length === 0) {
        return null;
      }
      if (data.value.length > 1) {
        throw new Error(`Multiple orders found for number: ${trimmed}`);
      }

      return data.value[0];
    });
    return order === null || order === undefined ? null : this.getOrder(order.Ref_Key);
  }

  async getStockBalance(
    nomenclatureRef: string,
    warehouseRef: string,
    characteristicRef?: string
  ): Promise<number | null> {
    if (
      !ODataClient.guidPattern.test(nomenclatureRef) ||
      !ODataClient.guidPattern.test(warehouseRef) ||
      (characteristicRef !== undefined && !ODataClient.guidPattern.test(characteristicRef))
    ) {
      throw new Error('Invalid stock reference');
    }

    try {
      return await this.retryRequest(async () => {
        const filters = [
          `Номенклатура_Key eq guid'${nomenclatureRef}'`,
          `Склад_Key eq guid'${warehouseRef}'`
        ];
        if (characteristicRef !== undefined) {
          filters.push(`Характеристика_Key eq guid'${characteristicRef}'`);
        }

        const response = await this.client.get(
          `/AccumulationRegister_ТоварыНаСкладах/Balance?$format=json&$filter=${encodeURIComponent(filters.join(' and '))}`
        );

        const data = response.data as {
          value?: Array<{ ВНаличииBalance?: number | string }>;
        };

        if (data.value === undefined || data.value.length === 0) {
          return null;
        }

        const balances = data.value.map(item =>
          typeof item.ВНаличииBalance === 'string'
            ? Number(item.ВНаличииBalance)
            : item.ВНаличииBalance
        );
        if (balances.some(balance => balance === undefined || !Number.isFinite(balance))) {
          return null;
        }
        return balances.reduce<number>((sum, balance) => sum + (balance as number), 0);
      });
    } catch (error) {
      console.warn(
        `Failed to get stock balance for nomenclature ${nomenclatureRef}:`,
        error instanceof Error ? error.message : 'Unknown error'
      );
      return null;
    }
  }

  async findProductByBarcode(barcode: string): Promise<ODataBarcode | null> {
    return this.retryRequest(async () => {
      let nextUrl: string | undefined =
        '/InformationRegister_ШтрихкодыНоменклатуры?$format=json&$top=1000';

      while (nextUrl !== undefined) {
        const response = await this.client.get(nextUrl);
        const data = response.data as {
          value?: ODataBarcode[];
          '@odata.nextLink'?: string;
        };
        const match = data.value?.find(item => item.Штрихкод?.trim() === barcode);
        if (match !== undefined) {
          return match;
        }
        nextUrl = data['@odata.nextLink'];
      }

      return null;
    });
  }

  async getStockBalancesByProduct(
    nomenclatureRef: string,
    characteristicRef?: string
  ): Promise<ODataStockBalance[]> {
    if (!ODataClient.guidPattern.test(nomenclatureRef)) {
      throw new Error('Invalid stock reference');
    }

    return this.retryRequest(async () => {
      const filters = [`Номенклатура_Key eq guid'${nomenclatureRef}'`];
      if (characteristicRef !== undefined && ODataClient.guidPattern.test(characteristicRef)) {
        filters.push(`Характеристика_Key eq guid'${characteristicRef}'`);
      }
      const response = await this.client.get(
        `/AccumulationRegister_ТоварыНаСкладах/Balance?$format=json&$filter=${encodeURIComponent(filters.join(' and '))}`
      );
      const data = response.data as {
        value?: Array<{ Склад_Key?: unknown; ВНаличииBalance?: unknown }>;
      };

      if (!Array.isArray(data.value)) {
        throw new Error('Invalid stock balance response');
      }

      const balancesByWarehouse = new Map<string, number>();
      for (const item of data.value) {
        const warehouseRef = item.Склад_Key;
        const rawBalance = item.ВНаличииBalance;
        const balance = typeof rawBalance === 'string' ? Number(rawBalance) : rawBalance;
        if (
          typeof warehouseRef !== 'string' ||
          !ODataClient.guidPattern.test(warehouseRef) ||
          typeof balance !== 'number' ||
          !Number.isFinite(balance)
        ) {
          throw new Error('Invalid stock balance row');
        }
        balancesByWarehouse.set(
          warehouseRef,
          (balancesByWarehouse.get(warehouseRef) ?? 0) + balance
        );
      }

      return Array.from(balancesByWarehouse, ([Склад_Key, ВНаличииBalance]) => ({
        Склад_Key,
        ВНаличииBalance
      }));
    });
  }

  async getVatRateName(vatRateRef: string): Promise<string | null> {
    if (!ODataClient.guidPattern.test(vatRateRef)) {
      return null;
    }

    const cached = this.vatRatesCache.get(vatRateRef);
    if (cached !== undefined) {
      return cached;
    }

    try {
      return await this.retryRequest(async () => {
        const response = await this.client.get(
          `/Catalog_СтавкиНДС(guid'${vatRateRef}')?$format=json`
        );
        const data = response.data as { Description?: string } | null;
        const rateName = data?.Description ?? null;
        if (rateName !== null) {
          this.vatRatesCache.set(vatRateRef, rateName);
        }
        return rateName;
      });
    } catch (error) {
      console.warn(
        `Failed to get VAT rate for ref ${vatRateRef}:`,
        error instanceof Error ? error.message : 'Unknown error'
      );
      return null;
    }
  }

  async getProduct(productRef: string): Promise<ODataProduct | null> {
    if (!ODataClient.guidPattern.test(productRef)) {
      throw new Error('Invalid product reference');
    }

    const cached = this.productsCache.get(productRef);
    if (cached !== undefined) {
      return cached;
    }

    return this.retryRequest(async () => {
      const response = await this.client.get(
        `/Catalog_Номенклатура(guid'${productRef}')?$format=json`
      );
      const product = (response.data as ODataProduct | null) ?? null;
      if (product !== null) {
        this.productsCache.set(productRef, product);
      }
      return product;
    });
  }

  async getUnitName(unitRef: string): Promise<string | null> {
    if (!ODataClient.guidPattern.test(unitRef)) {
      return null;
    }

    const cached = this.unitsCache.get(unitRef);
    if (cached !== undefined) {
      return cached;
    }

    if (!this.unitsLoaded) {
      await this.retryRequest(async () => {
        let nextUrl: string | undefined = '/Catalog_ЕдиницыИзмерения?$format=json';
        while (nextUrl !== undefined) {
          const page = await this.client.get(nextUrl);
          const data = page.data as { value?: ODataUnit[]; '@odata.nextLink'?: string };
          for (const unit of data.value ?? []) {
            const unitName = unit.Description?.trim() ?? '';
            if (unit.Ref_Key !== '' && unitName !== '') {
              this.unitsCache.set(unit.Ref_Key, unitName);
            }
          }
          nextUrl = data['@odata.nextLink'];
        }
        this.unitsLoaded = true;
      });
    }

    return this.unitsCache.get(unitRef) ?? null;
  }

  async getWarehouse(warehouseRef: string): Promise<ODataWarehouse | null> {
    if (!ODataClient.guidPattern.test(warehouseRef)) {
      throw new Error('Invalid warehouse reference');
    }

    const cached = this.warehousesCache.get(warehouseRef);
    if (cached !== undefined) {
      return cached;
    }

    return this.retryRequest(async () => {
      const response = await this.client.get(`/Catalog_Склады(guid'${warehouseRef}')?$format=json`);
      const warehouse = (response.data as ODataWarehouse | null) ?? null;
      if (warehouse !== null) {
        this.warehousesCache.set(warehouseRef, warehouse);
      }
      return warehouse;
    });
  }

  async findSalesDocumentByOrder(
    orderRef: string
  ): Promise<{ Ref_Key: string; Number?: string } | null> {
    if (!ODataClient.guidPattern.test(orderRef)) {
      return null;
    }

    return this.retryRequest(async () => {
      const response = await this.client.get(
        `/Document_РеализацияТоваровУслуг?$format=json&$filter=ЗаказКлиента_Key eq guid'${orderRef}' and DeletionMark eq false&$top=1`
      );
      const data = response.data as { value?: Array<{ Ref_Key?: string; Number?: string }> };
      const doc = data.value?.[0];
      if (doc?.Ref_Key !== undefined && doc.Ref_Key !== '') {
        return { Ref_Key: doc.Ref_Key, Number: doc.Number };
      }
      return null;
    });
  }

  async createSalesDocument(orderRef: string): Promise<string> {
    const existingLock = this.salesDocumentLocks.get(orderRef);
    if (existingLock !== undefined) {
      return existingLock;
    }

    const operation = this.createSalesDocumentLocked(orderRef);
    this.salesDocumentLocks.set(orderRef, operation);
    try {
      return await operation;
    } finally {
      this.salesDocumentLocks.delete(orderRef);
    }
  }

  private async createSalesDocumentLocked(orderRef: string): Promise<string> {
    const existingDoc = await this.findSalesDocumentByOrder(orderRef);
    if (existingDoc !== null) {
      return existingDoc.Ref_Key;
    }

    const order = await this.getOrder(orderRef);

    if (order === null || order === undefined) {
      throw new Error('Order not found');
    }

    const responsibleKey = order.Ответственный_Key ?? order.Менеджер_Key;
    if (
      !ODataClient.guidPattern.test(order.Организация_Key) ||
      !ODataClient.guidPattern.test(order.Склад_Key) ||
      !ODataClient.guidPattern.test(order.Валюта_Key) ||
      !ODataClient.guidPattern.test(order.Менеджер_Key) ||
      !ODataClient.guidPattern.test(responsibleKey)
    ) {
      throw new Error('В заказе отсутствуют обязательные ссылки для реализации');
    }

    const salesDoc = {
      Date: new Date().toISOString(),
      Posted: false,
      ХозяйственнаяОперация: 'РеализацияКлиенту',
      ЗаказКлиента_Key: order.Ref_Key,
      Организация_Key: order.Организация_Key,
      Контрагент_Key: order.Контрагент_Key,
      Партнер_Key: order.Партнер_Key,
      Склад_Key: order.Склад_Key,
      Валюта_Key: order.Валюта_Key,
      Менеджер_Key: order.Менеджер_Key,
      Ответственный_Key: responsibleKey,
      ЦенаВключаетНДС: order.ЦенаВключаетНДС,
      НалогообложениеНДС: order.НалогообложениеНДС,
      Согласован: false,
      Комментарий: '',
      Товары: order.Товары.map((line, index) => ({
        LineNumber: index + 1,
        КодСтроки: line.КодСтроки ?? index + 1,
        Номенклатура_Key: line.Номенклатура_Key,
        Характеристика_Key: line.Характеристика_Key,
        Упаковка_Key: line.Упаковка_Key,
        Количество: line.Количество,
        КоличествоУпаковок: line.КоличествоУпаковок ?? line.Количество,
        Цена: line.Цена,
        Сумма: line.Сумма,
        СуммаНДС: line.СуммаНДС,
        СуммаСНДС: line.СуммаСНДС,
        СтавкаНДС_Key: line.СтавкаНДС_Key,
        Склад_Key: line.Склад_Key ?? order.Склад_Key,
        ВариантОбеспечения: line.ВариантОбеспечения ?? 'СоСклада',
        Отменено: line.Отменено ?? false,
        ИдентификаторСтроки: line.ИдентификаторСтроки,
        ЗаказКлиента_Key: order.Ref_Key
      }))
    };

    const response = await this.client.post(
      '/Document_РеализацияТоваровУслуг?$format=json',
      salesDoc
    );

    const responseData = response.data as { Ref_Key?: string };

    if (responseData.Ref_Key === undefined) {
      throw new Error('Sales document created but Ref_Key not returned');
    }

    return responseData.Ref_Key;
  }

  async verifySalesDocument(docRef: string): Promise<{ exists: boolean; number?: string }> {
    return this.retryRequest(async () => {
      const response = await this.client.get(
        `/Document_РеализацияТоваровУслуг(guid'${docRef}')?$format=json`
      );
      const data = response.data as { Number?: string } | null;
      return {
        exists: Boolean(data),
        number: data?.Number
      };
    });
  }
}
