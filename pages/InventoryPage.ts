import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for the Sauce Demo Inventory (Products) Page
 * URL: https://www.saucedemo.com/inventory.html
 */
export class InventoryPage {
  readonly page: Page;

  // Locators
  readonly pageTitle: Locator;
  readonly productItems: Locator;
  readonly sortDropdown: Locator;
  readonly cartIcon: Locator;
  readonly cartBadge: Locator;
  readonly burgerMenu: Locator;
  readonly logoutLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageTitle    = page.locator('.title');
    this.productItems = page.locator('.inventory_item');
    this.sortDropdown = page.locator('[data-test="product-sort-container"]');
    this.cartIcon     = page.locator('.shopping_cart_link');
    this.cartBadge    = page.locator('.shopping_cart_badge');
    this.burgerMenu   = page.locator('#react-burger-menu-btn');
    this.logoutLink   = page.locator('#logout_sidebar_link');
  }

  /** Assert we landed on the inventory page */
  async expectLoaded() {
    await expect(this.page).toHaveURL(/inventory/);
    await expect(this.pageTitle).toHaveText('Products');
  }

  /** Add a product to cart by its name */
  async addToCartByName(productName: string) {
    const item = this.productItems.filter({ hasText: productName });
    await item.locator('button').click();
  }

  /** Remove a product from cart (when button says Remove) */
  async removeFromCartByName(productName: string) {
    const item = this.productItems.filter({ hasText: productName });
    await item.locator('button').click();
  }

  /** Sort products using the dropdown */
  async sortBy(option: 'az' | 'za' | 'lohi' | 'hilo') {
    await this.sortDropdown.selectOption(option);
  }

  /** Get the text of all product names on the page */
  async getProductNames(): Promise<string[]> {
    return this.productItems
      .locator('.inventory_item_name')
      .allTextContents();
  }

  /** Get all product prices as numbers */
  async getProductPrices(): Promise<number[]> {
    const texts = await this.productItems
      .locator('.inventory_item_price')
      .allTextContents();
    return texts.map(t => parseFloat(t.replace('$', '')));
  }

  /** Get the cart badge count (returns 0 if badge is hidden) */
  async getCartCount(): Promise<number> {
    const visible = await this.cartBadge.isVisible();
    if (!visible) return 0;
    const text = await this.cartBadge.textContent();
    return parseInt(text ?? '0');
  }

  /** Navigate to cart */
  async goToCart() {
    await this.cartIcon.click();
  }

  /** Logout via burger menu */
  async logout() {
    await this.burgerMenu.click();
    await this.logoutLink.click();
  }
}
