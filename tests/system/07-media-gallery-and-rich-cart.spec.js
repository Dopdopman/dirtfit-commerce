import { expect, test } from '@playwright/test';
import { API_BASE_URL, signInViaUi } from './fixtures/test-helpers.js';

// Valid 1x1 PNG buffer passing 4KB Magic Bytes verification and Chromium decode (naturalWidth > 0)
const VALID_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64'
);

/**
 * Assert that a Playwright image locator is visible and completely decoded in Chromium (`naturalWidth > 0`).
 * @param {import('@playwright/test').Locator} imgLocator
 * @returns {Promise<void>}
 */
async function expectImageLoaded(imgLocator) {
  await expect(imgLocator).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(
      async () => imgLocator.evaluate((el) => Boolean(el && el.complete && el.naturalWidth > 0)),
      {
        message: 'Expected <img> element to decode with naturalWidth > 0',
        timeout: 15_000,
      }
    )
    .toBe(true);
}

test.describe('E2E-07: Real Product Media Upload, Gallery & Lightbox, Accessories ?sku Deep-Link & Rich Cart', () => {
  test('uploads real bike & accessory photos via Admin UI, verifies Storefront galleries, ?sku deep-link & Checkout thumbnails cleanly', async ({
    page,
  }) => {
    const targetBikeSlug = 'honda-crf300l';
    const targetBikeName = 'Honda CRF300L';
    const targetAccessorySku = 'ACC-ZETA-LINK-30';

    let uploadedBikeId = null;
    const uploadedBikeMediaIds = [];
    let uploadedAccessoryId = null;

    try {
      // 1. Admin signs in and opens Honda CRF300L Media & Calibration workspace
      await signInViaUi(page, 'admin@dirtfit.vn', 'Admin@DirtFit2026!');
      await page.goto('/admin/bikes');

      const bikeSearch = page.locator('input[type="search"]').first();
      await bikeSearch.fill(targetBikeName);
      const detailLink = page
        .locator('tr', { hasText: targetBikeName })
        .locator('a[href^="/admin/bikes/"]')
        .first();
      await expect(detailLink).toBeVisible();
      await detailLink.click();
      await page.waitForURL(/\/admin\/bikes\/([0-9a-f-]+)/);

      const urlMatch = page.url().match(/\/admin\/bikes\/([0-9a-f-]+)/);
      uploadedBikeId = urlMatch?.[1] ?? null;
      expect(uploadedBikeId).toBeTruthy();

      // Confirm 2D Blueprint Calibration card below is visible before upload
      await expect(page.locator('svg[viewBox]').first()).toBeVisible();
      await expect(page.locator('body')).toContainText(/GROUND V=/);

      // Upload a real motorcycle cover photo in Card 1 (BikePhotoManager)
      const bikePhotoSection = page.locator('section', { hasText: 'Commercial Product Photos' });
      const confirmBikePromise = page.waitForResponse(
        (res) =>
          res.url().includes(`/api/v1/admin/bikes/${uploadedBikeId}/media/confirm`) &&
          res.request().method() === 'POST'
      );

      await bikePhotoSection.locator('input[type="file"]').setInputFiles({
        name: 'e2e-crf300l-cover.png',
        mimeType: 'image/png',
        buffer: VALID_PNG_BUFFER,
      });

      const confirmBikeRes = await confirmBikePromise;
      expect(confirmBikeRes.status()).toBe(201);
      const confirmBikeJson = await confirmBikeRes.json();
      const createdBikeMediaId = confirmBikeJson?.data?.media?.id;
      if (createdBikeMediaId) {
        uploadedBikeMediaIds.push(createdBikeMediaId);
      }

      await expect(bikePhotoSection).toContainText('COVER PHOTO', { timeout: 15_000 });
      await expectImageLoaded(bikePhotoSection.locator('img').first());

      // Verify 2D Blueprint Calibration card below was NOT overwritten and still renders cleanly
      await expect(page.locator('body')).toContainText(/GROUND V=/);
      await expect(page.locator('svg[viewBox]').first()).toBeVisible();

      // 2. Admin uploads real product photo for accessory ACC-ZETA-LINK-30
      await page.goto('/admin/accessories');
      const accSearch = page.locator('input[type="search"]').first();
      await accSearch.fill(targetAccessorySku);

      const targetRow = page.locator('tr', { hasText: targetAccessorySku }).first();
      await expect(targetRow).toBeVisible();
      await targetRow.getByRole('button', { name: /Edit/i }).click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      const confirmAccPromise = page.waitForResponse(
        (res) =>
          res.url().includes('/api/v1/admin/accessories/') &&
          res.url().includes('/media/confirm') &&
          res.request().method() === 'POST'
      );

      await dialog.locator('input[type="file"]').setInputFiles({
        name: 'e2e-zeta-link.png',
        mimeType: 'image/png',
        buffer: VALID_PNG_BUFFER,
      });

      const confirmAccRes = await confirmAccPromise;
      expect(confirmAccRes.status()).toBe(200);
      const confirmAccJson = await confirmAccRes.json();
      uploadedAccessoryId = confirmAccJson?.data?.accessory?.id ?? null;
      expect(uploadedAccessoryId).toBeTruthy();

      // Close modal and confirm accessory row thumbnail displays live uploaded image
      await dialog.getByRole('button', { name: /Cancel/i }).click();
      await expect(dialog).toBeHidden();
      await expectImageLoaded(targetRow.locator('img').first());

      // 3. Verify Storefront /bikes & /bikes/[slug] real photo rendering + #simulator preservation
      await page.goto('/bikes');
      const catalogCard = page.locator(`main a[href="/bikes/${targetBikeSlug}"]`).first();
      await expect(catalogCard).toBeVisible();
      await expect(catalogCard).toContainText('2D FIT READY');
      await expectImageLoaded(catalogCard.locator('img').first());

      await page.goto(`/bikes/${targetBikeSlug}`);
      await expectImageLoaded(page.locator('main img').first());
      await expect(page.locator('#simulator')).toBeVisible();

      // 4. Verify Storefront /accessories real photo & add both accessory + motorcycle to cart
      await page.goto('/accessories');
      const accCard = page
        .locator('main .grid.gap-5 > div', { hasText: targetAccessorySku })
        .first();
      await expect(accCard).toBeVisible();
      await expectImageLoaded(accCard.locator('img').first());

      const addAccPromise = page.waitForResponse(
        (res) => res.url().includes('/api/v1/cart/items') && res.request().method() === 'POST'
      );
      await accCard.getByRole('button', { name: /Add to Cart/i }).click();
      const addAccRes = await addAccPromise;
      expect([200, 201]).toContain(addAccRes.status());

      // Add motorcycle to cart via detail page Reserve CTA -> /cart
      await page.goto(`/bikes/${targetBikeSlug}`);
      await page
        .getByRole('button', { name: /Add Motorcycle to Cart|Reserve/i })
        .first()
        .click();
      await page.waitForURL('/cart', { timeout: 15_000 });

      // Verify both Cart rows render live thumbnails (`naturalWidth > 0`)
      const cartImgs = page.locator('main img');
      await expect(cartImgs).toHaveCount(2, { timeout: 15_000 });
      await expectImageLoaded(cartImgs.nth(0));
      await expectImageLoaded(cartImgs.nth(1));

      // Click motorcycle link on /cart -> navigates cleanly to /bikes/honda-crf300l
      await page.locator(`main a[href="/bikes/${targetBikeSlug}"]`).first().click();
      await page.waitForURL(`/bikes/${targetBikeSlug}`, { timeout: 15_000 });

      // Return to /cart, click accessory deep-link -> navigates to /accessories?sku=ACC-ZETA-LINK-30 & highlights card
      await page.goto('/cart');
      await page.locator(`main a[href="/accessories?sku=${targetAccessorySku}"]`).first().click();
      await page.waitForURL(/\/accessories\?sku=ACC-ZETA-LINK-30/, { timeout: 15_000 });

      const highlightedCard = page.locator(`[data-highlighted-sku="${targetAccessorySku}"]`);
      await expect(highlightedCard).toBeVisible({ timeout: 15_000 });
      await expectImageLoaded(highlightedCard.locator('img').first());

      // Open /checkout and verify Order Summary <aside> renders live thumbnails
      await page.goto('/checkout');
      const asideImgs = page.locator('aside img');
      await expect(asideImgs).toHaveCount(2, { timeout: 15_000 });
      await expectImageLoaded(asideImgs.nth(0));
      await expectImageLoaded(asideImgs.nth(1));
    } finally {
      // Clear cart and delete uploaded test media cleanly so DB & local storage return to seed state
      try {
        await page.goto('/cart');
        const clearBtn = page.locator('main button', { hasText: /Clear Cart/i });
        if ((await clearBtn.count()) > 0) {
          await clearBtn.click();
        }
      } catch {
        // ignore UI cart cleanup error
      }

      try {
        const loginRes = await page.request.post(`${API_BASE_URL}/api/v1/auth/login`, {
          data: {
            email: 'admin@dirtfit.vn',
            password: 'Admin@DirtFit2026!',
          },
        });
        if (loginRes.ok()) {
          const loginJson = await loginRes.json();
          const token = loginJson?.data?.accessToken;
          if (token) {
            const headers = { authorization: `Bearer ${token}` };
            await page.request.delete(`${API_BASE_URL}/api/v1/cart`, { headers }).catch(() => {});

            if (uploadedBikeId) {
              for (const mediaId of uploadedBikeMediaIds) {
                await page.request
                  .delete(`${API_BASE_URL}/api/v1/admin/bikes/${uploadedBikeId}/media/${mediaId}`, {
                    headers,
                  })
                  .catch(() => {});
              }
            }

            if (uploadedAccessoryId) {
              await page.request
                .delete(`${API_BASE_URL}/api/v1/admin/accessories/${uploadedAccessoryId}/media`, {
                  headers,
                })
                .catch(() => {});
            }
          }
        }
      } catch {
        // ignore API cleanup error
      }
    }
  });
});
