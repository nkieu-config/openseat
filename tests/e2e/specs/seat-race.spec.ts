import { expect, guestContext, test } from '../fixtures/auth';
import { expectSeatStatus, firstAvailableSeat, seat } from '../fixtures/seats';

const REALTIME_BATCH_MS = 250;

test('a seat one buyer takes turns held in the other browser, with no reload', async ({
  browser,
}) => {
  const buyerA = await guestContext(browser);
  const buyerB = await guestContext(browser);
  const pageA = await buyerA.newPage();
  const pageB = await buyerB.newPage();

  await pageA.goto('/events/bangkok-indie-fest');
  await pageB.goto('/events/bangkok-indie-fest');

  const label = await firstAvailableSeat(pageA, 'Main');
  await expectSeatStatus(pageB, label, 'available');

  await seat(pageA, label).click();
  await expectSeatStatus(pageA, label, 'yours');

  await expectSeatStatus(pageB, label, 'held');

  await seat(pageB, label).click();
  await expect(pageB.getByText(`${label} is held by someone else`)).toBeVisible();
  await expectSeatStatus(pageB, label, 'held');

  await buyerA.close();
  await buyerB.close();
});

test('a buyer whose live updates never arrive is refused by the server', async ({ browser }) => {
  const buyerA = await guestContext(browser);
  const buyerB = await guestContext(browser);
  await buyerB.routeWebSocket(/socket\.io/, () => {});
  const pageA = await buyerA.newPage();
  const pageB = await buyerB.newPage();

  const holdAttempts: number[] = [];
  pageB.on('response', (response) => {
    if (response.request().method() === 'POST' && response.url().endsWith('/holds')) {
      holdAttempts.push(response.status());
    }
  });

  await pageA.goto('/events/bangkok-indie-fest');
  await pageB.goto('/events/bangkok-indie-fest');

  const label = await firstAvailableSeat(pageA, 'Main');
  await expectSeatStatus(pageB, label, 'available');

  await seat(pageA, label).click();
  await expectSeatStatus(pageA, label, 'yours');

  await pageB.waitForTimeout(REALTIME_BATCH_MS * 6);
  await expectSeatStatus(pageB, label, 'available');

  await seat(pageB, label).click();
  await expect.poll(() => holdAttempts).toContain(409);
  await expectSeatStatus(pageB, label, 'held');

  await buyerA.close();
  await buyerB.close();
});
