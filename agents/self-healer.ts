/**
 * AI Self-Healing Agent (Groq version — free & fast)
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads Playwright's JSON test results, identifies failing tests, then uses
 * Groq's free API to suggest fixed locators by re-inspecting the live page.
 *
 * Usage:
 *   export GROQ_API_KEY=your-key-here
 *   npx ts-node agents/self-healer.ts
 *
 * Free API key: https://console.groq.com
 */

import Groq from 'groq-sdk';
import * as fs from 'fs';
import * as path from 'path';
import { chromium } from '@playwright/test';

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL   = 'https://www.saucedemo.com';
const TESTS_DIR  = path.join(__dirname, '..', 'tests');
const REPORT_DIR = path.join(__dirname, '..', 'test-results');
const MODEL = 'llama-3.3-70b-versatile'; // free on Groq, very capable

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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
    console.log('⚠️  No JSON report found at test-results/results.json');
    console.log('    Run: PLAYWRIGHT_JSON_OUTPUT_NAME=test-results/results.json npx playwright test --reporter=json --project=chromium');
    return failures;
  }

  const raw = fs.readFileSync(jsonReport, 'utf-8').trim();
  if (!raw) {
    console.log('⚠️  results.json is empty.');
    return failures;
  }

  const report = JSON.parse(raw);

  const walkSuite = (suite: any, filePath: string) => {
    const file = suite.file ?? filePath ?? '';
    (suite.specs ?? []).forEach((spec: any) => {
      (spec.tests ?? []).forEach((test: any) => {
        const result = test.results?.[0];
        const status = result?.status ?? test.status ?? '';
        if (status === 'failed' || status === 'timedOut') {
          failures.push({
            title: spec.title ?? test.title ?? 'Unknown test',
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
      document.querySelectorAll('[data-test], button, input, a').forEach((el: Element) => {
        const tag      = el.tagName.toLowerCase();
        const dataTest = el.getAttribute('data-test');
        const id       = el.getAttribute('id');
        const text     = el.textContent?.trim().substring(0, 40);
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

// ─── Read Test Source File ────────────────────────────────────────────────────

function readTestFile(filePath: string): string {
  if (path.isAbsolute(filePath) && fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf-8');
  }

  const relative = path.join(TESTS_DIR, filePath);
  if (fs.existsSync(relative)) return fs.readFileSync(relative, 'utf-8');

  let found = '';
  const searchDirs = [TESTS_DIR, path.join(__dirname, '..', 'pages')];
  searchDirs.forEach(dir => {
    if (!fs.existsSync(dir)) return;
    const walk = (d: string) => {
      fs.readdirSync(d).forEach(f => {
        const fp = path.join(d, f);
        if (fs.statSync(fp).isDirectory()) walk(fp);
        else if (fp.endsWith(path.basename(filePath))) found = fs.readFileSync(fp, 'utf-8');
      });
    };
    walk(dir);
  });
  return found;
}

// ─── Heal Test Using Groq ────────────────────────────────────────────────────

async function healTest(failure: FailedTest): Promise<HealSuggestion[]> {
  console.log(`\n🩺 Analysing: "${failure.title}"`);

  const testSource = readTestFile(failure.file);
  if (!testSource) {
    console.log(`   ⚠️  Could not read source: ${failure.file}`);
    return [];
  }

  let pageUrl = `${BASE_URL}/inventory.html`;
  if (failure.file.includes('cart'))     pageUrl = `${BASE_URL}/cart.html`;
  if (failure.file.includes('checkout')) pageUrl = `${BASE_URL}/checkout-step-one.html`;
  if (failure.file.includes('auth') || failure.file.includes('login')) pageUrl = BASE_URL;

  const liveDom = await getPageElements(pageUrl);

  const prompt = `You are a Playwright test automation expert. A test is failing because a selector is broken.

FAILING TEST:
Title: ${failure.title}
Error: ${failure.error}

TEST SOURCE CODE:
${testSource.substring(0, 3000)}

LIVE PAGE ELEMENTS (current DOM at ${pageUrl}):
${liveDom}

TASK: Find which selector is broken and suggest the correct one.
Prefer data-test attributes. Return ONLY a JSON array, nothing else:
[
  {
    "originalSelector": "[data-test=\\"broken\\"]",
    "suggestedSelector": "[data-test=\\"correct\\"]",
    "reasoning": "why this fix works",
    "confidence": "high"
  }
]
If no fix found, return: []`;

  console.log(`   🤖 Asking Groq (${MODEL})...`);

  try {
    const response = await groq.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
    });

    const raw = response.choices[0].message.content?.trim() ?? '';
    const jsonMatch = raw.match(/\[[\s\S]*\]/);

    if (!jsonMatch) {
      console.log(`   ⚠️  Model did not return valid JSON`);
      return [];
    }

    const suggestions: Omit<HealSuggestion, 'file'>[] = JSON.parse(jsonMatch[0]);
    return suggestions.map(s => ({ ...s, file: failure.file }));

  } catch (err: any) {
    // Catch rate limit or other API errors gracefully
    if (err?.status === 429) {
      console.log('   ⚠️  Rate limit hit — waiting 5 seconds...');
      await new Promise(r => setTimeout(r, 5000));
      return healTest(failure); // retry once
    }
    throw err;
  }
}

// ─── Apply Fixes ─────────────────────────────────────────────────────────────

function applySuggestions(suggestions: HealSuggestion[]): void {
  const searchDirs = [TESTS_DIR, path.join(__dirname, '..', 'pages')];

  suggestions.forEach(fix => {
    if (fix.confidence === 'low') {
      console.log(`   ⏭️  Skipping low-confidence fix: ${fix.originalSelector}`);
      return;
    }

    let patched = false;
    searchDirs.forEach(dir => {
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
              console.log(`   ✅ Fixed [${fix.confidence}] in ${path.basename(fp)}:`);
              console.log(`      "${fix.originalSelector}"`);
              console.log(`      → "${fix.suggestedSelector}"`);
              console.log(`      Reason: ${fix.reasoning}`);
              patched = true;
            }
          }
        });
      };
      walk(dir);
    });

    if (!patched) {
      console.log(`   ⚠️  Selector not found in any file: ${fix.originalSelector}`);
    }
  });
}

// ─── Save Report ─────────────────────────────────────────────────────────────

function writeHealReport(suggestions: HealSuggestion[]): void {
  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
  const reportPath = path.join(REPORT_DIR, 'heal-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(suggestions, null, 2), 'utf-8');
  console.log(`\n📄 Heal report saved to: test-results/heal-report.json`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

(async () => {
  console.log('🤖 AI Self-Healing Agent starting (powered by Groq — free & fast)\n');

  if (!process.env.GROQ_API_KEY) {
    console.error('❌ GROQ_API_KEY is not set.');
    console.error('   Get a free key at: https://console.groq.com');
    console.error('   Then run: export GROQ_API_KEY=your-key-here');
    process.exit(1);
  }

  const failures = parseFailingTests();

  if (failures.length === 0) {
    console.log('🎉 No failing tests found — nothing to heal!');
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
      console.error(`❌ Error healing "${failure.title}":`, err);
    }
  }

  if (allSuggestions.length === 0) {
    console.log('\n🤷 No selector fixes could be determined.');
    process.exit(0);
  }

  console.log(`\n🔧 Applying ${allSuggestions.length} fix(es)...\n`);
  applySuggestions(allSuggestions);
  writeHealReport(allSuggestions);

  const dryRun = process.argv.includes('--dry-run');

if (dryRun) {
  console.log('\n📋 DRY RUN — suggested fixes (not applied):\n');
  allSuggestions.forEach(s => {
    console.log(`  File: ${s.file}`);
    console.log(`  Old:  ${s.originalSelector}`);
    console.log(`  New:  ${s.suggestedSelector}`);
    console.log(`  Why:  ${s.reasoning}`);
    console.log(`  Confidence: ${s.confidence}\n`);
  });
  console.log('Run without --dry-run to apply, or fix manually.');
} else {
  console.log(`\n🔧 Applying ${allSuggestions.length} fix(es)...\n`);
  applySuggestions(allSuggestions);
}
})();
