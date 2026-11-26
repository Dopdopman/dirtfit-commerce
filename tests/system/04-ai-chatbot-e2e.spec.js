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

    // 3. Reopen drawer -> ask "tôi muốn mua xe" (EN UI) -> verify inline bike link + CompactBikeCard & zero privacy-data noise -> click to navigate
    await page.getByTestId('chat-widget-trigger').click();
    await expect(drawer).toBeVisible();

    await drawer.locator('input[type="text"]').fill('tôi muốn mua xe');
    await drawer.locator('form button[type="submit"]').click();

    const inlineBikeLink = drawer.locator('li a[href^="/bikes/"]').first();
    await expect(inlineBikeLink).toBeVisible();
    await expect(drawer).not.toContainText('[privacy-data]');

    const compactCard = drawer.getByTestId('chat-compact-bike-card').first();
    await expect(compactCard).toBeVisible();

    const targetHref = await compactCard.getAttribute('href');
    expect(targetHref).toMatch(/^\/bikes\/[a-z0-9-]+$/);

    await compactCard.click();
    await page.waitForURL(/\/bikes\/[a-z0-9-]+$/);
    await expect(page.locator('h1')).toBeVisible();

    // Also verify direct navigation from inline clickable bike link inside message body
    await page.getByTestId('chat-widget-trigger').click();
    await expect(drawer).toBeVisible();
    const secondInlineLink = drawer.locator('li a[href^="/bikes/"]').nth(1);
    await expect(secondInlineLink).toBeVisible();
    const secondHref = await secondInlineLink.getAttribute('href');
    await secondInlineLink.click();
    await page.waitForURL(new RegExp(`${secondHref}$`));
    await expect(page.locator('h1')).toBeVisible();

    // Verify v2.1.3 brand NLU & seat-height spec scoping with zero raw enums
    // Note: clicking an inline link keeps the drawer open on desktop (>=768px)
    await expect(drawer).toBeVisible();
    await drawer.locator('input[type="text"]').fill('có xe ktm không');
    await drawer.locator('form button[type="submit"]').click();
    await expect(drawer).toContainText('KTM 350 EXC-F');
    await expect(
      drawer.locator('a[data-testid="chat-compact-bike-card"][href="/bikes/ktm-350-exc-f"]')
    ).toHaveCount(1);
    await expect(drawer).not.toContainText('ENDURO');
    await expect(drawer).not.toContainText('DUAL_SPORT');
    await expect(drawer).not.toContainText('OUT_OF_SCOPE');
    await expect(drawer).not.toContainText('@dirtfit/');

    await drawer.locator('input[type="text"]').fill('chiều cao yên của ktm là bao nhiêu');
    await drawer.locator('form button[type="submit"]').click();
    await expect(drawer).toContainText('963 mm');
    await expect(
      drawer.locator('a[data-testid="chat-compact-bike-card"][href="/bikes/ktm-350-exc-f"]')
    ).toHaveCount(2);

    // 4. Reload page -> reopen chat -> persisted messages still present -> rate UP -> Reset
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
