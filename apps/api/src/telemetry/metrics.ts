import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('openseat-api');

export const holdsAcquired = meter.createCounter('holds_acquired_total');
export const ordersPaid = meter.createCounter('orders_paid_total');
export const ticketsCheckedIn = meter.createCounter('tickets_checked_in_total');
export const admissionsVerified = meter.createCounter(
  'admissions_verified_total',
);
export const webhookEvents = meter.createCounter('webhook_events_total');
export const refundsTotal = meter.createCounter('refunds_total');
