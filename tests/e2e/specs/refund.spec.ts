import { getEvent } from '../fixtures/api';
import { demoContext, expect, guestContext, test } from '../fixtures/auth';
import { submitAsGuest } from '../fixtures/checkout';
import { expectSeatStatus, firstAvailableSeat, seat } from '../fixtures/seats';

test('an organizer refunds a seat and both the buyer and the live map see it come back', async ({
  browser,
}) => {
  const buyer = await guestContext(browser);
  const watcher = await guestContext(browser);
  const buyerPage = await buyer.newPage();
  const watcherPage = await watcher.newPage();

  await buyerPage.goto('/events/bangkok-indie-fest');
  const label = await firstAvailableSeat(buyerPage, 'Main');
  await seat(buyerPage, label).click();
  await expectSeatStatus(buyerPage, label, 'yours');
  await submitAsGuest(buyerPage, 'Claim 1 seat');

  await buyerPage.waitForURL(/localhost:4100\/pay\//);
  await buyerPage.getByRole('button', { name: /^Pay / }).click();
  await buyerPage.waitForURL(/\/orders\//);
  await expect(buyerPage.getByText('paid', { exact: true })).toBeVisible({ timeout: 20_000 });

  await watcherPage.goto('/events/bangkok-indie-fest');
  await expectSeatStatus(watcherPage, label, 'sold');

  const organizer = await demoContext(browser, 'organizer');
  const event = await getEvent(organizer.request, 'bangkok-indie-fest');
  const organizerPage = await organizer.newPage();
  await organizerPage.goto(`/organizer/events/${event.id}/orders`);

  const orderPanel = organizerPage
    .locator('section')
    .filter({ has: organizerPage.getByRole('checkbox') })
    .first();
  await orderPanel.getByRole('checkbox').first().check();
  await orderPanel.getByRole('button', { name: /^Refund \d+ ticket/ }).click();
  await orderPanel.getByRole('button', { name: /click to confirm/ }).click();

  await expectSeatStatus(watcherPage, label, 'available');

  await expect(buyerPage.getByText('refunded', { exact: true })).toBeVisible({
    timeout: 20_000,
  });

  await buyer.close();
  await watcher.close();
  await organizer.close();
});
