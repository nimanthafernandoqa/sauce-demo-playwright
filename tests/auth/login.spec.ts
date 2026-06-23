import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { InventoryPage } from '../../pages/InventoryPage';
import { USERS, ERROR_MESSAGES } from '../../utils/test-data';

test.describe('Authentication', () => {
  let loginPage: LoginPage;
  let inventoryPage: InventoryPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    inventoryPage = new InventoryPage(page);
    await loginPage.goto();
  });

  // ─── Happy Path ─────────────────────────────────────────────────────────────

  test('TC-AUTH-01: standard user can log in successfully', async ({ page }) => {
    await loginPage.login(USERS.standard.username, USERS.standard.password);
    await inventoryPage.expectLoaded();
  });

  test('TC-AUTH-02: login page has correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/Swag Labs/);
  });

  test('TC-AUTH-03: login fields are visible and focusable', async () => {
    await expect(loginPage.usernameInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.loginButton).toBeEnabled();
  });

  // ─── Negative Paths ─────────────────────────────────────────────────────────

  test('TC-AUTH-04: locked out user sees error message', async () => {
    await loginPage.login(USERS.lockedOut.username, USERS.lockedOut.password);
    await loginPage.expectError(ERROR_MESSAGES.lockedOut);
  });

  test('TC-AUTH-05: empty username shows validation error', async () => {
    await loginPage.login('', USERS.standard.password);
    await loginPage.expectError(ERROR_MESSAGES.emptyUsername);
  });

  test('TC-AUTH-06: empty password shows validation error', async () => {
    await loginPage.login(USERS.standard.username, '');
    await loginPage.expectError(ERROR_MESSAGES.emptyPassword);
  });

  test('TC-AUTH-07: wrong password shows error message', async () => {
    await loginPage.login(USERS.standard.username, 'wrong_password');
    await loginPage.expectError(ERROR_MESSAGES.wrongPassword);
  });

  test('TC-AUTH-08: error banner can be dismissed', async () => {
    await loginPage.login('', '');
    await loginPage.dismissError();
  });

  test('TC-AUTH-09: password field masks input', async () => {
    await expect(loginPage.passwordInput).toHaveAttribute('type', 'password');
  });

  // ─── Session ─────────────────────────────────────────────────────────────────

  test('TC-AUTH-10: user can log out and is redirected to login', async ({ page }) => {
    await loginPage.login(USERS.standard.username, USERS.standard.password);
    await inventoryPage.logout();
    await expect(page).toHaveURL('/');
    await expect(loginPage.loginButton).toBeVisible();
  });

  test('TC-AUTH-11: unauthenticated user cannot access inventory directly', async ({ page }) => {
    await page.goto('/inventory.html');
    // Should redirect back to login
    await expect(page).toHaveURL('/');
  });
});
