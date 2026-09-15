import assert from 'node:assert';
import { describe, it } from 'node:test';
import { isValidEan13 } from '../../shared/barcode';

describe('EAN-13', () => {
  it('принимает пять штрихкодов с верной контрольной цифрой', () => {
    const barcodes = [
      '4607034764586',
      '4601234567893',
      '4810153012340',
      '5901234123457',
      '4006381333931'
    ];

    for (const barcode of barcodes) {
      assert.equal(isValidEan13(barcode), true, barcode);
    }
  });

  it('отклоняет неверную контрольную цифру и неподходящий формат', () => {
    for (const barcode of ['4607034764585', '460703476458', '460703476458A', '']) {
      assert.equal(isValidEan13(barcode), false, barcode);
    }
  });
});
