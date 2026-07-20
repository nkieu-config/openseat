import type { OrderStatus } from '../generated/prisma/client';

export const PAID_ORDER_STATUSES: OrderStatus[] = [
  'paid',
  'partially_refunded',
  'refunded',
];

export const REFUNDABLE_ORDER_STATUSES: OrderStatus[] = [
  'paid',
  'partially_refunded',
];

export const UNFULFILLABLE_ORDER_STATUSES: OrderStatus[] = [
  'expired',
  'canceled',
];
