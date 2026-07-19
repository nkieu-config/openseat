import { mkdirSync, renameSync } from 'node:fs';
import { test } from '@playwright/test';
import { WEB } from '../fixtures/api';
import { expectSeatStatus, firstAvailableSeat, seat } from '../fixtures/seats';

const OUT = 'capture/out';
const SIZE = { width: 640, height: 720 };
const LOCALE = { name: 'os_locale', value: 'en', url: WEB };

test('hero — a held seat crossing two browsers', async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  const left = await browser.newContext({
    baseURL: WEB,
    viewport: SIZE,
    recordVideo: { dir: OUT, size: SIZE },
  });
  const right = await browser.newContext({
    baseURL: WEB,
    viewport: SIZE,
    recordVideo: { dir: OUT, size: SIZE },
  });
  await left.addCookies([LOCALE]);
  await right.addCookies([LOCALE]);
  await left.addInitScript(() => window.localStorage.setItem('theme', 'dark'));
  await right.addInitScript(() => window.localStorage.setItem('theme', 'dark'));

  const a = await left.newPage();
  const b = await right.newPage();
  await a.goto('/events/bangkok-indie-fest');
  await b.goto('/events/bangkok-indie-fest');

  const label = await firstAvailableSeat(a, 'Front');
  await seat(a, label).scrollIntoViewIfNeeded();
  await seat(b, label).scrollIntoViewIfNeeded();
  await a.waitForTimeout(1200);

  await seat(a, label).click();
  await expectSeatStatus(a, label, 'yours');
  await expectSeatStatus(b, label, 'held');
  await a.waitForTimeout(1500);

  await a.screenshot({ path: `${OUT}/hero-left.png` });
  await b.screenshot({ path: `${OUT}/hero-right.png` });

  const videoA = a.video();
  const videoB = b.video();
  await left.close();
  await right.close();

  const pathA = await videoA?.path();
  const pathB = await videoB?.path();
  if (!pathA || !pathB) {
    throw new Error('hero capture produced no video');
  }
  renameSync(pathA, `${OUT}/hero-left.webm`);
  renameSync(pathB, `${OUT}/hero-right.webm`);
});
