export interface SubscriptionPlan {
  planId: string;
  name: string;
  priceCents: number;
  currency: string;
}

export function calculateInvoiceTotal(baseAmountCents: number, taxRate: number = 0.1): number {
  return Math.round(baseAmountCents * (1 + taxRate));
}
