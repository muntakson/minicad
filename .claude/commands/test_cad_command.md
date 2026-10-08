# MiniCAD Command Test & Audit Guide

When writing Playwright tests for MiniCAD commands, follow these patterns. Every test failure we've debugged traces back to violating one of them.

---

## 0. Current State

- **163 commands** across 14 modules, **137 aliases**, 0 alias conflicts
- **Dev server:** port 3010 (`npm run dev`)
- **Backend:** port 3002 (`cd backend && bash start.sh`)
- **Entity types:** line, circle, arc, polyline, rect, text, ellipse, dimension, point, hatch, blockref, region
- **Test files:** `test_commands.mjs` through `test_tier15_commands.mjs`
- **Global references:** `window.__store` (store), `window.__engine` (command engine)
- **No test framework** — tests are standalone Node.js scripts using Playwright

---

## 1. Test File Structure

Each tier of commands gets its own test file: `test_tierN_commands.mjs`. Use this skeleton:

```javascript
import { chromium } from 'playwright';

const URL = 'http://localhost:3010/';
const RESULTS = [];
let page, browser;

async function setup() {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await context.newPage();
  await page.goto(URL);
  await page.waitForSelector('#cad-canvas', { timeout: 5000 });
  await page.waitForTimeout(500);
}

async function teardown() { await browser.close(); }

async function cmd(text) {
  const input = page.locator('#cmd-input');
  await input.fill(text);
  await input.press('Enter');
  await page.waitForTimeout(150);
}

async function getOutput(n = 5) {
  return await page.evaluate((count) => {
    const hist = document.getElementById('cmd-history');
    if (!hist) return '';
    const lines = hist.innerText.split('\n').filter(l => l.trim());
    return lines.slice(-count).join('\n');
  }, n);
}

async function pressEsc() {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
}

function test(name, passed, detail = '') {
  RESULTS.push({ name, passed, detail });
  console.log(`  [${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
}
```

---

## 2. Test Patterns

### 2a. Command registration check
```javascript
const hasCmd = await page.evaluate(() => window.__engine.commands.has('COMMANDNAME'));
test('COMMANDNAME registered', hasCmd);
```

### 2b. Alias check
```javascript
const hasAlias = await page.evaluate(() => {
  const def = window.__engine.commands.get('COMMANDNAME');
  return def && def.aliases.includes('ALIAS');
});
test('ALIAS alias', hasAlias);
```

### 2c. Programmatic entity setup (preferred over canvas clicks)
```javascript
await page.evaluate(() => {
  const s = window.__store;
  s.entities = [];
  s.entities.push({
    id: 'test1', type: 'line', layer: '0', color: 'bylayer',
    lineweight: 1, linetype: 'continuous', visible: true, selected: true,
    start: { x: 0, y: 0 }, end: { x: 10, y: 10 },
  });
  s.emit();
});
```

### 2d. Result verification
```javascript
const result = await page.evaluate(() => {
  const s = window.__store;
  return {
    total: s.entities.length,
    typeCount: s.entities.filter(e => e.type === 'line').length,
  };
});
test('Creates correct count', result.total === 3, `total=${result.total}`);
```

### 2e. Output message check
```javascript
const output = await getOutput(3);
test('Shows message', output.includes('expected text'), output.split('\n').pop());
```

---

## 3. Test Isolation (Critical)

Tests run sequentially in one browser session. Previous tests leave state behind.

### 3a. Clean entities before each test
```javascript
await page.evaluate(() => {
  window.__store.entities = [];
  window.__store.emit();
});
```

### 3b. Use pressEsc() between tests to cancel any stuck commands
```javascript
await pressEsc();
```

### 3c. Use `page.evaluate` for selection, not canvas clicks
Canvas click coordinates depend on zoom/pan state which changes as entities accumulate. Programmatic selection is deterministic.

### 3d. Reset store state after tests that modify it
```javascript
// Cleanup
await page.evaluate(() => {
  window.__store.entities = [];
  window.__store.layers = [{ name: '0', color: '#ffffff', visible: true, locked: false, current: true, lineweight: 1 }];
  window.__store.hiddenEntityIds.clear();
  window.__store.isolatedLayers = [];
  window.__store.currentColor = 'bylayer';
  window.__store.emit();
});
```

---

## 4. Multi-Step Command Testing

### 4a. Coordinate input via `cmd()` works for `waitForClick`
```javascript
await cmd('COMMANDNAME');
await cmd('0,0');     // first point
await cmd('100,100'); // second point
```

### 4b. Menu-style prompts
```javascript
await cmd('COMMANDNAME');
await page.waitForTimeout(100);
await cmd('option1');   // choose menu option
await page.waitForTimeout(100);
await cmd('value');     // enter a value
await page.waitForTimeout(300);
```

### 4c. Default values (empty Enter)
```javascript
await cmd('');  // accept default
```

---

## 5. Test Categories for New Commands

Every new command MUST have tests covering:

| Category | What to verify | Example |
|----------|---------------|---------|
| Registration | Command exists in engine | `commands.has('NAME')` |
| Aliases | Each alias maps correctly | `def.aliases.includes('AL')` |
| Happy path | Creates/modifies correct entities | Check entity type, count, properties |
| Output message | Confirmation appears in history | `output.includes('created')` |
| Undo | `cmd('UNDO')` reverses the operation | Entity count returns to before |
| Edge cases | Empty selection, wrong types, etc. | Prompt with "No objects" message |
| No alias conflicts | Check against all 137+ existing aliases | See summary test below |

---

## 6. Summary/Audit Test Block

Every test file should end with a summary section that verifies the total command count and checks for alias conflicts:

```javascript
async function testSummary() {
  console.log('\n=== SUMMARY ===');
  const total = await page.evaluate(() => window.__engine.commands.size);
  test('Total registered commands', total === EXPECTED_COUNT, `count=${total}`);

  const newCmds = ['CMD1', 'CMD2', 'CMD3'];
  for (const name of newCmds) {
    const exists = await page.evaluate((n) => window.__engine.commands.has(n), name);
    test(`${name} registered`, exists);
  }

  // Alias conflict check
  const aliasCheck = await page.evaluate(() => {
    const allAliases = new Map();
    let conflicts = [];
    for (const [name, def] of window.__engine.commands) {
      for (const alias of def.aliases) {
        if (allAliases.has(alias)) {
          conflicts.push(`${alias} used by ${allAliases.get(alias)} and ${name}`);
        }
        allAliases.set(alias, name);
      }
    }
    return { conflicts, totalAliases: allAliases.size };
  });
  test('No alias conflicts', aliasCheck.conflicts.length === 0,
    aliasCheck.conflicts.length > 0 ? aliasCheck.conflicts.join('; ') : `${aliasCheck.totalAliases} total aliases`);
}
```

---

## 7. Full Audit Procedure

When auditing the full command set:

### 7a. Verify all commands compile
```bash
npx tsc --noEmit
```

### 7b. Count registered commands
```bash
node -e "
const fs = require('fs');
const files = fs.readdirSync('src/commands').filter(f => f.endsWith('.ts'));
const src = files.map(f => fs.readFileSync('src/commands/' + f,'utf8')).join('');
const matches = [...src.matchAll(/engine\.register\(\s*'([^']+)'/g)];
console.log('Total:', matches.length);
matches.map(m => m[1]).sort().forEach(c => console.log('  ' + c));
"
```

### 7c. Check for alias conflicts
```bash
node -e "
const fs = require('fs');
const files = fs.readdirSync('src/commands').filter(f => f.endsWith('.ts'));
const src = files.map(f => fs.readFileSync('src/commands/' + f,'utf8')).join('');
const cmds = [...src.matchAll(/engine\.register\(\s*'([^']+)'\s*,\s*\[([^\]]*)\]/g)];
const aliases = new Map();
for (const m of cmds) {
  const name = m[1];
  const als = m[2].replace(/'/g,'').split(',').map(a => a.trim()).filter(Boolean);
  for (const a of als) {
    if (aliases.has(a)) console.log('CONFLICT: ' + a + ' used by ' + aliases.get(a) + ' and ' + name);
    aliases.set(a, name);
  }
}
console.log('Total aliases:', aliases.size, '— Conflicts:', 0);
"
```

### 7d. Run all test tiers
```bash
# Start dev server first: npm run dev
for f in test_commands.mjs test_menus.mjs test_tier*.mjs; do
  echo "=== $f ==="
  node "$f" 2>&1 | tail -5
done
```

### 7e. Generate command report
```bash
node -e "
const fs = require('fs');
const files = fs.readdirSync('src/commands').filter(f => f.endsWith('.ts'));
const src = files.map(f => ({ name: f, content: fs.readFileSync('src/commands/' + f,'utf8') }));
const report = [];
for (const { name, content } of src) {
  const cmds = [...content.matchAll(/engine\.register\(\s*'([^']+)'\s*,\s*\[([^\]]*)\]/g)];
  for (const m of cmds) {
    const aliases = m[2].replace(/'/g,'').split(',').map(a => a.trim()).filter(Boolean);
    report.push({ command: m[1], aliases: aliases.join(', '), file: name });
  }
}
report.sort((a, b) => a.command.localeCompare(b.command));
console.log('| Command | Aliases | Module |');
console.log('|---------|---------|--------|');
for (const r of report) {
  console.log('| ' + r.command + ' | ' + (r.aliases || '—') + ' | ' + r.file + ' |');
}
console.log('\\nTotal: ' + report.length + ' commands');
"
```

---

## 8. Test Execution

```bash
# Start dev server
npm run dev

# Run specific tier
node test_tier15_commands.mjs

# TypeScript check (no test framework configured)
npx tsc --noEmit
```

Dev server must be running on port **3010** (`npm run dev`).

---

## 9. Common Test Pitfalls

| Pitfall | Fix |
|---------|-----|
| Wrong port (3011 vs 3010) | Use 3010 — check `vite.config.ts` |
| Entity property name mismatch | Check `src/types.ts` for correct field names (e.g. `patternName` not `pattern`) |
| Test depends on canvas click coords | Use `page.evaluate` for programmatic entity setup/selection |
| Stale state from prior test | Clean entities and reset store at start of each test |
| `waitForTimeout` too short | Use 300ms after complex commands, 150ms after simple `cmd()` |
| Checking `commands.size` wrong | Count includes the command name entries only, not aliases. Aliases are in `def.aliases` array. `commands.size` = number of unique command names |
