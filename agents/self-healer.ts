/**
 * AI Self-Healing Agent (Anthropic Claude)
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads Playwright JSON results, finds failing tests, then uses Claude to
 * suggest fixed selectors by re-inspecting the live page.
 *
 * Usage:
 *   export ANTHROPIC_API_KEY=sk-ant-...
 *   npx ts-node agents/self-healer.ts --dry-run   ← preview fixes only
 *   npx ts-node agents/self-healer.ts             ← apply fixes
 *
 * Always run --dry-run first and review before applying!
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { chromium } from '@playwright/test';

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL   = 'https://www.saucedemo.com';
const TESTS_DIR  = path.join(__dirname, '..', 'tests');
const PAGES_DIR  = path.join(__dirname, '..', 'pages');
const REPORT_DIR = path.join(__dirname, '..', 'test-results');
const MODEL      = 'claude-haiku-4-5-20251001'; // fast + cheap

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Types ───────────────────────────────────────────────────────────────────

interface FailedTest {
  title: string;
  file: string;
  error: string;
}

interface HealSuggestion {
  file: string;
  originalSelector: string;
  suggestedSelector: string;
  reasoning: string;
  confidence: 'high' | 'medium' | 'low';
}

// ─── Parse Failing Tests ──────────────────────────────────────────────────────

function parseFailingTests(): FailedTest[] {
  const jsonReport = path.join(REPORT_DIR, 'results.json');
  const failures: FailedTest[] = [];

  if (!fs.existsSync(jsonReport)) {
    console.log('⚠️  No JSON report found.');
    console.log('    Run: PLAYWRIGHT_JSON_OUTPUT_NAME=test-results/results.json npx playwright test --reporter=json --project=chromium --grep "TC-AUTH-01"');
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

// ─── Inspect Live Page ────────────────────────────────────────────────────────

async function getPageElements(url: string): Promise<string> {
  console.log(`   🔍 Inspecting: ${url}`);
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
      document.querySelectorAll('[data-test], button, input, a').forEach((el: Element) => {
        const tag      = el.tagName.toLowerCase();
        const dataTest = el.getAttribute('data-test');
        const id       = el.getAttribute('id');
        const text     = el.textContent?.trim().substring(0, 40);
        if (dataTest || id || text) {
          result.push(`${tag} | data-test="${dataTest}" | id="${id}" | text="${text}"`);
        }
      });
      return result.slice(0, 50);
    });

    return elements.join('\n');
  } finally {
    await browser.close();
  }
}

// ─── Read Source File ─────────────────────────────────────────────────────────

function readSourceFile(filePath: string): string {
  if (path.isAbsolute(filePath) && fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf-8');
  }
  let found = '';
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(f => {
      const fp = path.join(dir, f);
      if (fs.statSync(fp).isDirectory()) walk(fp);
      else if (fp.endsWith('.ts') && fp.includes(path.basename(filePath, '.ts'))) {
        found = fs.readFileSync(fp, 'utf-8');
      }
    });
  };
  walk(TESTS_DIR);
  walk(PAGES_DIR);
  return found;
}

// ─── Ask Claude ───────────────────────────────────────────────────────────────

async function healTest(failure: FailedTest): Promise<HealSuggestion[]> {
  console.log(`\n🩺 Analysing: "${failure.title}"`);

  const source = readSourceFile(failure.file);
  if (!source) {
    console.log(`   ⚠️  Could not read: ${failure.file}`);
    return [];
  }

  let pageUrl = `${BASE_URL}/inventory.html`;
  if (failure.file.includes('cart'))     pageUrl = `${BASE_URL}/cart.html`;
  if (failure.file.includes('checkout')) pageUrl = `${BASE_URL}/checkout-step-one.html`;
  if (failure.file.includes('auth') || failure.file.includes('login')) pageUrl = BASE_URL;

  const liveDom = await getPageElements(pageUrl);

  const prompt = `You are a Playwright TypeScript expert fixing broken selectors.

FAILING TEST: ${failure.title}
ERROR: ${failure.error}

SOURCE CODE:
${source.substring(0, 2500)}

LIVE PAGE ELEMENTS at ${pageUrl}:
${liveDom}

Return ONLY a JSON array. No explanation. No markdown. Just JSON:
[{"originalSelector":"...","suggestedSelector":"...","reasoning":"...","confidence":"high"}]

If nothing to fix return: []`;

  console.log(`   🤖 Asking Claude...`);

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = message.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('').trim();

  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.log(`   ⚠️  No valid JSON in response`);
    return [];
  }

  try {
    const suggestions: Omit<HealSuggestion, 'file'>[] = JSON.parse(jsonMatch[0]);
    return suggestions.map(s => ({ ...s, file: failure.file }));
  } catch {
    console.log(`   ⚠️  Could not parse response`);
    return [];
  }
}

// ─── Apply Fixes ─────────────────────────────────────────────────────────────

function applySuggestions(suggestions: HealSuggestion[]): void {
  suggestions.forEach(fix => {
    if (fix.confidence === 'low') {
      console.log(`   ⏭️  Skipping low-confidence: ${fix.originalSelector}`);
      return;
    }

    let patched = false;
    [TESTS_DIR, PAGES_DIR].forEach(dir => {
      if (!fs.existsSync(dir)) return;
      const walk = (d: string) => {
        fs.readdirSync(d).forEach(f => {
          const fp = path.join(d, f);
          if (fs.statSync(fp).isDirectory()) {
            walk(fp);
          } else if (fp.endsWith('.ts')) {
            let content = fs.readFileSync(fp, 'utf-8');
            if (content.includes(fix.originalSelector)) {
              content = content.split(fix.originalSelector).join(fix.suggestedSelector);
              fs.writeFileSync(fp, content, 'utf-8');
              console.log(`   ✅ Fixed in ${path.basename(fp)}:`);
              console.log(`      "${fix.originalSelector}" → "${fix.suggestedSelector}"`);
              console.log(`      Reason: ${fix.reasoning}`);
              patched = true;
            }
          }
        });
      };
      walk(dir);
    });

    if (!patched) console.log(`   ⚠️  Selector not found in any file: ${fix.originalSelector}`);
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

(async () => {
  console.log('🤖 AI Self-Healing Agent (Claude)\n');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY not set.');
    console.error('   export ANTHROPIC_API_KEY=sk-ant-...');
    process.exit(1);
  }

  const dryRun   = process.argv.includes('--dry-run');
  const failures = parseFailingTests();

  if (failures.length === 0) {
    console.log('🎉 No failing tests found!');
    process.exit(0);
  }

  console.log(`Found ${failures.length} failing test(s):\n`);
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f.title}`));

  const allSuggestions: HealSuggestion[] = [];

  for (const failure of failures) {
    try {
      const suggestions = await healTest(failure);
      allSuggestions.push(...suggestions);
    } catch (err) {
      console.error(`❌ Error on "${failure.title}":`, err);
    }
  }

  if (allSuggestions.length === 0) {
    console.log('\n🤷 No fixes found.');
    process.exit(0);
  }

  if (dryRun) {
    console.log('\n📋 DRY RUN — suggested fixes (not applied):\n');
    allSuggestions.forEach(s => {
      console.log(`  File:       ${s.file}`);
      console.log(`  Old:        ${s.originalSelector}`);
      console.log(`  New:        ${s.suggestedSelector}`);
      console.log(`  Reason:     ${s.reasoning}`);
      console.log(`  Confidence: ${s.confidence}\n`);
    });
    console.log('✅ Review above. If correct, run without --dry-run to apply.');
  } else {
    console.log(`\n🔧 Applying ${allSuggestions.length} fix(es)...\n`);
    applySuggestions(allSuggestions);
    const reportPath = path.join(REPORT_DIR, 'heal-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(allSuggestions, null, 2));
    console.log(`\n📄 Report: test-results/heal-report.json`);
    console.log('\n✅ Done! Run npm test to verify.');
  }
})();
