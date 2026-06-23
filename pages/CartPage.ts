import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for the Sauce Demo Cart Page
 * URL: https://www.saucedemo.com/cart.html
 */
export class CartPage {
  readonly page: Page;

  // Locators
  readonly pageTitle: Locator;
  readonly cartItems: Locator;
  readonly continueShoppingButton: Locator;
  readonly checkoutButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageTitle              = page.locator('.title');
    this.cartItems              = page.locator('.cart_item');
    this.continueShoppingButton = page.locator('[data-test="continue-shopping"]');
    this.checkoutButton         = page.locator('[data-test="checkout"]');
  }

  /** Assert we landed on the cart page */
  async expectLoaded() {
    await expect(this.page).toHaveURL(/cart/);
    await expect(this.pageTitle).toHaveText('Your Cart');
  }

  /** Get all item names in the cart */
  async getItemNames(): Promise<string[]> {
    return this.cartItems
      .locator('.inventory_item_name')
      .allTextContents();
  }

  /** Get all item prices in the cart */
  async getItemPrices(): Promise<number[]> {
    const texts = await this.cartItems
      .locator('.inventory_item_price')
      .allTextContents();
    return texts.map(t => parseFloat(t.replace('$', '')));
  }

  /** Remove an item from cart by name */
  async removeItem(itemName: string) {
    const item = this.cartItems.filter({ hasText: itemName });
    await item.locator('button').click();
  }

  /** Get number of items in cart */
  async getItemCount(): Promise<number> {
    return this.cartItems.count();
  }

  /** Proceed to checkout */
  async checkout() {
    await this.checkoutButton.click();
  }

  /** Go back to shopping */
  async continueShopping() {
    await this.continueShoppingButton.click();
  }
}
