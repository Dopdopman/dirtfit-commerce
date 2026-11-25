import { expect, test } from '@playwright/test';
import { makeRunId } from './fixtures/test-helpers.js';

test.describe('E2E-03: Google OAuth 2.0 Mock Flow + Guest Cart & Chat Session Merge', () => {
  test('merges anonymous guest cart accessory and chat message into Google OAuth account on /auth/callback', async ({
    page,
  }) => {
    const runId = makeRunId();
    const guestQuestion = `Check PayOS VietQR hold window ref ${runId}`;

    // 1. Ensure English default & add an accessory as anonymous guest on /accessories
    await page.goto('/accessories');
    const addButtons = page.getByRole('button', { name: /Add to Cart/i });
    await expect(addButtons.first()).toBeVisible();
    await addButtons.first().click();

    await expect
      .poll(async () => {
        const text = await page.locator('header a[href="/cart"]').innerText();
        const nums = text.match(/\d+/g);
        return nums ? Number(nums[nums.length - 1]) : 0;
      })
      .toBeGreaterThanOrEqual(1);

    // 2. Open SupportChatWidget as anonymous guest and send 1 unique message
    await page.getByTestId('chat-widget-trigger').click();
    const drawer = page.getByTestId('chat-widget-drawer');
    await expect(drawer).toBeVisible();
    await drawer.locator('input[type="text"]').fill(guestQuestion);
    await drawer.locator('form button[type="submit"]').click();
    await expect(drawer).toContainText(guestQuestion);
    await expect(drawer).toContainText('15');
    await drawer.getByRole('button', { name: /Close chat/i }).click();

    // 3. Visit /login and click Continue with Google (mock-authorize non-prod flow)
    await page.goto('/login');
    const googleBtn = page.getByTestId('google-oauth-btn');
    await expect(googleBtn).toBeVisible();
    await googleBtn.click();

    // Wait through OAuth callback -> /auth/callback -> /account
    await page.waitForURL('/account', { timeout: 25_000 });
    await expect(page.locator('header a[href="/account"]')).toBeVisible();

    // Verify Google Connected badge renders on /account
    await expect(page.locator('main')).toContainText(/Connected/i);

    // 4. Verify guest cart item survived into authenticated /cart
    await page.goto('/cart');
    await expect(page.locator('main')).not.toContainText(/currently empty/i);
    await expect(page.locator('main button', { hasText: /Clear Cart/i })).toBeVisible();

    // 5. Verify guest chat history merged into authenticated Chatbot session
    await page.getByTestId('chat-widget-trigger').click();
    const mergedDrawer = page.getByTestId('chat-widget-drawer');
    await expect(mergedDrawer).toContainText(guestQuestion);

    // Clean up chat & cart state for this mock account
    await mergedDrawer.getByRole('button', { name: /Reset chat/i }).click();
    await mergedDrawer.getByRole('button', { name: /Close chat/i }).click();
    await page.locator('main button', { hasText: /Clear Cart/i }).click();
  });
});
