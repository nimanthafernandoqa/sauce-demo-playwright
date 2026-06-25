/**
 * AI Test Generation Agent (Anthropic Claude) — v3.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Points at any web page and automatically generates:
 *
 *   1. pages/{PageName}Page.ts         ← Page Object Model class with all locators
 *   2. tests/{area}/{name}.spec.ts     ← Clean spec file that uses the Page Object
 *   3. tests/generated/{name}.md       ← Plain English summary (anyone can read)
 *
 * This matches the exact same structure as the manually written tests.
 *
 * Usage:
 *   export ANTHROPIC_API_KEY=sk-ant-...
 *
 *   npx ts-node agents/test-generator.ts \
 *     --url "https://www.saucedemo.com/inventory-item.html?id=4" \
 *     --name product-detail \
 *     --area product
 *
 *   --url   the page to generate tests for
 *   --name  filename prefix  (e.g. product-detail → ProductDetailPage.ts)
 *   --area  subfolder inside tests/  (e.g. product → tests/product/)
 *           defaults to "generated" if not provided
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { chromium } from '@playwright/test';

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL  = 'https://www.saucedemo.com';
const TESTS_DIR = path.join(__dirname, '..', 'tests');
const PAGES_DIR = path.join(__dirname, '..', 'pages');
const MODEL     = 'claude-haiku-4-5-20251001';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Helper: convert kebab-case to PascalCase ────────────────────────────────
// e.g. "product-detail" → "ProductDetail"

function toPascalCase(str: string): string {
  return str
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

// ─── Step 1: Scrape the Live Page ────────────────────────────────────────────

async function scrapePage(url: string) {
  console.log(`🔍 Scraping page: ${url}`);
  const browser = await chromium.launch();
  const page    = await browser.newPage();

  try {
    await page.goto(BASE_URL);
    await page.fill('[data-test="username"]', 'standard_user');
    await page.fill('[data-test="password"]', 'secret_sauce');
    await page.click('[data-test="login-button"]');
    await page.goto(url);
    await page.waitForLoadState('networkidle');

    const title = await page.title();

    const elements: string[] = await page.evaluate(() => {
      const result: string[] = [];
      document.querySelectorAll(
        '[data-test], button, input, select, a[href], h1, h2, h3, span, p, label'
      ).forEach((el: Element) => {
        const tag      = el.tagName.toLowerCase();
        const dataTest = el.getAttribute('data-test');
        const id       = el.getAttribute('id');
        const text     = el.textContent?.trim().substring(0, 60);
        const type     = el.getAttribute('type');
        const href     = el.getAttribute('href');
        if (dataTest || id || text) {
          result.push(
            `${tag} | data-test="${dataTest}" | id="${id}" | text="${text}" | type="${type}" | href="${href}"`
          );
        }
      });
      return result.slice(0, 60);
    });

    console.log(`   ✅ Found ${elements.length} elements on "${title}"`);
    return { url, title, elements };
  } finally {
    await browser.close();
  }
}

// ─── Step 2: Collect Existing Tests and Page Objects ─────────────────────────

function getExistingTestNames(): string[] {
  const names: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(f => {
      const fp = path.join(dir, f);
      if (fs.statSync(fp).isDirectory()) walk(fp);
      else if (f.endsWith('.spec.ts')) {
        const content = fs.readFileSync(fp, 'utf-8');
        const matches = content.match(/test\s*\(\s*['"`](.*?)['"`]/g) ?? [];
        matches.forEach(m =>
          names.push(m.replace(/test\s*\(\s*['"`]/, '').replace(/['"`]$/, ''))
        );
      }
    });
  };
  walk(TESTS_DIR);
  return names;
}

function getExistingPageObjects(): string {
  let result = '';
  if (!fs.existsSync(PAGES_DIR)) return result;

  // Sort so LoginPage comes first — the spec always needs its exact method names
  const files = fs.readdirSync(PAGES_DIR).filter(f => f.endsWith('.ts'));
  const sorted = [
    ...files.filter(f => f.toLowerCase().includes('login')),
    ...files.filter(f => !f.toLowerCase().includes('login')),
  ];

  sorted.forEach(f => {
    result += `\n// ===== pages/${f} =====\n`;
    // Send full content — Claude MUST know exact method names to avoid inventing them
    result += fs.readFileSync(path.join(PAGES_DIR, f), 'utf-8');
    result += '\n';
  });
  return result;
}

// ─── Step 3: Ask Claude to Generate All Three Files ──────────────────────────

async function generateAll(
  pageInfo:   { url: string; title: string; elements: string[] },
  name:       string,
  area:       string,
  className:  string,
): Promise<void> {

  const existingNames   = getExistingTestNames();
  const existingPageObj = getExistingPageObjects();

  console.log(`\n📋 Existing tests found: ${existingNames.length}`);
  console.log(`📄 Existing page objects: ${existingPageObj.length} chars`);
  console.log(`\n🤖 Asking Claude to generate Page Object + Spec + Summary...`);

  // ── THE MASTER PROMPT ─────────────────────────────────────────────────────
  const prompt = `You are an expert Playwright TypeScript test automation engineer.

Generate THREE things for the page described below, following the exact same
patterns and structure as the existing page objects and tests shown further down.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PAGE INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
URL       : ${pageInfo.url}
Page Title: ${pageInfo.title}
Class name: ${className}Page
File names:
  Page Object → pages/${className}Page.ts
  Spec file   → tests/${area}/${name}.spec.ts
  (Plain English will be Section 3)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INTERACTIVE ELEMENTS ON THIS PAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${pageInfo.elements.join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXISTING PAGE OBJECTS — follow this exact same pattern and style
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${existingPageObj}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXISTING TEST NAMES — do NOT duplicate any of these
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${existingNames.join('\n') || 'None yet'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RULES FOR THE PAGE OBJECT (Section 1)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Class name must be: ${className}Page
- Import Page and Locator from @playwright/test
- Constructor takes a Page parameter
- Define ALL interactive elements as readonly Locator properties
- ALWAYS prefer data-test attributes: page.locator('[data-test="xyz"]')
- Add action methods for key interactions (click, fill, navigate)
- Follow the exact same style as the existing page objects above

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RULES FOR THE SPEC FILE (Section 2)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Import ${className}Page from '../../pages/${className}Page'
- Import LoginPage from '../../pages/LoginPage' (for beforeEach login)
- One test.describe block named after the page title
- beforeEach: create page objects and log in with standard_user / secret_sauce
- Name tests TC-NEW-01, TC-NEW-02, TC-NEW-03 etc
- Cover: happy path, one error/edge case, one navigation test
- Use Page Object methods and locators — never use page.locator() directly in tests
- Add a one-line comment above each test explaining what it checks
- No hardcoded waits (page.waitForTimeout)

CRITICAL — METHOD NAMES:
- ONLY use methods that actually exist in the Page Object source code shown above
- For LoginPage: use goto() to navigate, then login(username, password) — NEVER navigate()
- Do NOT invent method names — if a method does not appear verbatim in the source, do not use it
- Read every class in the EXISTING PAGE OBJECTS section before calling any method
- If you are unsure whether a method exists, leave a comment // TODO instead of inventing it

CRITICAL — NO LOCATORS IN SPEC:
- NEVER use page.locator() inside a spec file
- NEVER use page.fill(), page.click() directly in a spec — call a Page Object method instead
- The spec file interacts with the page ONLY through Page Object methods and properties

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT — return ALL THREE sections in this exact order
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

===PAGEOBJECT===
[TypeScript Page Object class here]
===ENDPAGEOBJECT===

===SPEC===
[TypeScript spec file here]
===ENDSPEC===

===PLAIN===
Test 1 — [test name]
  What it checks: [plain English, no jargon, 1-2 sentences]
  Why it matters: [business reason why this matters]

Test 2 — [test name]
  What it checks: ...
  Why it matters: ...
===ENDPLAIN===

No markdown. No explanation outside the sections. Just the three sections.`;

  const message = await client.messages.create({
    model:      MODEL,
    max_tokens: 8192,
    messages:   [{ role: 'user', content: prompt }],
  });

  const raw = message.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('').trim();

  // ── Extract all three sections ────────────────────────────────────────────
  const pageObjMatch = raw.match(/===PAGEOBJECT===([\s\S]*?)===ENDPAGEOBJECT===/);
  const specMatch    = raw.match(/===SPEC===([\s\S]*?)===ENDSPEC===/);
  const plainMatch   = raw.match(/===PLAIN===([\s\S]*?)===ENDPLAIN===/);

  if (!pageObjMatch || !specMatch) {
    console.error('❌ Claude did not return the expected sections.');
    console.error('Raw response preview:');
    console.error(raw.substring(0, 600));
    process.exit(1);
  }

  // Clean up — strip any leftover markdown fences
  const cleanCode = (s: string) => s.trim()
    .replace(/^```typescript\n?/i, '')
    .replace(/^```ts\n?/i, '')
    .replace(/^```\n?/, '')
    .replace(/```$/, '')
    .trim();

  const pageObjCode = cleanCode(pageObjMatch[1]);
  const specCode    = cleanCode(specMatch[1]);
  const plainText   = plainMatch ? plainMatch[1].trim() : '(Plain English summary not generated)';

  // ── Save Page Object → pages/{ClassName}Page.ts ───────────────────────────
  const pageObjPath = path.join(PAGES_DIR, `${className}Page.ts`);
  fs.writeFileSync(pageObjPath, pageObjCode, 'utf-8');
  console.log(`\n✅ Page Object saved  : pages/${className}Page.ts`);

  // ── Save Spec → tests/{area}/{name}.spec.ts ───────────────────────────────
  const specDir  = path.join(TESTS_DIR, area);
  const specPath = path.join(specDir, `${name}.spec.ts`);
  if (!fs.existsSync(specDir)) fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(specPath, specCode, 'utf-8');
  console.log(`✅ Spec file saved     : tests/${area}/${name}.spec.ts`);

  // ── Save Plain English → tests/generated/{name}.md ───────────────────────
  const generatedDir = path.join(TESTS_DIR, 'generated');
  if (!fs.existsSync(generatedDir)) fs.mkdirSync(generatedDir, { recursive: true });
  const mdPath = path.join(generatedDir, `${name}.md`);
  const mdContent = [
    `# Test Cases — ${pageInfo.title}`,
    ``,
    `**Page URL:** ${pageInfo.url}`,
    `**Page Object:** pages/${className}Page.ts`,
    `**Spec file:** tests/${area}/${name}.spec.ts`,
    `**Generated:** ${new Date().toLocaleDateString('en-GB')}`,
    ``,
    `---`,
    ``,
    plainText,
  ].join('\n');
  fs.writeFileSync(mdPath, mdContent, 'utf-8');
  console.log(`✅ Plain English saved : tests/generated/${name}.md`);

  // ── Print summary ─────────────────────────────────────────────────────────
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📋 PLAIN ENGLISH SUMMARY`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  console.log(plainText);
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📁 FILES CREATED`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  pages/${className}Page.ts`);
  console.log(`  tests/${area}/${name}.spec.ts`);
  console.log(`  tests/generated/${name}.md`);
  console.log(`\n💡 Run the new tests:`);
  console.log(`   npx playwright test tests/${area}/${name}.spec.ts --project=chromium`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('🤖 AI Test Generator v3.0 (Anthropic Claude)\n');
  console.log('Generates: Page Object + Spec file + Plain English summary\n');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY not set.');
    console.error('   export ANTHROPIC_API_KEY=sk-ant-...');
    process.exit(1);
  }

  const args     = process.argv.slice(2);
  const urlIdx   = args.indexOf('--url');
  const nameIdx  = args.indexOf('--name');
  const areaIdx  = args.indexOf('--area');

  const targetUrl = urlIdx  !== -1 ? args[urlIdx  + 1] : `${BASE_URL}/inventory.html`;
  const name      = nameIdx !== -1 ? args[nameIdx + 1] : 'auto-generated';
  const area      = areaIdx !== -1 ? args[areaIdx + 1] : 'generated';
  const className = toPascalCase(name); // "product-detail" → "ProductDetail"

  console.log(`📄 Page Object  → pages/${className}Page.ts`);
  console.log(`🧪 Spec file    → tests/${area}/${name}.spec.ts`);
  console.log(`📝 Plain English → tests/generated/${name}.md\n`);

  try {
    const pageInfo = await scrapePage(targetUrl);
    await generateAll(pageInfo, name, area, className);
  } catch (err) {
    console.error('❌ Generation failed:', err);
    process.exit(1);
  }
})();
