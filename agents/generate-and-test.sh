#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# generate-and-test.sh
#
# One command that:
#   1. Generates a Page Object + Spec + Plain English summary for a page
#   2. Runs the generated spec with Playwright
#   3. Prints a report: what was created + pass/fail results
#
# Usage:
#   chmod +x agents/generate-and-test.sh      ← run once to make executable
#
#   ./agents/generate-and-test.sh \
#     --url  "https://www.saucedemo.com/cart.html" \
#     --name cart \
#     --area cart
#
# Required env var:
#   export ANTHROPIC_API_KEY=sk-ant-...
# ─────────────────────────────────────────────────────────────────────────────

set -e  # stop on any error

# ── Colours ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# ── Parse arguments ───────────────────────────────────────────────────────────
URL=""
NAME=""
AREA="generated"

while [[ $# -gt 0 ]]; do
  case $1 in
    --url)  URL="$2";  shift 2 ;;
    --name) NAME="$2"; shift 2 ;;
    --area) AREA="$2"; shift 2 ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

if [[ -z "$URL" || -z "$NAME" ]]; then
  echo -e "${RED}❌ Missing required arguments.${NC}"
  echo ""
  echo "Usage:"
  echo "  ./agents/generate-and-test.sh --url \"https://...\" --name my-page --area my-area"
  exit 1
fi

if [[ -z "$ANTHROPIC_API_KEY" ]]; then
  echo -e "${RED}❌ ANTHROPIC_API_KEY is not set.${NC}"
  echo "   export ANTHROPIC_API_KEY=sk-ant-..."
  exit 1
fi

# ── Header ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  QA Test Generator + Runner${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${BLUE}URL  :${NC} $URL"
echo -e "  ${BLUE}Name :${NC} $NAME"
echo -e "  ${BLUE}Area :${NC} $AREA"
echo ""

# ── Step 1: Generate files ─────────────────────────────────────────────────────
echo -e "${BOLD}[1/3] Generating test files...${NC}"
echo ""

npx ts-node agents/test-generator.ts \
  --url  "$URL" \
  --name "$NAME" \
  --area "$AREA"

echo ""

# Derive class name (kebab-case → PascalCase)
CLASS_NAME=$(echo "$NAME" | sed -E 's/(^|-)([a-z])/\U\2/g')

PAGE_OBJ="pages/${CLASS_NAME}Page.ts"
SPEC_FILE="tests/${AREA}/${NAME}.spec.ts"
MD_FILE="tests/generated/${NAME}.md"

echo -e "${BOLD}[2/3] Files created:${NC}"
echo -e "  ${GREEN}✅${NC} $PAGE_OBJ"
echo -e "  ${GREEN}✅${NC} $SPEC_FILE"
echo -e "  ${GREEN}✅${NC} $MD_FILE"
echo ""

# ── Step 2: Run the generated spec ────────────────────────────────────────────
echo -e "${BOLD}[3/3] Running tests...${NC}"
echo ""

REPORT_FILE="test-results/${NAME}-report.json"
mkdir -p test-results

# Run with JSON reporter, capture exit code without stopping the script
set +e
PLAYWRIGHT_JSON_OUTPUT_NAME="$REPORT_FILE" \
  npx playwright test "$SPEC_FILE" \
  --reporter=json,line \
  --project=chromium
EXIT_CODE=$?
set -e

# ── Step 3: Print report ───────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  REPORT — $(date '+%d %b %Y %H:%M')${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Parse JSON report if it exists
if [[ -f "$REPORT_FILE" ]]; then
  # Use node to parse the JSON and print a summary
  node -e "
    const fs = require('fs');
    const r  = JSON.parse(fs.readFileSync('$REPORT_FILE', 'utf-8'));

    const suites = r.suites || [];
    let passed = 0, failed = 0, skipped = 0;
    const failures = [];

    function walk(suite) {
      (suite.specs || []).forEach(spec => {
        (spec.tests || []).forEach(t => {
          const status = t.results?.[0]?.status;
          if (status === 'passed')  passed++;
          else if (status === 'failed') {
            failed++;
            const err = t.results?.[0]?.error?.message || 'unknown error';
            failures.push({ title: spec.title, error: err.split('\n')[0] });
          }
          else skipped++;
        });
      });
      (suite.suites || []).forEach(walk);
    }
    suites.forEach(walk);

    const total = passed + failed + skipped;
    console.log('  Page:       $URL');
    console.log('  Spec:       $SPEC_FILE');
    console.log('  Page Obj:   $PAGE_OBJ');
    console.log('  Plain Eng:  $MD_FILE');
    console.log('');
    console.log('  Results:');
    console.log('    Total   : ' + total);
    console.log('    \x1b[32mPassed  : ' + passed + '\x1b[0m');
    console.log('    \x1b[31mFailed  : ' + failed + '\x1b[0m');
    if (skipped) console.log('    Skipped : ' + skipped);
    console.log('');

    if (failures.length > 0) {
      console.log('  \x1b[31mFailed tests:\x1b[0m');
      failures.forEach((f, i) => {
        console.log('    ' + (i+1) + '. ' + f.title);
        console.log('       ' + f.error);
      });
      console.log('');
    }
  "
else
  echo -e "  ${YELLOW}⚠️  No JSON report found — check Playwright output above${NC}"
  echo ""
fi

# Print plain English summary if .md exists
if [[ -f "$MD_FILE" ]]; then
  echo -e "${BOLD}  Plain English Test Cases:${NC}"
  echo ""
  cat "$MD_FILE"
  echo ""
fi

echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [[ $EXIT_CODE -eq 0 ]]; then
  echo -e "  ${GREEN}${BOLD}ALL TESTS PASSED ✅${NC}"
else
  echo -e "  ${RED}${BOLD}SOME TESTS FAILED ❌${NC}"
  echo ""
  echo "  To investigate:"
  echo "    npx playwright test $SPEC_FILE --project=chromium --headed"
  echo "    npx playwright show-report"
fi

echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

exit $EXIT_CODE
