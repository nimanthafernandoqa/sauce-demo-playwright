# Test Cases — Swag Labs

**Page URL:** https://www.saucedemo.com/inventory-item.html?id=4
**Page Object:** pages/ProductDetailPage.ts
**Spec file:** tests/product/product-detail.spec.ts
**Generated:** 25/06/2026

---

Test 1 — TC-PROD-11: Product detail page loads with all product information
  What it checks: The product detail page displays the correct product name (Sauce Labs Backpack), price ($29.99), description, and product image are all visible and correct.
  Why it matters: Ensures customers see complete and accurate product information before making a purchase decision.

Test 2 — TC-PROD-12: Adding product to cart multiple times increments badge correctly
  What it checks: When the Add to Cart button is clicked twice, the shopping cart badge updates from 1 to 2, confirming proper quantity tracking.
  Why it matters: Validates that the cart system correctly accumulates items when the same product is added multiple times, preventing quantity calculation errors.

Test 3 — TC-PROD-13: Back to Products button navigates to inventory page
  What it checks: Clicking the Back to Products button successfully navigates the user from the product detail page back to the inventory page.
  Why it matters: Ensures smooth navigation flow and allows users to easily return to browse other products without using browser back button.