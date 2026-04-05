# Logging System Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all console.* calls in the codebase with the existing logger module that supports 5 log levels (error, warn, info, debug, trace) with dynamic runtime configuration.

**Architecture:** 
- Existing logger at `/data/code/minebot/bot/logger.js` already implements all requirements
- Simply replace `console.log/error/warn/debug` calls with appropriate `logger.*` calls
- Logger provides: 5 levels, file output to `/data/code/minebot/logs/bot_server.log`, dynamic level configuration

**Tech Stack:** Node.js, existing logger module

---

## Files to Modify

### Bot Directory (11 files, 118 occurrences)
1. `/data/code/minebot/bot/behaviors.js` - 47 console statements
2. `/data/code/minebot/bot/index.js` - 12 console statements
3. `/data/code/minebot/bot/pathfinder.js` - 11 console statements
4. `/data/code/minebot/bot/events.js` - 14 console statements
5. `/data/code/minebot/bot/evolution/experience-logger.js` - 7 console statements
6. `/data/code/minebot/bot/evolution/strategy-manager.js` - 1 console statement
7. `/data/code/minebot/bot/evolution/evolution-storage.js` - 1 console statement
8. `/data/code/minebot/bot/ScreenshotModule.js` - 4 console statements
9. `/data/code/minebot/bot/autonomous-engine.js` - 2 console statements
10. `/data/code/minebot/bot/goal-system.js` - verify and replace
11. `/data/code/minebot/bot/evolution/fitness-calculator.js` - verify and replace
12. `/data/code/minebot/bot/evolution/weight-engine.js` - verify and replace

### Server Directory (1 file, 68 occurrences)
13. `/data/code/minebot/bot_server.js` - 68 console statements

### CLI Directory (1 file, 141 occurrences)
14. `/data/code/minebot/cli.js` - 141 console statements

### Config Directory (1 file, 6 occurrences)
15. `/data/code/minebot/config/db.js` - 6 console statements

---

### Task 1: Replace console calls in bot/behaviors.js (47 statements)

**Files:**
- Modify: `/data/code/minebot/bot/behaviors.js`

**Logger mappings:**
- `console.log()` → `logger.debug()` (verbose operational logs)
- `console.error()` → `logger.error()` (errors)
- `console.warn()` → `logger.warn()` (warnings)

- [ ] **Step 1: Read behaviors.js to understand context**

Read the file to see the logger import and log statement contexts.

- [ ] **Step 2: Replace all console.log calls with logger.debug**

Replace all `console.log(` with `logger.debug(`

- [ ] **Step 3: Replace all console.error calls with logger.error**

Replace all `console.error(` with `logger.error(`

- [ ] **Step 4: Replace all console.warn calls with logger.warn**

Replace all `console.warn(` with `logger.warn(`

- [ ] **Step 5: Verify logger is imported**

Ensure `const logger = require('../logger');` exists at top of file.

- [ ] **Step 6: Run basic syntax check**

```bash
node -c bot/behaviors.js
```

Expected: no syntax errors

---

### Task 2: Replace console calls in bot/index.js (12 statements)

**Files:**
- Modify: `/data/code/minebot/bot/index.js`

- [ ] **Step 1: Read index.js to understand context**

- [ ] **Step 2: Add logger import if missing**

Add `const logger = require('./logger');` if not present

- [ ] **Step 3: Replace console.log with logger.debug**

- [ ] **Step 4: Replace console.error with logger.error**

- [ ] **Step 5: Replace console.warn with logger.warn**

- [ ] **Step 6: Verify syntax**

```bash
node -c bot/index.js
```

---

### Task 3: Replace console calls in bot/pathfinder.js (11 statements)

**Files:**
- Modify: `/data/code/minebot/bot/pathfinder.js`

- [ ] **Step 1: Read pathfinder.js**

- [ ] **Step 2: Add/import logger**

- [ ] **Step 3: Replace all console calls with logger equivalents**

- [ ] **Step 4: Verify syntax**

```bash
node -c bot/pathfinder.js
```

---

### Task 4: Replace console calls in bot/events.js (14 statements)

**Files:**
- Modify: `/data/code/minebot/bot/events.js`

- [ ] **Step 1: Read events.js**

- [ ] **Step 2: Add/import logger**

- [ ] **Step 3: Replace all console calls with logger equivalents**

- [ ] **Step 4: Verify syntax**

```bash
node -c bot/events.js
```

---

### Task 5: Replace console calls in bot/evolution/*.js files (9 statements)

**Files:**
- Modify: `/data/code/minebot/bot/evolution/experience-logger.js` (7 statements)
- Modify: `/data/code/minebot/bot/evolution/strategy-manager.js` (1 statement)
- Modify: `/data/code/minebot/bot/evolution/evolution-storage.js` (1 statement)

- [ ] **Step 1: Read experience-logger.js**

- [ ] **Step 2: Add/import logger and replace calls**

- [ ] **Step 3: Read strategy-manager.js**

- [ ] **Step 4: Add/import logger and replace calls**

- [ ] **Step 5: Read evolution-storage.js**

- [ ] **Step 6: Add/import logger and replace calls**

- [ ] **Step 7: Verify all syntax**

```bash
node -c bot/evolution/experience-logger.js
node -c bot/evolution/strategy-manager.js
node -c bot/evolution/evolution-storage.js
```

---

### Task 6: Replace console calls in remaining bot directory files (7 statements)

**Files:**
- Modify: `/data/code/minebot/bot/ScreenshotModule.js` (4 statements)
- Modify: `/data/code/minebot/bot/autonomous-engine.js` (2 statements)
- Modify: `/data/code/minebot/bot/goal-system.js` (verify and replace if any)
- Modify: `/data/code/minebot/bot/evolution/fitness-calculator.js` (verify and replace if any)
- Modify: `/data/code/minebot/bot/evolution/weight-engine.js` (verify and replace if any)

- [ ] **Step 1: Read and replace in ScreenshotModule.js**

- [ ] **Step 2: Read and replace in autonomous-engine.js**

- [ ] **Step 3: Check and replace in goal-system.js**

- [ ] **Step 4: Check and replace in fitness-calculator.js**

- [ ] **Step 5: Check and replace in weight-engine.js**

- [ ] **Step 6: Verify all syntax**

---

### Task 7: Replace console calls in bot_server.js (68 statements)

**Files:**
- Modify: `/data/code/minebot/bot_server.js`

**Note:** This is the main server file. Be careful with WebSocket and error handling logs.

- [ ] **Step 1: Read bot_server.js to understand context**

- [ ] **Step 2: Add logger import if missing**

- [ ] **Step 3: Replace console.log with logger.debug/info**

- [ ] **Step 4: Replace console.error with logger.error**

- [ ] **Step 5: Replace console.warn with logger.warn**

- [ ] **Step 6: Verify syntax**

```bash
node -c bot_server.js
```

---

### Task 8: Replace console calls in cli.js (141 statements)

**Files:**
- Modify: `/data/code/minebot/cli.js`

**Note:** CLI file has most console statements. These are likely user-facing output.

- [ ] **Step 1: Read cli.js to understand context**

- [ ] **Step 2: Add logger import**

**Question:** Should CLI output use logger or keep console? Consider:
- If CLI is interactive, console is appropriate for user output
- If CLI logs should be in log file, use logger

**Recommendation:** For now, replace with logger.debug for CLI operational logs.

- [ ] **Step 3: Replace all console.log with logger.debug**

- [ ] **Step 4: Replace console.error with logger.error**

- [ ] **Step 5: Replace console.warn with logger.warn**

- [ ] **Step 6: Verify syntax**

```bash
node -c cli.js
```

---

### Task 9: Replace console calls in config/db.js (6 statements)

**Files:**
- Modify: `/data/code/minebot/config/db.js`

- [ ] **Step 1: Read config/db.js**

- [ ] **Step 2: Add logger import**

- [ ] **Step 3: Replace all console calls**

- [ ] **Step 4: Verify syntax**

```bash
node -c config/db.js
```

---

### Task 10: Verify logger module works correctly

**Files:**
- Test: `/data/code/minebot/bot/logger.js`

- [ ] **Step 1: Verify logger module exists and has all 5 levels**

Read logger.js and confirm: error, warn, info, debug, trace methods exist

- [ ] **Step 2: Verify default log level is 'debug'**

Check logger.js for default level configuration

- [ ] **Step 3: Verify log file path is correct**

Confirm `/data/code/minebot/logs/bot_server.log` path

- [ ] **Step 4: Test logger can be required and used**

```bash
node -e "const logger = require('./bot/logger'); logger.info('test'); logger.debug('test');"
```

Expected: no errors

---

### Task 11: End-to-end test - run the bot

**Files:**
- Test: `/data/code/minebot/bot_server.js`

- [ ] **Step 1: Ensure logs directory exists**

```bash
mkdir -p /data/code/minebot/logs
```

- [ ] **Step 2: Start bot_server.js briefly**

```bash
timeout 5 node bot_server.js 2>&1 || true
```

- [ ] **Step 3: Check log file was created and contains entries**

```bash
cat /data/code/minebot/logs/bot_server.log | head -20
```

Expected: log entries with timestamps and levels

- [ ] **Step 4: Verify no console.* calls remain**

Search for remaining console calls:

```bash
grep -r "console\." --include="*.js" bot/ config/ cli.js bot_server.js | grep -v "logger" | grep -v "test" || echo "No console calls found"
```

Expected: minimal or no console calls remaining

---

### Task 12: Dynamic log level configuration test

**Files:**
- Test: `/data/code/minebot/bot/logger.js`

- [ ] **Step 1: Test logger.setLevel() method**

```bash
node -e "
const logger = require('./bot/logger');
logger.info('info message');
logger.debug('debug message');
logger.setLevel('error');
logger.info('should not appear');
logger.error('error message');
"
```

Expected: info message appears, debug doesn't; after setLevel('error'), only error appears

- [ ] **Step 2: Test all log levels work**

Verify error, warn, info, debug, trace all produce output

---

## Files Summary

| File | Console Statements | Action |
|------|-------------------|--------|
| bot/behaviors.js | 47 | Replace with logger |
| bot/index.js | 12 | Replace with logger |
| bot/pathfinder.js | 11 | Replace with logger |
| bot/events.js | 14 | Replace with logger |
| bot/evolution/experience-logger.js | 7 | Replace with logger |
| bot/evolution/strategy-manager.js | 1 | Replace with logger |
| bot/evolution/evolution-storage.js | 1 | Replace with logger |
| bot/ScreenshotModule.js | 4 | Replace with logger |
| bot/autonomous-engine.js | 2 | Replace with logger |
| bot/goal-system.js | ? | Verify and replace |
| bot/evolution/fitness-calculator.js | ? | Verify and replace |
| bot/evolution/weight-engine.js | ? | Verify and replace |
| bot_server.js | 68 | Replace with logger |
| cli.js | 141 | Replace with logger |
| config/db.js | 6 | Replace with logger |
| **TOTAL** | **314+** | **Replace with logger** |

---

## Commit Strategy

After each major file group, commit with descriptive message:

```bash
git add bot/behaviors.js
git commit -m "refactor: replace console.* with logger in bot/behaviors.js"

git add bot/index.js bot/pathfinder.js bot/events.js
git commit -m "refactor: replace console.* with logger in bot modules"

git add bot/evolution/*.js
git commit -m "refactor: replace console.* with logger in evolution modules"

git add bot_server.js cli.js config/db.js
git commit -m "refactor: replace console.* with logger in server/cli/config"

git add bot/logger.js
git commit -m "refactor: verify logger module supports 5 log levels with dynamic configuration"
```

---

## Verification Commands

**Before and after comparison:**
```bash
# Count console calls before
grep -r "console\." --include="*.js" bot/ config/ cli.js bot_server.js | wc -l

# Count console calls after (should be ~0)
grep -r "console\." --include="*.js" bot/ config/ cli.js bot_server.js | wc -l

# Verify logger usage
grep -r "logger\." --include="*.js" bot/ config/ cli.js bot_server.js | wc -l
```

**Syntax check all modified files:**
```bash
for f in bot/*.js bot/evolution/*.js bot_server.js cli.js config/db.js; do
  node -c "$f" || echo "SYNTAX ERROR: $f"
done
```
