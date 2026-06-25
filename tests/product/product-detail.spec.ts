import { test, expect } from '@playwright/test';
import { LoginPage }         from '../../pages/LoginPage';
import { ProductDetailPage } from '../../pages/ProductDetailPage';
import { InventoryPage }     from '../../pages/InventoryPage';
import { USERS }             from '../../utils/test-data';

test.describe('Product Detail Page', () => {
  let loginPage:         LoginPage;
  let productDetailPage: ProductDetailPage;
  let inventoryPage:     InventoryPage;

  test.beforeEach(async ({ page }) => {
    loginPage         = new LoginPage(page);
    productDetailPage = new ProductDetailPage(page);
    inventoryPage     = new InventoryPage(page);

    await loginPage.goto();
    await loginPage.login(USERS.standard.username, USERS.standard.password);
    await inventoryPage.expectLoaded();
    await productDetailPage.goto(4);
    await productDetailPage.expectLoaded();
  });

  // Checks that the product name, description and price are all visible on the detail page
  test('TC-PROD-01: product detail page displays name, description and price', async () => {
    await expect(productDetailPage.productName).toBeVisible();
    await expect(productDetailPage.productDesc).toBeVisible();
    await expect(productDetailPage.productPrice).toBeVisible();

    const price = await productDetailPage.getPriceAsNumber();
    expect(price).toBeGreaterThan(0);
  });

  // Checks that clicking Add to Cart increases the cart badge count from 0 to 1
  test('TC-PROD-02: adding product to cart updates the cart badge', async () => {
    const countBefore = await productDetailPage.getCartCount();
    expect(countBefore).toBe(0);

    await productDetailPage.addToCart();

    const countAfter = await productDetailPage.getCartCount();
    expect(countAfter).toBe(1);
  });

  // Checks that clicking Back to Products returns the user to the inventory page
  test('TC-PROD-03: back to products button navigates to inventory page', async () => {
    await productDetailPage.goBackToProducts();
    await inventoryPage.expectLoaded();
  });
});
