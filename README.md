# Sauce Demo — Playwright TS Test Suite with AI Agents

A complete end-to-end test automation project built on [Sauce Demo](https://www.saucedemo.com),
with GitHub Actions CI/CD and two AI agents powered by Claude.

---

## Project Structure

```
sauce-demo-playwright/
├── playwright.config.ts          # Playwright configuration (mobile + desktop)
├── package.json
├── tsconfig.json
│
├── pages/                        # Page Object Models
│   ├── LoginPage.ts
│   ├── InventoryPage.ts
│   ├── CartPage.ts
│   └── CheckoutPage.ts
│
├── tests/                        # Test Specs (36 test cases)
│   ├── auth/login.spec.ts        # TC-AUTH-01 to TC-AUTH-11
│   ├── inventory/products.spec.ts# TC-INV-01  to TC-INV-13
│   ├── cart/cart.spec.ts         # TC-CART-01 to TC-CART-08
│   └── checkout/checkout.spec.ts # TC-CHK-01  to TC-CHK-12
│
├── utils/
│   └── test-data.ts              # Users, products, error messages
│
├── agents/
│   ├── test-generator.ts         # AI agent: generate new tests
│   └── self-healer.ts            # AI agent: fix broken selectors
│
└── .github/workflows/
    └── playwright.yml            # CI/CD pipeline
```

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Install browsers
npx playwright install

# 3. Run all tests
npm test

# 4. Run with UI mode (visual debugger)
npm run test:ui

# 5. View HTML report
npm run test:report
```

---

## Test Coverage (36 test cases)

| Suite        | Tests | What's Covered |
|-------------|-------|----------------|
| Auth        | 11    | Login, logout, error messages, session protection |
| Inventory   | 13    | Product display, sorting (4 modes), cart add/remove |
| Cart        | 8     | Item persistence, removal, price accuracy |
| Checkout    | 12    | 3-step flow, validation errors, price math, confirmation |

### Test Users Available

| Username | Password | Behaviour |
|----------|----------|-----------|
| `standard_user` | `secret_sauce` | Normal |
| `locked_out_user` | `secret_sauce` | Login blocked |
| `problem_user` | `secret_sauce` | Broken images/buttons |
| `performance_glitch_user` | `secret_sauce` | Slow page loads |

---

## CI/CD — GitHub Actions

The pipeline runs on every push and PR:

1. **Parallel shards** — tests split across 3 runners for speed
2. **Multi-browser** — Chromium, Firefox, WebKit + Mobile Chrome
3. **HTML report** — uploaded as artifact after every run
4. **AI Self-Healing** — auto-triggered when tests fail (creates a PR with fixes)

### Setup

1. Push to GitHub
2. Add `ANTHROPIC_API_KEY` to **Settings → Secrets → Actions**
3. Every PR now runs the full test suite automatically

---

## AI Agents

### 1. Test Generator

Inspects a live URL and generates new Playwright test cases automatically.

```bash
# Generate tests for a new page
ANTHROPIC_API_KEY=sk-... npx ts-node agents/test-generator.ts \
  --url https://www.saucedemo.com/inventory-item.html?id=4 \
  --name product-detail
```

What it does:
- Launches Playwright to scrape the target URL
- Reads all existing tests to avoid duplication
- Asks Claude to generate a full spec file
- Saves to `tests/generated/<name>.spec.ts`

### 2. Self-Healing Agent

Reads failing test results and uses Claude to suggest fixed selectors.

```bash
# After a test run with failures:
ANTHROPIC_API_KEY=sk-... npm run heal-tests
```

What it does:
- Parses Playwright JSON results for failures
- Re-scrapes the live page to see current DOM
- Asks Claude to suggest updated locators
- Applies high/medium confidence fixes directly to source files
- Creates a `test-results/heal-report.json` summary
- In CI: opens a PR with the healed files

---

## Selector Strategy

Selectors are chosen in this priority order for maximum stability:

1. `[data-test="..."]` — most stable, used everywhere
2. `#id` — for unique elements
3. `.class` — only for structural containers, never for actions
4. Text content — for user-facing assertions only

---

## Learning Path

If you're studying this project, work through it in this order:

1. **`utils/test-data.ts`** — understand the test data structure
2. **`pages/LoginPage.ts`** — the simplest Page Object
3. **`tests/auth/login.spec.ts`** — your first tests
4. **`pages/InventoryPage.ts`** + **`tests/inventory/products.spec.ts`** — more complex interactions
5. **`pages/CartPage.ts`** + **`pages/CheckoutPage.ts`** — multi-page flows
6. **`tests/checkout/checkout.spec.ts`** — end-to-end scenario
7. **`.github/workflows/playwright.yml`** — the CI/CD pipeline
8. **`agents/test-generator.ts`** — AI test generation
9. **`agents/self-healer.ts`** — AI self-healing
