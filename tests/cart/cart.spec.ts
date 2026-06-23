import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { InventoryPage } from '../../pages/InventoryPage';
import { CartPage } from '../../pages/CartPage';
import { USERS, PRODUCTS } from '../../utils/test-data';

test.describe('Shopping Cart', () => {
  let inventoryPage: InventoryPage;
  let cartPage: CartPage;

  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    inventoryPage = new InventoryPage(page);
    cartPage = new CartPage(page);

    await loginPage.goto();
    await loginPage.login(USERS.standard.username, USERS.standard.password);
    await inventoryPage.expectLoaded();
  });

  test('TC-CART-01: empty cart shows no items', async () => {
    await inventoryPage.goToCart();
    await cartPage.expectLoaded();
    expect(await cartPage.getItemCount()).toBe(0);
  });

  test('TC-CART-02: added product appears in cart', async () => {
    await inventoryPage.addToCartByName(PRODUCTS.backpack);
    await inventoryPage.goToCart();
    await cartPage.expectLoaded();

    const names = await cartPage.getItemNames();
    expect(names).toContain(PRODUCTS.backpack);
  });

  test('TC-CART-03: multiple added products all appear in cart', async () => {
    await inventoryPage.addToCartByName(PRODUCTS.backpack);
    await inventoryPage.addToCartByName(PRODUCTS.bikeLight);
    await inventoryPage.goToCart();

    const names = await cartPage.getItemNames();
    expect(names).toContain(PRODUCTS.backpack);
    expect(names).toContain(PRODUCTS.bikeLight);
    expect(await cartPage.getItemCount()).toBe(2);
  });

  test('TC-CART-04: item prices in cart match inventory prices', async () => {
    await inventoryPage.addToCartByName(PRODUCTS.backpack);
    await inventoryPage.goToCart();
    const prices = await cartPage.getItemPrices();
    // Sauce Labs Backpack = $29.99
    expect(prices[0]).toBe(29.99);
  });

  test('TC-CART-05: removing item from cart removes it from the list', async () => {
    await inventoryPage.addToCartByName(PRODUCTS.backpack);
    await inventoryPage.addToCartByName(PRODUCTS.bikeLight);
    await inventoryPage.goToCart();

    await cartPage.removeItem(PRODUCTS.backpack);
    const names = await cartPage.getItemNames();
    expect(names).not.toContain(PRODUCTS.backpack);
    expect(names).toContain(PRODUCTS.bikeLight);
  });

  test('TC-CART-06: Continue Shopping returns to inventory', async ({ page }) => {
    await inventoryPage.goToCart();
    await cartPage.continueShopping();
    await inventoryPage.expectLoaded();
  });

  test('TC-CART-07: Checkout button navigates to checkout step 1', async ({ page }) => {
    await inventoryPage.addToCartByName(PRODUCTS.backpack);
    await inventoryPage.goToCart();
    await cartPage.checkout();
    await expect(page).toHaveURL(/checkout-step-one/);
  });

  test('TC-CART-08: cart persists items after navigating back to inventory', async () => {
    await inventoryPage.addToCartByName(PRODUCTS.backpack);
    await inventoryPage.goToCart();
    await cartPage.continueShopping();

    // Cart badge should still show 1
    expect(await inventoryPage.getCartCount()).toBe(1);
  });
});
