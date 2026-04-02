# Bot Management Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a comprehensive management page with three tabs (Bots, Config, Logs) that replaces the current single-bot dashboard as the post-login landing page.

**Architecture:** Hash-based SPA routing in React, new tabbed management component, new backend API endpoints for config and logs, existing components preserved and linked.

**Tech Stack:** React 18, fetch API, WebSocket, Express.js, Node.js, SQLite

---

## File Structure

### New Files
- `frontend/src/components/BotManagement.js` — Main management container with tab navigation
- `frontend/src/components/BotManagement.css` — Styles for management page
- `frontend/src/components/BotList.js` — Left panel bot list
- `frontend/src/components/BotDetail.js` — Right panel bot details
- `frontend/src/components/BotStartForm.js` — Modal form to start a new bot
- `frontend/src/components/ConfigPanel.js` — Config management UI
- `frontend/src/components/ConfigEditModal.js` — Modal for editing config values
- `frontend/src/components/LogViewer.js` — Live log viewer
- `frontend/src/components/LogViewer.css` — Log viewer styles

### Modified Files
- `frontend/src/App.js` — Add hash-based routing to show BotManagement as default
- `frontend/src/components/Dashboard.js` — Add "Back to Management" link
- `frontend/src/components/Dashboard.css` — Add "Back to Management" button styles
- `bot_server.js` — Add 5 new API endpoints: `/api/server/config`, `/api/server/config/env`, `/api/server/config/database`, `/api/server/logs`, `/api/server/status`

---

### Task 1: Add Backend API Endpoints

**Files:**
- Modify: `bot_server.js` (insert after line 136, before `/api/bots`)

- [ ] **Step 1: Add `/api/server/logs` GET endpoint**

Insert after the `/api/frontend/status` endpoint (line 136) in bot_server.js:

```javascript
// GET /api/server/logs - Get recent log entries
app.get('/api/server/logs', (req, res) => {
  try {
    const logFile = path.join(__dirname, 'logs', 'bot_server.log');
    if (!fs.existsSync(logFile)) {
      return res.json({ lines: [], total: 0 });
    }
    
    const content = fs.readFileSync(logFile, 'utf8');
    const allLines = content.trim().split('\n').filter(line => line.trim());
    const maxLines = 500;
    const recentLines = allLines.slice(-maxLines);
    
    const parsedLines = recentLines.map(line => {
      let level = 'log';
      let message = line;
      let timestamp = '';
      
      const timestampMatch = line.match(/^\[([^\]]+)\]\s*(.*)/);
      if (timestampMatch) {
        timestamp = timestampMatch[1];
        message = timestampMatch[2];
      }
      
      if (message.startsWith('WARN:')) {
        level = 'warn';
        message = message.replace(/^WARN:\s*/, '');
      } else if (message.toLowerCase().includes('error') || message.toLowerCase().includes('fail') || message.toLowerCase().includes('exception')) {
        level = 'error';
      }
      
      return { timestamp, level, message };
    });
    
    res.json({ lines: parsedLines, total: allLines.length });
  } catch (err) {
    console.error(`[API] Failed to read logs: ${err.message}`);
    res.status(500).json({ error: 'Failed to read logs' });
  }
});
```

- [ ] **Step 2: Add `/api/server/config` GET endpoint**

```javascript
// GET /api/server/config - Get all current configuration
app.get('/api/server/config', async (req, res) => {
  try {
    const envPath = path.join(__dirname, '.env');
    const envVars = {};
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      envContent.split('\n').forEach(line => {
        line = line.trim();
        if (line && !line.startsWith('#')) {
          const [key, ...valueParts] = line.split('=');
          if (key) envVars[key.trim()] = valueParts.join('=').trim();
        }
      });
    }
    
    const defaults = {
      autoReconnectRetries: 3,
      autoReconnectDelay: 10000,
      broadcastInterval: 3000,
      serverStateSaveInterval: 3000,
      botStaleCleanupDays: 30,
      databaseBusyTimeout: 5000,
      botStatusCheckTimeout: 2000,
      minecraftMaxMemory: '1G',
      minecraftJarPath: 'resources/minecraft_server.1.21.11.jar',
      minecraftServerDir: 'resources/',
      logDir: 'logs/',
      defaultBuildingWidth: 5,
      defaultBuildingLength: 5,
      defaultBuildingHeight: 3,
      defaultBuildingBlockType: 'oak_planks',
      defaultGatheringRadius: 10,
      defaultGatheringTargets: ['oak_log', 'cobblestone', 'iron_ore', 'coal_ore'],
      defaultBotMode: 'survival'
    };
    
    res.json({ env: envVars, defaults: defaults, source: process.env });
  } catch (err) {
    console.error(`[API] Failed to get config: ${err.message}`);
    res.status(500).json({ error: 'Failed to get configuration' });
  }
});
```

- [ ] **Step 3: Add `/api/server/config/env` PUT endpoint**

```javascript
// PUT /api/server/config/env - Update .env variable
app.put('/api/server/config/env', (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) {
      return res.status(400).json({ error: 'Key is required' });
    }
    
    const validKeys = [
      'HOST', 'PORT', 'MINECRAFT_SERVER_HOST', 'MINECRAFT_SERVER_PORT',
      'SESSION_SECRET', 'MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET',
      'LLM_SERVICE_URL', 'VLLM_URL', 'USE_FALLBACK'
    ];
    
    if (!validKeys.includes(key)) {
      return res.status(400).json({ error: `Invalid config key: ${key}` });
    }
    
    const envPath = path.join(__dirname, '.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    
    const keyRegex = new RegExp(`^${key}\\s*=`, 'm');
    if (keyRegex.test(envContent)) {
      envContent = envContent.replace(new RegExp(`^${key}\\s*=.*$`, 'm'), `${key}=${value}`);
    } else {
      envContent += (envContent.endsWith('\n') ? '' : '\n') + `${key}=${value}\n`;
    }
    
    fs.writeFileSync(envPath, envContent, 'utf8');
    
    res.json({
      success: true,
      key,
      value,
      requiresRestart: true,
      message: `Updated ${key}. Server restart required for changes to take effect.`
    });
  } catch (err) {
    console.error(`[API] Failed to update config: ${err.message}`);
    res.status(500).json({ error: 'Failed to update configuration' });
  }
});
```

- [ ] **Step 4: Add `/api/server/config/database` PUT endpoint**

```javascript
// PUT /api/server/config/database - Update database defaults
app.put('/api/server/config/database', async (req, res) => {
  try {
    const { category, values } = req.body;
    
    if (!category || !values) {
      return res.status(400).json({ error: 'Category and values are required' });
    }
    
    const validCategories = ['building', 'gathering', 'bot_defaults'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ error: `Invalid category: ${category}` });
    }
    
    res.json({
      success: true,
      category,
      values,
      message: `Updated ${category} defaults`
    });
  } catch (err) {
    console.error(`[API] Failed to update database config: ${err.message}`);
    res.status(500).json({ error: 'Failed to update configuration' });
  }
});
```

- [ ] **Step 5: Add `/api/server/status` GET endpoint**

```javascript
// GET /api/server/status - Get server runtime status
app.get('/api/server/status', (req, res) => {
  const uptimeSeconds = Math.floor((Date.now() - botServerStartTime) / 1000);
  
  res.json({
    uptime: uptimeSeconds,
    pid: process.pid,
    activeBots: activeBots.size,
    retryQueueSize: retryQueue.size,
    verbose: verbose,
    startTime: new Date(botServerStartTime).toISOString(),
    memoryUsage: process.memoryUsage(),
    port: PORT,
    host: HOST
  });
});
```

- [ ] **Step 6: Move retryQueue declaration to top level**

The `retryQueue` is currently declared inside the WebSocket section. Move it to the top-level scope with `activeBots` and `botConnections`:

Find:
```javascript
const activeBots = new Map();
const botConnections = new Map();
const botServerStartTime = Date.now();
```

Change to:
```javascript
const activeBots = new Map();
const botConnections = new Map();
const botServerStartTime = Date.now();
const retryQueue = new Map();
```

And remove the duplicate declaration `const retryQueue = new Map();` from the WebSocket section.

- [ ] **Step 7: Restart bot server to apply changes**

Run: `./minebot server stop && sleep 1 && ./minebot server start`

Then test all new endpoints:
```bash
curl -s http://localhost:9500/api/server/status | python3 -m json.tool
curl -s http://localhost:9500/api/server/logs | python3 -m json.tool | head -20
curl -s http://localhost:9500/api/server/config | python3 -m json.tool | head -20
```

Expected: All endpoints return valid JSON with expected fields.

---

### Task 2: Create BotManagement Component

**Files:**
- Create: `frontend/src/components/BotManagement.js`
- Create: `frontend/src/components/BotManagement.css`

- [ ] **Step 1: Create BotManagement.css**

Full CSS file for the management page. Includes styles for:
- Management header with user info and logout
- Tab navigation (Bots/Config/Logs)
- Split panel layout for Bots tab
- Bot list items with status dots and colors
- Bot detail panel with stat cards and action buttons
- Modal overlays for forms
- Responsive breakpoints

- [ ] **Step 2: Create BotManagement.js**

Main container component with:
- Tab navigation state (Bots/Config/Logs)
- Renders BotList in left panel, BotDetail in right panel for Bots tab
- Renders ConfigPanel for Config tab
- Renders LogViewer for Logs tab
- Header with username and logout button

---

### Task 3: Create BotList, BotDetail, and BotStartForm Components

**Files:**
- Create: `frontend/src/components/BotList.js`
- Create: `frontend/src/components/BotDetail.js`
- Create: `frontend/src/components/BotStartForm.js`

- [ ] **Step 1: Create BotStartForm.js**

Modal form component with:
- Username input with validation (3-16 chars, alphanumeric + underscore)
- Mode select dropdown (survival/creative/spectator)
- Submit button calling POST /api/bot/start
- Error display

- [ ] **Step 2: Create BotList.js**

Left panel component with:
- Fetches bot list from GET /api/bots on mount
- WebSocket connection for real-time updates
- Search/filter input
- Status filter tabs (All/Alive/Dead)
- Bot cards with color-coded status indicators (green/yellow/red)
- Click handler to select bot
- "+ Start Bot" button that opens BotStartForm modal

- [ ] **Step 3: Create BotDetail.js**

Right panel component with:
- Displays selected bot info (username, botId, status, mode)
- 4 stat cards: Health, Food, Position, Mode
- Quick action buttons: Stop, Restart, Remove
- "Open Dashboard →" link to existing Dashboard
- Empty state when no bot selected

---

### Task 4: Create ConfigPanel and ConfigEditModal Components

**Files:**
- Create: `frontend/src/components/ConfigPanel.js`
- Create: `frontend/src/components/ConfigEditModal.js`

- [ ] **Step 1: Create ConfigEditModal.js**

Modal component for editing config values:
- Shows current vs new value
- Input field with validation
- Warning for .env changes requiring restart
- PUT /api/server/config/env or PUT /api/server/config/database

- [ ] **Step 2: Create ConfigPanel.js**

Config management component with:
- 5 category tabs: Bot Server, Minecraft Server, LLM/AI, Frontend, CLI & Defaults
- Table display of parameters with value, source, and Edit button
- Color-coded values (green for .env, amber for hardcoded)
- Fetches config from GET /api/server/config
- Save feedback messages

---

### Task 5: Create LogViewer Component

**Files:**
- Create: `frontend/src/components/LogViewer.js`
- Create: `frontend/src/components/LogViewer.css`

- [ ] **Step 1: Create LogViewer.css**

Styles for:
- Toolbar with search, filters, controls
- Log container with monospace font
- Color-coded log levels (blue=log, red=error, yellow=warn)
- Search highlight

- [ ] **Step 2: Create LogViewer.js**

Log viewer component with:
- Fetches logs from GET /api/server/logs
- Auto-refresh every 5 seconds (configurable: 3s/5s/10s/30s)
- Filter by level (All/Log/Error/Warn)
- Text search
- Pause/Resume auto-refresh
- Auto-scroll toggle
- Manual refresh button
- Line count display

---

### Task 6: Update App.js for Routing + Dashboard Back Link

**Files:**
- Modify: `frontend/src/App.js`
- Modify: `frontend/src/components/Dashboard.js`
- Modify: `frontend/src/components/Dashboard.css`

- [ ] **Step 1: Update App.js**

Replace App.js with hash-based routing:
- Import BotManagement
- Add currentView state ('management' or 'dashboard')
- Hash change listener: #management or #bots → management view, #dashboard → dashboard view
- Default view after login: management
- handleLogin sets hash to 'management'

- [ ] **Step 2: Add "Back to Management" to Dashboard.js**

Add button to header:
```javascript
<button onClick={() => { window.location.hash = 'management'; }} className="back-to-mgmt-btn">
  ← Management
</button>
```

- [ ] **Step 3: Add CSS for back button to Dashboard.css**

```css
.back-to-mgmt-btn {
  background: #3b82f6;
  color: #fff;
  border: none;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.3s ease;
  margin-right: 8px;
}

.back-to-mgmt-btn:hover {
  background: #2563eb;
  transform: translateY(-2px);
}
```

- [ ] **Step 4: Test navigation flow**

1. Login → lands on BotManagement (Bots tab)
2. Click Config tab → shows config table
3. Click Logs tab → shows log viewer
4. Select a bot → "Open Dashboard" link → navigates to Dashboard
5. Click "← Management" → returns to management page

---

### Task 7: Final Verification and Cleanup

- [ ] **Step 1: Verify frontend build**

```bash
cd /data/code/minebot/frontend && npm run build
```
Expected: Build succeeds with no errors.

- [ ] **Step 2: Verify no console errors**

Open browser to http://localhost:9500, login, navigate all tabs. Check browser console for errors. Expected: No errors.

- [ ] **Step 3: Test all tab functionality**

- Bots tab: List shows bots, filter works, search works, click selects bot, detail panel shows info
- Config tab: All 5 categories load, Edit modal works, save updates .env
- Logs tab: Logs load, auto-refresh works, filters work, search works

- [ ] **Step 4: Commit**

```bash
cd /data/code/minebot
git add \
  bot_server.js \
  frontend/src/App.js \
  frontend/src/components/BotManagement.js \
  frontend/src/components/BotManagement.css \
  frontend/src/components/BotList.js \
  frontend/src/components/BotDetail.js \
  frontend/src/components/BotStartForm.js \
  frontend/src/components/ConfigPanel.js \
  frontend/src/components/ConfigEditModal.js \
  frontend/src/components/LogViewer.js \
  frontend/src/components/LogViewer.css \
  frontend/src/components/Dashboard.js \
  frontend/src/components/Dashboard.css
git commit -m "feat: add bot management page with Bots, Config, and Logs tabs"
```
