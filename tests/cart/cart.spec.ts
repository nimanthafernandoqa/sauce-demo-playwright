import { test, expect } from '@playwright/test';
import { CartPage } from '../../pages/CartPage';
import { LoginPage } from '../../pages/LoginPage';
import { InventoryPage } from '../../pages/InventoryPage';

test.describe('Cart Page', () => {
  let cartPage: CartPage;
  let loginPage: LoginPage;
  let inventoryPage: InventoryPage;

  test.beforeEach(async ({ page }) => {
    cartPage = new CartPage(page);
    loginPage = new LoginPage(page);
    inventoryPage = new InventoryPage(page);

    // Log in and add items to cart
    await loginPage.goto();
    await loginPage.login('standard_user', 'secret_sauce');
    await inventoryPage.expectLoaded();
  });

  // Verify that cart column headers are visible for quantity and description
  test('TC-CART-09: cart displays quantity and description column headers', async () => {
    await inventoryPage.addToCartByName('Sauce Labs Backpack');
    await inventoryPage.goToCart();
    await cartPage.expectLoaded();
    await cartPage.expectQuantityLabelVisible();
    await cartPage.expectDescriptionLabelVisible();
  });

  // Verify that the burger menu can be opened and closed on the cart page
  test('TC-CART-10: burger menu opens and closes on cart page', async ({ page }) => {
    await cartPage.goto();
    await cartPage.expectLoaded();
    await cartPage.openMenu();
    await expect(cartPage.allItemsLink).toBeVisible();
    await cartPage.closeMenu();
    await expect(cartPage.allItemsLink).not.toBeVisible();
  });

  // Verify that the footer is visible on the cart page
  test('TC-CART-11: footer displays with social links on cart page', async () => {
    await cartPage.goto();
    await cartPage.expectLoaded();
    await cartPage.expectFooterVisible();
    const twitterUrl = await cartPage.getTwitterUrl();
    expect(twitterUrl).toBe('https://twitter.com/saucelabs');
  });
});