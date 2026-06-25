/**
 * AI Self-Healing Agent (Anthropic Claude) — v2.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads Playwright JSON results, classifies the failure type, gathers all
 * relevant source files, inspects the live page, then asks Claude to suggest
 * the exact fix — covering broken selectors, wrong assertions, bad test data,
 * navigation errors, and timeouts.
 *
 * Usage:
 *   export ANTHROPIC_API_KEY=sk-ant-...
 *   npx ts-node agents/self-healer.ts --dry-run   ← preview fixes only
 *   npx ts-node agents/self-healer.ts             ← apply fixes
 *
 * Always run --dry-run first and review before applying!
 * Always git commit before running so you can rollback with: git checkout -- pages/ tests/
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { chromium } from '@playwright/test';

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL    = 'https://www.saucedemo.com';
const TESTS_DIR   = path.join(__dirname, '..', 'tests');
const PAGES_DIR   = path.join(__dirname, '..', 'pages');
const UTILS_DIR   = path.join(__dirname, '..', 'utils');
const REPORT_DIR  = path.join(__dirname, '..', 'test-results');
const MODEL       = 'claude-haiku-4-5-20251001'; // fast + cheap

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Types ───────────────────────────────────────────────────────────────────

interface FailedTest {
  title: string;
  file:  string;
  error: string;
}

/**
 * What the agent returns for each failure.
 *
 * failureType  — category of the problem (see classifyError below)
 * file         — which file needs to be changed
 * originalCode — the exact broken line / selector as it appears in the file
 * suggestedCode— the replacement line / selector
 * reasoning    — plain-English explanation of why this is broken
 * confidence   — how sure Claude is (low suggestions are skipped when applying)
 */
interface HealSuggestion {
  failureType:   'broken-selector' | 'wrong-assertion' | 'wrong-data' | 'navigation' | 'timeout' | 'unknown';
  file:          string;
  originalCode:  string;
  suggestedCode: string;
  reasoning:     string;
  confidence:    'high' | 'medium' | 'low';
}

// ─── Step 1: Classify the Error ───────────────────────────────────────────────
//
// Before sending anything to Claude we do a quick keyword scan of the error
// message. This narrows Claude's focus so it doesn't have to guess what kind
// of problem it is looking for.
//
// Error message keyword      → failureType
// ─────────────────────────────────────────
// "waiting for locator"      → broken-selector  (element not found on page)
// "strict mode violation"    → broken-selector  (selector matched >1 element)
// "toHaveText"               → wrong-assertion  (expected text doesn't match)
// "toHaveURL"                → navigation       (wrong page URL)
// "toBeVisible"              → broken-selector  (element exists but hidden)
// "TimeoutError"             → timeout          (page/element took too long)
// "net::ERR"                 → network          (network/URL error)
// "Invalid credentials"      → wrong-data       (wrong username or password)
// anything else              → unknown

function classifyError(error: string): HealSuggestion['failureType'] {
  if (error.includes('waiting for locator'))   return 'broken-selector';
  if (error.includes('strict mode violation')) return 'broken-selector';
  if (error.includes('toBeVisible'))           return 'broken-selector';
  if (error.includes('toHaveText'))            return 'wrong-assertion';
  if (error.includes('toHaveURL'))             return 'navigation';
  if (error.includes('TimeoutError'))          return 'timeout';
  if (error.includes('net::ERR'))              return 'timeout';
  if (error.includes('credentials') ||
      error.includes('password') ||
      error.includes('username'))              return 'wrong-data';
  return 'unknown';
}

// ─── Step 2: Parse Failing Tests from JSON Report ────────────────────────────

function parseFailingTests(): FailedTest[] {
  const jsonReport = path.join(REPORT_DIR, 'results.json');
  const failures: FailedTest[] = [];

  if (!fs.existsSync(jsonReport)) {
    console.log('⚠️  No JSON report found.');
    console.log('   Run this first to generate it:');
    console.log('   PLAYWRIGHT_JSON_OUTPUT_NAME=test-results/results.json npx playwright test --reporter=json --project=chromium');
    return failures;
  }

  const raw = fs.readFileSync(jsonReport, 'utf-8').trim();
  if (!raw) { console.log('⚠️  results.json is empty.'); return failures; }

  const report = JSON.parse(raw);

  const walkSuite = (suite: any, filePath: string) => {
    const file = suite.file ?? filePath ?? '';
    (suite.specs ?? []).forEach((spec: any) => {
      (spec.tests ?? []).forEach((test: any) => {
        const result = test.results?.[0];
        const status = result?.status ?? test.status ?? '';
        if (status === 'failed' || status === 'timedOut') {
          failures.push({
            title: spec.title ?? 'Unknown test',
            file,
            error: result?.error?.message ?? 'Unknown error',
          });
        }
      });
    });
    (suite.suites ?? []).forEach((s: any) => walkSuite(s, file));
  };

  (report.suites ?? []).forEach((s: any) => walkSuite(s, s.file ?? ''));
  return failures;
}

// ─── Step 3: Gather All Relevant Source Files ─────────────────────────────────
//
// We read THREE types of files so Claude has the full picture:
//
// 1. The SPEC file (tests/auth/login.spec.ts)
//    — contains the actual test steps and assertions
//    — failures from wrong assertions or wrong method calls show up here
//
// 2. ALL PAGE OBJECT files (pages/*.ts)
//    — contains selectors (locators) for every element on each page
//    — broken selectors almost always live here
//    — most relevant file is sorted to the top based on the test name
//
// 3. The TEST DATA file (utils/test-data.ts)
//    — contains usernames, passwords, product names, error messages
//    — wrong credentials or expected text strings could cause failures

function gatherSourceFiles(failure: FailedTest): {
  specSource:      string;
  pageObjSource:   string;
  testDataSource:  string;
  errorLine:       number | null;
} {
  // ── Spec file ──
  let specSource = '';
  if (fs.existsSync(failure.file)) {
    specSource = fs.readFileSync(failure.file, 'utf-8');
  } else {
    // try finding it by filename inside TESTS_DIR
    const baseName = path.basename(failure.file);
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      fs.readdirSync(dir).forEach(f => {
        const fp = path.join(dir, f);
        if (fs.statSync(fp).isDirectory()) walk(fp);
        else if (f === baseName) specSource = fs.readFileSync(fp, 'utf-8');
      });
    };
    walk(TESTS_DIR);
  }

  // ── Page objects — most relevant file first ──
  let pageObjSource = '';
  if (fs.existsSync(PAGES_DIR)) {
    const hint     = (failure.file + failure.title).toLowerCase();
    const keywords = ['login', 'auth', 'cart', 'checkout', 'inventory', 'product'];
    const matchedKw = keywords.find(kw => hint.includes(kw)) ?? '';
    const files    = fs.readdirSync(PAGES_DIR).filter(f => f.endsWith('.ts'));
    const sorted   = [
      ...files.filter(f => f.toLowerCase().includes(matchedKw)),
      ...files.filter(f => !f.toLowerCase().includes(matchedKw)),
    ];
    sorted.forEach(f => {
      pageObjSource += `\n// ===== pages/${f} =====\n`;
      pageObjSource += fs.readFileSync(path.join(PAGES_DIR, f), 'utf-8');
      pageObjSource += '\n';
    });
  }

  // ── Test data ──
  let testDataSource = '';
  const testDataPath = path.join(UTILS_DIR, 'test-data.ts');
  if (fs.existsSync(testDataPath)) {
    testDataSource = fs.readFileSync(testDataPath, 'utf-8');
  }

  // ── Extract error line number ──
  const lineMatch = failure.error.match(/:(\d+):\d+/);
  const errorLine = lineMatch ? parseInt(lineMatch[1]) : null;

  return { specSource, pageObjSource, testDataSource, errorLine };
}

// ─── Step 4: Inspect the Live Page ───────────────────────────────────────────
//
// Launches an invisible Chrome browser, logs into Sauce Demo, navigates to
// the relevant page, and collects up to 50 interactive elements.
// This gives Claude "ground truth" — what actually exists on the live site.

async function getPageElements(url: string): Promise<string> {
  console.log(`   🔍 Inspecting live page: ${url}`);
  const browser = await chromium.launch();
  const page    = await browser.newPage();

  try {
    await page.goto(BASE_URL);
    await page.fill('[data-test="username"]', 'standard_user');
    await page.fill('[data-test="password"]', 'secret_sauce');
    await page.click('[data-test="login-button"]');
    await page.goto(url);
    await page.waitForLoadState('networkidle');

    const elements: string[] = await page.evaluate(() => {
      const result: string[] = [];
      document.querySelectorAll('[data-test], button, input, a, h1, h2, span').forEach((el: Element) => {
        const tag      = el.tagName.toLowerCase();
        const dataTest = el.getAttribute('data-test');
        const id       = el.getAttribute('id');
        const text     = el.textContent?.trim().substring(0, 50);
        if (dataTest || id || text) {
          result.push(`${tag} | data-test="${dataTest}" | id="${id}" | text="${text}"`);
        }
      });
      return result.slice(0, 60);
    });

    return elements.join('\n');
  } finally {
    await browser.close();
  }
}

// ─── Step 5: Ask Claude ───────────────────────────────────────────────────────
//
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║                     THE MASTER PROMPT — v2.0                           ║
// ║                                                                        ║
// ║  This is the core of the agent. Everything else is just feeding data   ║
// ║  into this prompt correctly.                                           ║
// ║                                                                        ║
// ║  PROMPT ENGINEERING RULES USED HERE:                                  ║
// ║                                                                        ║
// ║  1. Give Claude a role → "You are a Playwright TypeScript expert"      ║
// ║  2. Pre-classify the error → narrows Claude's focus immediately        ║
// ║  3. Provide the error line number → Claude knows exactly where to look ║
// ║  4. Give ALL relevant files → spec + page objects + test data          ║
// ║  5. Give the live DOM → Claude can verify selectors actually exist     ║
// ║  6. Show a concrete output example → Claude knows exact JSON format    ║
// ║  7. Tell it what NOT to do → prevents TypeScript vs CSS confusion      ║
// ║  8. Tell it what to return if nothing found → prevents weird answers   ║
// ║                                                                        ║
// ║  FAILURE TYPES CLAUDE CAN NOW DETECT:                                  ║
// ║  - broken-selector  → wrong data-test value in page.locator()          ║
// ║  - wrong-assertion  → toHaveText() expected value doesn't match live   ║
// ║  - wrong-data       → bad username/password in test-data.ts            ║
// ║  - navigation       → wrong URL being navigated to                     ║
// ║  - timeout          → element exists but selector too slow to match    ║
// ║  - unknown          → Claude decides based on all context              ║
// ╚══════════════════════════════════════════════════════════════════════════╝

async function healTest(failure: FailedTest): Promise<HealSuggestion[]> {
  console.log(`\n🩺 Analysing: "${failure.title}"`);

  // Pre-classify so Claude knows what to focus on
  const failureType = classifyError(failure.error);
  console.log(`   🏷️  Classified as: ${failureType}`);

  // Gather all source files
  const { specSource, pageObjSource, testDataSource, errorLine } = gatherSourceFiles(failure);
  console.log(`   📄 Spec file: ${specSource.length} chars`);
  console.log(`   📄 Page objects: ${pageObjSource.length} chars`);
  console.log(`   📄 Test data: ${testDataSource.length} chars`);
  if (errorLine) console.log(`   📍 Error at line: ${errorLine}`);

  // Determine which page to inspect
  let pageUrl = `${BASE_URL}/inventory.html`;
  if (failure.file.includes('cart'))           pageUrl = `${BASE_URL}/cart.html`;
  if (failure.file.includes('checkout'))       pageUrl = `${BASE_URL}/checkout-step-one.html`;
  if (failure.file.includes('auth') ||
      failure.file.includes('login'))          pageUrl = BASE_URL;

  const liveDom = await getPageElements(pageUrl);

  // ── THE MASTER PROMPT ─────────────────────────────────────────────────────
  const prompt = `You are a Playwright TypeScript expert. Your job is to find exactly what is broken in a failing test and suggest the precise fix.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FAILING TEST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Test name : ${failure.title}
Error type: ${failureType}
Error line: ${errorLine ?? 'unknown'}
Full error: ${failure.error}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT TO LOOK FOR BASED ON ERROR TYPE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${failureType === 'broken-selector'  ? '→ Look for a page.locator() call with a selector that does NOT appear in the LIVE PAGE ELEMENTS below.\n  The fix is to replace the broken selector string with one that DOES appear in LIVE PAGE ELEMENTS.' : ''}
${failureType === 'wrong-assertion'  ? '→ Look for an expect().toHaveText() or expect().toContainText() call where the expected text does not match what is actually on the live page.\n  Check the LIVE PAGE ELEMENTS for the actual text value.' : ''}
${failureType === 'wrong-data'       ? '→ Look in the TEST DATA file for wrong usernames, passwords, or expected strings.\n  Cross-reference with what the error message says.' : ''}
${failureType === 'navigation'       ? '→ Look for a page.goto() call with a URL that does not match the actual page.\n  Check the error for the expected vs received URL.' : ''}
${failureType === 'timeout'          ? '→ The selector may exist but is too specific or has a timing issue.\n  Look for a locator that could be improved to be more stable.' : ''}
${failureType === 'unknown'          ? '→ Read all files carefully. The error message is your best clue. Look for anything that does not match the live page.' : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SPEC FILE: ${failure.file}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${specSource.substring(0, 2000)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PAGE OBJECTS (pages/*.ts) — selectors live here
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${pageObjSource.substring(0, 4000)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TEST DATA (utils/test-data.ts)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${testDataSource.substring(0, 1000)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LIVE PAGE ELEMENTS at ${pageUrl}
(These are the elements that ACTUALLY exist on the page right now)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${liveDom}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRICT RULES — READ CAREFULLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- originalCode  → the EXACT broken string as it appears in the file (copy it character for character)
- suggestedCode → the replacement string
- For selector fixes: suggestedCode must be a selector that EXISTS in LIVE PAGE ELEMENTS above
- Do NOT suggest TypeScript property names like "loginPage.loginButton" — those are not selectors
- Do NOT suggest changing import statements or test structure
- If you find nothing broken, return exactly: []
- file field must be one of: "${failure.file}", a pages/*.ts filename, or "utils/test-data.ts"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT — return ONLY this JSON, nothing else
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Example:
[
  {
    "failureType": "broken-selector",
    "file": "pages/LoginPage.ts",
    "originalCode": "[data-test=\\"login-Broken\\"]",
    "suggestedCode": "[data-test=\\"login-button\\"]",
    "reasoning": "login-button exists in live DOM, login-Broken does not",
    "confidence": "high"
  }
]

No markdown. No explanation. No code blocks. Just the raw JSON array.`;

  console.log(`   🤖 Asking Claude (${MODEL})...`);

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = message.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('').trim();

  console.log(`   💬 Claude replied: ${raw.substring(0, 300)}`);

  // Strip markdown fences if Claude added them anyway
  const cleaned   = raw.replace(/^```json\n?/i, '').replace(/^```\n?/, '').replace(/```$/, '').trim();
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);

  if (!jsonMatch) {
    console.log(`   ⚠️  No valid JSON found in Claude response`);
    return [];
  }

  try {
    const suggestions: HealSuggestion[] = JSON.parse(jsonMatch[0]);
    return suggestions;
  } catch {
    console.log(`   ⚠️  Could not parse Claude response as JSON`);
    return [];
  }
}

// ─── Step 6: Apply Fixes ──────────────────────────────────────────────────────
//
// Does a find-and-replace of originalCode → suggestedCode across all TypeScript
// files in tests/ and pages/.
// Skips low-confidence suggestions — better to be safe.

function applySuggestions(suggestions: HealSuggestion[]): void {
  suggestions.forEach(fix => {
    if (fix.confidence === 'low') {
      console.log(`   ⏭️  Skipping low-confidence fix: ${fix.originalCode}`);
      return;
    }

    let patched = false;
    [TESTS_DIR, PAGES_DIR, UTILS_DIR].forEach(dir => {
      if (!fs.existsSync(dir)) return;
      const walk = (d: string) => {
        fs.readdirSync(d).forEach(f => {
          const fp = path.join(d, f);
          if (fs.statSync(fp).isDirectory()) {
            walk(fp);
          } else if (fp.endsWith('.ts')) {
            let content = fs.readFileSync(fp, 'utf-8');
            if (content.includes(fix.originalCode)) {
              content = content.split(fix.originalCode).join(fix.suggestedCode);
              fs.writeFileSync(fp, content, 'utf-8');
              console.log(`   ✅ Fixed in ${path.relative(process.cwd(), fp)}:`);
              console.log(`      Type:   ${fix.failureType}`);
              console.log(`      Before: ${fix.originalCode}`);
              console.log(`      After:  ${fix.suggestedCode}`);
              console.log(`      Reason: ${fix.reasoning}`);
              patched = true;
            }
          }
        });
      };
      walk(dir);
    });

    if (!patched) {
      console.log(`   ⚠️  Could not find "${fix.originalCode}" in any file`);
    }
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('🤖 AI Self-Healing Agent v2.0 (Claude)\n');
  console.log('💡 Tip: Always git commit before running so you can rollback.');
  console.log('        git checkout -- pages/ tests/ utils/\n');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY not set.');
    console.error('   export ANTHROPIC_API_KEY=sk-ant-...');
    process.exit(1);
  }

  const dryRun   = process.argv.includes('--dry-run');
  const failures = parseFailingTests();

  if (failures.length === 0) {
    console.log('🎉 No failing tests found! All tests passed.');
    process.exit(0);
  }

  console.log(`Found ${failures.length} failing test(s):\n`);
  failures.forEach((f, i) => {
    const type = classifyError(f.error);
    console.log(`  ${i + 1}. [${type}] ${f.title}`);
  });

  const allSuggestions: HealSuggestion[] = [];

  for (const failure of failures) {
    try {
      const suggestions = await healTest(failure);
      allSuggestions.push(...suggestions);
    } catch (err) {
      console.error(`❌ Error analysing "${failure.title}":`, err);
    }
  }

  if (allSuggestions.length === 0) {
    console.log('\n🤷 No fixes found. The issue may need manual investigation.');
    process.exit(0);
  }

  if (dryRun) {
    console.log('\n📋 DRY RUN — suggested fixes (nothing has been changed):\n');
    allSuggestions.forEach((s, i) => {
      console.log(`  Fix ${i + 1}:`);
      console.log(`  Type:       ${s.failureType}`);
      console.log(`  File:       ${s.file}`);
      console.log(`  Before:     ${s.originalCode}`);
      console.log(`  After:      ${s.suggestedCode}`);
      console.log(`  Reason:     ${s.reasoning}`);
      console.log(`  Confidence: ${s.confidence}\n`);
    });
    console.log('✅ Review above. If correct, run without --dry-run to apply.');
  } else {
    console.log(`\n🔧 Applying ${allSuggestions.length} fix(es)...\n`);
    applySuggestions(allSuggestions);
    const reportPath = path.join(REPORT_DIR, 'heal-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(allSuggestions, null, 2));
    console.log(`\n📄 Full report saved: test-results/heal-report.json`);
    console.log('\n✅ Done! Run your tests to verify: npx playwright test');
  }
})();
