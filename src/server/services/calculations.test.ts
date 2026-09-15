import assert from 'node:assert/strict';
import test from 'node:test';
import { formatVatDisplay } from '../../shared/vatFormat';
import { calculateLineAmounts, calculateTotals, roundHalfUp } from './calculations';

test('roundHalfUp rounds to 2 decimal places', () => {
  assert.equal(roundHalfUp(1.267), 1.27);
  assert.equal(roundHalfUp(1.264), 1.26);
  assert.equal(roundHalfUp(10.006), 10.01);
  assert.equal(roundHalfUp(0.995), 1.0);
  assert.equal(roundHalfUp(1.265), 1.27);
});

test('calculateLineAmounts without VAT included', () => {
  // 3 шт * 1250 руб = 3750 руб, НДС 20% = 750 руб, с НДС = 4500 руб
  const result = calculateLineAmounts(3, 1250, '20%', false);
  assert.equal(result.amount, 3750);
  assert.equal(result.vatAmount, 750);
  assert.equal(result.amountWithVat, 4500);
});

test('calculateLineAmounts with 22% VAT not included', () => {
  // 3 шт * 1250 руб = 3750 руб, НДС 22% = 825 руб, с НДС = 4575 руб
  const result = calculateLineAmounts(3, 1250, '22%', false);
  assert.equal(result.amount, 3750);
  assert.equal(result.vatAmount, 825);
  assert.equal(result.amountWithVat, 4575);
});

test('calculateLineAmounts with VAT included', () => {
  // 10 шт * 120 руб = 1200 руб с НДС 20%, НДС = 1200 * 0.2 / 1.2 = 200 руб
  const result = calculateLineAmounts(10, 120, '20%', true);
  assert.equal(result.amountWithVat, 1200);
  assert.equal(result.vatAmount, 200);
  assert.equal(result.amount, 1000);
});

test('calculateLineAmounts with calculated VAT 20/120', () => {
  const result = calculateLineAmounts(1, 1200, '20/120', true);
  assert.equal(result.amountWithVat, 1200);
  assert.equal(result.vatAmount, 200);
});

test('calculateTotals sums line values correctly', () => {
  const lines = [
    { amount: 3750, vatAmount: 825, amountWithVat: 4575 },
    { amount: 1200, vatAmount: 200, amountWithVat: 1200 }
  ];
  const totals = calculateTotals(lines);
  assert.equal(totals.amount, 4950);
  assert.equal(totals.vatAmount, 1025);
  assert.equal(totals.amountWithVat, 5775);
});

test('calculateLineAmounts with 0% VAT', () => {
  const result = calculateLineAmounts(5, 100, '0%', false);
  assert.equal(result.amount, 500);
  assert.equal(result.vatAmount, 0);
  assert.equal(result.amountWithVat, 500);
});

test('calculateLineAmounts without VAT', () => {
  const result = calculateLineAmounts(2, 50, 'Без НДС', false);
  assert.equal(result.amount, 100);
  assert.equal(result.vatAmount, 0);
  assert.equal(result.amountWithVat, 100);
});

test('calculateLineAmounts with 10% VAT', () => {
  const result = calculateLineAmounts(1, 100, '10%', false);
  assert.equal(result.amount, 100);
  assert.equal(result.vatAmount, 10);
  assert.equal(result.amountWithVat, 110);
});

test('calculateLineAmounts with calculated VAT 10/110', () => {
  const result = calculateLineAmounts(1, 110, '10/110', true);
  assert.equal(result.amountWithVat, 110);
  assert.equal(result.vatAmount, 10);
});

test('calculateLineAmounts with calculated VAT 22/122', () => {
  const result = calculateLineAmounts(1, 122, '22/122', true);
  assert.equal(result.amountWithVat, 122);
  assert.equal(result.vatAmount, 22);
});

test('calculateLineAmounts keeps gross amount when price includes 22% VAT', () => {
  const result = calculateLineAmounts(4, 2400, '22%', true);
  assert.equal(result.amount, 7868.85);
  assert.equal(result.vatAmount, 1731.15);
  assert.equal(result.amountWithVat, 9600);
});

test('calculateLineAmounts with fractional quantity', () => {
  const result = calculateLineAmounts(2.5, 100, '20%', false);
  assert.equal(result.amount, 250);
  assert.equal(result.vatAmount, 50);
  assert.equal(result.amountWithVat, 300);
});

test('calculateLineAmounts with rounding', () => {
  const result = calculateLineAmounts(3, 33.33, '20%', false);
  assert.equal(result.amount, 99.99);
  assert.equal(result.vatAmount, 20);
  assert.equal(result.amountWithVat, 119.99);
});

test('calculateLineAmounts with zero quantity', () => {
  const result = calculateLineAmounts(0, 100, '20%', false);
  assert.equal(result.amount, 0);
  assert.equal(result.vatAmount, 0);
  assert.equal(result.amountWithVat, 0);
});

test('calculateLineAmounts with zero price', () => {
  const result = calculateLineAmounts(10, 0, '20%', false);
  assert.equal(result.amount, 0);
  assert.equal(result.vatAmount, 0);
  assert.equal(result.amountWithVat, 0);
});

test('calculateLineAmounts with unknown VAT rate throws error', () => {
  assert.throws(() => calculateLineAmounts(1, 100, 'Unknown', false), /Unknown VAT rate: Unknown/);
});

test('calculateTotals with empty lines', () => {
  const totals = calculateTotals([]);
  assert.equal(totals.amount, 0);
  assert.equal(totals.vatAmount, 0);
  assert.equal(totals.amountWithVat, 0);
});

test('calculateTotals with mixed VAT rates', () => {
  const lines = [
    { amount: 100, vatAmount: 20, amountWithVat: 120 },
    { amount: 100, vatAmount: 10, amountWithVat: 110 },
    { amount: 100, vatAmount: 0, amountWithVat: 100 }
  ];
  const totals = calculateTotals(lines);
  assert.equal(totals.amount, 300);
  assert.equal(totals.vatAmount, 30);
  assert.equal(totals.amountWithVat, 330);
});

test('real-world scenario: construction materials order', () => {
  const line1 = calculateLineAmounts(10, 250, '20%', true);
  const line2 = calculateLineAmounts(5, 180, '20%', true);
  const line3 = calculateLineAmounts(2, 1500, '20%', true);

  const totals = calculateTotals([line1, line2, line3]);

  assert.equal(totals.amountWithVat, 6400);
  assert.equal(totals.amount, 5333.33);
  assert.ok(totals.vatAmount > 1000);
});

test('real-world scenario: products with different VAT rates', () => {
  const line1 = calculateLineAmounts(3, 45.5, '10%', true);
  const line2 = calculateLineAmounts(2, 120, '20%', true);
  const line3 = calculateLineAmounts(1, 80, '10%', true);

  const totals = calculateTotals([line1, line2, line3]);

  assert.equal(totals.amountWithVat, 456.5);
  assert.equal(totals.amount, 396.82);
});

test('real-world scenario: order with fractional quantities', () => {
  const line1 = calculateLineAmounts(2.5, 120, '20%', false);
  const line2 = calculateLineAmounts(1.75, 80, '10%', false);
  const line3 = calculateLineAmounts(0.5, 200, '0%', false);

  const totals = calculateTotals([line1, line2, line3]);

  assert.equal(totals.amount, 540);
  assert.equal(totals.vatAmount, 74);
  assert.equal(totals.amountWithVat, 614);
});

test('formatVatDisplay formats calculated rates into simple percentages', () => {
  assert.equal(formatVatDisplay('22/122'), '22%');
  assert.equal(formatVatDisplay('20/120'), '20%');
  assert.equal(formatVatDisplay('10/110'), '10%');
  assert.equal(formatVatDisplay('22%'), '22%');
  assert.equal(formatVatDisplay('Без НДС'), 'Без НДС');
  assert.equal(formatVatDisplay('0%'), '0%');
  assert.equal(formatVatDisplay('13%'), '13%');
});
