#!/usr/bin/env node
require('dotenv').config();
const path = require('path');
const fs = require('fs');

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

module.exports = { main };