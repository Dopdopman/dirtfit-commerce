import { expect, test } from '@playwright/test';

test.describe('E2E-04: AI Support Chatbot Grounded Citations, Ergonomics Mini Card, Feedback & Reset', () => {
  test('answers deposit/COD with clickable Citation Chip, renders 165cm/60kg MiniFitCard -> Simulator, persists across reload, rates UP & resets', async ({
    page,
  }) => {
    await page.goto('/');

    // 1. Open SupportChatWidget and ask deposit/COD policy question
    await page.getByTestId('chat-widget-trigger').click();
    const drawer = page.getByTestId('chat-widget-drawer');
    await expect(drawer).toBeVisible();

    await drawer.locator('input[type="text"]').fill('How do bike deposits and COD rules work?');
    await drawer.locator('form button[type="submit"]').click();

    await expect(drawer).toContainText(/Cash on Delivery|PayOS|prohibited/i);
    const orderingChip = drawer.locator('a[href^="/policies/ordering"]').first();
    await expect(orderingChip).toBeVisible();

    // Click citation chip -> navigates cleanly to /policies/ordering
    await orderingChip.click();
    await page.waitForURL(/\/policies\/ordering/);
    await expect(page.locator('h1')).toContainText(/Ordering|Deposit/i);

    // 2. Reopen drawer and ask for 165cm 60kg Rider Fit advice -> MiniFitCard renders
    await page.getByTestId('chat-widget-trigger').click();
    await expect(drawer).toBeVisible();

    await drawer
      .locator('input[type="text"]')
      .fill("I'm 165cm 60kg — which dual-sport bike fits me?");
    await drawer.locator('form button[type="submit"]').click();

    const simLink = drawer.locator('a[href*="/bikes/"][href*="heightCm=165"]').first();
    await expect(simLink).toBeVisible();
    await expect(drawer).toContainText('mm');

    // Click Open 2D Simulator -> navigates to /bikes/[slug]?heightCm=165&weightKg=60
    await simLink.click();
    await page.waitForURL(/\/bikes\/.+\?heightCm=165&weightKg=60/);
    await expect(page.locator('#simulator')).toContainText('165 cm');
    await expect(page.locator('#simulator')).toContainText('60 kg');

    // 3. Reload page -> reopen chat -> persisted messages still present -> rate UP -> Reset
    await page.reload();
    await page.getByTestId('chat-widget-trigger').click();
    await expect(drawer).toContainText('How do bike deposits and COD rules work?');
    await expect(drawer).toContainText("I'm 165cm 60kg");

    const upButton = drawer.getByRole('button', { name: /Mark helpful/i }).first();
    await upButton.click();
    await expect(upButton).toHaveClass(/border-emerald-600/);

    await drawer.getByRole('button', { name: /Reset chat/i }).click();
    await expect(drawer).toContainText(/Quick Prompts/i);
  });
});
