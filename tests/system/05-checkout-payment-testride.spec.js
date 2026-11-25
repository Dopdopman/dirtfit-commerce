import { expect, test } from '@playwright/test';
import { makeFutureTestRideDate, makeRunId } from './fixtures/test-helpers.js';

test.describe('E2E-05: Checkout, COD Guard, Mock Payment -> DEPOSIT_PAID & Test Ride Booking', () => {
  test('blocks COD for motorcycle cart, completes Mock deposit checkout -> DEPOSIT_PAID, and books DN_SON_TRA test ride', async ({
    page,
  }) => {
    const runId = makeRunId();
    const customerEmail = `e2e-buyer-${runId}@dirtfit.test`;
    const slotDate = makeFutureTestRideDate(75 + (Number.parseInt(runId.slice(0, 2), 16) % 60));

    // 1. Register a fresh isolated rider account via /register UI
    await page.goto('/register');
    await page.locator('input[type="email"]').fill(customerEmail);
    const textInputs = page.locator('form input[type="text"]');
    await textInputs.nth(0).fill(`E2E Rider ${runId}`);
    await page.locator('input[type="password"]').fill('StrongPass123!');
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL('/account', { timeout: 20_000 });

    // 2. Add Honda CRF300L to cart via detail page -> /cart -> /checkout
    await page.goto('/bikes/honda-crf300l');
    await page
      .getByRole('button', { name: /Add Motorcycle to Cart|Reserve/i })
      .first()
      .click();
    await page.waitForURL('/cart', { timeout: 15_000 });
    await page.locator('a[href="/checkout"]').click();
    await page.waitForURL('/checkout', { timeout: 15_000 });

    // Verify COD radio option is strictly disabled when motorcycle is in cart
    const codRadio = page.locator('input[type="radio"][name="paymentMethod"][value="COD"]');
    await expect(codRadio).toBeDisabled();

    // Select Mock Sandbox payment, fill phone + street address & place deposit order
    await page.locator('input[type="radio"][name="paymentMethod"][value="MOCK"]').check();
    await page.locator('input[placeholder="0901234567"]').fill('0901234567');
    const streetInput = page.locator('form input[required]').nth(4);
    await streetInput.fill('468 Xa Lo Ha Noi, Linh Trung');
    await page.locator('form button[type="submit"]').click();

    // Complete Mock sandbox payment webhook
    const payMockBtn = page.getByRole('button', { name: /Simulate Instant Sandbox Payment/i });
    await expect(payMockBtn).toBeVisible({ timeout: 15_000 });
    await payMockBtn.click();

    await expect(page.locator('main')).toContainText(/Deposit Paid/i, { timeout: 15_000 });

    // 3. Verify order appears as DEPOSIT_PAID inside /account
    await page.locator('a[href="/account"]').last().click();
    await page.waitForURL('/account');
    await page.getByRole('tab', { name: /Orders & Deposits/i }).click();
    await expect(page.locator('main')).toContainText(/Deposit Paid/i);

    // 4. Book Test Ride at Da Nang (DN_SON_TRA) on collision-free future date
    await page.goto('/test-ride');
    const selects = page.locator('form select');
    // Select 0 = Bike, Select 1 = Showroom, Select 2 = License Class
    await selects.nth(1).selectOption('DN_SON_TRA');
    await page.locator('form input[type="date"]').fill(slotDate);
    await selects.nth(2).selectOption('A2');

    // Click 14:00-15:30 slot button
    const targetSlotBtn = page.getByRole('button', { name: /14:00-15:30/ });
    await expect(targetSlotBtn).toBeEnabled();
    await targetSlotBtn.click();

    await page.locator('form button[type="submit"]').click();
    await expect(page.locator('main')).toContainText(/Test Ride Confirmed/i, { timeout: 15_000 });

    // Verify booking appears in /account -> Test Rides tab and clean up by cancelling
    await page.goto('/account');
    await page.getByRole('tab', { name: /Test Rides/i }).click();
    await expect(page.locator('main')).toContainText('14:00-15:30');
    await page
      .getByRole('button', { name: /Cancel Booking/i })
      .first()
      .click();
  });
});
