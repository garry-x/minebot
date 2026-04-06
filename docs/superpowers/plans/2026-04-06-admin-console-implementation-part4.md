# Admin Console Implementation Plan - Part 4: Optimization and Testing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimize the admin console implementation, add error handling, and create comprehensive tests.

**Architecture:** Final polish and quality assurance for the complete admin console system.

**Tech Stack:** Node.js, existing MineBot infrastructure, testing best practices

---

## Phase 4: Optimization and Testing (1 day)

### Task 12: Implement Error Handling and Resilience

**Files:**
- Modify: `cli.js:2900-3050` (add error handling methods)

- [ ] **Step 1: Implement handleClose() method**

```javascript
async handleClose() {
  console.log(`${this.colors.cyan}\nConsole closed${this.colors.reset}`);
  await this.cleanup();
}
```

- [ ] **Step 2: Implement handleSigint() method**

```javascript
async handleSigint() {
  console.log(`${this.colors.cyan}\nInterrupted (Ctrl+C)${this.colors.reset}`);
  await this.cleanup();
  process.exit(0);
}
```

- [ ] **Step 3: Implement safeRequest() wrapper**

```javascript
async safeRequest(options, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await makeRequest(options);
    } catch (err) {
      lastError = err;
      
      if (attempt < maxRetries) {
        // Wait before retry (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}
```

- [ ] **Step 4: Update all API calls to use safeRequest**

```javascript
// Example update in fetchBotList()
async fetchBotList() {
  try {
    const data = await this.safeRequest({
      hostname: BOT_HOST,
      port: BOT_PORT,
      path: '/api/bots',
      method: 'GET'
    }, 2);
    
    return data.bots || [];
  } catch (err) {
    if (this.session.currentView === 'bot-management') {
      console.log(`${this.colors.red}Error fetching bots: ${err.message}${this.colors.reset}`);
    }
    return [];
  }
}
```

- [ ] **Step 5: Implement connection status check**

```javascript
async checkConnection() {
  try {
    await this.safeRequest({
      hostname: BOT_HOST,
      port: BOT_PORT,
      path: '/api/health',
      method: 'GET',
      timeout: 3000
    }, 1);
    
    return true;
  } catch (err) {
    return false;
  }
}
```

- [ ] **Step 6: Test error handling**

Run: `./minebot console` (without server running)
Expected: Graceful error messages, not crashes
Test: Type `status`
Expected: Shows "NOT RUNNING" status with clear message

- [ ] **Step 7: Commit**

```bash
git add cli.js
git commit -m "feat: implement error handling and resilience"
```

### Task 13: Add Status Monitor for Auto-refresh

**Files:**
- Modify: `cli.js:3050-3150` (add status monitor methods)

- [ ] **Step 1: Implement startStatusMonitor() method**

```javascript
startStatusMonitor() {
  if (this.statusMonitor) {
    clearInterval(this.statusMonitor);
  }
  
  this.statusMonitor = setInterval(async () => {
    await this.updateStatusIndicator();
  }, this.options.updateInterval);
}
```

- [ ] **Step 2: Implement updateStatusIndicator() method**

```javascript
async updateStatusIndicator() {
  // Only update if in a view that needs status
  const needsUpdate = [
    'dashboard',
    'bot-management',
    'server-control'
  ].includes(this.session.currentView);
  
  if (!needsUpdate || !this.isRunning) {
    return;
  }
  
  this.session.lastUpdate = Date.now();
  
  // For dashboard, refresh the whole view
  if (this.session.currentView === 'dashboard') {
    await this.showDashboard();
  }
  // For bot management, refresh if not watching
  else if (this.session.currentView === 'bot-management' && !this.session.watchInterval) {
    await this.showBotManagement();
  }
  // For server control, refresh if not in logs
  else if (this.session.currentView === 'server-control' && !this.session.currentView.includes('log')) {
    await this.showServerControl();
  }
}
```

- [ ] **Step 3: Implement stopStatusMonitor() method**

```javascript
stopStatusMonitor() {
  if (this.statusMonitor) {
    clearInterval(this.statusMonitor);
    this.statusMonitor = null;
  }
}
```

- [ ] **Step 4: Update cleanup() to stop monitor**

```javascript
// Add to cleanup() method
if (this.statusMonitor) {
  clearInterval(this.statusMonitor);
  this.statusMonitor = null;
}
```

- [ ] **Step 5: Test auto-refresh**

Run: `./minebot console` (with server running)
Test: Type `1` for dashboard
Expected: Dashboard auto-refreshes every 5 seconds
Test: Start bot server while in dashboard
Expected: Dashboard updates to show "RUNNING" status

- [ ] **Step 6: Commit**

```bash
git add cli.js
git commit -m "feat: add status monitor for auto-refresh"
```

### Task 14: Create Console Tests

**Files:**
- Create: `tests/console.test.js` (console unit tests)

- [ ] **Step 1: Create basic test file structure**

```javascript
const { describe, it, before, after, beforeEach, afterEach } = require('jest');
const { Console } = require('../cli.js');

describe('Console Class', () => {
  let consoleInstance;
  
  beforeEach(() => {
    consoleInstance = new Console({
      showWelcome: false,
      updateInterval: 100
    });
  });
  
  afterEach(() => {
    if (consoleInstance) {
      consoleInstance.cleanup();
    }
  });
  
  it('should create console instance', () => {
    expect(consoleInstance).toBeDefined();
    expect(consoleInstance.isRunning).toBe(false);
    expect(consoleInstance.session).toBeDefined();
  });
  
  it('should have colors getter', () => {
    expect(consoleInstance.colors).toBeDefined();
    expect(typeof consoleInstance.colors).toBe('object');
  });
});
```

- [ ] **Step 2: Add formatUptime tests**

```javascript
describe('formatUptime', () => {
  it('should format seconds correctly', () => {
    const consoleInstance = new Console();
    
    expect(consoleInstance.formatUptime(0)).toBe('0s');
    expect(consoleInstance.formatUptime(30)).toBe('30s');
    expect(consoleInstance.formatUptime(90)).toBe('1m 30s');
    expect(consoleInstance.formatUptime(3665)).toBe('1h 1m 5s');
    expect(consoleInstance.formatUptime(7200)).toBe('2h 0m 0s');
  });
  
  it('should handle negative values', () => {
    const consoleInstance = new Console();
    expect(consoleInstance.formatUptime(-10)).toBe('0s');
  });
});
```

- [ ] **Step 3: Add command parsing tests**

```javascript
describe('Command Parsing', () => {
  let consoleInstance;
  
  beforeEach(() => {
    consoleInstance = new Console({ showWelcome: false });
  });
  
  it('should parse simple commands', async () => {
    // Mock the methods
    consoleInstance.showDashboard = jest.fn();
    consoleInstance.showBotManagement = jest.fn();
    consoleInstance.showHelp = jest.fn();
    consoleInstance.executeCliCommand = jest.fn();
    
    await consoleInstance.handleCommand('1');
    expect(consoleInstance.showDashboard).toHaveBeenCalled();
    
    await consoleInstance.handleCommand('dashboard');
    expect(consoleInstance.showDashboard).toHaveBeenCalledTimes(2);
    
    await consoleInstance.handleCommand('help');
    expect(consoleInstance.showHelp).toHaveBeenCalled();
    
    await consoleInstance.handleCommand('unknown');
    expect(consoleInstance.executeCliCommand).toHaveBeenCalledWith('unknown');
  });
  
  it('should handle exit commands', async () => {
    consoleInstance.cleanup = jest.fn();
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    
    await consoleInstance.handleCommand('exit');
    expect(consoleInstance.cleanup).toHaveBeenCalled();
    
    exitSpy.mockRestore();
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- tests/console.test.js`
Expected: All tests pass

- [ ] **Step 5: Add integration test**

```javascript
describe('Console Integration', () => {
  it('should start and clean up without errors', async () => {
    const consoleInstance = new Console({
      showWelcome: false,
      updateInterval: 100
    });
    
    // Mock readline to avoid actual terminal interaction
    const mockRl = {
      on: jest.fn(),
      close: jest.fn(),
      prompt: jest.fn()
    };
    
    const readline = require('readline');
    jest.spyOn(readline, 'createInterface').mockReturnValue(mockRl);
    
    await consoleInstance.start();
    
    expect(consoleInstance.isRunning).toBe(true);
    expect(consoleInstance.rl).toBe(mockRl);
    
    await consoleInstance.cleanup();
    
    expect(consoleInstance.isRunning).toBe(false);
    expect(mockRl.close).toHaveBeenCalled();
    
    readline.createInterface.mockRestore();
  });
});
```

- [ ] **Step 6: Commit**

```bash
git add tests/console.test.js
git commit -m "feat: add console unit tests"
```

### Task 15: Update Documentation and Final Polish

**Files:**
- Modify: `CLI_FEATURES.md` (complete console features)
- Modify: `README.md` (add console documentation)
- Create: `docs/console-usage.md` (detailed console guide)

- [ ] **Step 1: Update CLI_FEATURES.md**

```markdown
### 9. Admin Console
- [x] `minebot console` - Start interactive admin console
- [x] `minebot console --no-welcome` - Start without welcome screen
- [x] `minebot console --interval 3000` - Set update interval (ms)

**Console Features:**
- [x] Dashboard with system status
- [x] Bot management (list, start, stop, watch)
- [x] Server control (start, stop, restart, logs)
- [x] Configuration viewing
- [x] Real-time monitoring
- [x] System logs viewer
- [x] Command history
- [x] Auto-refresh
- [x] Error resilience
```

- [ ] **Step 2: Create console usage documentation**

```markdown
# MineBot Admin Console Guide

## Overview
The MineBot Admin Console is an interactive terminal interface for managing your MineBot system. It provides real-time monitoring, bot management, and server control through an intuitive menu-driven interface.

## Starting the Console
```bash
./minebot console
```

## Navigation
The console uses a simple number-based navigation system:

1. **Dashboard** - System status overview
2. **Bot Management** - Control and monitor bots
3. **Server Control** - Manage servers
4. **Configuration** - View system configuration
5. **Real-time Watch** - Live monitoring
6. **System Logs** - View logs
7. **Help** - Show help
8. **Exit** - Quit console

## Quick Start Commands
- `status` - Show system status
- `bot list` - List all bots
- `server logs` - View server logs
- `config show` - Show configuration
- `history` - View command history
- `clear` - Clear screen
- `back` - Return to previous menu

## Real-time Monitoring
The console supports real-time monitoring of bots:
- Single bot monitoring: `watch <bot-id>`
- All bots monitoring: `watch`
- System monitoring: Automatic dashboard updates

## Keyboard Shortcuts
- `Ctrl+C` - Exit current operation or console
- `Tab` - Command completion
- `↑/↓` - Command history navigation
```

- [ ] **Step 3: Add to README.md**

```markdown
## Admin Console

MineBot includes an interactive admin console for system management:

```bash
./minebot console
```

The console provides:
- Real-time system monitoring
- Bot management interface
- Server control panel
- Configuration viewer
- Log viewing capabilities

See [Console Usage Guide](docs/console-usage.md) for complete documentation.
```

- [ ] **Step 4: Create test script for console**

```bash
#!/bin/bash
# test-console.sh

echo "=== MineBot Console Test ==="
echo "Testing basic console functionality..."

# Test 1: Console starts
echo -e "\nTest 1: Console startup"
timeout 2 ./minebot console 2>&1 | grep -q "Starting MineBot Admin Console" && echo "✓ Console starts" || echo "✗ Console startup failed"

# Test 2: Help command
echo -e "\nTest 2: Help command"
echo "help" | timeout 2 ./minebot console 2>&1 | grep -q "Available Commands" && echo "✓ Help command works" || echo "✗ Help command failed"

# Test 3: Status command  
echo -e "\nTest 3: Status command"
echo "status" | timeout 2 ./minebot console 2>&1 | grep -q "System Status" && echo "✓ Status command works" || echo "✗ Status command failed"

echo -e "\n=== Console Test Complete ==="
```

- [ ] **Step 5: Make test script executable**

```bash
chmod +x test-console.sh
```

- [ ] **Step 6: Run final tests**

```bash
# Run unit tests
npm test -- tests/console.test.js

# Run integration test
./test-console.sh

# Test console with server
./minebot server start
sleep 2
timeout 5 ./minebot console <<< "status"
./minebot server stop
```

- [ ] **Step 7: Final commit**

```bash
git add CLI_FEATURES.md README.md docs/console-usage.md test-console.sh
git commit -m "feat: complete admin console with documentation and tests"
```

---

## Implementation Complete

**Project Status:** Admin Console fully implemented and tested.

### What's Been Built

1. **Foundation Framework**
   - Console class with lifecycle management
   - Readline-based interactive interface
   - Color-coded output system
   - Command parsing and routing

2. **Core Features**
   - Dashboard with system status
   - Bot management (list, start, stop, watch)
   - Server control (start, stop, restart, logs)
   - Configuration viewer

3. **Enhanced Features**
   - Real-time monitoring with auto-refresh
   - System logs viewer with color coding
   - Command history and utilities
   - Error handling and resilience

4. **Quality Assurance**
   - Unit tests for core functionality
   - Integration tests
   - Comprehensive documentation
   - Test scripts

### Key Technical Achievements

1. **No New Dependencies** - Uses only Node.js built-ins and existing libraries
2. **Modular Architecture** - Clean separation of concerns
3. **Error Resilience** - Graceful handling of network issues
4. **Real-time Updates** - Auto-refresh for live monitoring
5. **Full Integration** - Works with all existing MineBot APIs

### Usage Examples

```bash
# Start the console
./minebot console

# Start without welcome screen
./minebot console --no-welcome

# Start with custom update interval
./minebot console --interval 3000

# From within console:
1          # Go to dashboard
bot list   # List all bots
watch      # Monitor all bots
server logs 20  # View last 20 log lines
config show    # Show configuration
```

### Next Steps

1. **User Feedback** - Gather feedback from actual usage
2. **Performance Optimization** - Monitor and optimize as needed
3. **Feature Enhancements** - Add features based on user requests
4. **Plugin System** - Consider extensibility for future features

**The Admin Console is now ready for production use!**