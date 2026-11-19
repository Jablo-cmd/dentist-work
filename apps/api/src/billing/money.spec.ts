import { computeLines, dec, fmt, round2 } from './money';

const line = (
  o: Partial<{ description: string; quantity: string; unitPrice: string; taxAmount: string }>,
) => ({ description: 'Item', quantity: '1', unitPrice: '0', taxAmount: '0', ...o });

describe('money arithmetic', () => {
  it('is exact where binary floats are not (0.1 + 0.2)', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(fmt(dec('0.1').add(dec('0.2')))).toBe('0.30');
    const r = computeLines([line({ unitPrice: '0.10' }), line({ unitPrice: '0.20' })]);
    expect(fmt(r.total)).toBe('0.30');
  });
  it('rounds half-up to two decimals per line', () => {
    expect(fmt(round2(dec('1.005')))).toBe('1.01');
    expect(fmt(round2(dec('2.675')))).toBe('2.68');
    expect(fmt(computeLines([line({ quantity: '2.5', unitPrice: '10.01' })]).total)).toBe('25.03'); // 25.025 -> 25.03
  });
  it('adds recorded tax without calculating any', () => {
    const r = computeLines([line({ quantity: '3', unitPrice: '100.00', taxAmount: '45.00' })]);
    expect(fmt(r.subtotal)).toBe('300.00');
    expect(fmt(r.taxTotal)).toBe('45.00');
    expect(fmt(r.total)).toBe('345.00');
    expect(fmt(r.lines[0]!.lineTotal)).toBe('345.00');
  });
  it('handles large totals without precision loss', () => {
    const r = computeLines([
      line({ quantity: '1', unitPrice: '9999999999.99' }),
      line({ unitPrice: '0.01' }),
    ]);
    expect(fmt(r.total)).toBe('10000000000.00');
  });
});
