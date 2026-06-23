import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { InventoryPage } from '../../pages/InventoryPage';
import { CartPage } from '../../pages/CartPage';
import { CheckoutPage } from '../../pages/CheckoutPage';
import { USERS, PRODUCTS, CHECKOUT_INFO, ERROR_MESSAGES } from '../../utils/test-data';

test.describe('Checkout Flow', () => {
  let inventoryPage: InventoryPage;
  let cartPage: CartPage;
  let checkoutPage: CheckoutPage;

  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    inventoryPage = new InventoryPage(page);
    cartPage = new CartPage(page);
    checkoutPage = new CheckoutPage(page);

    // Standard setup: login → add product → open cart → begin checkout
    await loginPage.goto();
    await loginPage.login(USERS.standard.username, USERS.standard.password);
    await inventoryPage.addToCartByName(PRODUCTS.backpack);
    await inventoryPage.addToCartByName(PRODUCTS.bikeLight);
    await inventoryPage.goToCart();
    await cartPage.checkout();
  });

  // ─── Step 1: Info ────────────────────────────────────────────────────────────

  test('TC-CHK-01: checkout step 1 loads with info form', async () => {
    await checkoutPage.expectStep1Loaded();
    await expect(checkoutPage.firstNameInput).toBeVisible();
    await expect(checkoutPage.lastNameInput).toBeVisible();
    await expect(checkoutPage.postalCodeInput).toBeVisible();
  });

  test('TC-CHK-02: missing first name shows error', async () => {
    const { firstName, lastName, postalCode } = CHECKOUT_INFO.missingFirstName;
    await checkoutPage.fillInfo(firstName, lastName, postalCode);
    await checkoutPage.expectInfoError(ERROR_MESSAGES.missingFirstName);
  });

  test('TC-CHK-03: missing last name shows error', async () => {
    const { firstName, lastName, postalCode } = CHECKOUT_INFO.missingLastName;
    await checkoutPage.fillInfo(firstName, lastName, postalCode);
    await checkoutPage.expectInfoError(ERROR_MESSAGES.missingLastName);
  });

  test('TC-CHK-04: missing postal code shows error', async () => {
    const { firstName, lastName, postalCode } = CHECKOUT_INFO.missingPostalCode;
    await checkoutPage.fillInfo(firstName, lastName, postalCode);
    await checkoutPage.expectInfoError(ERROR_MESSAGES.missingPostalCode);
  });

  test('TC-CHK-05: valid info proceeds to step 2', async ({ page }) => {
    const { firstName, lastName, postalCode } = CHECKOUT_INFO.valid;
    await checkoutPage.fillInfo(firstName, lastName, postalCode);
    await checkoutPage.expectStep2Loaded();
  });

  test('TC-CHK-06: cancel on step 1 returns to cart', async ({ page }) => {
    await checkoutPage.cancelButton.click();
    await expect(page).toHaveURL(/cart/);
  });

  // ─── Step 2: Overview ────────────────────────────────────────────────────────

  test('TC-CHK-07: step 2 shows ordered items', async () => {
    const { firstName, lastName, postalCode } = CHECKOUT_INFO.valid;
    await checkoutPage.fillInfo(firstName, lastName, postalCode);
    await checkoutPage.expectStep2Loaded();

    const count = await checkoutPage.summaryItems.count();
    expect(count).toBe(2);
  });

  test('TC-CHK-08: step 2 total = subtotal + tax', async () => {
    const { firstName, lastName, postalCode } = CHECKOUT_INFO.valid;
    await checkoutPage.fillInfo(firstName, lastName, postalCode);
    await checkoutPage.expectStep2Loaded();

    const subtotal = await checkoutPage.getSubtotal();
    const total    = await checkoutPage.getTotal();
    const taxText  = await checkoutPage.taxLabel.textContent() ?? '';
    const tax      = parseFloat(taxText.replace(/[^0-9.]/g, ''));

    expect(total).toBeCloseTo(subtotal + tax, 2);
  });

  test('TC-CHK-09: subtotal matches sum of item prices', async () => {
    const { firstName, lastName, postalCode } = CHECKOUT_INFO.valid;
    await checkoutPage.fillInfo(firstName, lastName, postalCode);

    // Backpack $29.99 + Bike Light $9.99 = $39.98
    const subtotal = await checkoutPage.getSubtotal();
    expect(subtotal).toBeCloseTo(39.98, 2);
  });

  // ─── Step 3: Completion ──────────────────────────────────────────────────────

  test('TC-CHK-10: completing checkout shows order confirmation', async ({ page }) => {
    const { firstName, lastName, postalCode } = CHECKOUT_INFO.valid;
    await checkoutPage.fillInfo(firstName, lastName, postalCode);
    await checkoutPage.finish();
    await checkoutPage.expectOrderComplete();
  });

  test('TC-CHK-11: Back Home button after order returns to inventory', async ({ page }) => {
    const { firstName, lastName, postalCode } = CHECKOUT_INFO.valid;
    await checkoutPage.fillInfo(firstName, lastName, postalCode);
    await checkoutPage.finish();
    await checkoutPage.backToHome();
    await inventoryPage.expectLoaded();
  });

  test('TC-CHK-12: cart is empty after successful order', async () => {
    const { firstName, lastName, postalCode } = CHECKOUT_INFO.valid;
    await checkoutPage.fillInfo(firstName, lastName, postalCode);
    await checkoutPage.finish();
    await checkoutPage.backToHome();
    expect(await inventoryPage.getCartCount()).toBe(0);
  });
});
