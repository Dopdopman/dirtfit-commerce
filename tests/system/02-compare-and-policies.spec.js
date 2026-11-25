import { expect, test } from '@playwright/test';

test.describe('E2E-02: Ghost Overlay Bike Comparison & Bilingual Policy Documents', () => {
  test('compares Honda CRF300L vs KTM 350 EXC-F in Ghost Overlay and browses EN/VI policy pages with TOC', async ({
    page,
  }) => {
    // 1. Navigate to /compare with Honda CRF300L and KTM 350 EXC-F
    await page.goto('/compare?bikeA=honda-crf300l&bikeB=ktm-350-exc-f');
    const main = page.locator('main');
    await expect(main.locator('svg').first()).toBeVisible();

    const deltaTable = main.locator('table');
    await expect(deltaTable).toBeVisible();
    await expect(deltaTable).toContainText('Honda CRF300L');
    await expect(deltaTable).toContainText('KTM 350 EXC-F');
    // Unladen seat delta: 963mm - 880mm = +83 mm (or signed)
    await expect(deltaTable).toContainText('83 mm');

    // 2. Navigate via Footer to Ordering, Terms, and Warranty policy pages in EN & VI
    await page.locator('footer a[href="/policies/ordering"]').click();
    await page.waitForURL('/policies/ordering');
    await expect(page.locator('h1')).toContainText(/Ordering|Deposit/i);
    await expect(page.locator('aside a[href^="#"]').first()).toBeVisible();

    // Verify anchor jump inside TOC
    const firstTocHref = await page.locator('aside a[href^="#"]').first().getAttribute('href');
    expect(firstTocHref).toBeTruthy();
    await page.locator(`aside a[href="${firstTocHref}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/policies/ordering${firstTocHref}`));

    // Visit Terms & Warranty pages cleanly in EN
    await page.goto('/policies/terms');
    await expect(page.locator('h1')).toContainText(/Terms/i);

    await page.goto('/policies/warranty');
    await expect(page.locator('h1')).toContainText(/Warranty/i);

    // Switch to VI via LocaleToggle and verify SSR reload renders Vietnamese policies
    const langGroup = page.getByRole('group', { name: 'Language selector' });
    await langGroup.getByRole('button', { name: 'VI' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await page.reload();
    await expect(page.locator('h1')).toContainText(/Bảo hành|Đổi trả/i);

    // Reset back to EN so subsequent tests start cleanly in default EN locale
    await langGroup.getByRole('button', { name: 'EN' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});
