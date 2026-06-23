/**
 * Sauce Demo test credentials and shared test data
 * All accounts use the same password: secret_sauce
 */

export const USERS = {
  /** Standard user — all features work normally */
  standard: { username: 'standard_user', password: 'secret_sauce' },

  /** Locked out — login should fail with an error */
  lockedOut: { username: 'locked_out_user', password: 'secret_sauce' },

  /** Problem user — images are broken, some buttons misbehave */
  problem: { username: 'problem_user', password: 'secret_sauce' },

  /** Performance glitch user — pages load slowly */
  performanceGlitch: { username: 'performance_glitch_user', password: 'secret_sauce' },
} as const;

export const CHECKOUT_INFO = {
  valid: {
    firstName: 'John',
    lastName: 'Doe',
    postalCode: '12345',
  },
  missingFirstName: {
    firstName: '',
    lastName: 'Doe',
    postalCode: '12345',
  },
  missingLastName: {
    firstName: 'John',
    lastName: '',
    postalCode: '12345',
  },
  missingPostalCode: {
    firstName: 'John',
    lastName: 'Doe',
    postalCode: '',
  },
} as const;

export const PRODUCTS = {
  backpack: 'Sauce Labs Backpack',
  bikeLight: 'Sauce Labs Bike Light',
  boltShirt: 'Sauce Labs Bolt T-Shirt',
  fleeceJacket: 'Sauce Labs Fleece Jacket',
  onesie: 'Sauce Labs Onesie',
  redShirt: 'Test.allTheThings() T-Shirt (Red)',
} as const;

export const ERROR_MESSAGES = {
  lockedOut: 'Epic sadface: Sorry, this user has been locked out.',
  emptyUsername: 'Epic sadface: Username is required',
  emptyPassword: 'Epic sadface: Password is required',
  wrongPassword: 'Epic sadface: Username and password do not match any user in this service',
  missingFirstName: 'Error: First Name is required',
  missingLastName: 'Error: Last Name is required',
  missingPostalCode: 'Error: Postal Code is required',
} as const;
