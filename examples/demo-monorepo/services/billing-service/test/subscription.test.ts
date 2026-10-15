import { describe, it, expect } from 'vitest';
import { calculateInvoiceTotal } from '../src/subscription.js';

describe('Billing Service Calculations', () => {
  it('calculates invoice total with default tax', () => {
    const total = calculateInvoiceTotal(1000); // 1000 + 10% = 1100
    expect(total).toBe(1100);
  });
});
