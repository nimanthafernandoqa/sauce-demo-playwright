import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for the Sauce Demo Login Page
 * URL: https://www.saucedemo.com
 */
export class LoginPage {
  readonly page: Page;

  // Locators
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly errorMessage: Locator;
  readonly errorCloseButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.usernameInput   = page.locator('[data-test="username"]');
    this.passwordInput   = page.locator('[data-test="password"]');
    this.loginButton     = page.locator('[data-test="Error"]');
    this.errorMessage    = page.locator('[data-test="error"]');
    this.errorCloseButton = page.locator('.error-button');
  }

  /** Navigate to the login page */
  async goto() {
    await this.page.goto('/');
  }

  /** Perform a full login */
  async login(username: string, password: string) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  /** Assert that an error is visible with the expected message */
  async expectError(message: string) {
    await expect(this.errorMessage).toBeVisible();
    await expect(this.errorMessage).toContainText(message);
  }

  /** Dismiss the error banner */
  async dismissError() {
    await this.errorCloseButton.click();
    await expect(this.errorMessage).toBeHidden();
  }
}
