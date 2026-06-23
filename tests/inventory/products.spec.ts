import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { InventoryPage } from '../../pages/InventoryPage';
import { USERS, PRODUCTS } from '../../utils/test-data';

test.describe('Product Inventory', () => {
  let inventoryPage: InventoryPage;

  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    inventoryPage = new InventoryPage(page);
    await loginPage.goto();
    await loginPage.login(USERS.standard.username, USERS.standard.password);
    await inventoryPage.expectLoaded();
  });

  // ─── Display ─────────────────────────────────────────────────────────────────

  test('TC-INV-01: inventory page shows 6 products', async () => {
    const count = await inventoryPage.productItems.count();
    expect(count).toBe(6);
  });

  test('TC-INV-02: each product has a name, description, price and image', async ({ page }) => {
    const items = inventoryPage.productItems;
    const count = await items.count();
    for (let i = 0; i < count; i++) {
      const item = items.nth(i);
      await expect(item.locator('.inventory_item_name')).toBeVisible();
      await expect(item.locator('.inventory_item_desc')).toBeVisible();
      await expect(item.locator('.inventory_item_price')).toBeVisible();
      await expect(item.locator('img')).toBeVisible();
    }
  });

  test('TC-INV-03: each product has an Add to Cart button', async () => {
    const buttons = inventoryPage.productItems.locator('button');
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      await expect(buttons.nth(i)).toContainText('Add to cart');
    }
  });

  // ─── Sorting ─────────────────────────────────────────────────────────────────

  test('TC-INV-04: sort A-Z orders products alphabetically', async () => {
    await inventoryPage.sortBy('az');
    const names = await inventoryPage.getProductNames();
    expect(names).toEqual([...names].sort());
  });

  test('TC-INV-05: sort Z-A orders products in reverse alphabetical order', async () => {
    await inventoryPage.sortBy('za');
    const names = await inventoryPage.getProductNames();
    expect(names).toEqual([...names].sort().reverse());
  });

  test('TC-INV-06: sort low-to-high orders products by ascending price', async () => {
    await inventoryPage.sortBy('lohi');
    const prices = await inventoryPage.getProductPrices();
    const sorted = [...prices].sort((a, b) => a - b);
    expect(prices).toEqual(sorted);
  });

  test('TC-INV-07: sort high-to-low orders products by descending price', async () => {
    await inventoryPage.sortBy('hilo');
    const prices = await inventoryPage.getProductPrices();
    const sorted = [...prices].sort((a, b) => b - a);
    expect(prices).toEqual(sorted);
  });

  // ─── Cart Interaction ─────────────────────────────────────────────────────────

  test('TC-INV-08: adding a product increments the cart badge', async () => {
    expect(await inventoryPage.getCartCount()).toBe(0);
    await inventoryPage.addToCartByName(PRODUCTS.backpack);
    expect(await inventoryPage.getCartCount()).toBe(1);
  });

  test('TC-INV-09: adding multiple products updates badge count correctly', async () => {
    await inventoryPage.addToCartByName(PRODUCTS.backpack);
    await inventoryPage.addToCartByName(PRODUCTS.bikeLight);
    await inventoryPage.addToCartByName(PRODUCTS.boltShirt);
    expect(await inventoryPage.getCartCount()).toBe(3);
  });

  test('TC-INV-10: Add to Cart button changes to Remove after adding', async () => {
    const item = inventoryPage.productItems.filter({ hasText: PRODUCTS.backpack });
    await item.locator('button').click();
    await expect(item.locator('button')).toHaveText('Remove');
  });

  test('TC-INV-11: removing a product decrements the cart badge', async () => {
    await inventoryPage.addToCartByName(PRODUCTS.backpack);
    expect(await inventoryPage.getCartCount()).toBe(1);
    await inventoryPage.removeFromCartByName(PRODUCTS.backpack);
    expect(await inventoryPage.getCartCount()).toBe(0);
  });

  // ─── Navigation ──────────────────────────────────────────────────────────────

  test('TC-INV-12: clicking a product name navigates to its detail page', async ({ page }) => {
    const firstName = (await inventoryPage.getProductNames())[0];
    await inventoryPage.productItems.first().locator('.inventory_item_name').click();
    await expect(page).toHaveURL(/inventory-item/);
  });

  test('TC-INV-13: cart icon navigates to cart page', async ({ page }) => {
    await inventoryPage.goToCart();
    await expect(page).toHaveURL(/cart/);
  });
});
