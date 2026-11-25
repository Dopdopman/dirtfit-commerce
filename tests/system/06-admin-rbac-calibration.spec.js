import { expect, test } from '@playwright/test';
import { signInViaUi } from './fixtures/test-helpers.js';

test.describe('E2E-06: Admin RBAC 403 Guard, 4-Tab Blueprint Calibration & Audit Logs', () => {
  test('blocks CUSTOMER on /admin, hides Chatbot widget on /admin/*, inspects 4 bike tabs + calibration canvas & loads audit logs', async ({
    page,
  }) => {
    // 1. CUSTOMER cannot access /admin -> shows 403 Forbidden UI
    await signInViaUi(page, 'rider@dirtfit.vn', 'Rider@DirtFit2026!');
    await page.goto('/admin');
    await expect(page.locator('body')).toContainText(/403 Forbidden|do not have access/i);

    // Switch Account button clears session and redirects to /login
    await page.getByRole('button', { name: /Switch Account/i }).click();
    await page.waitForURL(/\/login/, { timeout: 15_000 });

    // 2. ADMIN logs in and navigates to /admin/bikes
    await signInViaUi(page, 'admin@dirtfit.vn', 'Admin@DirtFit2026!');
    await page.goto('/admin/bikes');

    // Verify Storefront Chatbot trigger is strictly hidden on /admin/*
    await expect(page.getByTestId('chat-widget-trigger')).toHaveCount(0);

    // Open first seeded bike's detail & calibration workspace
    const detailLink = page.locator('a[href^="/admin/bikes/"]').first();
    await expect(detailLink).toBeVisible();
    await detailLink.click();
    await page.waitForURL(/\/admin\/bikes\/[0-9a-f-]+/);

    // Confirm all 4 tabs exist & Calibration tab canvas + SVG anchor handles render
    const tabList = page.getByRole('tablist');
    await expect(tabList.getByRole('tab')).toHaveCount(4);

    const calibrationSvg = page.locator('svg[viewBox]').first();
    await expect(calibrationSvg).toBeVisible();
    await expect(page.locator('body')).toContainText(/GROUND V=/);

    // Toggle Rider Overlay button interactively
    const overlayToggle = page.getByRole('button', { name: /Rider Overlay|170cm/i }).first();
    if ((await overlayToggle.count()) > 0) {
      await overlayToggle.click();
      await overlayToggle.click();
    }

    // 3. Visit /admin/audit-logs -> table renders without errors
    await page.goto('/admin/audit-logs');
    await expect(page.locator('h1')).toContainText(/Audit Logs/i);
    await expect(page.locator('table')).toBeVisible();
  });
});
