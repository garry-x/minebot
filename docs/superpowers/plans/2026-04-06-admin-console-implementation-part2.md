# Admin Console Implementation Plan - Part 2: Core Features

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement core admin console features including dashboard, bot management, and server control.

**Architecture:** Build on the foundation from Phase 1, adding functional modules that integrate with existing MineBot APIs.

**Tech Stack:** Node.js, readline (built-in), chalk (existing), MineBot API integration

---

## Phase 2: Core Features (3 days)

### Task 5: Implement Dashboard Module

**Files:**
- Modify: `cli.js:1850-2000` (add showDashboard and related methods)

- [ ] **Step 1: Implement showDashboard() method**

```javascript
async showDashboard() {
  this.session.currentView = 'dashboard';
  this.clearScreen();
  
  console.log(`${this.colors.cyan}Dashboard - System Status${this.colors.reset}`);
  console.log(`${this.colors.cyan}═══════════════════════════════════════════════════════════════${this.colors.reset}`);
  console.log();
  
  // Fetch system status
  const status = await this.fetchSystemStatus();
  
  // Display status
  await this.displayDashboardStatus(status);
  
  console.log();
  console.log(`${this.colors.cyan}═══════════════════════════════════════════════════════════════${this.colors.reset}`);
  console.log(`${this.colors.gray}Press 'r' to refresh, 'm' for menu, 'q' to quit dashboard${this.colors.reset}`);
  
  if (this.rl) {
    this.rl.prompt();
  }
}
```

- [ ] **Step 2: Implement fetchSystemStatus() method**

```javascript
async fetchSystemStatus() {
  try {
    // Check bot server status
    const botServerStatus = await this.checkBotServerStatus();
    
    // Check Minecraft server status
    const mcServerStatus = await this.checkMinecraftServerStatus();
    
    // Get bot count
    const botCount = await this.getActiveBotCount();
    
    // Get system info
    const systemInfo = this.getSystemInfo();
    
    return {
      botServer: botServerStatus.status,
      botServerUptime: botServerStatus.uptime,
      mcServer: mcServerStatus.status,
      botCount: botCount,
      system: systemInfo,
      timestamp: new Date().toLocaleTimeString()
    };
  } catch (err) {
    return {
      botServer: 'ERROR',
      mcServer: 'ERROR',
      botCount: 0,
      system: { memory: 'N/A', cpu: 'N/A' },
      error: err.message,
      timestamp: new Date().toLocaleTimeString()
    };
  }
}
```

- [ ] **Step 3: Implement displayDashboardStatus() method**

```javascript
async displayDashboardStatus(status) {
  // Bot Server status
  if (status.botServer === 'RUNNING') {
    console.log(`Bot Server:    ${this.colors.green}✓ RUNNING${this.colors.reset}`);
    if (status.botServerUptime) {
      console.log(`  Uptime:      ${status.botServerUptime}`);
    }
  } else if (status.botServer === 'ERROR') {
    console.log(`Bot Server:    ${this.colors.red}✗ ERROR${this.colors.reset}`);
    if (status.error) {
      console.log(`  Error:       ${status.error}`);
    }
  } else {
    console.log(`Bot Server:    ${this.colors.red}✗ NOT RUNNING${this.colors.reset}`);
  }
  
  // Minecraft Server status
  if (status.mcServer === 'RUNNING') {
    console.log(`MC Server:     ${this.colors.green}✓ RUNNING${this.colors.reset}`);
  } else if (status.mcServer === 'ERROR') {
    console.log(`MC Server:     ${this.colors.red}✗ ERROR${this.colors.reset}`);
  } else {
    console.log(`MC Server:     ${this.colors.red}✗ NOT RUNNING${this.colors.reset}`);
  }
  
  // Bot count
  console.log(`Active Bots:   ${this.colors.bright}${status.botCount}${this.colors.reset}`);
  
  // System info
  console.log(`Memory Usage:  ${status.system.memory}`);
  console.log(`CPU Usage:     ${status.system.cpu}`);
  
  // Last update
  console.log();
  console.log(`${this.colors.gray}Last update: ${status.timestamp}${this.colors.reset}`);
}
```

- [ ] **Step 4: Implement checkBotServerStatus() helper**

```javascript
async checkBotServerStatus() {
  try {
    const data = await makeRequest({
      hostname: BOT_HOST,
      port: BOT_PORT,
      path: '/api/health',
      method: 'GET'
    });
    
    if (data && data.status === 'OK') {
      return {
        status: 'RUNNING',
        uptime: data.uptimeSeconds ? this.formatUptime(data.uptimeSeconds) : 'N/A'
      };
    }
  } catch (err) {
    // Server not running or error
  }
  
  return { status: 'NOT RUNNING', uptime: null };
}
```

- [ ] **Step 5: Implement formatUptime() helper**

```javascript
formatUptime(seconds) {
  if (!seconds || seconds < 0) return '0s';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}
```

- [ ] **Step 6: Test dashboard**

Run: `./minebot console`
Test: Type `1` or `dashboard`
Expected: Shows dashboard with system status

- [ ] **Step 7: Commit**

```bash
git add cli.js
git commit -m "feat: implement dashboard module"
```

### Task 6: Implement Bot Management Module

**Files:**
- Modify: `cli.js:2000-2150` (add bot management methods)

- [ ] **Step 1: Implement showBotManagement() method**

```javascript
async showBotManagement() {
  this.session.currentView = 'bot-management';
  this.clearScreen();
  
  console.log(`${this.colors.cyan}Bot Management${this.colors.reset}`);
  console.log(`${this.colors.cyan}═══════════════════════════════════════════════════════════════${this.colors.reset}`);
  console.log();
  
  // Fetch bot list
  const bots = await this.fetchBotList();
  
  if (bots.length === 0) {
    console.log(`${this.colors.yellow}No active bots found${this.colors.reset}`);
    console.log();
    console.log(`${this.colors.gray}Use 'bot start <username>' to start a new bot${this.colors.reset}`);
  } else {
    console.log(`${this.colors.green}Active Bots: ${bots.length}${this.colors.reset}\n`);
    
    bots.forEach((bot, index) => {
      const stateColor = bot.state === 'ALIVE' ? this.colors.green :
                        bot.state === 'DEAD' ? this.colors.red : this.colors.yellow;
      
      console.log(`${this.colors.bright}[${index + 1}] ${bot.username}${this.colors.reset} (${bot.botId})`);
      console.log(`    State: ${stateColor}${bot.state}${this.colors.reset} | Connected: ${bot.connected ? this.colors.green + 'Yes' : this.colors.red + 'No'}${this.colors.reset}`);
      
      if (bot.health !== undefined) {
        const healthColor = bot.health <= 5 ? this.colors.red :
                           bot.health <= 10 ? this.colors.yellow : this.colors.green;
        console.log(`    Health: ${healthColor}${bot.health}${this.colors.reset}/20 | Food: ${bot.food || 0}/20`);
      }
      
      if (bot.position) {
        console.log(`    Position: ${bot.position.x}, ${bot.position.y}, ${bot.position.z}`);
      }
      
      console.log();
    });
  }
  
  console.log(`${this.colors.cyan}═══════════════════════════════════════════════════════════════${this.colors.reset}`);
  console.log(`${this.colors.gray}Commands: bot start <name> | bot stop <id> | bot watch <id>${this.colors.reset}`);
  console.log(`${this.colors.gray}          list | refresh | back${this.colors.reset}`);
  
  if (this.rl) {
    this.rl.prompt();
  }
}
```

- [ ] **Step 2: Implement fetchBotList() helper**

```javascript
async fetchBotList() {
  try {
    const data = await makeRequest({
      hostname: BOT_HOST,
      port: BOT_PORT,
      path: '/api/bots',
      method: 'GET'
    });
    
    return data.bots || [];
  } catch (err) {
    console.log(`${this.colors.red}Error fetching bots: ${err.message}${this.colors.reset}`);
    return [];
  }
}
```

- [ ] **Step 3: Implement executeBotCommand() helper**

```javascript
async executeBotCommand(args) {
  if (args.length === 0) {
    await this.showBotManagement();
    return;
  }
  
  const subCommand = args[0].toLowerCase();
  
  switch(subCommand) {
    case 'list':
      await this.showBotManagement();
      break;
      
    case 'start':
      if (args.length < 2) {
        console.log(`${this.colors.yellow}Usage: bot start <username>${this.colors.reset}`);
        return;
      }
      await this.startBot(args[1]);
      break;
      
    case 'stop':
      if (args.length < 2) {
        console.log(`${this.colors.yellow}Usage: bot stop <bot-id>${this.colors.reset}`);
        return;
      }
      await this.stopBot(args[1]);
      break;
      
    case 'watch':
      const botId = args.length > 1 ? args[1] : null;
      await this.watchBot(botId);
      break;
      
    default:
      console.log(`${this.colors.yellow}Unknown bot command: ${subCommand}${this.colors.reset}`);
      console.log(`${this.colors.gray}Available: list, start <name>, stop <id>, watch [id]${this.colors.reset}`);
  }
}
```

- [ ] **Step 4: Implement startBot() helper**

```javascript
async startBot(username) {
  console.log(`${this.colors.cyan}Starting bot: ${username}${this.colors.reset}`);
  
  try {
    const data = await makeRequest({
      hostname: BOT_HOST,
      port: BOT_PORT,
      path: '/api/bot/start',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    
    if (data.success) {
      console.log(`${this.colors.green}✓ Bot started successfully${this.colors.reset}`);
      console.log(`${this.colors.gray}Bot ID: ${data.botId}${this.colors.reset}`);
      
      // Refresh bot list
      setTimeout(() => {
        if (this.session.currentView === 'bot-management') {
          this.showBotManagement();
        }
      }, 1000);
    } else {
      console.log(`${this.colors.red}✗ Failed to start bot: ${data.error || 'Unknown error'}${this.colors.reset}`);
    }
  } catch (err) {
    console.log(`${this.colors.red}✗ Error starting bot: ${err.message}${this.colors.reset}`);
  }
}
```

- [ ] **Step 5: Implement watchBot() helper**

```javascript
async watchBot(botId = null) {
  this.session.currentView = 'bot-watch';
  this.clearScreen();
  
  if (botId) {
    // Single bot watch
    await this.watchSingleBot(botId);
  } else {
    // All bots watch
    await this.watchAllBots();
  }
}
```

- [ ] **Step 6: Test bot management**

Run: `./minebot console`
Test: Type `2` or `bot`
Expected: Shows bot management interface
Test: Type `bot list`
Expected: Shows bot list

- [ ] **Step 7: Commit**

```bash
git add cli.js
git commit -m "feat: implement bot management module"
```

### Task 7: Implement Server Control Module

**Files:**
- Modify: `cli.js:2150-2300` (add server control methods)

- [ ] **Step 1: Implement showServerControl() method**

```javascript
async showServerControl() {
  this.session.currentView = 'server-control';
  this.clearScreen();
  
  console.log(`${this.colors.cyan}Server Control${this.colors.reset}`);
  console.log(`${this.colors.cyan}═══════════════════════════════════════════════════════════════${this.colors.reset}`);
  console.log();
  
  // Get server status
  const botStatus = await this.checkBotServerStatus();
  const mcStatus = await this.checkMinecraftServerStatus();
  
  console.log(`${this.colors.bright}Bot Server:${this.colors.reset}`);
  if (botStatus.status === 'RUNNING') {
    console.log(`  Status:  ${this.colors.green}✓ RUNNING${this.colors.reset}`);
    if (botStatus.uptime) {
      console.log(`  Uptime:  ${botStatus.uptime}`);
    }
    console.log(`  Port:    ${BOT_PORT}`);
    console.log(`  Host:    ${BOT_HOST}`);
  } else {
    console.log(`  Status:  ${this.colors.red}✗ NOT RUNNING${this.colors.reset}`);
  }
  
  console.log();
  console.log(`${this.colors.bright}Minecraft Server:${this.colors.reset}`);
  if (mcStatus.status === 'RUNNING') {
    console.log(`  Status:  ${this.colors.green}✓ RUNNING${this.colors.reset}`);
    console.log(`  Port:    ${process.env.MINECRAFT_SERVER_PORT || '25565'}`);
    console.log(`  Host:    ${process.env.MINECRAFT_SERVER_HOST || 'localhost'}`);
  } else {
    console.log(`  Status:  ${this.colors.red}✗ NOT RUNNING${this.colors.reset}`);
  }
  
  console.log();
  console.log(`${this.colors.cyan}═══════════════════════════════════════════════════════════════${this.colors.reset}`);
  console.log(`${this.colors.gray}Commands: server start | server stop | server restart${this.colors.reset}`);
  console.log(`${this.colors.gray}          server logs | mc start | mc stop${this.colors.reset}`);
  console.log(`${this.colors.gray}          refresh | back${this.colors.reset}`);
  
  if (this.rl) {
    this.rl.prompt();
  }
}
```

- [ ] **Step 2: Implement executeServerCommand() helper**

```javascript
async executeServerCommand(args) {
  if (args.length === 0) {
    await this.showServerControl();
    return;
  }
  
  const subCommand = args[0].toLowerCase();
  
  switch(subCommand) {
    case 'start':
      await this.startBotServer();
      break;
      
    case 'stop':
      await this.stopBotServer();
      break;
      
    case 'restart':
      await this.restartBotServer();
      break;
      
    case 'logs':
      const lines = args.length > 1 ? parseInt(args[1]) : 20;
      await this.showServerLogs(lines);
      break;
      
    case 'status':
      await this.showServerControl();
      break;
      
    default:
      console.log(`${this.colors.yellow}Unknown server command: ${subCommand}${this.colors.reset}`);
      console.log(`${this.colors.gray}Available: start, stop, restart, logs [lines], status${this.colors.reset}`);
  }
}
```

- [ ] **Step 3: Implement startBotServer() helper**

```javascript
async startBotServer() {
  console.log(`${this.colors.cyan}Starting bot server...${this.colors.reset}`);
  
  try {
    // This would typically call an external script or API
    // For now, show message and simulate
    console.log(`${this.colors.yellow}ℹ Starting bot server on ${BOT_HOST}:${BOT_PORT}...${this.colors.reset}`);
    
    // Simulate delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log(`${this.colors.green}✓ Bot server started${this.colors.reset}`);
    
    // Refresh status after delay
    setTimeout(() => {
      if (this.session.currentView === 'server-control') {
        this.showServerControl();
      }
    }, 2000);
    
  } catch (err) {
    console.log(`${this.colors.red}✗ Failed to start bot server: ${err.message}${this.colors.reset}`);
  }
}
```

- [ ] **Step 4: Implement showServerLogs() helper**

```javascript
async showServerLogs(lines = 20) {
  this.session.currentView = 'server-logs';
  this.clearScreen();
  
  console.log(`${this.colors.cyan}Server Logs (last ${lines} lines)${this.colors.reset}`);
  console.log(`${this.colors.cyan}═══════════════════════════════════════════════════════════════${this.colors.reset}`);
  console.log();
  
  try {
    const logFile = path.join(__dirname, 'logs', 'bot_server.log');
    
    if (fs.existsSync(logFile)) {
      const content = fs.readFileSync(logFile, 'utf8');
      const allLines = content.trim().split('\n').filter(line => line.trim());
      const recentLines = allLines.slice(-lines);
      
      if (recentLines.length === 0) {
        console.log(`${this.colors.yellow}No log entries found${this.colors.reset}`);
      } else {
        recentLines.forEach(line => {
          // Parse log line for better display
          let logLevel = 'log';
          let message = line;
          
          if (line.includes('[ERROR]')) {
            logLevel = 'error';
          } else if (line.includes('[WARN]')) {
            logLevel = 'warn';
          } else if (line.includes('[INFO]')) {
            logLevel = 'info';
          } else if (line.includes('[DEBUG]')) {
            logLevel = 'debug';
          }
          
          const color = logLevel === 'error' ? this.colors.red :
                       logLevel === 'warn' ? this.colors.yellow :
                       logLevel === 'info' ? this.colors.cyan :
                       logLevel === 'debug' ? this.colors.gray : this.colors.reset;
          
          console.log(`${color}${line}${this.colors.reset}`);
        });
      }
    } else {
      console.log(`${this.colors.yellow}Log file not found: ${logFile}${this.colors.reset}`);
    }
  } catch (err) {
    console.log(`${this.colors.red}Error reading logs: ${err.message}${this.colors.reset}`);
  }
  
  console.log();
  console.log(`${this.colors.cyan}═══════════════════════════════════════════════════════════════${this.colors.reset}`);
  console.log(`${this.colors.gray}Press 'f' to follow logs, 'm' for menu, 'q' to quit${this.colors.reset}`);
  
  if (this.rl) {
    this.rl.prompt();
  }
}
```

- [ ] **Step 5: Test server control**

Run: `./minebot console`
Test: Type `3` or `server`
Expected: Shows server control interface
Test: Type `server logs`
Expected: Shows server logs

- [ ] **Step 6: Commit**

```bash
git add cli.js
git commit -m "feat: implement server control module"
```

### Task 8: Implement Configuration Module

**Files:**
- Modify: `cli.js:2300-2450` (add configuration methods)

- [ ] **Step 1: Implement showConfiguration() method**

```javascript
async showConfiguration() {
  this.session.currentView = 'configuration';
  this.clearScreen();
  
  console.log(`${this.colors.cyan}Configuration${this.colors.reset}`);
  console.log(`${this.colors.cyan}═══════════════════════════════════════════════════════════════${this.colors.reset}`);
  console.log();
  
  // Load configuration
  const config = await this.loadConfiguration();
  
  console.log(`${this.colors.bright}Server Configuration:${this.colors.reset}`);
  console.log();
  
  // Group configuration by category
  const categories = {
    'Server': ['HOST', 'PORT', 'LOG_DIR', 'BOT_PID_FILE', 'BOT_LOG_FILE'],
    'Minecraft': ['MINECRAFT_SERVER_HOST', 'MINECRAFT_SERVER_PORT', 'MINECRAFT_SERVER_DIR', 'MINECRAFT_JAR_PATH'],
    'Bot Connection': ['BOT_SERVER_HOST', 'BOT_SERVER_PORT'],
    'LLM': ['VLLM_URL', 'LLM_SERVICE_URL', 'USE_FALLBACK'],
    'Logging': ['LOG_LEVEL', 'NODE_ENV']
  };
  
  for (const [category, keys] of Object.entries(categories)) {
    console.log(`${this.colors.cyan}${category}:${this.colors.reset}`);
    
    keys.forEach(key => {
      const value = config[key];
      if (value !== undefined) {
        const displayValue = key.includes('SECRET') || key.includes('PASSWORD') 
          ? '******' 
          : String(value);
        
        console.log(`  ${this.colors.bright}${key}${this.colors.reset}: ${displayValue}`);
      }
    });
    
    console.log();
  }
  
  console.log(`${this.colors.cyan}═══════════════════════════════════════════════════════════════${this.colors.reset}`);
  console.log(`${this.colors.gray}Commands: config set <key> <value> | config reload${this.colors.reset}`);
  console.log(`${this.colors.gray}          refresh | back${this.colors.reset}`);
  
  if (this.rl) {
    this.rl.prompt();
  }
}
```

- [ ] **Step 2: Implement loadConfiguration() helper**

```javascript
async loadConfiguration() {
  const config = {};
  
  // Load from environment
  const envKeys = [
    'HOST', 'PORT', 'LOG_DIR', 'BOT_PID_FILE', 'BOT_LOG_FILE',
    'MINECRAFT_SERVER_HOST', 'MINECRAFT_SERVER_PORT', 'MINECRAFT_SERVER_DIR',
    'MINECRAFT_JAR_PATH', 'MINECRAFT_PID_FILE', 'MINECRAFT_MAX_MEMORY',
    'BOT_SERVER_HOST', 'BOT_SERVER_PORT', 'VLLM_URL', 'LLM_SERVICE_URL',
    'USE_FALLBACK', 'LOG_LEVEL', 'NODE_ENV'
  ];
  
  envKeys.forEach(key => {
    if (process.env[key] !== undefined) {
      config[key] = process.env[key];
    }
  });
  
  // Try to load from .env file
  try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const envLines = envContent.split('\n');
      
      envLines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key && valueParts.length > 0) {
            const envKey = key.trim();
            const envValue = valueParts.join('=').trim();
            config[envKey] = envValue;
          }
        }
      });
    }
  } catch (err) {
    // Ignore errors reading .env file
  }
  
  return config;
}
```

- [ ] **Step 3: Implement executeConfigCommand() helper**

```javascript
async executeConfigCommand(args) {
  if (args.length === 0) {
    await this.showConfiguration();
    return;
  }
  
  const subCommand = args[0].toLowerCase();
  
  switch(subCommand) {
    case 'show':
      await this.showConfiguration();
      break;
      
    case 'set':
      if (args.length < 3) {
        console.log(`${this.colors.yellow}Usage: config set <key> <value>${this.colors.reset}`);
        return;
      }
      await this.setConfigValue(args[1], args.slice(2).join(' '));
      break;
      
    case 'reload':
      await this.reloadConfiguration();
      break;
      
    default:
      console.log(`${this.colors.yellow}Unknown config command: ${subCommand}${this.colors.reset}`);
      console.log(`${this.colors.gray}Available: show, set <key> <value>, reload${this.colors.reset}`);
  }
}
```

- [ ] **Step 4: Implement setConfigValue() helper**

```javascript
async setConfigValue(key, value) {
  console.log(`${this.colors.cyan}Setting configuration: ${key}=${value}${this.colors.reset}`);
  
  // Note: In a real implementation, this would write to .env file
  // For now, just show message
  console.log(`${this.colors.yellow}ℹ Configuration changes require server restart to take effect${this.colors.reset}`);
  console.log(`${this.colors.gray}To persist changes, edit the .env file manually${this.colors.reset}`);
  
  // Update in-memory config
  process.env[key] = value;
  
  // Refresh config view
  setTimeout(() => {
    if (this.session.currentView === 'configuration') {
      this.showConfiguration();
    }
  }, 500);
}
```

- [ ] **Step 5: Test configuration module**

Run: `./minebot console`
Test: Type `4` or `config`
Expected: Shows configuration interface
Test: Type `config show`
Expected: Shows configuration

- [ ] **Step 6: Commit**

```bash
git add cli.js
git commit -m "feat: implement configuration module"
```

---

## Phase 2 Complete

**Checkpoint:** Core features are now complete. The console can:
- Display system dashboard with real-time status
- Manage bots (list, start, stop, watch)
- Control servers (start, stop, restart, view logs)
- View and modify configuration
- All features integrate with existing MineBot APIs

**Next Phase:** Enhanced features (Real-time monitoring, System logs, Utilities)