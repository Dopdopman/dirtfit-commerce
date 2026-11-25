import crypto from 'node:crypto';
import { expect } from '@playwright/test';

export const API_BASE_URL = 'http://localhost:4000';
export const WEB_BASE_URL = 'http://localhost:3000';

/**
 * Generate a short collision-free run identifier for System E2E isolation.
 * @returns {string}
 */
export function makeRunId() {
  return crypto.randomUUID().slice(0, 8);
}

/**
 * Compute a deterministic future YYYY-MM-DD date far from seeded test rides (2026-12-15..17).
 * @param {number} [offsetDays]
 * @returns {string}
 */
export function makeFutureTestRideDate(offsetDays = 40) {
  const target = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return target.toISOString().slice(0, 10);
}

/**
 * Sign in via the Storefront `/login` UI and wait for redirect completion.
 * @param {import('@playwright/test').Page} page
 * @param {string} email
 * @param {string} password
 * @param {RegExp} [expectedUrl]
 * @returns {Promise<void>}
 */
export async function signInViaUi(
  page,
  email,
  password,
  expectedUrl = /\/(account|admin|checkout)/
) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(expectedUrl, { timeout: 20_000 });
}

/**
 * Move a Radix Slider (`[role="slider"]`) step-by-step via keyboard ArrowLeft/ArrowRight.
 * @param {import('@playwright/test').Locator} sliderThumb
 * @param {'ArrowLeft'|'ArrowRight'} key
 * @param {number} steps
 * @returns {Promise<void>}
 */
export async function nudgeRadixSlider(sliderThumb, key, steps) {
  await sliderThumb.focus();
  for (let i = 0; i < steps; i += 1) {
    await sliderThumb.press(key);
  }
}

/**
 * Verify that page text contains no unexpected `NaN` tokens.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
export async function expectNoNaN(page) {
  const bodyText = await page.locator('main').innerText();
  expect(bodyText).not.toMatch(/\bNaN\b/);
}
