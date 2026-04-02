# Bot Management Page Design Spec

## Overview
Add a comprehensive management page to the Minecraft AI Robot web UI with three tabs:
1. **Bots** — View and control all bots from a split-panel interface
2. **Config** — Manage all project configuration parameters
3. **Logs** — Live server log viewer with auto-refresh

## Architecture

### Navigation Flow
```
Login → BotManagement (default landing)
  → Tab: Bots → Split panel: bot list + bot details
    → Click bot → loads details in right panel
    → Click "Open Dashboard" → navigates to existing Dashboard
  → Tab: Config → Category-based config editor
  → Tab: Logs → Live log viewer
  → Dashboard has "Back to Management" link to return
```

### App.js Changes
- Add hash-based routing: `#bots` (default), `#config`, `#logs`, `#dashboard/:botId`
- BotManagement becomes default after login
- Existing Dashboard remains accessible

## Component Structure

### New Components

#### BotManagement.js
- Main container with tab navigation (Bots / Config / Logs)
- Renders active tab content
- Shared header with user info and logout

#### Bots Tab

**BotList.js**
- Renders list of all bots (ALIVE, DEAD, DISCONNECTED)
- Color-coded status indicators:
  - ALIVE: green dot with pulse animation
  - DISCONNECTED: yellow/orange dot
  - DEAD: red dot
- Search/filter input (filters by username)
- Filter tabs: All, Alive, Dead
- Shows bot count summary
- Clicking a bot selects it and triggers right panel update

**BotDetail.js**
- Displays selected bot's information:
  - Username, botId, status, mode
  - Health, Food, Position, GameMode stat cards
- Quick Actions toolbar:
  - Stop, Restart, Automatic, Gather, Build, Remove
- "Open Dashboard →" link to existing Dashboard for that bot
- Shows empty state message when no bot selected

**BotStartForm.js**
- Modal or inline form for starting a new bot
- Fields:
  - Username input (validated 3-16 chars, letters/numbers/underscores)
  - Mode select dropdown: survival, creative, spectator
  - Submit button: "Start Bot"
- On success: refreshes bot list, selects the new bot

#### Config Tab

**ConfigPanel.js**
- Displays configuration in 5 category tabs:
  1. **Bot Server** — HOST, PORT, auto-reconnect retries/delay, broadcast interval, server state save interval, cleanup threshold
  2. **Minecraft Server** — MC server host/port, JAR path, server directory, max memory
  3. **LLM / AI** — LLM service URL, vLLM URL, USE_FALLBACK, model, temperature, max tokens
  4. **Frontend** — Frontend port, static build path
  5. **CLI & Defaults** — CLI host/port, bot defaults (building dimensions, gathering radius/targets)

- Each category shows a table of parameters with:
  - Parameter name
  - Current value (color-coded: green = from .env, amber = hardcoded default)
  - Source (.env / hardcoded / database)
  - Edit button for modifiable parameters
- "Save & Restart Required" banner for .env changes that need server restart
- Database defaults (building dimensions, gathering config) can be saved directly via API
- Read-only indicator for hardcoded values

**ConfigEditModal.js**
- Modal dialog for editing a config value
- Input field with validation (number, URL, path, etc.)
- Shows current vs. new value
- Save/Cancel buttons
- For .env changes: warning that server restart is needed

#### Logs Tab

**LogViewer.js**
- Live log viewer reading from `GET /api/server/logs` endpoint
- Auto-refresh every 5 seconds (configurable: 3s, 5s, 10s, 30s)
- Filter by log level: All, Log, Error, Warn
- Search/filter text input
- Scrollable log area (auto-scroll to bottom toggle)
- Each log entry shows:
  - Timestamp
  - Level badge (color-coded)
  - Message
- "Pause" / "Resume" auto-refresh toggle
- Log line count display
- Manual refresh button

#### Existing Component Modifications

**Dashboard.js**
- Add "Back to Management" link/button in header
- No other changes needed

**App.js**
- Add hash-based routing: `#bots` (default), `#config`, `#logs`, `#dashboard/:botId`
- Preserve existing auth logic (localStorage)

## Backend API

### New Endpoints Needed

| Method | Path | Purpose | Response |
|--------|------|---------|----------|
| `GET` | `/api/server/config` | Get all current configuration | `{ env: {...}, defaults: {...}, database: {...} }` |
| `PUT` | `/api/server/config/env` | Update .env variable | `{ success, key, value, requiresRestart }` |
| `PUT` | `/api/server/config/database` | Update database defaults | `{ success, category, values }` |
| `GET` | `/api/server/logs` | Get recent log entries | `{ lines: [{timestamp, level, message}, ...], total }` |
| `GET` | `/api/server/status` | Get server runtime status | `{ uptime, pid, activeBots, retryQueue, verbose }` |

### Existing Endpoints Used

| Feature | Endpoint | Method |
|---------|----------|--------|
| List all bots | `/api/bots` | GET |
| Start bot | `/api/bot/start` | POST |
| Stop bot | `/api/bot/:id/stop` | POST |
| Restart bot | `/api/bot/:id/restart` | POST |
| Remove bot | `/api/bot/:id` | DELETE |

### WebSocket
- Connects to `ws://localhost:9500` on mount
- Sends `get_status` on connect
- Listens for `status_update` messages to refresh bot list
- Auto-reconnect on disconnect (3s delay)

### State Management
- React useState hooks (same pattern as existing Dashboard)
- No Redux or Context needed

**BotManagement state:**
- `activeTab` — 'bots', 'config', or 'logs'

**Bots tab state:**
- `bots` — array of bot objects from API
- `selectedBot` — currently selected bot in right panel
- `searchQuery` — filter text
- `statusFilter` — 'all', 'alive', 'dead'
- `wsConnected` — WebSocket connection status

**Config tab state:**
- `config` — current configuration values by category
- `editingKey` — currently editing parameter
- `unsavedChanges` — boolean flag

**Logs tab state:**
- `logs` — array of log entries
- `filterLevel` — 'all', 'log', 'error', 'warn'
- `searchQuery` — text filter
- `autoRefresh` — boolean
- `refreshInterval` — milliseconds
- `autoScroll` — boolean
- `paused` — boolean

## Error Handling
- API errors shown as toast/notification messages
- WebSocket disconnect: show indicator, auto-reconnect
- Bot start failures: show error in form context
- Empty bot list: show friendly "No bots yet" message
- Config save failures: show inline error
- Log fetch failures: show retry button

## Styling
- Follow existing Dashboard.css patterns (dark theme)
- Tab navigation at top of management page
- Split panel layout using flexbox for Bots tab
- Config tables with alternating row colors
- Log viewer with monospace font, color-coded levels
- Responsive: panels stack vertically on small screens
- Consistent with existing BotControls.js button styles
