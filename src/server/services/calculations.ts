interface VatRate {
  name: string;
  isCalculated: boolean;
  rate: number;
  baseRate: number;
}

const VAT_RATES: Record<string, VatRate> = {
  '0%': { name: '0%', isCalculated: false, rate: 0, baseRate: 0 },
  '10%': { name: '10%', isCalculated: false, rate: 0.1, baseRate: 0.1 },
  '13%': { name: '13%', isCalculated: false, rate: 0.13, baseRate: 0.13 },
  '20%': { name: '20%', isCalculated: false, rate: 0.2, baseRate: 0.2 },
  '22%': { name: '22%', isCalculated: false, rate: 0.22, baseRate: 0.22 },
  '10/110': { name: '10/110', isCalculated: true, rate: 10 / 110, baseRate: 0.1 },
  '20/120': { name: '20/120', isCalculated: true, rate: 20 / 120, baseRate: 0.2 },
  '22/122': { name: '22/122', isCalculated: true, rate: 22 / 122, baseRate: 0.22 },
  'Без НДС': { name: 'Без НДС', isCalculated: false, rate: 0, baseRate: 0 }
};

function resolveVatRate(vatName: string): VatRate | undefined {
  if (VAT_RATES[vatName] !== undefined) {
    return VAT_RATES[vatName];
  }

  const percentMatch = /^(\d+(?:\.\d+)?)%$/.exec(vatName.trim());
  if (percentMatch?.[1] !== undefined) {
    const val = parseFloat(percentMatch[1]);
    const rate = val / 100;
    return { name: vatName, isCalculated: false, rate, baseRate: rate };
  }

  const calcMatch = /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(vatName.trim());
  if (calcMatch?.[1] !== undefined && calcMatch[2] !== undefined) {
    const numerator = parseFloat(calcMatch[1]);
    const denominator = parseFloat(calcMatch[2]);
    if (denominator > 0) {
      return {
        name: vatName,
        isCalculated: true,
        rate: numerator / denominator,
        baseRate: numerator / 100
      };
    }
  }

  return undefined;
}

export function roundHalfUp(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Amount must be finite');
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateLineAmounts(
  qty: number,
  price: number,
  vatName: string,
  priceIncludesVat: boolean
): { amount: number; vatAmount: number; amountWithVat: number } {
  const vatRate = resolveVatRate(vatName);

  if (vatRate === undefined) {
    throw new Error(`Unknown VAT rate: ${vatName}`);
  }

  if (!Number.isFinite(qty) || !Number.isFinite(price) || qty < 0 || price < 0) {
    throw new Error('Quantity and price must be non-negative finite numbers');
  }
  const amountCents = Math.round((qty * price + Number.EPSILON) * 100);
  let amount = amountCents / 100;

  let vatAmount: number;
  let amountWithVat: number;

  if (priceIncludesVat) {
    amountWithVat = amount;

    if (vatRate.isCalculated) {
      vatAmount = roundHalfUp(amount * vatRate.rate);
    } else if (vatRate.rate > 0) {
      vatAmount = roundHalfUp((amount * vatRate.rate) / (1 + vatRate.rate));
    } else {
      vatAmount = 0;
    }
    // При цене с НДС сначала выделяем налог из валовой суммы,
    // а amount оставляем чистой суммой без НДС.
    amount = roundHalfUp(amountWithVat - vatAmount);
  } else {
    const effectiveRate = vatRate.isCalculated ? vatRate.baseRate : vatRate.rate;
    vatAmount = roundHalfUp(amount * effectiveRate);
    amountWithVat = amount + vatAmount;
  }

  return {
    amount: roundHalfUp(amount),
    vatAmount: roundHalfUp(vatAmount),
    amountWithVat: roundHalfUp(amountWithVat)
  };
}

export function calculateTotals(
  lines: Array<{ amount: number; vatAmount: number; amountWithVat: number }>
) {
  return lines.reduce(
    (totals, line) => ({
      amount: roundHalfUp(totals.amount + line.amount),
      vatAmount: roundHalfUp(totals.vatAmount + line.vatAmount),
      amountWithVat: roundHalfUp(totals.amountWithVat + line.amountWithVat)
    }),
    { amount: 0, vatAmount: 0, amountWithVat: 0 }
  );
}
