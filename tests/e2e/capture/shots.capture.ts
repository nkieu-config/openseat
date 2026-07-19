import { mkdirSync } from 'node:fs';
import { test } from '@playwright/test';
import { demoContext, guestContext } from '../fixtures/auth';

const OUT = 'capture/out';
const VIEW = { width: 1280, height: 800 };

test('shots — the curated product surfaces', async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });

  const guest = await guestContext(browser);
  await guest.addInitScript(() => window.localStorage.setItem('theme', 'dark'));
  const gp = await guest.newPage();
  await gp.setViewportSize(VIEW);

  await gp.goto('/events/bangkok-indie-fest');
  await gp
    .getByRole('button', { name: /^Front \w+\d+ — / })
    .first()
    .scrollIntoViewIfNeeded();
  await gp.waitForTimeout(800);
  await gp.screenshot({ path: `${OUT}/seat-map.png`, fullPage: true });

  await gp.goto('/events/midnight-drop/queue');
  await gp.waitForTimeout(1500);
  await gp
    .getByRole('button', { name: /simulate/i })
    .click()
    .catch(() => undefined);
  await gp.waitForTimeout(2000);
  await gp.screenshot({ path: `${OUT}/waiting-room.png`, fullPage: true });
  await guest.close();

  const org = await demoContext(browser, 'organizer');
  await org.addInitScript(() => window.localStorage.setItem('theme', 'dark'));
  const op = await org.newPage();
  await op.setViewportSize(VIEW);

  async function consoleHref(title: string): Promise<string> {
    await op.goto('/organizer');
    const link = op
      .locator('div.rounded-md')
      .filter({ has: op.getByRole('heading', { name: title }) })
      .first()
      .locator('a[href^="/organizer/events/"]')
      .first();
    await link.waitFor({ state: 'visible' });
    const value = await link.getAttribute('href');
    if (!value) {
      throw new Error(`no console link for ${title}`);
    }
    return value;
  }

  const seatedHref = await consoleHref('Bangkok Indie Fest 2026');
  await op.goto(seatedHref);
  await op.waitForTimeout(1500);
  await op.screenshot({ path: `${OUT}/console.png`, fullPage: true });

  await op.getByRole('heading', { name: 'Team' }).scrollIntoViewIfNeeded();
  await op.waitForTimeout(500);
  await op.screenshot({ path: `${OUT}/team-panel.png` });

  await op.goto(`${seatedHref}/checkin`);
  await op.waitForTimeout(1000);
  await op.screenshot({ path: `${OUT}/check-in.png`, fullPage: true });

  const dropHref = await consoleHref('Midnight Drop');
  await op.goto(`${dropHref}/seatmap`);
  const addSection = op.getByRole('button', { name: 'Section', exact: true });
  await addSection.waitFor({ state: 'visible' });
  await addSection.click();
  await op.waitForTimeout(800);
  await op.screenshot({ path: `${OUT}/seatmap-editor.png`, fullPage: true });
  await org.close();

  const social = await guestContext(browser);
  await social.addInitScript(() => window.localStorage.setItem('theme', 'dark'));
  const sp = await social.newPage();
  await sp.setViewportSize({ width: 1280, height: 640 });
  await sp.goto('/');
  await sp.waitForTimeout(1500);
  await sp.screenshot({ path: `${OUT}/social-preview.png` });
  await social.close();
});
