# Admin Console Implementation Plan - Part 1: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an interactive admin console for MineBot that provides system monitoring and management through a terminal interface.

**Architecture:** Extend the existing CLI with a new `console` subsystem that uses Node.js readline for interactive sessions, reuses existing CLI functions, and provides dashboard, bot management, server control, and real-time monitoring features.

**Tech Stack:** Node.js, readline (built-in), chalk (existing dependency), existing MineBot CLI infrastructure

---

## File Structure

### New Files
- `cli.js` - Add new console functions and Console class
- No new external dependencies needed

### Modified Files
- `cli.js` - Add console command handling and new functions
- `CLI_FEATURES.md` - Update with new console features

### Architecture
```
cli.js (existing)
├── consoleMain() - Entry point for console subsystem
├── Console class
│   ├── constructor(), start(), cleanup()
│   ├── displayMenu(), handleCommand()
│   ├── showDashboard(), showBotManagement(), etc.
│   └── executeCliCommand() - Integration with existing CLI
└── helpers (internal)
    ├── formatStatus() - Status formatting helpers
    └── commandParser() - Command parsing helpers
```

---

## Phase 1: Foundation Framework (2 days)

### Task 1: Add Console Command to CLI

**Files:**
- Modify: `cli.js:1-50` (add console command to main switch)
- Modify: `cli.js:1500-1518` (add consoleMain function)
- Modify: `CLI_FEATURES.md:1-10` (add console to features list)

- [ ] **Step 1: Add console command to main CLI switch**

```javascript
// In cli.js around line where other systems are handled
case 'console':
  await consoleMain(actionArgs, parsedArgs);
  break;
```

- [ ] **Step 2: Add console to CLI_FEATURES.md**

```markdown
### 9. Admin Console
- [ ] `minebot console` - Start interactive admin console
- [ ] `minebot console help` - Console help information
```

- [ ] **Step 3: Create consoleMain function skeleton**

```javascript
async function consoleMain(args = [], options = {}) {
  console.log(`${colors.cyan}Starting MineBot Admin Console...${colors.reset}`);
  
  // Initialize console
  const adminConsole = new Console();
  
  try {
    await adminConsole.start();
  } catch (err) {
    console.error(`${colors.red}Console error: ${err.message}${colors.reset}`);
  } finally {
    await adminConsole.cleanup();
  }
}
```

- [ ] **Step 4: Test basic console command**

Run: `./minebot console`
Expected: Shows "Starting MineBot Admin Console..." then exits (no Console class yet)

- [ ] **Step 5: Commit**

```bash
git add cli.js CLI_FEATURES.md
git commit -m "feat: add console command skeleton"
```

### Task 2: Implement Console Class Foundation

**Files:**
- Create: `cli.js:1520-1650` (Console class implementation)
- Modify: `cli.js:1500-1518` (update consoleMain to use Console class)

- [ ] **Step 1: Implement Console class constructor**

```javascript
class Console {
  constructor(options = {}) {
    this.options = {
      updateInterval: options.updateInterval || 5000,
      showWelcome: options.showWelcome !== false,
      ...options
    };
    
    this.rl = null;
    this.session = {
      history: [],
      currentView: 'menu',
      lastUpdate: Date.now()
    };
    this.isRunning = false;
    this.statusMonitor = null;
  }
  
  get colors() {
    return colors;
  }
}
```

- [ ] **Step 2: Implement start() method**

```javascript
async start() {
  if (this.isRunning) return;
  
  this.isRunning = true;
  
  // Setup readline interface
  this.rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
    completer: this.completer.bind(this)
  });
  
  // Setup event handlers
  this.rl.on('line', this.handleLine.bind(this));
  this.rl.on('close', this.handleClose.bind(this));
  this.rl.on('SIGINT', this.handleSigint.bind(this));
  
  // Show welcome screen
  if (this.options.showWelcome) {
    await this.showWelcome();
  }
  
  // Start status monitor
  this.startStatusMonitor();
  
  // Show main menu
  await this.showMainMenu();
}
```

- [ ] **Step 3: Implement cleanup() method**

```javascript
async cleanup() {
  if (!this.isRunning) return;
  
  this.isRunning = false;
  
  // Stop status monitor
  if (this.statusMonitor) {
    clearInterval(this.statusMonitor);
    this.statusMonitor = null;
  }
  
  // Close readline
  if (this.rl) {
    this.rl.close();
    this.rl = null;
  }
  
  console.log(`\n${this.colors.cyan}Console stopped. Goodbye!${this.colors.reset}`);
}
```

- [ ] **Step 4: Update consoleMain to use Console class**

```javascript
async function consoleMain(args = [], options = {}) {
  console.log(`${colors.cyan}Starting MineBot Admin Console...${colors.reset}`);
  
  const adminConsole = new Console(options);
  
  try {
    await adminConsole.start();
  } catch (err) {
    console.error(`${colors.red}Console error: ${err.message}${colors.reset}`);
    process.exit(1);
  }
}
```

- [ ] **Step 5: Test Console class**

Run: `./minebot console`
Expected: Shows welcome message, sets up readline, waits for input

- [ ] **Step 6: Commit**

```bash
git add cli.js
git commit -m "feat: implement Console class foundation"
```

### Task 3: Implement Basic UI Components

**Files:**
- Modify: `cli.js:1650-1750` (add UI helper methods to Console class)

- [ ] **Step 1: Implement showWelcome() method**

```javascript
async showWelcome() {
  this.clearScreen();
  
  console.log(`${this.colors.cyan}═══════════════════════════════════════════════════════════════${this.colors.reset}`);
  console.log(`${this.colors.bright}${this.colors.cyan}           MineBot Admin Console v1.0${this.colors.reset}`);
  console.log(`${this.colors.cyan}═══════════════════════════════════════════════════════════════${this.colors.reset}`);
  console.log();
  console.log(`${this.colors.gray}Type 'help' for commands, 'exit' to quit${this.colors.reset}`);
  console.log();
}
```

- [ ] **Step 2: Implement clearScreen() method**

```javascript
clearScreen() {
  process.stdout.write('\x1B[2J\x1B[0f');
}
```

- [ ] **Step 3: Implement showMainMenu() method**

```javascript
async showMainMenu() {
  this.session.currentView = 'menu';
  
  console.log(`${this.colors.cyan}Main Menu${this.colors.reset}`);
  console.log(`${this.colors.cyan}═══════════════════════════════════════════════════════════════${this.colors.reset}`);
  console.log();
  console.log(`[1] ${this.colors.bright}Dashboard${this.colors.reset}      [2] ${this.colors.bright}Bot Management${this.colors.reset}`);
  console.log(`[3] ${this.colors.bright}Server Control${this.colors.reset} [4] ${this.colors.bright}Configuration${this.colors.reset}`);
  console.log(`[5] ${this.colors.bright}Real-time Watch${this.colors.reset} [6] ${this.colors.bright}System Logs${this.colors.reset}`);
  console.log(`[7] ${this.colors.bright}Help${this.colors.reset}           [8] ${this.colors.bright}Exit${this.colors.reset}`);
  console.log();
  console.log(`${this.colors.cyan}Enter command (or number):${this.colors.reset}`);
  
  if (this.rl) {
    this.rl.prompt();
  }
}
```

- [ ] **Step 4: Implement handleLine() method**

```javascript
async handleLine(input) {
  const trimmed = input.trim();
  
  if (!trimmed) {
    if (this.rl) this.rl.prompt();
    return;
  }
  
  // Add to history
  this.session.history.push({
    command: trimmed,
    timestamp: Date.now(),
    view: this.session.currentView
  });
  
  // Keep only last 100 commands
  if (this.session.history.length > 100) {
    this.session.history.shift();
  }
  
  // Handle command
  await this.handleCommand(trimmed);
}
```

- [ ] **Step 5: Implement handleCommand() method skeleton**

```javascript
async handleCommand(input) {
  const cmd = input.toLowerCase().trim();
  
  // Handle exit commands
  if (cmd === 'exit' || cmd === 'quit' || cmd === '8') {
    await this.cleanup();
    process.exit(0);
    return;
  }
  
  // Handle help
  if (cmd === 'help' || cmd === '?' || cmd === '7') {
    await this.showHelp();
    return;
  }
  
  // Handle menu navigation
  switch(cmd) {
    case '1':
    case 'dashboard':
      await this.showDashboard();
      break;
    case '2':
    case 'bot':
    case 'bots':
      await this.showBotManagement();
      break;
    case '3':
    case 'server':
      await this.showServerControl();
      break;
    case '4':
    case 'config':
    case 'configuration':
      await this.showConfiguration();
      break;
    case '5':
    case 'watch':
      await this.showRealTimeWatch();
      break;
    case '6':
    case 'logs':
      await this.showSystemLogs();
      break;
    case 'back':
      await this.showMainMenu();
      break;
    default:
      // Try to execute as CLI command
      await this.executeCliCommand(cmd);
  }
}
```

- [ ] **Step 6: Test UI components**

Run: `./minebot console`
Expected: Shows welcome screen and main menu, accepts input, handles exit command

- [ ] **Step 7: Commit**

```bash
git add cli.js
git commit -m "feat: implement basic UI components"
```

### Task 4: Implement CLI Command Integration

**Files:**
- Modify: `cli.js:1750-1850` (add executeCliCommand and helpers)

- [ ] **Step 1: Implement executeCliCommand() method**

```javascript
async executeCliCommand(input) {
  const [command, ...args] = input.split(/\s+/);
  
  console.log(`${this.colors.gray}Executing: ${command} ${args.join(' ')}${this.colors.reset}`);
  
  try {
    // Map console commands to existing CLI functions
    switch(command.toLowerCase()) {
      case 'status':
        await this.executeStatusCommand(args);
        break;
      case 'bot':
        await this.executeBotCommand(args);
        break;
      case 'server':
        await this.executeServerCommand(args);
        break;
      case 'config':
        await this.executeConfigCommand(args);
        break;
      case 'mc':
        await this.executeMcCommand(args);
        break;
      default:
        console.log(`${this.colors.yellow}Unknown command: ${command}${this.colors.reset}`);
        console.log(`${this.colors.gray}Type 'help' for available commands${this.colors.reset}`);
    }
  } catch (err) {
    console.log(`${this.colors.red}Error: ${err.message}${this.colors.reset}`);
  }
  
  if (this.rl && this.session.currentView === 'menu') {
    this.rl.prompt();
  }
}
```

- [ ] **Step 2: Implement executeStatusCommand() helper**

```javascript
async executeStatusCommand(args) {
  // Call existing status function
  const status = await checkSystemStatus();
  
  console.log(`${this.colors.cyan}System Status${this.colors.reset}`);
  console.log(`${this.colors.cyan}═══════════════════════════════════════════════════════════════${this.colors.reset}`);
  console.log();
  
  if (status.botServer === 'RUNNING') {
    console.log(`Bot Server:    ${this.colors.green}✓ RUNNING${this.colors.reset}`);
    if (status.botServerUptime) {
      console.log(`  Uptime:      ${status.botServerUptime}`);
    }
  } else {
    console.log(`Bot Server:    ${this.colors.red}✗ NOT RUNNING${this.colors.reset}`);
  }
  
  if (status.mcServer === 'RUNNING') {
    console.log(`MC Server:     ${this.colors.green}✓ RUNNING${this.colors.reset}`);
  } else {
    console.log(`MC Server:     ${this.colors.red}✗ NOT RUNNING${this.colors.reset}`);
  }
  
  console.log(`Active Bots:   ${status.botCount || 0}`);
  console.log();
}
```

- [ ] **Step 3: Implement command completer for readline**

```javascript
completer(line) {
  const completions = [
    'dashboard', 'bot', 'server', 'config', 'watch', 'logs',
    'help', 'exit', 'status', 'list', 'start', 'stop', 'restart',
    'back', 'clear', 'history'
  ];
  
  const hits = completions.filter((c) => c.startsWith(line));
  
  // Show all completions if none found
  return [hits.length ? hits : completions, line];
}
```

- [ ] **Step 4: Implement showHelp() method**

```javascript
async showHelp() {
  console.log(`${this.colors.cyan}Available Commands${this.colors.reset}`);
  console.log(`${this.colors.cyan}═══════════════════════════════════════════════════════════════${this.colors.reset}`);
  console.log();
  console.log(`${this.colors.bright}Navigation:${this.colors.reset}`);
  console.log(`  dashboard, 1      - Show system dashboard`);
  console.log(`  bot, 2           - Bot management`);
  console.log(`  server, 3        - Server control`);
  console.log(`  config, 4        - Configuration management`);
  console.log(`  watch, 5         - Real-time monitoring`);
  console.log(`  logs, 6          - System logs`);
  console.log(`  help, 7          - This help screen`);
  console.log(`  exit, 8, quit    - Exit console`);
  console.log(`  back             - Return to main menu`);
  console.log();
  console.log(`${this.colors.bright}CLI Commands:${this.colors.reset}`);
  console.log(`  status           - Show system status`);
  console.log(`  bot list         - List all bots`);
  console.log(`  bot start <name> - Start a bot`);
  console.log(`  bot stop <id>    - Stop a bot`);
  console.log(`  server start     - Start bot server`);
  console.log(`  server stop      - Stop bot server`);
  console.log(`  config show      - Show configuration`);
  console.log();
  console.log(`${this.colors.bright}Utilities:${this.colors.reset}`);
  console.log(`  clear            - Clear screen`);
  console.log(`  history          - Show command history`);
  console.log();
}
```

- [ ] **Step 5: Test CLI integration**

Run: `./minebot console`
Test commands: `help`, `status`, `exit`
Expected: Help shows commands, status shows system info, exit quits

- [ ] **Step 6: Commit**

```bash
git add cli.js
git commit -m "feat: implement CLI command integration and help system"
```

---

## Phase 1 Complete

**Checkpoint:** Foundation framework is now complete. The console can:
- Start and exit cleanly
- Display welcome screen and main menu
- Handle basic navigation commands
- Integrate with existing CLI commands
- Provide command completion and help

**Next Phase:** Core features (Dashboard, Bot Management, Server Control)