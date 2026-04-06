# Admin Console Implementation Plan - Part 3: Enhanced Features

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement enhanced admin console features including real-time monitoring, system logs, and utility functions.

**Architecture:** Build on the core features from Phase 2, adding real-time updates and advanced monitoring capabilities.

**Tech Stack:** Node.js, readline (built-in), chalk (existing), MineBot API integration

---

## Phase 3: Enhanced Features (2 days)

### Task 9: Implement Real-time Monitoring

**Files:**
- Modify: `cli.js:2450-2600` (add real-time monitoring methods)

- [ ] **Step 1: Implement showRealTimeWatch() method**

```javascript
async showRealTimeWatch() {
  this.session.currentView = 'real-time-watch';
  this.clearScreen();
  
  console.log(`${this.colors.cyan}Real-time Monitoring${this.colors.reset}`);
  console.log(`${this.colors.cyan}═══════════════════════════════════════════════════════════════${this.colors.reset}`);
  console.log();
  
  console.log(`${this.colors.yellow}Select monitoring mode:${this.colors.reset}`);
  console.log(`[1] ${this.colors.bright}Single Bot${this.colors.reset} - Monitor specific bot`);
  console.log(`[2] ${this.colors.bright}All Bots${this.colors.reset} - Monitor all active bots`);
  console.log(`[3] ${this.colors.bright}System${this.colors.reset} - Monitor system resources`);
  console.log(`[4] ${this.colors.bright}Back${this.colors.reset} - Return to main menu`);
  console.log();
  console.log(`${this.colors.cyan}Enter choice:${this.colors.reset}`);
  
  if (this.rl) {
    this.rl.prompt();
  }
}
```

- [ ] **Step 2: Implement watchSingleBot() method**

```javascript
async watchSingleBot(botId = null) {
  if (!botId) {
    console.log(`${this.colors.yellow}Enter bot ID to monitor:${this.colors.reset}`);
    return;
  }
  
  this.session.currentView = 'single-bot-watch';
  this.session.watchInterval = null;
  this.session.watchCount = 0;
  
  const startWatching = async () => {
    this.clearScreen();
    
    console.log(`${this.colors.cyan}Bot Monitor - ${botId}${this.colors.reset}`);
    console.log(`${this.colors.cyan}═══════════════════════════════════════════════════════════════${this.colors.reset}`);
    console.log();
    
    try {
      const data = await makeRequest({
        hostname: BOT_HOST,
        port: BOT_PORT,
        path: `/api/bot/${botId}/inspect`,
        method: 'GET'
      });
      
      if (data.success && data.bot) {
        const bot = data.bot;
        this.session.watchCount++;
        
        console.log(`${this.colors.bright}Update #${this.session.watchCount} - ${new Date().toLocaleTimeString()}${this.colors.reset}`);
        console.log();
        
        console.log(`${this.colors.bright}Bot Information:${this.colors.reset}`);
        console.log(`  ID:       ${bot.botId}`);
        console.log(`  Username: ${bot.username}`);
        console.log(`  State:    ${bot.state === 'ALIVE' ? this.colors.green + 'ALIVE' : this.colors.red + 'DEAD'}${this.colors.reset}`);
        console.log(`  Mode:     ${bot.mode || 'N/A'}`);
        console.log(`  Game:     ${bot.gameMode || 'N/A'}`);
        console.log(`  Connected: ${bot.connected ? this.colors.green + 'Yes' : this.colors.red + 'No'}${this.colors.reset}`);
        
        console.log();
        console.log(`${this.colors.bright}Status:${this.colors.reset}`);
        if (bot.health !== undefined) {
          const healthColor = bot.health <= 5 ? this.colors.red :
                             bot.health <= 10 ? this.colors.yellow : this.colors.green;
          console.log(`  Health:   ${healthColor}${bot.health}${this.colors.reset}/20`);
        }
        if (bot.food !== undefined) {
          console.log(`  Food:     ${bot.food}/20`);
        }
        
        if (bot.position) {
          console.log();
          console.log(`${this.colors.bright}Position:${this.colors.reset}`);
          console.log(`  X: ${bot.position.x || 'N/A'}`);
          console.log(`  Y: ${bot.position.y || 'N/A'}`);
          console.log(`  Z: ${bot.position.z || 'N/A'}`);
        }
        
        if (bot.inventory && bot.inventory.length > 0) {
          console.log();
          console.log(`${this.colors.bright}Inventory (${bot.inventory.length} items):${this.colors.reset}`);
          // Show first few items
          bot.inventory.slice(0, 5).forEach((item, idx) => {
            console.log(`  ${idx + 1}. ${item.name || 'Unknown'} x${item.count || 1}`);
          });
          if (bot.inventory.length > 5) {
            console.log(`  ... and ${bot.inventory.length - 5} more`);
          }
        }
      } else {
        console.log(`${this.colors.red}Bot not found or error: ${data.error || 'Unknown error'}${this.colors.reset}`);
      }
    } catch (err) {
      console.log(`${this.colors.red}Error fetching bot data: ${err.message}${this.colors.reset}`);
    }
    
    console.log();
    console.log(`${this.colors.cyan}═══════════════════════════════════════════════════════════════${this.colors.reset}`);
    console.log(`${this.colors.gray}Press 's' to stop, 'm' for menu${this.colors.reset}`);
  };
  
  // Start interval
  startWatching();
  this.session.watchInterval = setInterval(startWatching, 2000);
}
```

- [ ] **Step 3: Implement watchAllBots() method**

```javascript
async watchAllBots() {
  this.session.currentView = 'all-bots-watch';
  this.session.watchInterval = null;
  this.session.watchCount = 0;
  
  const startWatching = async () => {
    this.clearScreen();
    
    console.log(`${this.colors.cyan}Bots Monitor - All Active Bots${this.colors.reset}`);
    console.log(`${this.colors.cyan}═══════════════════════════════════════════════════════════════${this.colors.reset}`);
    console.log();
    
    try {
      const data = await makeRequest({
        hostname: BOT_HOST,
        port: BOT_PORT,
        path: '/api/bots',
        method: 'GET'
      });
      
      if (data && data.bots) {
        this.session.watchCount++;
        
        console.log(`${this.colors.bright}Update #${this.session.watchCount} - ${new Date().toLocaleTimeString()}${this.colors.reset}`);
        console.log(`${this.colors.green}Active Bots: ${data.bots.length}${this.colors.reset}\n`);
        
        data.bots.forEach((bot, idx) => {
          const stateColor = bot.state === 'ALIVE' ? this.colors.green :
                            bot.state === 'DEAD' ? this.colors.red : this.colors.yellow;
          
          console.log(`${this.colors.bright}[${idx + 1}] ${bot.username}${this.colors.reset} (${bot.botId})`);
          console.log(`    State: ${stateColor}${bot.state}${this.colors.reset} | Health: ${bot.health || 'N/A'}/20`);
          console.log(`    Pos: ${bot.position ? `${bot.position.x}, ${bot.position.y}, ${bot.position.z}` : 'N/A'}`);
          console.log();
        });
      } else {
        console.log(`${this.colors.yellow}No active bots found${this.colors.reset}`);
      }
    } catch (err) {
      console.log(`${this.colors.red}Error fetching bots: ${err.message}${this.colors.reset}`);
    }
    
    console.log(`${this.colors.cyan}═══════════════════════════════════════════════════════════════${this.colors.reset}`);
    console.log(`${this.colors.gray}Press 's' to stop, 'm' for menu${this.colors.reset}`);
  };
  
  // Start interval
  startWatching();
  this.session.watchInterval = setInterval(startWatching, 3000);
}
```

- [ ] **Step 4: Implement stopWatching() method**

```javascript
stopWatching() {
  if (this.session.watchInterval) {
    clearInterval(this.session.watchInterval);
    this.session.watchInterval = null;
    this.session.watchCount = 0;
  }
  
  console.log(`${this.colors.cyan}Monitoring stopped${this.colors.reset}`);
  this.showRealTimeWatch();
}
```

- [ ] **Step 5: Update handleCommand for monitoring controls**

```javascript
// Add to handleCommand method
case 's':
case 'stop':
  if (this.session.currentView.includes('watch')) {
    this.stopWatching();
  }
  break;
```

- [ ] **Step 6: Test real-time monitoring**

Run: `./minebot console`
Test: Type `5` or `watch`
Expected: Shows monitoring menu
Test: Type `2` then `bot list` to get bot ID, then `watch <bot-id>`
Expected: Shows real-time bot monitoring

- [ ] **Step 7: Commit**

```bash
git add cli.js
git commit -m "feat: implement real-time monitoring"
```

### Task 10: Implement System Logs Module

**Files:**
- Modify: `cli.js:2600-2750` (add system logs methods)

- [ ] **Step 1: Implement showSystemLogs() method**

```javascript
async showSystemLogs() {
  this.session.currentView = 'system-logs';
  this.clearScreen();
  
  console.log(`${this.colors.cyan}System Logs${this.colors.reset}`);
  console.log(`${this.colors.cyan}═══════════════════════════════════════════════════════════════${this.colors.reset}`);
  console.log();
  
  console.log(`${this.colors.yellow}Select log source:${this.colors.reset}`);
  console.log(`[1] ${this.colors.bright}Bot Server${this.colors.reset} - bot_server.log`);
  console.log(`[2] ${this.colors.bright}Minecraft Server${this.colors.reset} - minecraft_server.log`);
  console.log(`[3] ${this.colors.bright}Application${this.colors.reset} - application.log`);
  console.log(`[4] ${this.colors.bright}Back${this.colors.reset} - Return to main menu`);
  console.log();
  console.log(`${this.colors.cyan}Enter choice:${this.colors.reset}`);
  
  if (this.rl) {
    this.rl.prompt();
  }
}
```

- [ ] **Step 2: Implement showLogFile() method**

```javascript
async showLogFile(logType, lines = 50) {
  this.session.currentView = `log-${logType}`;
  
  let logFile;
  switch(logType) {
    case 'bot':
      logFile = path.join(__dirname, 'logs', 'bot_server.log');
      break;
    case 'minecraft':
      logFile = path.join(__dirname, 'logs', 'minecraft_server.log');
      break;
    case 'app':
      logFile = path.join(__dirname, 'logs', 'application.log');
      break;
    default:
      console.log(`${this.colors.red}Unknown log type: ${logType}${this.colors.reset}`);
      return;
  }
  
  const displayLogs = async () => {
    this.clearScreen();
    
    console.log(`${this.colors.cyan}${logType.toUpperCase()} Logs - ${path.basename(logFile)}${this.colors.reset}`);
    console.log(`${this.colors.cyan}═══════════════════════════════════════════════════════════════${this.colors.reset}`);
    console.log();
    
    try {
      if (fs.existsSync(logFile)) {
        const stats = fs.statSync(logFile);
        const content = fs.readFileSync(logFile, 'utf8');
        const allLines = content.trim().split('\n').filter(line => line.trim());
        const recentLines = allLines.slice(-lines);
        
        console.log(`${this.colors.gray}File: ${logFile}${this.colors.reset}`);
        console.log(`${this.colors.gray}Size: ${this.formatFileSize(stats.size)} | Lines: ${allLines.length}${this.colors.reset}`);
        console.log();
        
        if (recentLines.length === 0) {
          console.log(`${this.colors.yellow}No log entries found${this.colors.reset}`);
        } else {
          recentLines.forEach((line, idx) => {
            // Color code by log level
            let color = this.colors.reset;
            if (line.includes('[ERROR]') || line.toLowerCase().includes('error')) {
              color = this.colors.red;
            } else if (line.includes('[WARN]') || line.toLowerCase().includes('warning')) {
              color = this.colors.yellow;
            } else if (line.includes('[INFO]')) {
              color = this.colors.cyan;
            } else if (line.includes('[DEBUG]')) {
              color = this.colors.gray;
            }
            
            const lineNum = allLines.length - recentLines.length + idx + 1;
            console.log(`${color}${lineNum.toString().padStart(4)}: ${line}${this.colors.reset}`);
          });
        }
      } else {
        console.log(`${this.colors.yellow}Log file not found: ${logFile}${this.colors.reset}`);
        console.log(`${this.colors.gray}Creating new log file...${this.colors.reset}`);
        
        // Create directory if needed
        const logDir = path.dirname(logFile);
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }
        
        // Create empty file
        fs.writeFileSync(logFile, '');
        console.log(`${this.colors.green}✓ Created new log file${this.colors.reset}`);
      }
    } catch (err) {
      console.log(`${this.colors.red}Error reading log file: ${err.message}${this.colors.reset}`);
    }
    
    console.log();
    console.log(`${this.colors.cyan}═══════════════════════════════════════════════════════════════${this.colors.reset}`);
    console.log(`${this.colors.gray}Commands: more <lines> | follow | clear | back${this.colors.reset}`);
  };
  
  await displayLogs();
  
  if (this.rl) {
    this.rl.prompt();
  }
}
```

- [ ] **Step 3: Implement formatFileSize() helper**

```javascript
formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
```

- [ ] **Step 4: Implement followLogs() method**

```javascript
async followLogs(logType) {
  this.session.currentView = `follow-${logType}`;
  this.session.followInterval = null;
  
  let logFile;
  switch(logType) {
    case 'bot':
      logFile = path.join(__dirname, 'logs', 'bot_server.log');
      break;
    case 'minecraft':
      logFile = path.join(__dirname, 'logs', 'minecraft_server.log');
      break;
    default:
      return;
  }
  
  let lastSize = 0;
  
  const follow = async () => {
    try {
      if (fs.existsSync(logFile)) {
        const stats = fs.statSync(logFile);
        
        if (stats.size > lastSize) {
          const stream = fs.createReadStream(logFile, { start: lastSize, encoding: 'utf8' });
          
          stream.on('data', (data) => {
            const lines = data.split('\n').filter(line => line.trim());
            lines.forEach(line => {
              // Color code by log level
              let color = this.colors.reset;
              if (line.includes('[ERROR]') || line.toLowerCase().includes('error')) {
                color = this.colors.red;
              } else if (line.includes('[WARN]') || line.toLowerCase().includes('warning')) {
                color = this.colors.yellow;
              } else if (line.includes('[INFO]')) {
                color = this.colors.cyan;
              } else if (line.includes('[DEBUG]')) {
                color = this.colors.gray;
              }
              
              console.log(`${color}${new Date().toLocaleTimeString()}: ${line}${this.colors.reset}`);
            });
          });
          
          stream.on('end', () => {
            lastSize = stats.size;
          });
        }
      }
    } catch (err) {
      // Ignore errors during follow
    }
  };
  
  // Clear screen and show header
  this.clearScreen();
  console.log(`${this.colors.cyan}Following ${logType} logs - ${path.basename(logFile)}${this.colors.reset}`);
  console.log(`${this.colors.cyan}═══════════════════════════════════════════════════════════════${this.colors.reset}`);
  console.log(`${this.colors.gray}Press Ctrl+C to stop following${this.colors.reset}`);
  console.log();
  
  // Start following
  this.session.followInterval = setInterval(follow, 1000);
}
```

- [ ] **Step 5: Test system logs**

Run: `./minebot console`
Test: Type `6` or `logs`
Expected: Shows logs menu
Test: Type `1`
Expected: Shows bot server logs

- [ ] **Step 6: Commit**

```bash
git add cli.js
git commit -m "feat: implement system logs module"
```

### Task 11: Implement Utility Functions

**Files:**
- Modify: `cli.js:2750-2900` (add utility methods)

- [ ] **Step 1: Implement showHistory() method**

```javascript
async showHistory() {
  this.session.currentView = 'history';
  this.clearScreen();
  
  console.log(`${this.colors.cyan}Command History${this.colors.reset}`);
  console.log(`${this.colors.cyan}═══════════════════════════════════════════════════════════════${this.colors.reset}`);
  console.log();
  
  if (this.session.history.length === 0) {
    console.log(`${this.colors.yellow}No command history${this.colors.reset}`);
  } else {
    console.log(`${this.colors.gray}Showing last ${Math.min(20, this.session.history.length)} of ${this.session.history.length} commands${this.colors.reset}`);
    console.log();
    
    const recentHistory = this.session.history.slice(-20).reverse();
    
    recentHistory.forEach((entry, idx) => {
      const time = new Date(entry.timestamp).toLocaleTimeString();
      const view = entry.view || 'menu';
      const reversedIdx = recentHistory.length - idx;
      
      console.log(`${this.colors.bright}${reversedIdx}.${this.colors.reset} [${time}] [${view}] ${entry.command}`);
    });
  }
  
  console.log();
  console.log(`${this.colors.cyan}═══════════════════════════════════════════════════════════════${this.colors.reset}`);
  console.log(`${this.colors.gray}Press 'c' to clear history, 'm' for menu${this.colors.reset}`);
  
  if (this.rl) {
    this.rl.prompt();
  }
}
```

- [ ] **Step 2: Implement clearHistory() method**

```javascript
async clearHistory() {
  this.session.history = [];
  console.log(`${this.colors.green}✓ Command history cleared${this.colors.reset}`);
  
  // Return to previous view or menu
  if (this.session.currentView === 'history') {
    this.showHistory();
  }
}
```

- [ ] **Step 3: Implement getSystemInfo() helper**

```javascript
getSystemInfo() {
  const memory = process.memoryUsage();
  const formatMemory = (bytes) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };
  
  // Note: CPU usage requires external module or different approach
  // For now, return placeholder
  return {
    memory: `${formatMemory(memory.heapUsed)} / ${formatMemory(memory.heapTotal)}`,
    cpu: 'N/A (requires external module)'
  };
}
```

- [ ] **Step 4: Implement getActiveBotCount() helper**

```javascript
async getActiveBotCount() {
  try {
    const data = await makeRequest({
      hostname: BOT_HOST,
      port: BOT_PORT,
      path: '/api/bots',
      method: 'GET'
    });
    
    return data.count || 0;
  } catch (err) {
    return 0;
  }
}
```

- [ ] **Step 5: Implement checkMinecraftServerStatus() helper**

```javascript
async checkMinecraftServerStatus() {
  // Check if Minecraft server is running by checking PID file
  const pidFile = path.join(__dirname, 'logs', 'minecraft_server.pid');
  
  try {
    if (fs.existsSync(pidFile)) {
      const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim());
      
      if (pid && pid > 0) {
        try {
          process.kill(pid, 0); // Check if process exists
          return { status: 'RUNNING' };
        } catch (err) {
          // Process doesn't exist
        }
      }
    }
  } catch (err) {
    // Error checking status
  }
  
  return { status: 'NOT RUNNING' };
}
```

- [ ] **Step 6: Test utility functions**

Run: `./minebot console`
Test: Type `history`
Expected: Shows command history
Test: Various commands to build history, then `history` again
Expected: Shows updated history

- [ ] **Step 7: Commit**

```bash
git add cli.js
git commit -m "feat: implement utility functions"
```

---

## Phase 3 Complete

**Checkpoint:** Enhanced features are now complete. The console can:
- Monitor bots in real-time with automatic updates
- View and follow system logs with color coding
- Access command history and utility functions
- All features work together in a cohesive interface

**Next Phase:** Optimization and testing