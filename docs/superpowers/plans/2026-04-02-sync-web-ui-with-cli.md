# Sync Web UI with CLI Commands

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ `) syntax for tracking.

**Goal:** Add missing bot controls (gather, build, restart, remove, cleanup) to the web UI to match the CLI functionality.

**Architecture:** The bot server already exposes all required REST API endpoints. We only need to add handler functions in `Dashboard.js` and control elements in `BotControls.js`. No backend changes needed.

**Tech Stack:** React 18, native fetch API, existing CSS patterns

---

## Gap Analysis

| CLI Command | API Endpoint | UI Status |
|-------------|-------------|-----------|
| `bot start` | `POST /api/bot/start` | ✅ Has button |
| `bot stop` | `POST /api/bot/:botId/stop` | ✅ Has button |
| `bot automatic` | `POST /api/bot/automatic` | ✅ Has button |
| `bot gather` | `POST /api/bot/:botId/gather` | ❌ No UI |
| `bot build` | `POST /api/bot/:botId/build` | ⚠️ Form exists, no submit button |
| `bot restart` | `POST /api/bot/:botId/restart` | ❌ No UI |
| `bot remove` | `DELETE /api/bot/:botId` | ❌ No UI |
| `bot cleanup` | `POST /api/bot/cleanup` | ❌ No UI |

---

## Files to Modify

- `frontend/src/components/BotControls.js` -- Add gather config, build button, restart/remove/cleanup buttons
- `frontend/src/components/Dashboard.js` -- Add handler functions for gather, build, restart, remove, cleanup
- `frontend/src/components/Dashboard.css` -- Add styles for new button colors (gather, build)

---

### Task 1: Add Gather controls to BotControls.js

**Files:**
- Modify: `frontend/src/components/BotControls.js`

Add a "Gathering Configuration" section with:
- Block types input (text input, comma-separated, e.g. `oak_log,cobblestone`)
- Radius input (number, default 30)
- "Gather Resources" button (calls `onGather` prop)

Also wire `onBuild` prop to existing building config form and add a "Build Structure" button.

Props to add: `onGather`, `onBuild`, `onRestart`, `onRemove`, `onCleanup`

- [ ] **Step 1:** Add `gatherConfig` state with `blocks: 'oak_log,cobblestone'` and `radius: 30`
- [ ] **Step 2:** Add Gathering Configuration UI section (block types text input, radius number input)
- [ ] **Step 3:** Add "Gather Resources" button that calls `onGather(gatherConfig)`
- [ ] **Step 4:** Add "Build Structure" button below existing building config that calls `onBuild(buildingConfig)`
- [ ] **Step 5:** Add Restart, Remove, and Cleanup buttons in a "Bot Management" section

---

### Task 2: Add handler functions in Dashboard.js

**Files:**
- Modify: `frontend/src/components/Dashboard.js`

Add these handler functions and pass them to BotControls:

- [ ] **Step 1:** Add `handleGather({ blocks, radius })` -- calls `POST /api/bot/:currentBotId/gather` with `{ targetBlocks: blocks.split(','), radius }`
- [ ] **Step 2:** Add `handleBuild({ width, length, height, blockType })` -- calls `POST /api/bot/:currentBotId/build` with `{ width, length, height, blockType }`
- [ ] **Step 3:** Add `handleRestart()` -- calls `POST /api/bot/:currentBotId/restart`
- [ ] **Step 4:** Add `handleRemove()` -- calls `DELETE /api/bot/:currentBotId`, resets `currentBotId` and `botStatus`
- [ ] **Step 5:** Add `handleCleanup()` -- calls `POST /api/bot/cleanup`
- [ ] **Step 6:** Pass all handlers to `<BotControls>` as props

---

### Task 3: Add CSS styles for new buttons

**Files:**
- Modify: `frontend/src/components/Dashboard.css`

- [ ] **Step 1:** Add `.action-button.gather` style (green tint)
- [ ] **Step 2:** Add `.action-button.build` style (blue tint)
- [ ] **Step 3:** Add `.action-button.danger` style (red tint, for remove button)
- [ ] **Step 4:** Add `.bot-management` section style for restart/remove/cleanup button group

---

## Verification

1. Start the dev server: `cd frontend && npm start`
2. Open the browser and log in
3. Verify all new buttons appear in the Bot Controls panel
4. Verify "Gather Resources" sends correct API call (check browser network tab)
5. Verify "Build Structure" sends correct API call with building config values
6. Verify "Restart", "Remove", "Cleanup" send correct API calls
7. Verify action log shows success/error messages for each action
