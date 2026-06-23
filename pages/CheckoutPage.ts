import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for the Sauce Demo Checkout Flow
 * Step 1: /checkout-step-one.html  (personal info)
 * Step 2: /checkout-step-two.html  (overview)
 * Step 3: /checkout-complete.html  (confirmation)
 */
export class CheckoutPage {
  readonly page: Page;

  // Step 1 — Info
  readonly firstNameInput: Locator;
  readonly lastNameInput: Locator;
  readonly postalCodeInput: Locator;
  readonly continueButton: Locator;
  readonly cancelButton: Locator;
  readonly errorMessage: Locator;

  // Step 2 — Overview
  readonly summaryItems: Locator;
  readonly subtotalLabel: Locator;
  readonly taxLabel: Locator;
  readonly totalLabel: Locator;
  readonly finishButton: Locator;

  // Step 3 — Complete
  readonly completeHeader: Locator;
  readonly completeText: Locator;
  readonly backHomeButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Step 1
    this.firstNameInput  = page.locator('[data-test="firstName"]');
    this.lastNameInput   = page.locator('[data-test="lastName"]');
    this.postalCodeInput = page.locator('[data-test="postalCode"]');
    this.continueButton  = page.locator('[data-test="continue"]');
    this.cancelButton    = page.locator('[data-test="cancel"]');
    this.errorMessage    = page.locator('[data-test="error"]');

    // Step 2
    this.summaryItems   = page.locator('.cart_item');
    this.subtotalLabel  = page.locator('.summary_subtotal_label');
    this.taxLabel       = page.locator('.summary_tax_label');
    this.totalLabel     = page.locator('.summary_total_label');
    this.finishButton   = page.locator('[data-test="finish"]');

    // Step 3
    this.completeHeader  = page.locator('.complete-header');
    this.completeText    = page.locator('.complete-text');
    this.backHomeButton  = page.locator('[data-test="back-to-products"]');
  }

  // ─── Step 1 ────────────────────────────────────────────────────────────────

  async expectStep1Loaded() {
    await expect(this.page).toHaveURL(/checkout-step-one/);
  }

  async fillInfo(firstName: string, lastName: string, postalCode: string) {
    await this.firstNameInput.fill(firstName);
    await this.lastNameInput.fill(lastName);
    await this.postalCodeInput.fill(postalCode);
    await this.continueButton.click();
  }

  async expectInfoError(message: string) {
    await expect(this.errorMessage).toContainText(message);
  }

  // ─── Step 2 ────────────────────────────────────────────────────────────────

  async expectStep2Loaded() {
    await expect(this.page).toHaveURL(/checkout-step-two/);
  }

  async getSubtotal(): Promise<number> {
    const text = await this.subtotalLabel.textContent() ?? '';
    return parseFloat(text.replace(/[^0-9.]/g, ''));
  }

  async getTotal(): Promise<number> {
    const text = await this.totalLabel.textContent() ?? '';
    return parseFloat(text.replace(/[^0-9.]/g, ''));
  }

  async finish() {
    await this.finishButton.click();
  }

  // ─── Step 3 ────────────────────────────────────────────────────────────────

  async expectOrderComplete() {
    await expect(this.page).toHaveURL(/checkout-complete/);
    await expect(this.completeHeader).toHaveText('Thank you for your order!');
  }

  async backToHome() {
    await this.backHomeButton.click();
  }
}
