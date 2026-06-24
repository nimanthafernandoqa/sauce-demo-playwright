/**
 * AI Test Generation Agent (Groq version — free & fast)
 * ─────────────────────────────────────────────────────────────────────────────
 * Inspects a live page using Playwright, then uses Groq's free API to
 * generate new Playwright TypeScript test cases automatically.
 *
 * Usage:
 *   export GROQ_API_KEY=your-key-here
 *   npx ts-node agents/test-generator.ts --url https://www.saucedemo.com/inventory-item.html?id=4 --name product-detail
 *
 * Free API key: https://console.groq.com
 */

import Groq from 'groq-sdk';
import * as fs from 'fs';
import * as path from 'path';
import { chromium } from '@playwright/test';

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL  = 'https://www.saucedemo.com';
const TESTS_DIR = path.join(__dirname, '..', 'tests');
const PAGES_DIR = path.join(__dirname, '..', 'pages');
const MODEL = 'llama-3.3-70b-versatile';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── Scrape Page ─────────────────────────────────────────────────────────────

async function scrapePage(url: string) {
  console.log(`🔍 Scraping: ${url}`);
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
      document.querySelectorAll('[data-test], button, input, select, a[href], h1, h2').forEach((el: Element) => {
        const tag      = el.tagName.toLowerCase();
        const dataTest = el.getAttribute('data-test');
        const id       = el.getAttribute('id');
        const text     = el.textContent?.trim().substring(0, 50);
        const type     = el.getAttribute('type');
        result.push(`${tag} | data-test="${dataTest}" | id="${id}" | text="${text}" | type="${type}"`);
      });
      return result.slice(0, 50);
    });

    return { url, title, elements };
  } finally {
    await browser.close();
  }
}

// ─── Collect Existing Tests ───────────────────────────────────────────────────

function getExistingTestNames(): string[] {
  const names: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(f => {
      const fp = path.join(dir, f);
      if (fs.statSync(fp).isDirectory()) {
        walk(fp);
      } else if (f.endsWith('.spec.ts')) {
        const content = fs.readFileSync(fp, 'utf-8');
        const matches = content.match(/test\s*\(\s*['"`](.*?)['"`]/g) ?? [];
        matches.forEach(m => names.push(m.replace(/test\s*\(\s*['"`]/, '').replace(/['"`]$/, '')));
      }
    });
  };
  walk(TESTS_DIR);
  return names;
}

// ─── Collect Page Objects ─────────────────────────────────────────────────────

function getPageObjects(): string {
  let result = '';
  if (!fs.existsSync(PAGES_DIR)) return result;
  fs.readdirSync(PAGES_DIR)
    .filter(f => f.endsWith('.ts'))
    .forEach(f => {
      result += `\n// pages/${f}\n`;
      result += fs.readFileSync(path.join(PAGES_DIR, f), 'utf-8').substring(0, 600);
    });
  return result;
}

// ─── Generate Tests Using Groq ────────────────────────────────────────────────

async function generateTests(targetUrl: string, outputName: string): Promise<void> {
  const { url, title, elements } = await scrapePage(targetUrl);
  const existingNames = getExistingTestNames();
  const pageObjects   = getPageObjects();

  const prompt = `You are an expert Playwright TypeScript test automation engineer.

Generate a complete Playwright test spec file for this page.

PAGE INFO:
URL: ${url}
Title: ${title}

INTERACTIVE ELEMENTS:
${elements.join('\n')}

EXISTING PAGE OBJECTS (reuse these):
${pageObjects.substring(0, 2000)}

EXISTING TEST NAMES (do NOT duplicate):
${existingNames.join('\n')}

RULES:
1. Use TypeScript with @playwright/test
2. Prefer data-test attributes as selectors
3. Cover happy paths, error cases, and navigation
4. Name tests TC-NEW-01, TC-NEW-02 etc
5. Group in a describe block with beforeEach for login
6. Return ONLY valid TypeScript — no markdown, no explanations

Generate the test file:`;

  console.log(`\n🤖 Asking Groq to generate tests...`);

  const response = await groq.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
  });

  let code = response.choices[0].message.content?.trim() ?? '';

  // Strip markdown fences if model added them
  code = code.replace(/^```typescript\n?/i, '').replace(/^```ts\n?/i, '').replace(/^```\n?/, '').replace(/```$/, '').trim();

  const outputDir  = path.join(TESTS_DIR, 'generated');
  const outputFile = path.join(outputDir, `${outputName}.spec.ts`);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputFile, code, 'utf-8');

  console.log(`✅ Tests saved to: tests/generated/${outputName}.spec.ts`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

(async () => {
  console.log('🤖 AI Test Generator starting (powered by Groq — free & fast)\n');

  if (!process.env.GROQ_API_KEY) {
    console.error('❌ GROQ_API_KEY is not set.');
    console.error('   Get a free key at: https://console.groq.com');
    console.error('   Then run: export GROQ_API_KEY=your-key-here');
    process.exit(1);
  }

  const args      = process.argv.slice(2);
  const urlFlag   = args.indexOf('--url');
  const nameFlag  = args.indexOf('--name');
  const targetUrl = urlFlag  !== -1 ? args[urlFlag  + 1] : `${BASE_URL}/inventory.html`;
  const outName   = nameFlag !== -1 ? args[nameFlag + 1] : 'auto-generated';

  try {
    await generateTests(targetUrl, outName);
  } catch (err) {
    console.error('❌ Generation failed:', err);
    process.exit(1);
  }
})();
