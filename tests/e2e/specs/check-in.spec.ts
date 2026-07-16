import { getEvent, issueFreeGaTicket } from '../fixtures/api';
import { demoContext, expect, test } from '../fixtures/auth';

const SAME_TOKEN_DEBOUNCE_MS = 2500;

test('an organizer checks a ticket in once and only once', async ({ browser, request }) => {
  const { qrToken } = await issueFreeGaTicket(request, 'bangkok-indie-fest');
  const event = await getEvent(request, 'bangkok-indie-fest');

  const organizer = await demoContext(browser, 'organizer');
  const page = await organizer.newPage();
  await page.goto(`/organizer/events/${event.id}/checkin`);

  const field = page.getByLabel('Ticket QR token');
  const scan = page.getByRole('button', { name: 'Check in' });
  const lastScan = page.getByRole('status');

  await field.fill(qrToken);
  await scan.click();
  await expect(lastScan).toContainText('Admitted');
  await expect(field).toHaveValue('');

  await page.waitForTimeout(SAME_TOKEN_DEBOUNCE_MS + 500);

  await field.fill(qrToken);
  await scan.click();
  await expect(lastScan).toContainText('Already checked in');
  await expect(lastScan).not.toContainText('Admitted');

  await organizer.close();
});
