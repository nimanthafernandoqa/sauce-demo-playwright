import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for the Sauce Demo Cart Page
 * URL: https://www.saucedemo.com/cart.html
 */
export class CartPage {
  readonly page: Page;

  // Header & Navigation
  readonly burgerMenuButton: Locator;
  readonly closeMenuButton: Locator;
  readonly allItemsLink: Locator;
  readonly logoutLink: Locator;
  readonly cartLink: Locator;

  // Page Content
  readonly pageTitle: Locator;
  readonly cartItems: Locator;
  readonly cartQuantityLabel: Locator;
  readonly cartDescLabel: Locator;

  // Action Buttons
  readonly continueShoppingButton: Locator;
  readonly checkoutButton: Locator;

  // Footer
  readonly footer: Locator;
  readonly twitterLink: Locator;
  readonly facebookLink: Locator;
  readonly linkedinLink: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header & Navigation
    this.burgerMenuButton       = page.locator('#react-burger-menu-btn');
    this.closeMenuButton        = page.locator('#react-burger-cross-btn');
    this.allItemsLink           = page.locator('[data-test="inventory-sidebar-link"]');
    this.logoutLink             = page.locator('[data-test="logout-sidebar-link"]');
    this.cartLink               = page.locator('[data-test="shopping-cart-link"]');

    // Page Content
    this.pageTitle              = page.locator('[data-test="title"]');
    this.cartItems              = page.locator('[data-test="cart-item"]');
    this.cartQuantityLabel      = page.locator('[data-test="cart-quantity-label"]');
    this.cartDescLabel          = page.locator('[data-test="cart-desc-label"]');

    // Action Buttons
    this.continueShoppingButton = page.locator('[data-test="continue-shopping"]');
    this.checkoutButton         = page.locator('[data-test="checkout"]');

    // Footer
    this.footer                 = page.locator('[data-test="footer"]');
    this.twitterLink            = page.locator('[data-test="social-twitter"]');
    this.facebookLink           = page.locator('[data-test="social-facebook"]');
    this.linkedinLink           = page.locator('[data-test="social-linkedin"]');
  }

  /** Navigate to the cart page */
  async goto() {
    await this.page.goto('/cart.html');
  }

  /** Assert we landed on the cart page */
  async expectLoaded() {
    await expect(this.page).toHaveURL(/cart/);
    await expect(this.pageTitle).toHaveText('Your Cart');
  }

  /** Open the burger menu */
  async openMenu() {
    await this.burgerMenuButton.click();
  }

  /** Close the burger menu */
  async closeMenu() {
    await this.closeMenuButton.click();
  }

  /** Navigate to all items via sidebar */
  async goToAllItems() {
    await this.allItemsLink.click();
  }

  /** Logout via sidebar menu */
  async logout() {
    await this.burgerMenuButton.click();
    await this.logoutLink.click();
  }

  /** Get number of items in cart */
  async getItemCount(): Promise<number> {
    return this.cartItems.count();
  }

  /** Get all item names in the cart */
  async getItemNames(): Promise<string[]> {
    return this.cartItems
      .locator('[data-test="inventory-item-name"]')
      .allTextContents();
  }

  /** Get all item prices in the cart */
  async getItemPrices(): Promise<number[]> {
    const texts = await this.cartItems
      .locator('[data-test="inventory-item-price"]')
      .allTextContents();
    return texts.map(t => parseFloat(t.replace('$', '')));
  }

  /** Remove an item from cart by name */
  async removeItem(itemName: string) {
    const item = this.cartItems.filter({ hasText: itemName });
    await item.locator('button').click();
  }

  /** Proceed to checkout */
  async checkout() {
    await this.checkoutButton.click();
  }

  /** Go back to shopping */
  async continueShopping() {
    await this.continueShoppingButton.click();
  }

  /** Assert cart quantity column is visible */
  async expectQuantityLabelVisible() {
    await expect(this.cartQuantityLabel).toBeVisible();
  }

  /** Assert cart description column is visible */
  async expectDescriptionLabelVisible() {
    await expect(this.cartDescLabel).toBeVisible();
  }

  /** Get the href of Twitter social link */
  async getTwitterUrl(): Promise<string | null> {
    return this.twitterLink.getAttribute('href');
  }

  /** Assert footer is visible */
  async expectFooterVisible() {
    await expect(this.footer).toBeVisible();
  }
}