/**
 * AI Test Generation Agent
 * ─────────────────────────────────────────────────────────────────────────────
 * Uses Claude AI to automatically generate new Playwright TypeScript test cases
 * for pages / features that don't yet have coverage.
 *
 * Usage:
 *   npx ts-node agents/test-generator.ts --url https://www.saucedemo.com/inventory-item.html?id=4
 *   npx ts-node agents/test-generator.ts --page ProductDetail
 *
 * Requires:
 *   ANTHROPIC_API_KEY env variable
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { chromium } from '@playwright/test';

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = 'https://www.saucedemo.com';
const TESTS_DIR = path.join(__dirname, '..', 'tests');
const PAGES_DIR = path.join(__dirname, '..', 'pages');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─── Types ───────────────────────────────────────────────────────────────────

interface PageContext {
  url: string;
  title: string;
  html: string;
  interactiveElements: string[];
  existingTests: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Scrape a page using Playwright and extract relevant information */
async function scrapePage(url: string): Promise<PageContext> {
  console.log(`🔍 Scraping page: ${url}`);
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Login first if not on login page
  if (!url.includes('saucedemo.com') || url !== BASE_URL + '/') {
    await page.goto(BASE_URL);
    await page.fill('[data-test="username"]', 'standard_user');
    await page.fill('[data-test="password"]', 'secret_sauce');
    await page.click('[data-test="login-button"]');
  }

  await page.goto(url);
  await page.waitForLoadState('networkidle');

  const title = await page.title();
  const html  = await page.content();

  // Extract interactive elements with their data-test attributes
  const interactiveElements = await page.evaluate(() => {
    const elements: string[] = [];
    document.querySelectorAll('[data-test], button, input, select, a[href]').forEach(el => {
      const tag        = el.tagName.toLowerCase();
      const dataTest   = el.getAttribute('data-test');
      const id         = el.getAttribute('id');
      const className  = el.className;
      const text       = el.textContent?.trim().substring(0, 50);
      const type       = el.getAttribute('type');

      elements.push(
        JSON.stringify({ tag, dataTest, id, className, text, type })
      );
    });
    return elements;
  });

  await browser.close();

  // Find existing tests to avoid duplication
  const existingTests = collectExistingTestNames();

  return { url, title, html: html.substring(0, 8000), interactiveElements, existingTests };
}

/** Collect all test names already written */
function collectExistingTestNames(): string[] {
  const names: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(f => {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) {
        walk(full);
      } else if (f.endsWith('.spec.ts')) {
        const content = fs.readFileSync(full, 'utf-8');
        const matches = content.match(/test\(['"`](.*?)['"`]/g) ?? [];
        matches.forEach(m => names.push(m.replace(/test\(['"`]/, '').replace(/['"`]$/, '')));
      }
    });
  };
  walk(TESTS_DIR);
  return names;
}

/** Collect existing page objects to give Claude context */
function collectPageObjects(): string {
  let result = '';
  if (!fs.existsSync(PAGES_DIR)) return result;
  fs.readdirSync(PAGES_DIR)
    .filter(f => f.endsWith('.ts'))
    .forEach(f => {
      result += `\n\n// File: pages/${f}\n`;
      result += fs.readFileSync(path.join(PAGES_DIR, f), 'utf-8');
    });
  return result;
}

// ─── Main Agent ──────────────────────────────────────────────────────────────

async function generateTests(targetUrl: string, outputName: string): Promise<void> {
  const context = await scrapePage(targetUrl);
  const pageObjects = collectPageObjects();

  const systemPrompt = `You are an expert QA automation engineer specialising in Playwright TypeScript.
Your task is to generate comprehensive, production-quality test cases for a given web page.

Rules:
1. Use TypeScript with @playwright/test
2. Follow the Page Object Model pattern — create or extend a page object if needed
3. Use data-test attributes as the primary selector strategy (most stable)
4. Cover: happy paths, edge cases, validation errors, navigation, and accessibility basics
5. Use descriptive test names with a TC-XXX prefix (continue from existing IDs)
6. Do NOT duplicate any of the existing test names listed
7. Group tests in describe blocks
8. Use beforeEach to handle login and navigation
9. Return ONLY valid TypeScript code — no markdown fences, no explanations`;

  const userPrompt = `Generate Playwright TS tests for this page:

URL: ${context.url}
Title: ${context.title}

Interactive Elements Found:
${context.interactiveElements.slice(0, 30).join('\n')}

Existing Page Objects (for reference):
${pageObjects}

Existing Test Names (DO NOT duplicate):
${context.existingTests.join('\n')}

Generate a complete test spec file for this page. Be thorough.`;

  console.log('🤖 Asking Claude to generate tests...');

  const message = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
    system: systemPrompt,
  });

  const generatedCode = message.content
    .filter(block => block.type === 'text')
    .map(block => (block as { type: 'text'; text: string }).text)
    .join('');

  // Determine output path
  const outputDir  = path.join(TESTS_DIR, 'generated');
  const outputFile = path.join(outputDir, `${outputName}.spec.ts`);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputFile, generatedCode, 'utf-8');

  console.log(`✅ Generated tests saved to: ${outputFile}`);
  console.log(`📊 Tokens used — input: ${message.usage.input_tokens}, output: ${message.usage.output_tokens}`);
}

// ─── CLI Entry Point ──────────────────────────────────────────────────────────

(async () => {
  const args = process.argv.slice(2);
  const urlFlag  = args.findIndex(a => a === '--url');
  const nameFlag = args.findIndex(a => a === '--name');

  const targetUrl  = urlFlag  !== -1 ? args[urlFlag  + 1] : `${BASE_URL}/inventory.html`;
  const outputName = nameFlag !== -1 ? args[nameFlag + 1] : 'auto-generated';

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY environment variable is not set.');
    process.exit(1);
  }

  try {
    await generateTests(targetUrl, outputName);
  } catch (err) {
    console.error('❌ Test generation failed:', err);
    process.exit(1);
  }
})();
