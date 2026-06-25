import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for the Sauce Demo Product Detail Page
 * URL: https://www.saucedemo.com/inventory-item.html?id=4
 */
export class ProductDetailPage {
  readonly page: Page;

  // Locators
  readonly productName:    Locator;
  readonly productDesc:    Locator;
  readonly productPrice:   Locator;
  readonly addToCartBtn:   Locator;
  readonly removeBtn:      Locator;
  readonly backButton:     Locator;
  readonly cartBadge:      Locator;

  constructor(page: Page) {
    this.page         = page;
    this.productName  = page.locator('[data-test="inventory-item-name"]');
    this.productDesc  = page.locator('[data-test="inventory-item-desc"]');
    this.productPrice = page.locator('[data-test="inventory-item-price"]');
    this.addToCartBtn = page.locator('[data-test^="add-to-cart"]');
    this.removeBtn    = page.locator('[data-test^="remove"]');
    this.backButton   = page.locator('[data-test="back-to-products"]');
    this.cartBadge    = page.locator('.shopping_cart_badge');
  }

  /** Navigate directly to a product detail page by item id */
  async goto(id: number = 4) {
    await this.page.goto(`/inventory-item.html?id=${id}`);
  }

  /** Assert the product detail page is loaded */
  async expectLoaded() {
    await expect(this.page).toHaveURL(/inventory-item/);
    await expect(this.productName).toBeVisible();
  }

  /** Add the product to cart */
  async addToCart() {
    await this.addToCartBtn.click();
  }

  /** Remove the product from cart */
  async removeFromCart() {
    await this.removeBtn.click();
  }

  /** Go back to the products list */
  async goBackToProducts() {
    await this.backButton.click();
  }

  /** Get the cart badge count (returns 0 if badge is hidden) */
  async getCartCount(): Promise<number> {
    const visible = await this.cartBadge.isVisible();
    if (!visible) return 0;
    const text = await this.cartBadge.textContent();
    return parseInt(text ?? '0');
  }

  /** Get the product price as a number (strips the $ sign) */
  async getPriceAsNumber(): Promise<number> {
    const text = await this.productPrice.textContent();
    return parseFloat((text ?? '0').replace('$', ''));
  }
}
