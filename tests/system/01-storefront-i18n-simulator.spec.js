import { expect, test } from '@playwright/test';
import { expectNoNaN, nudgeRadixSlider } from './fixtures/test-helpers.js';

test.describe('E2E-01: Storefront i18n EN/VI Cookie Persistence, Quick Fit & 2D Simulator', () => {
  test('renders default EN locale, persists VI across reload, updates 2D Simulator telemetry & adds Smart Upsell combo to cart', async ({
    page,
  }) => {
    // 1. Default locale EN + /icon.svg returns 200
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    const iconRes = await page.request.get('/icon.svg');
    expect(iconRes.status()).toBe(200);

    // 2. Toggle EN -> VI and reload -> cookie dirtfit_locale persists
    const langGroup = page.getByRole('group', { name: 'Language selector' });
    await langGroup.getByRole('button', { name: 'VI' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');

    // Switch back to EN for consistent assertions below
    await langGroup.getByRole('button', { name: 'EN' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    // 3. Submit Quick Fit Bar on homepage
    const quickFitForm = page.locator('form').first();
    const numInputs = quickFitForm.locator('input[type="number"]');
    await numInputs.nth(0).fill('162');
    await numInputs.nth(1).fill('58');
    await quickFitForm.locator('button[type="submit"]').click();
    await page.waitForURL(/\/bikes\?.*heightCm=162.*weightKg=58/);

    // 4. Open KTM 350 EXC-F 2D Simulator & adjust sliders + lowering mods
    await page.goto('/bikes/ktm-350-exc-f');
    const simSection = page.locator('#simulator');
    await expect(simSection).toBeVisible();

    const sliders = simSection.locator('[role="slider"]');
    await expect(sliders).toHaveCount(3);

    // Capture initial effective seat height readout
    const loadedSeatLocator = simSection
      .locator('text=Loaded Seat Height')
      .locator('..')
      .locator('div')
      .nth(1);
    const initialSeatText = await loadedSeatLocator.innerText();
    const initialSeatMm = Number.parseInt(initialSeatText, 10);
    expect(Number.isFinite(initialSeatMm)).toBe(true);

    // Nudge Height down (-4cm -> 158cm) and Weight up (+5kg -> 63kg) -> telemetry updates without NaN
    await nudgeRadixSlider(sliders.nth(0), 'ArrowLeft', 4);
    await nudgeRadixSlider(sliders.nth(1), 'ArrowRight', 5);
    await expectNoNaN(page);

    const afterWeightSeatText = await loadedSeatLocator.innerText();
    const afterWeightSeatMm = Number.parseInt(afterWeightSeatText, 10);
    expect(afterWeightSeatMm).toBeLessThanOrEqual(initialSeatMm);

    // Toggle Lowering Link & Low Seat buttons -> effective seat height drops significantly
    await simSection.getByRole('button', { name: /Lowering Link/i }).click();
    await simSection.getByRole('button', { name: /Low Comfort Seat/i }).click();
    const afterModSeatText = await loadedSeatLocator.innerText();
    const afterModSeatMm = Number.parseInt(afterModSeatText, 10);
    expect(afterModSeatMm).toBeLessThan(afterWeightSeatMm - 35);

    // 5. Add Smart Upsell combo bundle to cart and verify header Cart counter increments >= 2
    const upsellBtn = simSection.getByRole('button', { name: /Add Bike \+ Lowering Combo/i });
    await expect(upsellBtn).toBeVisible();
    await upsellBtn.click();

    const cartLink = page.locator('header a[href="/cart"]');
    await expect
      .poll(async () => {
        const text = await cartLink.innerText();
        const nums = text.match(/\d+/g);
        return nums ? Number(nums[nums.length - 1]) : 0;
      })
      .toBeGreaterThanOrEqual(2);
  });
});
