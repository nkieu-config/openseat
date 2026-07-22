import { getEvent, simulateCrowd } from '../fixtures/api';
import { expect, test } from '../fixtures/auth';
import { submitAsGuest } from '../fixtures/checkout';

const CROWD_AHEAD = 6;

test('a visitor queues, is admitted, and buys with the token the gate signed', async ({
  page,
  request,
}) => {
  const event = await getEvent(request, 'midnight-drop');
  await simulateCrowd(request, event.id, CROWD_AHEAD);

  await page.goto('/events/midnight-drop');
  await page.getByRole('button', { name: 'Enter the on-sale' }).click();

  await page.waitForURL(/\/queue/);
  await expect(page.getByRole('heading', { name: "You're in the queue" })).toBeVisible();
  await expect(page.getByText(/\d+ ahead of you/)).toBeVisible();

  await page.waitForURL(/\/events\/midnight-drop$/, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Add one Drop pass' }).click();
  await submitAsGuest(page, 'Claim 1 ticket');

  await page.waitForURL(/\/orders\//);
  await expect(page.getByText('paid', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /You're going to/ })).toBeVisible();
});
