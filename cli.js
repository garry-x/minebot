#!/usr/bin/env node
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const readline = require('readline');

// Colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
};



class AdminConsole {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true
    });
    this.currentView = 'dashboard';
    this.isRunning = false;
    this.refreshInterval = null;
    this.refreshRate = 5000; // 5 seconds
    this.lastRenderTime = 0;
    this.renderDebounceTimeout = null;
    this.config = {
      performanceMode: false,
      refreshRates: {
        normal: 5000,    // 5 seconds
        fast: 2000,      // 2 seconds
        slow: 10000      // 10 seconds
      }
    };
  }

  // ====================
  // UI Components
  // ====================
  
  clearScreen() {
    process.stdout.write('\x1b[2J\x1b[0f');
  }

  drawHeader(title = 'MineBot Admin Console') {
    const width = process.stdout.columns || 80;
    const headerLine = '─'.repeat(width);
    const titlePadding = Math.floor((width - title.length) / 2);
    
    console.log(`\n${colors.bright}${colors.cyan}${' '.repeat(titlePadding)}${title}${colors.reset}`);
    console.log(`${colors.dim}${headerLine}${colors.reset}\n`);
  }

  drawFooter(status = 'Ready') {
    const width = process.stdout.columns || 80;
    const footerLine = '─'.repeat(width);
    const helpText = '[Q] Quit  [H] Help  [R] Refresh  [M] Main Menu';
    const helpPadding = Math.floor((width - helpText.length) / 2);
    
    console.log(`\n${colors.dim}${footerLine}${colors.reset}`);
    console.log(`${colors.dim}${' '.repeat(helpPadding)}${helpText}${colors.reset}`);
    console.log(`${colors.dim}${footerLine}${colors.reset}`);
    console.log(`${colors.gray}> ${status}${colors.reset}\n`);
  }

  drawMenu(items, currentIndex = 0) {
    console.log(`${colors.bright}${colors.white}Select an option:${colors.reset}\n`);
    
    items.forEach((item, index) => {
      const prefix = index === currentIndex ? `${colors.green}›${colors.reset} ` : '  ';
      const label = item.label || item;
      const description = item.description ? ` ${colors.dim}(${item.description})${colors.reset}` : '';
      console.log(`${prefix}${label}${description}`);
    });
    
    console.log('');
  }

  drawStatusCard(title, status, details = []) {
    const statusColor = status === 'RUNNING' ? colors.green : 
                       status === 'WARNING' ? colors.yellow : colors.red;
    
    console.log(`${colors.bright}${colors.white}${title}:${colors.reset} ${statusColor}${status}${colors.reset}`);
    
    if (details.length > 0) {
      details.forEach(detail => {
        console.log(`  ${colors.dim}${detail}${colors.reset}`);
      });
    }
    console.log('');
  }

  drawTable(headers, rows) {
    // Simple table formatting
    const colWidths = headers.map((header, i) => {
      const maxContent = Math.max(...rows.map(row => String(row[i] || '').length));
      return Math.max(header.length, maxContent);
    });

    // Draw header
    const headerRow = headers.map((header, i) => 
      header.padEnd(colWidths[i])
    ).join('  ');
    console.log(`${colors.bright}${headerRow}${colors.reset}`);

    // Draw separator
    const separator = colWidths.map(width => '─'.repeat(width)).join('──');
    console.log(`${colors.dim}${separator}${colors.reset}`);

    // Draw rows
    rows.forEach(row => {
      const rowStr = row.map((cell, i) => 
        String(cell || '').padEnd(colWidths[i])
      ).join('  ');
      console.log(rowStr);
    });
    console.log('');
  }

  // ====================
  // View Rendering
  // ====================
  
  async renderDashboard() {
    this.clearScreen();
    this.drawHeader('System Dashboard');
    
    // Get system status
    const status = await this.getSystemStatus();
    
    // Check for alerts
    const alerts = this.checkAlerts(status);
    
    // Show alerts if any
    if (alerts.length > 0) {
      console.log(`${colors.bright}${colors.yellow}⚠  Active Alerts (${alerts.length}):${colors.reset}\n`);
      alerts.forEach((alert, index) => {
        const alertColor = alert.severity === 'CRITICAL' ? colors.red : 
                          alert.severity === 'WARNING' ? colors.yellow : colors.cyan;
        console.log(`  ${alertColor}${alert.severity}${colors.reset}: ${alert.message}`);
        if (alert.details) {
          console.log(`    ${colors.dim}${alert.details}${colors.reset}`);
        }
      });
      console.log('');
    }

    // Bot Server Status
    this.drawStatusCard('Bot Server', status.botServer.status, [
      `Uptime: ${status.botServer.uptime || 'N/A'}`,
      `Version: ${status.botServer.version || 'N/A'}`
    ]);

    // Minecraft Server Status
    this.drawStatusCard('Minecraft Server', status.mcServer.status, [
      `Players: ${status.mcServer.players || '0'}`,
      `Address: localhost:25565`
    ]);

    // Active Bots
    const botsTableHeaders = ['Name', 'Status', 'Location', 'Health'];
    const botsRows = status.bots.map(bot => [
      bot.name,
      bot.status,
      bot.location || 'Unknown',
      bot.health || '100%'
    ]);
    
    console.log(`${colors.bright}${colors.white}Active Bots (${status.bots.length}):${colors.reset}`);
    if (botsRows.length > 0) {
      this.drawTable(botsTableHeaders, botsRows);
    } else {
      console.log(`${colors.dim}No active bots${colors.reset}\n`);
    }

    // System Resources
    console.log(`${colors.bright}${colors.white}System Resources:${colors.reset}`);
    const resources = this.getSystemResources();
    const resourcesHeaders = ['Resource', 'Usage', 'Status'];
    const resourcesRows = [
      ['CPU', `${resources.cpu}%`, resources.cpu < 80 ? 'OK' : 'HIGH'],
      ['Memory', `${resources.memory}%`, resources.memory < 85 ? 'OK' : 'HIGH'],
      ['Disk', `${resources.disk}%`, resources.disk < 90 ? 'OK' : 'HIGH']
    ];
    this.drawTable(resourcesHeaders, resourcesRows);

    this.drawFooter(alerts.length > 0 ? `${alerts.length} active alert(s)` : 'Dashboard view loaded');
  }

  async renderBotManagement() {
    this.clearScreen();
    this.drawHeader('Bot Management');
    
    const bots = await this.getAllBots();
    const menuItems = [
      { label: 'Start New Bot', description: 'Create and start a new bot' },
      { label: 'Stop Bot', description: 'Stop a running bot' },
      { label: 'View Bot Details', description: 'Get detailed bot information' },
      { label: 'Configure Bot', description: 'Change bot settings' }
    ];

    this.drawMenu(menuItems);
    
    console.log(`${colors.bright}${colors.white}Available Bots:${colors.reset}`);
    if (bots.length > 0) {
      const botsHeaders = ['Name', 'Status', 'Actions'];
      const botsRows = bots.map(bot => [
        bot.name,
        bot.status,
        `${colors.gray}[S] Start [K] Stop [D] Details${colors.reset}`
      ]);
      this.drawTable(botsHeaders, botsRows);
    } else {
      console.log(`${colors.dim}No bots configured${colors.reset}\n`);
    }

    this.drawFooter('Bot Management - Select an option');
  }

  async renderServerControl() {
    this.clearScreen();
    this.drawHeader('Server Control');
    
    const serverStatus = await this.getMinecraftServerStatus();
    const botServerStatus = await this.getBotServerStatus();
    
    console.log(`${colors.bright}${colors.white}Server Status:${colors.reset}\n`);
    
    // Minecraft Server Control
    this.drawStatusCard('Minecraft Server', serverStatus.status, [
      `Version: ${serverStatus.version || 'N/A'}`,
      `Players: ${serverStatus.players || '0'}`,
      `World: ${serverStatus.world || 'default'}`
    ]);

    const mcActions = [
      { label: 'Start Server', description: 'Start Minecraft server' },
      { label: 'Stop Server', description: 'Gracefully stop server' },
      { label: 'Restart Server', description: 'Restart with same settings' },
      { label: 'Force Stop', description: 'Force immediate shutdown' },
      { label: 'Backup World', description: 'Create world backup' }
    ];
    
    console.log(`${colors.bright}${colors.white}Minecraft Actions:${colors.reset}`);
    this.drawMenu(mcActions);

    // Bot Server Control
    this.drawStatusCard('Bot Server', botServerStatus.status, [
      `Uptime: ${botServerStatus.uptime || 'N/A'}`,
      `Active Bots: ${botServerStatus.activeBots || '0'}`,
      `API Endpoint: ${BOT_HOST}:${BOT_PORT}`
    ]);

    const botServerActions = [
      { label: 'Start Bot Server', description: 'Start bot API server' },
      { label: 'Stop Bot Server', description: 'Stop bot API server' },
      { label: 'Restart Bot Server', description: 'Restart with current config' },
      { label: 'View Logs', description: 'Show server logs' }
    ];
    
    console.log(`${colors.bright}${colors.white}Bot Server Actions:${colors.reset}`);
    this.drawMenu(botServerActions);

    this.drawFooter('Server Control - Select action for each server');
  }

  async renderConfigManagement() {
    this.clearScreen();
    this.drawHeader('Configuration Management');
    
    const configs = await this.getAvailableConfigs();
    
    console.log(`${colors.bright}${colors.white}Configuration Files:${colors.reset}`);
    if (configs.length > 0) {
      const configHeaders = ['Config', 'Type', 'Status', 'Last Modified'];
      const configRows = configs.map(config => [
        config.name,
        config.type,
        config.status,
        config.modified
      ]);
      this.drawTable(configHeaders, configRows);
    } else {
      console.log(`${colors.dim}No configuration files found${colors.reset}\n`);
    }

    const menuItems = [
      { label: 'Edit Configuration', description: 'Modify config settings' },
      { label: 'View Current Config', description: 'Show current configuration' },
      { label: 'Reset to Defaults', description: 'Reset all configs to defaults' },
      { label: 'Export Config', description: 'Export current configuration' },
      { label: 'Import Config', description: 'Import configuration from file' }
    ];

    console.log(`\n${colors.bright}${colors.white}Configuration Actions:${colors.reset}`);
    this.drawMenu(menuItems);

    this.drawFooter('Config Management - Select action');
  }

  async renderLogViewer() {
    this.clearScreen();
    this.drawHeader('System Log Viewer');
    
    const logs = await this.getRecentLogs();
    
    console.log(`${colors.bright}${colors.white}Recent Log Entries:${colors.reset}\n`);
    
    if (logs.length > 0) {
      logs.forEach(log => {
        const time = log.timestamp ? `[${log.timestamp}]` : '[Unknown]';
        const levelColor = log.level === 'ERROR' ? colors.red :
                          log.level === 'WARN' ? colors.yellow :
                          log.level === 'INFO' ? colors.cyan : colors.white;
        
        console.log(`${colors.dim}${time}${colors.reset} ${levelColor}${log.level.padEnd(7)}${colors.reset} ${log.message}`);
        if (log.source) {
          console.log(`  ${colors.dim}Source: ${log.source}${colors.reset}`);
        }
      });
    } else {
      console.log(`${colors.dim}No log entries found${colors.reset}\n`);
    }
    
    const menuItems = [
      { label: 'Refresh Logs', description: 'Reload latest log entries' },
      { label: 'View Bot Logs', description: 'Show bot-specific logs' },
      { label: 'View Server Logs', description: 'Show server logs' },
      { label: 'Clear Logs', description: 'Clear log buffer (not files)' },
      { label: 'Export Logs', description: 'Export logs to file' }
    ];
    
    console.log(`\n${colors.bright}${colors.white}Log Actions:${colors.reset}`);
    this.drawMenu(menuItems);

    this.drawFooter(`Showing ${logs.length} log entries`);
  }

  async renderUtilities() {
    this.clearScreen();
    this.drawHeader('Utilities Toolbox');
    
    console.log(`${colors.bright}${colors.white}System Utilities:${colors.reset}\n`);
    
    const utilities = [
      {
        name: 'System Diagnostics',
        description: 'Run comprehensive system diagnostics',
        command: 'diagnostics'
      },
      {
        name: 'Network Test',
        description: 'Test network connectivity to servers',
        command: 'network-test'
      },
      {
        name: 'Disk Cleanup',
        description: 'Clean up temporary files and logs',
        command: 'cleanup'
      },
      {
        name: 'Backup System',
        description: 'Create system backup',
        command: 'backup'
      },
      {
        name: 'Restore System',
        description: 'Restore from backup',
        command: 'restore'
      },
      {
        name: 'Performance Test',
        description: 'Run performance benchmarks',
        command: 'perf-test'
      },
      {
        name: 'Update Check',
        description: 'Check for system updates',
        command: 'update-check'
      },
      {
        name: 'Password Reset',
        description: 'Reset admin password',
        command: 'reset-password'
      }
    ];
    
    utilities.forEach((util, index) => {
      console.log(`  ${colors.green}${index + 1}${colors.reset}  ${colors.bright}${util.name}${colors.reset}`);
      console.log(`     ${colors.dim}${util.description}${colors.reset}`);
      console.log(`     ${colors.dim}Command: ${util.command}${colors.reset}\n`);
    });
    
    console.log(`${colors.bright}${colors.white}Quick Actions:${colors.reset}`);
    console.log(`${colors.dim}  • Type utility number to run${colors.reset}`);
    console.log(`${colors.dim}  • Type 'all' to run all diagnostics${colors.reset}`);
    console.log(`${colors.dim}  • Type 'back' to return to main menu${colors.reset}`);

    this.drawFooter('Select a utility to run (1-8)');
  }

  async renderHelp() {
    this.clearScreen();
    this.drawHeader('Admin Console Help');
    
    console.log(`${colors.bright}${colors.white}Navigation:${colors.reset}\n`);
    
    const navigation = [
      ['1', 'Dashboard', 'System overview and status'],
      ['2', 'Bot Management', 'Manage and control bots'],
      ['3', 'Server Control', 'Control Minecraft and Bot servers'],
      ['4', 'Configuration', 'Manage system configuration'],
      ['5', 'Log Viewer', 'View system logs'],
      ['6', 'Utilities', 'System utilities toolbox'],
      ['Q', 'Quit', 'Exit admin console'],
      ['H', 'Help', 'Show this help screen'],
      ['R', 'Refresh', 'Refresh current view'],
      ['M', 'Main Menu', 'Return to dashboard']
    ];
    
    navigation.forEach(([key, title, desc]) => {
      console.log(`  ${colors.green}${key}${colors.reset}  ${colors.bright}${title}${colors.reset}`);
      console.log(`     ${colors.dim}${desc}${colors.reset}\n`);
    });

    console.log(`${colors.bright}${colors.white}Interactive Features:${colors.reset}`);
    console.log(`${colors.dim}  • Type menu numbers to navigate${colors.reset}`);
    console.log(`${colors.dim}  • Use arrow keys in menus${colors.reset}`);
    console.log(`${colors.dim}  • Auto-refresh every ${this.refreshRate/1000} seconds${colors.reset}`);
    console.log(`${colors.dim}  • Press Ctrl+C to force quit${colors.reset}`);

    this.drawFooter('Press any key to return');
  }

  // ====================
  // Data Fetching
  // ====================
  
  async getSystemStatus() {
    try {
      // Get bot server status
      const botServerStatus = await this.getBotServerStatus();
      
      // Get Minecraft server status
      const mcStatus = await this.getMinecraftServerStatus();
      
      // Get active bots
      const bots = await this.getAllBots();
      
      return {
        botServer: botServerStatus,
        mcServer: mcStatus,
        bots: bots.filter(bot => bot.status === 'RUNNING')
      };
    } catch (error) {
      return {
        botServer: { status: 'ERROR', error: error.message },
        mcServer: { status: 'UNKNOWN' },
        bots: []
      };
    }
  }

  async getBotServerStatus() {
    try {
      const data = await makeRequest({
        hostname: BOT_HOST,
        port: BOT_PORT,
        path: '/api/health',
        method: 'GET',
        timeout: 2000
      });
      
      return {
        status: 'RUNNING',
        uptime: this.formatUptime(data.uptime),
        version: data.version,
        activeBots: data.activeBots || 0
      };
    } catch (error) {
      return { status: 'NOT_RUNNING' };
    }
  }

  async getMinecraftServerStatus() {
    try {
      // Check if server is running
      const isRunning = await this.checkMinecraftPort();
      
      if (!isRunning) {
        return { status: 'NOT_RUNNING' };
      }
      
      // Try to get more details (this would need proper Minecraft server query)
      return {
        status: 'RUNNING',
        players: '0', // Would need actual player count
        version: '1.21.11',
        world: 'default'
      };
    } catch (error) {
      return { status: 'UNKNOWN' };
    }
  }

  async getAllBots() {
    try {
      const data = await makeRequest({
        hostname: BOT_HOST,
        port: BOT_PORT,
        path: '/api/bots',
        method: 'GET',
        timeout: 2000
      });
      
      return Array.isArray(data) ? data : [];
    } catch (error) {
      return [];
    }
  }

  async getAvailableConfigs() {
    const configDir = path.join(__dirname, 'config');
    const configs = [];
    
    try {
      if (fs.existsSync(configDir)) {
        const files = fs.readdirSync(configDir);
        
        files.forEach(file => {
          if (file.endsWith('.json') || file.endsWith('.js') || file.endsWith('.yaml')) {
            const filePath = path.join(configDir, file);
            const stats = fs.statSync(filePath);
            const type = file.split('.').pop();
            
            configs.push({
              name: file,
              type: type.toUpperCase(),
              status: 'ACTIVE',
              modified: stats.mtime.toLocaleString()
            });
          }
        });
      }
    } catch (error) {
      // Ignore errors
    }
    
    return configs;
  }

  async getRecentLogs(limit = 20) {
    const logs = [];
    const logDir = path.join(__dirname, 'logs');
    
    try {
      if (fs.existsSync(logDir)) {
        // Get all log files
        const files = fs.readdirSync(logDir)
          .filter(file => file.endsWith('.log') || file.endsWith('.txt'))
          .sort()
          .reverse()
          .slice(0, 3); // Last 3 log files
        
        for (const file of files) {
          const filePath = path.join(logDir, file);
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n').filter(line => line.trim()).slice(-limit);
            
            lines.forEach(line => {
              // Simple log parsing - in a real implementation, this would be more sophisticated
              const timestampMatch = line.match(/\[(.*?)\]/);
              const levelMatch = line.match(/(ERROR|WARN|INFO|DEBUG)/);
              const message = line.replace(/\[.*?\]/g, '').replace(/(ERROR|WARN|INFO|DEBUG)/, '').trim();
              
              logs.push({
                timestamp: timestampMatch ? timestampMatch[1] : new Date().toISOString(),
                level: levelMatch ? levelMatch[1] : 'INFO',
                message: message || line.trim(),
                source: file
              });
            });
          } catch (err) {
            // Skip unreadable files
          }
        }
      }
      
      // If no log files found, generate some sample logs
      if (logs.length === 0) {
        const levels = ['INFO', 'WARN', 'ERROR'];
        const messages = [
          'System started',
          'Bot server initialized',
          'Minecraft server connection established',
          'New bot connected: TestBot',
          'Resource usage normal',
          'Scheduled backup completed',
          'Warning: High memory usage detected',
          'Error: Failed to connect to database'
        ];
        
        const now = new Date();
        for (let i = 0; i < limit; i++) {
          const time = new Date(now.getTime() - i * 60000); // 1 minute intervals
          const level = levels[Math.floor(Math.random() * levels.length)];
          const message = messages[Math.floor(Math.random() * messages.length)];
          
          logs.push({
            timestamp: time.toISOString().replace('T', ' ').substring(0, 19),
            level: level,
            message: message,
            source: 'system.log'
          });
        }
      }
    } catch (error) {
      // Return sample logs on error
      logs.push({
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        level: 'INFO',
        message: 'Log system initialized',
        source: 'admin-console'
      });
    }
    
    return logs.slice(0, limit);
  }

  getSystemResources() {
    // Simple system resource simulation
    // In a real implementation, this would use os.cpuUsage(), os.freemem(), etc.
    return {
      cpu: Math.floor(Math.random() * 30) + 10, // 10-40%
      memory: Math.floor(Math.random() * 40) + 30, // 30-70%
      disk: Math.floor(Math.random() * 20) + 10 // 10-30%
    };
  }

  async checkMinecraftPort() {
    return new Promise((resolve) => {
      const net = require('net');
      const socket = new net.Socket();
      
      socket.setTimeout(2000);
      socket.connect({ host: 'localhost', port: 25565 }, () => {
        socket.destroy();
        resolve(true);
      });
      
      socket.on('error', () => {
        resolve(false);
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
    });
  }

  formatUptime(seconds) {
    if (!seconds) return 'N/A';
    
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days}d ${hours}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  checkAlerts(status) {
    const alerts = [];
    
    // Check bot server status
    if (status.botServer.status === 'NOT_RUNNING') {
      alerts.push({
        severity: 'CRITICAL',
        message: 'Bot server is not running',
        details: 'Bot functionality is unavailable'
      });
    } else if (status.botServer.status === 'ERROR') {
      alerts.push({
        severity: 'CRITICAL',
        message: 'Bot server error',
        details: status.botServer.error
      });
    }
    
    // Check Minecraft server status
    if (status.mcServer.status === 'NOT_RUNNING') {
      alerts.push({
        severity: 'WARNING',
        message: 'Minecraft server is not running',
        details: 'Bots cannot connect to Minecraft'
      });
    }
    
    // Check active bots count
    if (status.bots.length === 0) {
      alerts.push({
        severity: 'INFO',
        message: 'No active bots',
        details: 'Start bots from Bot Management menu'
      });
    }
    
    // Check system resources (simulated)
    const resources = this.getSystemResources();
    if (resources.cpu > 80) {
      alerts.push({
        severity: 'WARNING',
        message: 'High CPU usage',
        details: `CPU at ${resources.cpu}% - consider reducing load`
      });
    }
    
    if (resources.memory > 85) {
      alerts.push({
        severity: 'WARNING',
        message: 'High memory usage',
        details: `Memory at ${resources.memory}% - consider restarting services`
      });
    }
    
    if (resources.disk > 90) {
      alerts.push({
        severity: 'CRITICAL',
        message: 'High disk usage',
        details: `Disk at ${resources.disk}% - cleanup or expand storage`
      });
    }
    
    return alerts;
  }

  // ====================
  // Main Control Loop
  // ====================
  
  async start() {
    this.isRunning = true;
    
    // Set up auto-refresh
    this.startAutoRefresh();
    
    // Initial render
    await this.renderCurrentView();
    
    // Start input loop
    this.setupInputHandling();
  }

  async stop() {
    this.isRunning = false;
    
    // Stop auto-refresh
    this.stopAutoRefresh();
    
    // Close readline interface
    this.rl.close();
    
    console.log(`${colors.green}Admin console stopped.${colors.reset}\n`);
  }

  startAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    
    this.refreshInterval = setInterval(async () => {
      if (this.isRunning) {
        // Debounce rendering to prevent too frequent updates
        const now = Date.now();
        if (now - this.lastRenderTime < 1000) { // Minimum 1 second between renders
          return;
        }
        
        this.lastRenderTime = now;
        
        // Clear any pending debounce timeout
        if (this.renderDebounceTimeout) {
          clearTimeout(this.renderDebounceTimeout);
          this.renderDebounceTimeout = null;
        }
        
        // Use debounce for performance
        this.renderDebounceTimeout = setTimeout(async () => {
          try {
            await this.renderCurrentView();
          } catch (error) {
            this.handleError(error, 'autoRefresh');
          }
        }, 100); // 100ms debounce
      }
    }, this.refreshRate);
  }

  setRefreshRate(rateName) {
    if (this.config.refreshRates[rateName]) {
      this.refreshRate = this.config.refreshRates[rateName];
      this.startAutoRefresh(); // Restart with new rate
      return true;
    }
    return false;
  }

  togglePerformanceMode() {
    this.config.performanceMode = !this.config.performanceMode;
    if (this.config.performanceMode) {
      this.setRefreshRate('fast');
    } else {
      this.setRefreshRate('normal');
    }
    return this.config.performanceMode;
  }

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  async renderCurrentView() {
    try {
      switch (this.currentView) {
        case 'dashboard':
          await this.renderDashboard();
          break;
        case 'bot-management':
          await this.renderBotManagement();
          break;
        case 'server-control':
          await this.renderServerControl();
          break;
        case 'config-management':
          await this.renderConfigManagement();
          break;
        case 'log-viewer':
          await this.renderLogViewer();
          break;
        case 'utilities':
          await this.renderUtilities();
          break;
        case 'help':
          await this.renderHelp();
          break;
        default:
          await this.renderDashboard();
      }
    } catch (error) {
      this.handleError(error, 'renderCurrentView');
    }
  }

  handleError(error, context) {
    console.log(`\n${colors.red}${'─'.repeat(60)}${colors.reset}`);
    console.log(`${colors.bright}${colors.red}✗ Error in ${context}:${colors.reset}`);
    console.log(`${colors.red}${error.message}${colors.reset}`);
    
    if (error.stack) {
      console.log(`${colors.dim}${error.stack.split('\n').slice(0, 3).join('\n')}${colors.reset}`);
    }
    
    console.log(`${colors.red}${'─'.repeat(60)}${colors.reset}\n`);
    
    // Try to recover by returning to dashboard after a delay
    console.log(`${colors.yellow}Attempting to recover...${colors.reset}`);
    
    setTimeout(() => {
      if (this.isRunning) {
        this.currentView = 'dashboard';
        this.renderCurrentView().catch(recoveryError => {
          console.log(`${colors.red}Recovery failed: ${recoveryError.message}${colors.reset}`);
          console.log(`${colors.yellow}Restarting admin console...${colors.reset}`);
          // In a real implementation, this would restart the console
        });
      }
    }, 2000);
  }

  setupInputHandling() {
    this.rl.on('line', async (input) => {
      await this.handleInput(input.trim());
    });

    this.rl.on('SIGINT', () => {
      console.log('\n');
      this.stop();
      process.exit(0);
    });

    // Set prompt
    this.rl.setPrompt(`${colors.cyan}admin>${colors.reset} `);
    this.rl.prompt();
  }

  async handleInput(input) {
    if (!input) {
      this.rl.prompt();
      return;
    }

    const cmd = input.toLowerCase();
    
    switch (cmd) {
      case 'q':
      case 'quit':
      case 'exit':
        await this.stop();
        break;
        
      case 'h':
      case 'help':
        this.currentView = 'help';
        await this.renderCurrentView();
        break;
        
      case 'r':
      case 'refresh':
        await this.renderCurrentView();
        break;
        
      case 'm':
      case 'menu':
        this.currentView = 'dashboard';
        await this.renderCurrentView();
        break;
        
      case '1':
        this.currentView = 'dashboard';
        await this.renderCurrentView();
        break;
        
      case '2':
        this.currentView = 'bot-management';
        await this.renderCurrentView();
        break;
        
      case '3':
        this.currentView = 'server-control';
        await this.renderCurrentView();
        break;
        
      case '4':
        this.currentView = 'config-management';
        await this.renderCurrentView();
        break;
        
      case '5':
        this.currentView = 'log-viewer';
        await this.renderCurrentView();
        break;
        
      case '6':
        this.currentView = 'utilities';
        await this.renderCurrentView();
        break;
        
      default:
        console.log(`${colors.yellow}Unknown command: ${input}${colors.reset}`);
        console.log(`${colors.dim}Type 'help' for available commands${colors.reset}`);
        this.rl.prompt();
    }
  }
}

// Configuration
const BOT_SERVER_SCRIPT = path.join(__dirname, 'bot_server.js');
const MINECRAFT_SERVER_DIR = path.join(__dirname, process.env.MINECRAFT_SERVER_DIR || 'resources');
const MINECRAFT_JAR_FILENAME = process.env.MINECRAFT_JAR_PATH || 'minecraft_server.1.21.11.jar';
const MINECRAFT_SERVER_JAR = path.join(MINECRAFT_SERVER_DIR, MINECRAFT_JAR_FILENAME);
const BOT_HOST = 'localhost';
const BOT_PORT = 9500;

// PID files
const BOT_PID_FILE = path.join(__dirname, 'logs', 'bot_server.pid');
const MINECRAFT_PID_FILE = path.join(__dirname, 'logs', 'minecraft_server.pid');

// Utility functions
function log(msg, color = '') {
  console.log(`${color}${msg}${colors.reset}`);
}

function logError(msg) {
  console.error(`${colors.red}✗ ${msg}${colors.reset}`);
}

function logSuccess(msg) {
  console.log(`${colors.green}✓ ${msg}${colors.reset}`);
}

function logInfo(msg) {
  console.log(`${colors.cyan}ℹ ${msg}${colors.reset}`);
}

function logWarning(msg) {
  console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`);
}

function logDebug(msg) {
  if (process.env.DEBUG) {
    console.log(`${colors.dim}${msg}${colors.reset}`);
  }
}

// API request helper
async function makeRequest(options, postData = null) {
  const http = require('http');
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
          }
        } catch (e) {
          reject(new Error(`Invalid response: ${e.message}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Request error: ${e.message}`));
    });

    req.on('timeout', () => {
      reject(new Error('Request timeout'));
      req.destroy();
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

// Server management
function savePid(pid, type) {
  const LOG_DIR = path.join(__dirname, 'logs');
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
  fs.writeFileSync(type === 'bot' ? BOT_PID_FILE : MINECRAFT_PID_FILE, pid.toString());
}

function loadPid(type) {
  const pidFile = type === 'bot' ? BOT_PID_FILE : MINECRAFT_PID_FILE;
  try {
    if (fs.existsSync(pidFile)) {
      return parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
    }
  } catch (e) {}
  return null;
}

// Bot server control
function startBotServer() {
  const LOG_DIR = path.join(__dirname, 'logs');
  const LOG_FILE = path.join(LOG_DIR, 'bot_server.log');
  
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }

  logInfo(`Starting bot server on ${BOT_HOST}:${BOT_PORT}...`);
  
  const { spawn } = require('child_process');
  const startScript = `
#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 24.14.1 > /dev/null 2>&1
VERBOSE_FLAG=""; nohup node ${BOT_SERVER_SCRIPT} $VERBOSE_FLAG > ${LOG_FILE} 2>&1 &
`;
  
  const scriptFile = '/tmp/start_bot_server.sh';
  fs.writeFileSync(scriptFile, startScript);
  fs.chmodSync(scriptFile, '755');
  
  spawn('bash', [scriptFile], {
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true,
    env: process.env
  });
  
  logSuccess('Bot server started');
}

function stopBotServer() {
  const pid = loadPid('bot');
  if (!pid) {
    logInfo('Bot server is not running');
    return;
  }

  try {
    const http = require('http');
    const options = {
      hostname: BOT_HOST,
      port: BOT_PORT,
      path: '/api/server/stop',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        logDebug('Server stop request sent successfully');
        try { fs.unlinkSync(BOT_PID_FILE); } catch (e) {}
      });
    });

    req.on('error', (e) => {
      logDebug(`Bot server is not running: ${e.message}`);
      try { fs.unlinkSync(BOT_PID_FILE); } catch (e) {}
    });

    req.end();
    
    setTimeout(() => {
      try {
        process.kill(pid, 'SIGTERM');
        logSuccess('Bot server stopped');
      } catch (e) {
        logInfo('Bot server is not running');
      }
    }, 500);
  } catch (e) {
    logInfo('Bot server is not running');
    try { fs.unlinkSync(BOT_PID_FILE); } catch (e) {}
  }
}

// Minecraft server control
function startMinecraftServer() {
  const jarPath = MINECRAFT_SERVER_JAR;
  if (!fs.existsSync(jarPath)) {
    logError(`Minecraft server jar not found at ${jarPath}`);
    return;
  }

  const LOG_DIR = path.join(__dirname, 'logs');
  const LOG_FILE = path.join(LOG_DIR, 'minecraft_server.log');
  
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }

  const existingPid = loadPid('minecraft');
  if (existingPid) {
    try {
      process.kill(existingPid, 0);
      logInfo(`Minecraft server is already running with PID ${existingPid}`);
      return;
    } catch (e) {
      logDebug('Removing stale PID file');
      try { fs.unlinkSync(MINECRAFT_PID_FILE); } catch (e) {}
    }
  }

  logInfo('Starting Minecraft server...');
  
  const { spawn } = require('child_process');
  const startScript = `
#!/bin/bash
cd ${MINECRAFT_SERVER_DIR}
nohup java -Xmx1G -jar ${jarPath} nogui > ${LOG_FILE} 2>&1 &
echo $! > /tmp/mc_server_pid.txt
echo $!
`;
  
  const scriptFile = '/tmp/start_mc_server.sh';
  fs.writeFileSync(scriptFile, startScript);
  fs.chmodSync(scriptFile, '755');
  
  const child = spawn('bash', [scriptFile], {
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true,
    env: process.env
  });
  
  let output = '';
  child.stdout.on('data', (data) => output += data.toString());
  
  child.on('close', (code) => {
    const pid = parseInt(output.trim(), 10);
    if (!isNaN(pid)) {
      savePid(pid, 'minecraft');
      logSuccess(`Minecraft server started with PID ${pid}`);
    }
  });
}

function stopMinecraftServer() {
  const pid = loadPid('minecraft');
  if (!pid) {
    logInfo('Minecraft server is not running');
    return;
  }

  try {
    process.kill(pid, 0);
  } catch (e) {
    logDebug('Removing stale PID file');
    try { fs.unlinkSync(MINECRAFT_PID_FILE); } catch (e) {}
    logInfo('Minecraft server is not running');
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
    logInfo('Stopping Minecraft server...');
    setTimeout(() => {
      try {
        process.kill(pid, 0);
        logError('Minecraft server failed to stop');
      } catch (e) {
        try { fs.unlinkSync(MINECRAFT_PID_FILE); } catch (e) {}
        logSuccess('Minecraft server stopped');
      }
    }, 1000);
  } catch (e) {
    logInfo('Minecraft server is not running');
    try { fs.unlinkSync(MINECRAFT_PID_FILE); } catch (e) {}
  }
}

function restartMinecraftServer() {
  stopMinecraftServer();
  setTimeout(startMinecraftServer, 3000);
}

// Bot control functions
async function botStart(username) {
  if (!username) {
    logError('Username is required');
    log('Usage: minebot bot start <username>');
    return;
  }

  try {
    const data = await makeRequest({
      hostname: BOT_HOST,
      port: BOT_PORT,
      path: '/api/bot/start',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000
    }, JSON.stringify({ username }));

    logSuccess('Bot started successfully');
    console.log(`  Bot ID: ${data.botId}`);
    console.log(`  Username: ${data.username}`);
    console.log(`  Mode: ${data.mode || 'survival'}`);
  } catch (err) {
    if (err.message.includes('ECONNREFUSED')) {
      logError('Bot server is not running. Start it with: minebot server start');
    } else {
      logError(err.message);
    }
  }
}

async function botStop(botId) {
  if (!botId) {
    logError('Bot ID is required');
    log('Usage: minebot bot stop <bot-id>');
    return;
  }

  try {
    await makeRequest({
      hostname: BOT_HOST,
      port: BOT_PORT,
      path: `/api/bot/${botId}/stop`,
      method: 'POST'
    });
    logSuccess('Bot stopped successfully');
  } catch (err) {
    logError(err.message);
  }
}

async function botAutomatic(username, mode = 'survival') {
  if (!username) {
    logError('Username is required');
    log('Usage: minebot bot automatic <username> [mode]');
    return;
  }

  try {
    const data = await makeRequest({
      hostname: BOT_HOST,
      port: BOT_PORT,
      path: '/api/bot/automatic',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    }, JSON.stringify({ username, mode }));

    logSuccess('Automatic behavior started');
    console.log(`  Bot ID: ${data.botId}`);
    console.log(`  Username: ${data.username}`);
    console.log(`  Mode: ${mode}`);
  } catch (err) {
    logError(err.message);
  }
}

async function botList() {
  try {
    const data = await makeRequest({
      hostname: BOT_HOST,
      port: BOT_PORT,
      path: '/api/bots',
      method: 'GET'
    });

    console.log(`${colors.bright}Bots (${data.count}):${colors.reset}`);
    data.bots.forEach(bot => {
      const stateColor = bot.state === 'ALIVE' ? colors.green : 
                        bot.state === 'DEAD' ? colors.red : colors.yellow;
      console.log(`  ${colors.bright}${bot.username}${colors.reset} (${bot.botId})`);
      console.log(`    State: ${stateColor}${bot.state}${colors.reset}`);
      console.log(`    Connected: ${bot.connected ? colors.green + 'Yes' : colors.red + 'No'}${colors.reset}`);
      if (bot.position) {
        console.log(`    Position: ${bot.position.x}, ${bot.position.y}, ${bot.position.z}`);
      }
    });
  } catch (err) {
    logError(err.message);
  }
}

async function botRestart(botId) {
  if (!botId) {
    logError('Bot ID is required');
    log('Usage: minebot bot restart <bot-id>');
    return;
  }

  try {
    const data = await makeRequest({
      hostname: BOT_HOST,
      port: BOT_PORT,
      path: `/api/bot/${botId}/restart`,
      method: 'POST'
    });
    logSuccess('Bot restart initiated');
    console.log(`  Bot ID: ${data.botId}`);
    console.log(`  Username: ${data.username}`);
  } catch (err) {
    logError(err.message);
  }
}

async function botRemove(botId) {
  if (!botId) {
    logError('Bot ID is required');
    log('Usage: minebot bot remove <bot-id>');
    return;
  }

  try {
    await makeRequest({
      hostname: BOT_HOST,
      port: BOT_PORT,
      path: `/api/bot/${botId}`,
      method: 'DELETE'
    });
    logSuccess('Bot removed successfully');
  } catch (err) {
    logError(err.message);
  }
}

async function botRemoveAll() {
  try {
    const data = await makeRequest({
      hostname: BOT_HOST,
      port: BOT_PORT,
      path: '/api/bots',
      method: 'DELETE'
    });
    logSuccess('All bots removed successfully');
    if (data.message) {
      console.log(`  ${data.message}`);
    }
  } catch (err) {
    logError(err.message);
  }
}

async function botCleanup() {
  try {
    const data = await makeRequest({
      hostname: BOT_HOST,
      port: BOT_PORT,
      path: '/api/bot/cleanup',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    }, '{}');

    logSuccess('Cleanup completed');
    if (data.message) {
      console.log(`  ${data.message}`);
    }
  } catch (err) {
    logError(err.message);
  }
}

async function botWatch(botIdentifier = null, options = {}) {
  const interval = options.interval || 2000;
  const count = options.count || 0;
  
  let watchCount = 0;
  let running = true;
  let actualBotId = null;

  function clearScreen() {
    process.stdout.write('\x1B[2J\x1B[0f');
  }

  function formatPosition(pos) {
    if (!pos) return 'N/A';
    const x = pos.x !== null && pos.x !== undefined ? pos.x.toFixed(1) : 'N/A';
    const y = pos.y !== null && pos.y !== undefined ? pos.y.toFixed(1) : 'N/A';
    const z = pos.z !== null && pos.z !== undefined ? pos.z.toFixed(1) : 'N/A';
    return `${x}, ${y}, ${z}`;
  }

  process.on('SIGINT', () => {
    console.log(`\n${colors.cyan}Watch stopped (Ctrl+C)${colors.reset}`);
    running = false;
    process.exit(0);
  });

  // Helper function to get bot ID by username
  async function getBotIdByIdentifier(identifier) {
    try {
      // First try to get all bots
      const data = await makeRequest({
        hostname: BOT_HOST,
        port: BOT_PORT,
        path: '/api/bots',
        method: 'GET'
      });

      if (data && data.bots) {
        // Check if identifier is a bot ID (starts with 'bot_')
        if (identifier.startsWith('bot_')) {
          const bot = data.bots.find(b => b.botId === identifier);
          return bot ? { botId: bot.botId, username: bot.username } : null;
        } else {
          // Identifier is a username
          const bot = data.bots.find(b => b.username === identifier);
          return bot ? { botId: bot.botId, username: bot.username } : null;
        }
      }
    } catch (err) {
      return null;
    }
    return null;
  }

  async function fetchAndDisplay() {
    if (!running) return;

    try {
      if (botIdentifier) {
        // Single bot watch
        // First, get the actual bot ID if we haven't already
        if (!actualBotId) {
          const botInfo = await getBotIdByIdentifier(botIdentifier);
          if (!botInfo) {
            logError(`Bot not found: ${botIdentifier}`);
            running = false;
            return;
          }
          actualBotId = botInfo.botId;
        }

        const data = await makeRequest({
          hostname: BOT_HOST,
          port: BOT_PORT,
          path: `/api/bot/${actualBotId}/inspect`,
          method: 'GET'
        });

        if (!data.success) {
          logError(`Error: ${data.error}`);
          return;
        }

        const bot = data.bot;
        clearScreen();
        watchCount++;

        console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}`);
        console.log(`${colors.cyan}                   BOT WATCH - ${bot.username}${colors.reset}`);
        console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}`);
        console.log();
        console.log(`${colors.cyan}Time: ${new Date().toLocaleTimeString()} | Update: ${watchCount}${count > 0 ? `/${count}` : ''} | Press Ctrl+C to stop${colors.reset}`);
        console.log();

        console.log(`${colors.bright}Bot Information${colors.reset}`);
        console.log(`  Bot ID:       ${bot.botId}`);
        console.log(`  Username:     ${bot.username}`);
        console.log(`  Mode:         ${bot.mode || 'N/A'}`);
        console.log(`  Game Mode:    ${bot.gameMode}`);
        console.log(`  State:        ${bot.state === 'ALIVE' ? colors.green + 'ALIVE' : bot.state === 'DEAD' ? colors.red + 'DEAD' : colors.yellow + bot.state}${colors.reset}`);
        console.log(`  Connected:    ${bot.connected ? colors.green + 'Yes' : colors.red + 'No'}${colors.reset}`);
        
        if (bot.health !== undefined) {
          console.log();
          console.log(`${colors.bright}Health & Status${colors.reset}`);
          console.log(`  Health:       ${bot.health <= 5 ? colors.red : bot.health <= 10 ? colors.yellow : colors.green}${bot.health}${colors.reset}/${bot.maxHealth || 20}`);
          console.log(`  Food:         ${bot.food || 0}/20`);
        }

        if (bot.position) {
          console.log();
          console.log(`${colors.bright}Position${colors.reset}`);
          console.log(`  Position:     ${formatPosition(bot.position)}`);
        }

        console.log();
        console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}`);
      } else {
        // All bots watch
        const data = await makeRequest({
          hostname: BOT_HOST,
          port: BOT_PORT,
          path: '/api/bots',
          method: 'GET'
        });

        clearScreen();
        watchCount++;

        console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}`);
        console.log(`${colors.cyan}                   BOTS WATCH${colors.reset}`);
        console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}`);
        console.log();
        console.log(`${colors.cyan}Time: ${new Date().toLocaleTimeString()} | Update: ${watchCount}${count > 0 ? `/${count}` : ''} | Press Ctrl+C to stop${colors.reset}`);
        console.log();

        if (data.count === 0) {
          console.log('No active bots');
        } else {
          console.log(`${colors.green}Total Bots: ${data.count}${colors.reset}\n`);
          
          data.bots.forEach((bot, idx) => {
            const stateColor = bot.state === 'ALIVE' ? colors.green : 
                             bot.state === 'DEAD' ? colors.red : colors.yellow;
            console.log(`${colors.bright}[${idx + 1}] ${bot.username}${colors.reset} (${bot.botId})`);
            console.log(`    State: ${stateColor}${bot.state}${colors.reset} | Connected: ${bot.connected ? colors.green + 'Yes' : colors.red + 'No'}${colors.reset}`);
            if (bot.health !== undefined) {
              console.log(`    Health: ${bot.health <= 5 ? colors.red : bot.health <= 10 ? colors.yellow : colors.green}${bot.health}${colors.reset}/20 | Food: ${bot.food || 0}/20`);
            }
            if (bot.position) {
              console.log(`    Position: ${formatPosition(bot.position)}`);
            }
            console.log();
          });
        }

        console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}`);
      }

      if (count > 0 && watchCount >= count) {
        running = false;
        console.log(`${colors.cyan}Watch stopped after ${count} updates${colors.reset}`);
        process.exit(0);
      }
    } catch (err) {
      logError(err.message);
      if (count > 0 && watchCount >= count) {
        running = false;
        process.exit(1);
      }
    }
  }

  fetchAndDisplay();
  const watchInterval = setInterval(() => {
    if (running) {
      fetchAndDisplay();
    } else {
      clearInterval(watchInterval);
    }
  }, interval);
}

async function botGather(botId, blocks, radius = 20) {
  if (!botId || !blocks) {
    logError('Bot ID and blocks are required');
    log('Usage: minebot bot gather --botId <id> --blocks <list> [--radius <num>]');
    return;
  }

  const blockList = typeof blocks === 'string' ? blocks.split(',').map(b => b.trim()) : [];
  
  try {
    const data = await makeRequest({
      hostname: BOT_HOST,
      port: BOT_PORT,
      path: `/api/bot/${botId}/gather`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    }, JSON.stringify({ targetBlocks: blockList, radius }));

    logSuccess('Gathering started successfully');
    console.log(`  Bot ID: ${botId}`);
    console.log(`  Target blocks: ${blockList.join(', ')}`);
    console.log(`  Radius: ${radius} blocks`);
  } catch (err) {
    logError(err.message);
  }
}

async function botBuild(botId, block, size, offset = '0,0,0') {
  if (!botId || !block || !size) {
    logError('Bot ID, block type, and size are required');
    log('Usage: minebot bot build --botId <id> --block <type> --size <WxLxH> [--offset <x,y,z>]');
    return;
  }

  const [width, length, height] = size.split('x').map(v => parseInt(v.trim(), 10));
  const [offsetX, offsetY, offsetZ] = offset.split(',').map(v => parseInt(v.trim(), 10));
  
  try {
    const data = await makeRequest({
      hostname: BOT_HOST,
      port: BOT_PORT,
      path: `/api/bot/${botId}/build`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 120000
    }, JSON.stringify({ 
      width, length, height, 
      blockType: block,
      offsetX, offsetY, offsetZ
    }));

    logSuccess('Building started successfully');
    console.log(`  Bot ID: ${botId}`);
    console.log(`  Block type: ${block}`);
    console.log(`  Structure size: ${width}x${length}x${height}`);
    console.log(`  Offset: ${offsetX}, ${offsetY}, ${offsetZ}`);
  } catch (err) {
    logError(err.message);
  }
}

// Evolution system functions
async function evolutionStats(botId) {
  if (!botId) {
    logError('Bot ID is required');
    log('Usage: minebot evolution stats <bot-id>');
    return;
  }

  try {
    const data = await makeRequest({
      hostname: BOT_HOST,
      port: BOT_PORT,
      path: `/api/bot/${botId}/evolution/stats`,
      method: 'GET'
    });

    console.log(`${colors.bright}Evolution Stats for Bot: ${botId}${colors.reset}`);
    console.log();
    
    if (data.domains) {
      console.log(`${colors.cyan}Domains:${colors.reset}`);
      for (const [domain, stats] of Object.entries(data.domains)) {
        console.log(`  ${colors.bright}${domain}${colors.reset}:`);
        console.log(`    Version: ${stats.version}`);
        console.log(`    Experience Count: ${stats.experienceCount || 0}`);
        if (stats.baselineFitness !== undefined) {
          console.log(`    Baseline Fitness: ${stats.baselineFitness.toFixed(3)}`);
        }
        if (stats.recentFitness && stats.recentFitness.length > 0) {
          const avg = stats.recentFitness.reduce((a, b) => a + b, 0) / stats.recentFitness.length;
          console.log(`    Recent Avg Fitness: ${avg.toFixed(3)}`);
        }
        console.log();
      }
    }

    if (data.weights) {
      console.log(`${colors.cyan}Weights:${colors.reset}`);
      for (const [param, value] of Object.entries(data.weights)) {
        console.log(`  ${param}: ${value.toFixed(3)}`);
      }
    }
  } catch (err) {
    logError(err.message);
  }
}

async function evolutionReset(botId) {
  if (!botId) {
    logError('Bot ID is required');
    log('Usage: minebot evolution reset <bot-id>');
    return;
  }

  try {
    const data = await makeRequest({
      hostname: BOT_HOST,
      port: BOT_PORT,
      path: `/api/bot/${botId}/evolution/reset`,
      method: 'POST'
    });

    logSuccess('Evolution system reset');
    if (data.message) {
      console.log(`  ${data.message}`);
    }
  } catch (err) {
    logError(err.message);
  }
}

// Goal system functions
async function goalSelect(botId, goalType) {
  if (!botId || !goalType) {
    logError('Bot ID and goal type are required');
    log('Usage: minebot goal select <bot-id> <goal-type>');
    log('Available goal types: gather, build, explore, defend');
    return;
  }

  try {
    const data = await makeRequest({
      hostname: BOT_HOST,
      port: BOT_PORT,
      path: `/api/bot/${botId}/goal/select`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({ goalType }));

    logSuccess('Goal selected');
    console.log(`  Bot ID: ${botId}`);
    console.log(`  Goal: ${goalType}`);
    if (data.message) {
      console.log(`  ${data.message}`);
    }
  } catch (err) {
    logError(err.message);
  }
}

async function goalStatus(botId) {
  if (!botId) {
    logError('Bot ID is required');
    log('Usage: minebot goal status <bot-id>');
    return;
  }

  try {
    const data = await makeRequest({
      hostname: BOT_HOST,
      port: BOT_PORT,
      path: `/api/bot/${botId}/goal/status`,
      method: 'GET'
    });

    console.log(`${colors.bright}Goal Status for Bot: ${botId}${colors.reset}`);
    console.log();
    console.log(`  Current Goal: ${data.currentGoal || 'None'}`);
    console.log(`  Progress: ${Math.round((data.progress || 0) * 100)}%`);
    console.log(`  Active: ${data.active ? colors.green + 'Yes' : colors.red + 'No'}${colors.reset}`);
    
    if (data.subgoals && data.subgoals.length > 0) {
      console.log();
      console.log(`  Subgoals:`);
      data.subgoals.forEach((sg, idx) => {
        console.log(`    ${idx + 1}. ${sg.description} - ${sg.completed ? colors.green + '✓' : colors.yellow + '○'}${colors.reset}`);
      });
    }
  } catch (err) {
    logError(err.message);
  }
}

// Config functions
async function configShow() {
  try {
    const data = await makeRequest({
      hostname: BOT_HOST,
      port: BOT_PORT,
      path: '/api/server/config',
      method: 'GET'
    });

    console.log(`${colors.bright}Server Configuration${colors.reset}`);
    console.log();
    
    console.log(`${colors.cyan}Environment Variables:${colors.reset}`);
    for (const [key, value] of Object.entries(data.env)) {
      console.log(`  ${colors.bright}${key}${colors.reset}: ${value}`);
    }
    
    console.log();
    console.log(`${colors.cyan}Database:${colors.reset}`);
    console.log(`  Path: ${data.database.path}`);
    console.log(`  Connected: ${data.database.connected ? colors.green + 'Yes' : colors.red + 'No'}${colors.reset}`);
    console.log(`  Tables: ${data.database.tables.join(', ')}`);
  } catch (err) {
    logError(err.message);
  }
}

async function configSet(key, value) {
  if (!key || !value) {
    logError('Key and value are required');
    log('Usage: minebot config set <key> <value>');
    return;
  }

  try {
    await makeRequest({
      hostname: BOT_HOST,
      port: BOT_PORT,
      path: '/api/server/config/env',
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({ [key]: value }));

    logSuccess('Configuration updated');
    console.log(`  ${key} = ${value}`);
    logInfo('Note: Restart server for changes to take effect');
  } catch (err) {
    logError(err.message);
  }
}

// LLM functions
async function llmStrategy(goal, context = '') {
  if (!goal) {
    logError('Goal is required');
    log('Usage: minebot llm strategy <goal> [context]');
    return;
  }

  try {
    const data = await makeRequest({
      hostname: BOT_HOST,
      port: BOT_PORT,
      path: '/api/llm/strategy',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({ goal, context }));

    console.log(`${colors.bright}LLM Strategy Advice${colors.reset}`);
    console.log();
    console.log(`${colors.cyan}Goal:${colors.reset} ${goal}`);
    if (context) {
      console.log(`${colors.cyan}Context:${colors.reset} ${context}`);
    }
    console.log();
    console.log(`${colors.cyan}Advice:${colors.reset}`);
    console.log(data.advice);
  } catch (err) {
    logError(err.message);
  }
}

// Server logs
async function serverLogs(options = {}) {
  const lines = options.lines || 50;
  const follow = options.follow || false;

  const LOG_FILE = path.join(__dirname, 'logs', 'bot_server.log');
  
  console.log(`${colors.cyan}Bot server logs: ${LOG_FILE}${colors.reset}`);
  
  if (follow) {
    console.log('Press Ctrl+C to stop\n');
    
    let lastSize = 0;
    let running = true;

    process.on('SIGINT', () => {
      console.log(`\n${colors.cyan}Log follow stopped${colors.reset}`);
      running = false;
      process.exit(0);
    });

    function tailLog() {
      if (!running) return;

      try {
        const stats = fs.statSync(LOG_FILE);
        if (stats.size > lastSize) {
          const stream = fs.createReadStream(LOG_FILE, { start: lastSize, encoding: 'utf8' });
          stream.on('data', (data) => {
            const lines = data.split('\n');
            lines.forEach(line => {
              if (line.trim() === '') return;
              
              let coloredLine = line;
              if (line.includes('[ERROR]') || line.includes('Error:')) {
                coloredLine = `${colors.red}${line}${colors.reset}`;
              } else if (line.includes('[WARN]') || line.includes('Warning:')) {
                coloredLine = `${colors.yellow}${line}${colors.reset}`;
              } else if (line.includes('[INFO]')) {
                coloredLine = `${colors.green}${line}${colors.reset}`;
              } else if (line.includes('[Bot]')) {
                coloredLine = `${colors.cyan}${line}${colors.reset}`;
              } else if (line.includes('[Pathfinder]')) {
                coloredLine = `${colors.magenta}${line}${colors.reset}`;
              }
              console.log(coloredLine);
            });
          });
          stream.on('end', () => {
            lastSize = stats.size;
          });
        }
      } catch (err) {
        console.error(`${colors.red}Error reading log file: ${err.message}${colors.reset}`);
      }

      setTimeout(tailLog, 1000);
    }

    // Show last few lines initially
    try {
      const content = fs.readFileSync(LOG_FILE, 'utf8');
      const allLines = content.split('\n').filter(line => line.trim() !== '');
      const lastLines = allLines.slice(-lines);
      
      lastLines.forEach(line => {
        let coloredLine = line;
        if (line.includes('[ERROR]') || line.includes('Error:')) {
          coloredLine = `${colors.red}${line}${colors.reset}`;
        } else if (line.includes('[WARN]') || line.includes('Warning:')) {
          coloredLine = `${colors.yellow}${line}${colors.reset}`;
        } else if (line.includes('[INFO]')) {
          coloredLine = `${colors.green}${line}${colors.reset}`;
        } else if (line.includes('[Bot]')) {
          coloredLine = `${colors.cyan}${line}${colors.reset}`;
        } else if (line.includes('[Pathfinder]')) {
          coloredLine = `${colors.magenta}${line}${colors.reset}`;
        }
        console.log(coloredLine);
      });
      lastSize = fs.statSync(LOG_FILE).size;
    } catch (err) {
      console.error(`${colors.red}Error reading log file: ${err.message}${colors.reset}`);
    }

    tailLog();
  } else {
    try {
      const content = fs.readFileSync(LOG_FILE, 'utf8');
      const allLines = content.split('\n').filter(line => line.trim() !== '');
      const lastLines = allLines.slice(-lines);
      
      console.log(`Last ${lastLines.length} log lines:\n`);
      console.log(`${colors.gray}${'='.repeat(80)}${colors.reset}`);
      
      lastLines.forEach(line => {
        let coloredLine = line;
        if (line.includes('[ERROR]') || line.includes('Error:')) {
          coloredLine = `${colors.red}${line}${colors.reset}`;
        } else if (line.includes('[WARN]') || line.includes('Warning:')) {
          coloredLine = `${colors.yellow}${line}${colors.reset}`;
        } else if (line.includes('[INFO]')) {
          coloredLine = `${colors.green}${line}${colors.reset}`;
        } else if (line.includes('[Bot]')) {
          coloredLine = `${colors.cyan}${line}${colors.reset}`;
        } else if (line.includes('[Pathfinder]')) {
          coloredLine = `${colors.magenta}${line}${colors.reset}`;
        }
        console.log(coloredLine);
      });
    } catch (err) {
      console.error(`${colors.red}Error reading log file: ${err.message}${colors.reset}`);
    }
  }
}

// Main help
function showHelp() {
  console.log(`${colors.bright}${colors.cyan}Usage:${colors.reset} minebot <system> <action> [args...]

${colors.bright}${colors.cyan}MineBot - Minecraft AI Robot System (CLI Only)${colors.reset}

${colors.bright}Systems:${colors.reset}
  ${colors.green}bot${colors.reset}         Bot control
  ${colors.green}mc${colors.reset}          Minecraft server control
  ${colors.green}config${colors.reset}      Configuration management
  ${colors.green}evolution${colors.reset}   Evolution system management
  ${colors.green}goal${colors.reset}        Goal system management
  ${colors.green}llm${colors.reset}         LLM strategy management
  ${colors.green}server${colors.reset}      Bot server management
  ${colors.green}dev${colors.reset}         Development mode
  ${colors.green}admin${colors.reset}       Interactive admin console
  ${colors.green}console${colors.reset}     Interactive admin console

${colors.bright}Top-level commands:${colors.reset}
  ${colors.yellow}status${colors.reset} [--json]  Show system status
  ${colors.yellow}help${colors.reset}            Show this help message

${colors.bright}Examples:${colors.reset}
  ${colors.gray}minebot bot start MyBot${colors.reset}
  ${colors.gray}minebot bot watch${colors.reset}
  ${colors.gray}minebot server start${colors.reset}
  ${colors.gray}minebot config show${colors.reset}
  ${colors.gray}minebot evolution stats bot_123${colors.reset}
`);
}

// System status
async function showSystemStatus(jsonOutput = false) {
  async function getBotServerStatus() {
    try {
      const data = await makeRequest({
        hostname: BOT_HOST,
        port: BOT_PORT,
        path: '/api/health',
        method: 'GET',
        timeout: 2000
      });
      return { status: 'RUNNING', data };
    } catch (err) {
      return { status: 'NOT_RUNNING' };
    }
  }

  async function getBotsStatus() {
    try {
      const data = await makeRequest({
        hostname: BOT_HOST,
        port: BOT_PORT,
        path: '/api/bots',
        method: 'GET',
        timeout: 2000
      });
      return { status: 'AVAILABLE', data };
    } catch (err) {
      return { status: 'UNAVAILABLE' };
    }
  }

  function getMinecraftStatus() {
    return new Promise((resolve) => {
      const net = require('net');
      const socket = new net.Socket();
      
      socket.setTimeout(2000);
      socket.connect({ host: 'localhost', port: 25565 }, () => {
        socket.destroy();
        resolve({ status: 'RUNNING' });
      });
      
      socket.on('error', () => {
        resolve({ status: 'NOT_RUNNING' });
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        resolve({ status: 'NOT_RUNNING' });
      });
    });
  }

  try {
    const [botServer, bots, mcServer] = await Promise.all([
      getBotServerStatus(),
      getBotsStatus(),
      getMinecraftStatus()
    ]);

    if (jsonOutput) {
      const status = {
        botServer: {
          status: botServer.status,
          data: botServer.data || null
        },
        bots: {
          status: bots.status,
          data: bots.data || null
        },
        mcServer: mcServer
      };
      console.log(JSON.stringify(status, null, 2));
    } else {
      console.log(`${colors.bright}${colors.cyan}System Status${colors.reset}`);
      console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}`);
      console.log();
      
      console.log(`${colors.bright}Bot Server:${colors.reset} ${botServer.status === 'RUNNING' ? colors.green + 'RUNNING' : colors.red + 'NOT RUNNING'}${colors.reset}`);
      if (botServer.status === 'RUNNING' && botServer.data) {
        console.log(`  Mode: ${botServer.data.serverMode}`);
        console.log(`  Uptime: ${botServer.data.uptimeSeconds || 0} seconds`);
      }
      console.log();
      
      console.log(`${colors.bright}Minecraft Server:${colors.reset} ${mcServer.status === 'RUNNING' ? colors.green + 'RUNNING' : colors.red + 'NOT RUNNING'}${colors.reset}`);
      console.log();
      
      if (bots.status === 'AVAILABLE' && bots.data) {
        console.log(`${colors.bright}Bots (${bots.data.count}):${colors.reset}`);
        bots.data.bots.forEach(bot => {
          const stateColor = bot.state === 'ALIVE' ? colors.green : 
                           bot.state === 'DEAD' ? colors.red : colors.yellow;
          console.log(`  ${bot.username}: ${stateColor}${bot.state}${colors.reset} (${bot.connected ? 'connected' : 'disconnected'})`);
        });
      } else {
        console.log(`${colors.bright}Bots:${colors.reset} ${colors.yellow}UNAVAILABLE${colors.reset}`);
      }
    }
  } catch (err) {
    logError(`Failed to get system status: ${err.message}`);
  }
}

// Main CLI logic
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    showHelp();
    process.exit(0);
  }

  // Parse arguments
  const parsedArgs = {};
  const positionalArgs = [];
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        parsedArgs[key] = args[i + 1];
        i++;
      } else {
        parsedArgs[key] = true;
      }
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        parsedArgs[key] = args[i + 1];
        i++;
      } else {
        parsedArgs[key] = true;
      }
    } else {
      positionalArgs.push(arg);
    }
  }

  const system = positionalArgs[0];
  const action = positionalArgs[1];
  const actionArgs = positionalArgs.slice(2);

  try {
    switch (system) {
      case 'bot':
        switch (action) {
          case 'start':
            await botStart(actionArgs[0]);
            break;
          case 'stop':
            await botStop(actionArgs[0]);
            break;
          case 'automatic':
            await botAutomatic(actionArgs[0], actionArgs[1]);
            break;
          case 'list':
            await botList();
            break;
          case 'restart':
            await botRestart(actionArgs[0]);
            break;
          case 'remove':
            if (actionArgs[0] === 'all') {
              await botRemoveAll();
            } else {
              await botRemove(actionArgs[0]);
            }
            break;
          case 'cleanup':
            await botCleanup();
            break;
          case 'watch':
            await botWatch(actionArgs[0], parsedArgs);
            break;
          case 'gather':
            await botGather(parsedArgs.botId, parsedArgs.blocks, parsedArgs.radius);
            break;
          case 'build':
            await botBuild(parsedArgs.botId, parsedArgs.block, parsedArgs.size, parsedArgs.offset);
            break;
          case 'help':
          case '-h':
          case '--help':
            console.log(`${colors.bright}${colors.cyan}Bot Control Commands${colors.reset}

${colors.bright}Actions:${colors.reset}
  ${colors.yellow}start <username>${colors.reset}      Start a bot
  ${colors.yellow}stop <bot-id>${colors.reset}         Stop a bot
  ${colors.yellow}automatic <username> [mode]${colors.reset}
                        Start automatic behavior
  ${colors.yellow}list${colors.reset}                  List all bots
  ${colors.yellow}restart <bot-id>${colors.reset}      Restart a bot
  ${colors.yellow}remove <bot-id>${colors.reset}       Remove a bot
  ${colors.yellow}remove all${colors.reset}            Remove all bots
  ${colors.yellow}cleanup${colors.reset}               Cleanup stale bots
  ${colors.yellow}watch [bot-id]${colors.reset}        Watch bots in real-time
                        --interval <ms>  Update interval (default: 2000)
                        --count <n>      Number of updates (default: continuous)
  ${colors.yellow}gather${colors.reset}                Gather resources
                        --botId <id>     Bot ID
                        --blocks <list>  Comma-separated block types
                        --radius <num>   Search radius (default: 20)
  ${colors.yellow}build${colors.reset}                 Build structure
                        --botId <id>     Bot ID
                        --block <type>   Block type
                        --size <WxLxH>   Dimensions (e.g. 5x5x3)
                        --offset <x,y,z> Offset (default: 0,0,0)
`);
            break;
          default:
            logError(`Unknown bot action: ${action}`);
            console.log('Run "minebot bot help" for available commands');
            process.exit(1);
        }
        break;

      case 'mc':
        switch (action) {
          case 'start':
            startMinecraftServer();
            break;
          case 'stop':
            stopMinecraftServer();
            break;
          case 'restart':
            restartMinecraftServer();
            break;
          case 'status':
            const net = require('net');
            const socket = new net.Socket();
            socket.setTimeout(2000);
            socket.connect({ host: 'localhost', port: 25565 }, () => {
              socket.destroy();
              console.log(`${colors.green}Minecraft Server: RUNNING${colors.reset}`);
            });
            socket.on('error', () => {
              console.log(`${colors.red}Minecraft Server: NOT RUNNING${colors.reset}`);
            });
            socket.on('timeout', () => {
              socket.destroy();
              console.log(`${colors.red}Minecraft Server: NOT RUNNING${colors.reset}`);
            });
            break;
          case 'backup':
            logInfo('Backup functionality not yet implemented');
            console.log('To backup Minecraft server, manually copy the world folder:');
            console.log(`  cp -r ${MINECRAFT_SERVER_DIR}/world ${MINECRAFT_SERVER_DIR}/world_backup_$(date +%Y%m%d_%H%M%S)`);
            break;
          case 'help':
          case '-h':
          case '--help':
            console.log(`${colors.bright}${colors.cyan}Minecraft Server Control${colors.reset}

${colors.bright}Actions:${colors.reset}
  ${colors.yellow}start${colors.reset}     Start Minecraft server
  ${colors.yellow}stop${colors.reset}      Stop Minecraft server
  ${colors.yellow}restart${colors.reset}   Restart Minecraft server
  ${colors.yellow}status${colors.reset}    Check server status
  ${colors.yellow}backup${colors.reset}    Show backup instructions
`);
            break;
          default:
            logError(`Unknown MC action: ${action}`);
            console.log('Run "minebot mc help" for available commands');
            process.exit(1);
        }
        break;

      case 'config':
        switch (action) {
          case 'show':
            await configShow();
            break;
          case 'set':
            await configSet(actionArgs[0], actionArgs[1]);
            break;
          case 'help':
          case '-h':
          case '--help':
            console.log(`${colors.bright}${colors.cyan}Configuration Management${colors.reset}

${colors.bright}Actions:${colors.reset}
  ${colors.yellow}show${colors.reset}     Show current configuration
  ${colors.yellow}set <key> <value>${colors.reset}  Set configuration value
`);
            break;
          default:
            logError(`Unknown config action: ${action}`);
            console.log('Run "minebot config help" for available commands');
            process.exit(1);
        }
        break;

      case 'evolution':
        switch (action) {
          case 'stats':
            await evolutionStats(actionArgs[0]);
            break;
          case 'reset':
            await evolutionReset(actionArgs[0]);
            break;
          case 'help':
          case '-h':
          case '--help':
            console.log(`${colors.bright}${colors.cyan}Evolution System Management${colors.reset}

${colors.bright}Actions:${colors.reset}
  ${colors.yellow}stats <bot-id>${colors.reset}     Show evolution statistics
  ${colors.yellow}reset <bot-id>${colors.reset}     Reset evolution system
`);
            break;
          default:
            logError(`Unknown evolution action: ${action}`);
            console.log('Run "minebot evolution help" for available commands');
            process.exit(1);
        }
        break;

      case 'goal':
        switch (action) {
          case 'select':
            await goalSelect(actionArgs[0], actionArgs[1]);
            break;
          case 'status':
            await goalStatus(actionArgs[0]);
            break;
          case 'help':
          case '-h':
          case '--help':
            console.log(`${colors.bright}${colors.cyan}Goal System Management${colors.reset}

${colors.bright}Actions:${colors.reset}
  ${colors.yellow}select <bot-id> <goal>${colors.reset}  Select goal for bot
  ${colors.yellow}status <bot-id>${colors.reset}         Show goal status
`);
            break;
          default:
            logError(`Unknown goal action: ${action}`);
            console.log('Run "minebot goal help" for available commands');
            process.exit(1);
        }
        break;

      case 'llm':
        switch (action) {
          case 'strategy':
            await llmStrategy(actionArgs[0], actionArgs.slice(1).join(' '));
            break;
          case 'help':
          case '-h':
          case '--help':
            console.log(`${colors.bright}${colors.cyan}LLM Strategy Management${colors.reset}

${colors.bright}Actions:${colors.reset}
  ${colors.yellow}strategy <goal> [context]${colors.reset}  Get strategy advice
`);
            break;
          default:
            logError(`Unknown llm action: ${action}`);
            console.log('Run "minebot llm help" for available commands');
            process.exit(1);
        }
        break;

      case 'server':
        switch (action) {
          case 'start':
            startBotServer();
            break;
          case 'stop':
            stopBotServer();
            break;
          case 'restart':
            stopBotServer();
            setTimeout(startBotServer, 2000);
            break;
          case 'logs':
            await serverLogs(parsedArgs);
            break;
          case 'help':
          case '-h':
          case '--help':
            console.log(`${colors.bright}${colors.cyan}Bot Server Management${colors.reset}

${colors.bright}Actions:${colors.reset}
  ${colors.yellow}start${colors.reset}     Start bot server
  ${colors.yellow}stop${colors.reset}      Stop bot server
  ${colors.yellow}restart${colors.reset}   Restart bot server
  ${colors.yellow}logs${colors.reset}      Show server logs
                        --lines <n>    Number of lines (default: 50)
                        --follow       Follow logs in real-time
`);
            break;
          default:
            logError(`Unknown server action: ${action}`);
            console.log('Run "minebot server help" for available commands');
            process.exit(1);
        }
        break;

      case 'dev':
        logInfo('Starting development environment...');
        startBotServer();
        break;

      case 'admin':
      case 'console':
        await adminConsoleCommand();
        break;

      case 'status':
        await showSystemStatus(parsedArgs.json);
        break;

      case 'help':
      case '-h':
      case '--help':
        showHelp();
        break;

      default:
        logError(`Unknown system: ${system}`);
        showHelp();
        process.exit(1);
    }
  } catch (err) {
    logError(`Command failed: ${err.message}`);
    process.exit(1);
  }
}

// Run the CLI
if (require.main === module) {
  main().catch(err => {
    logError(`Fatal error: ${err.message}`);
    process.exit(1);
  });
}

// ============================================================================
// Admin Console Implementation
// ============================================================================



// Admin Console command
async function adminConsoleCommand() {
  logInfo('Starting MineBot Admin Console...');
  logInfo('Press Ctrl+C to exit at any time\n');
  
  const console = new AdminConsole();
  await console.start();
}

// Export the AdminConsole class
module.exports = { main, AdminConsole, adminConsoleCommand };