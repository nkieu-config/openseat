import { expect, test } from '../fixtures/auth';
import { submitAsGuest } from '../fixtures/checkout';
import { expectSeatStatus, firstAvailableSeat, seat } from '../fixtures/seats';

test('a declined payment cancels the order and frees the seat', async ({ page }) => {
  await page.goto('/events/bangkok-indie-fest');

  const label = await firstAvailableSeat(page, 'Main');
  await seat(page, label).click();
  await expectSeatStatus(page, label, 'yours');

  await submitAsGuest(page, 'Claim 1 seat');

  await page.waitForURL(/localhost:4100\/pay\//);
  await page.getByRole('button', { name: 'Simulate a failed payment' }).click();

  await page.waitForURL(/\/orders\//);
  await expect(page.getByText('This order was canceled')).toBeVisible({ timeout: 20_000 });

  await page.goto('/events/bangkok-indie-fest');
  await expectSeatStatus(page, label, 'available');
});
