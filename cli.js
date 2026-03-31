#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const BOT_SERVER_SCRIPT = path.join(__dirname, 'bot_server.js');
const FRONTEND_DIR = path.join(__dirname, 'frontend');
const MINECRAFT_SERVER_DIR = path.join(__dirname, 'resources');
const MINECRAFT_SERVER_JAR = path.join(MINECRAFT_SERVER_DIR, 'minecraft_server.1.21.11.jar');

let botServerProcess = null;
let minecraftServerProcess = null;

// Default host and port for bot server
let botHost = 'localhost';
let botPort = 9500;
// Default Minecraft server jar path
let minecraftJarPath = null;

// PID file paths
const BOT_PID_FILE = path.join(__dirname, 'logs', 'bot_server.pid');
const MINECRAFT_PID_FILE = path.join(__dirname, 'logs', 'minecraft_server.pid');

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
  } catch (e) {
    // ignore
  }
  return null;
}

function startBotServer() {
  const LOG_DIR = path.join(__dirname, 'logs');
  const LOG_FILE = path.join(LOG_DIR, 'bot_server.log');
  
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }

  console.log(`Starting bot server on ${botHost}:${botPort}...`);
  
  const startScript = `
#!/bin/bash
nohup node ${BOT_SERVER_SCRIPT} > ${LOG_FILE} 2>&1 &
`;
  const scriptFile = '/tmp/start_bot_server.sh';
  fs.writeFileSync(scriptFile, startScript);
  fs.chmodSync(scriptFile, '755');
  
  spawn('bash', [scriptFile], {
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true,
    env: process.env
  });
  
  console.log('Bot server started');
}

function stopBotServer() {
  const pid = loadPid('bot');
  if (!pid) {
    console.log('Bot server is not running');
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
    console.log('Stopping bot server...');
    setTimeout(() => {
      try {
        fs.unlinkSync(BOT_PID_FILE);
      } catch (e) {}
      console.log('Bot server stopped');
    }, 1000);
  } catch (e) {
    console.log('Bot server is not running');
    try {
      fs.unlinkSync(BOT_PID_FILE);
    } catch (e2) {}
  }
}

function restartBotServer() {
  stopBotServer();
  setTimeout(startBotServer, 2000);
}

function startMinecraftServer() {
  const jarPath = minecraftJarPath || MINECRAFT_SERVER_JAR;
  if (!fs.existsSync(jarPath)) {
    console.log(`Minecraft server jar not found at ${jarPath}`);
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
      console.log(`Minecraft server is already running with PID ${existingPid}`);
      return;
    } catch (e) {
      console.log('Removing stale PID file');
      try {
        fs.unlinkSync(MINECRAFT_PID_FILE);
      } catch (e2) {}
    }
  }

  console.log('Starting Minecraft server...');
  
  const startScript = `
#!/bin/bash
cd ${MINECRAFT_SERVER_DIR}
nohup java -Xmx1G -jar ${jarPath} nogui > ${LOG_FILE} 2>&1 &
echo \$!
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
  child.stdout.on('data', (data) => {
    output += data.toString();
  });
  
  child.on('close', (code) => {
    const pid = parseInt(output.trim(), 10);
    if (!isNaN(pid)) {
      savePid(pid, 'minecraft');
      console.log(`Minecraft server started with PID ${pid}`);
    }
  });
}

function stopMinecraftServer() {
  const pid = loadPid('minecraft');
  if (!pid) {
    console.log('Minecraft server is not running');
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
    console.log('Stopping Minecraft server...');
    setTimeout(() => {
      try {
        fs.unlinkSync(MINECRAFT_PID_FILE);
      } catch (e) {}
      console.log('Minecraft server stopped');
    }, 1000);
  } catch (e) {
    console.log('Minecraft server is not running');
    try {
      fs.unlinkSync(MINECRAFT_PID_FILE);
    } catch (e2) {}
  }
}

function restartMinecraftServer() {
  stopMinecraftServer();
  setTimeout(startMinecraftServer, 3000);
}

function botControl(action, username, botId, mode) {
  const http = require('http');
  
  function makeRequest(options, postData = null) {
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

  switch(action) {
    case 'start':
      if (!username) {
        console.log('Error: username is required');
        return;
      }
      makeRequest({
        hostname: botHost,
        port: botPort,
        path: '/api/bot/start',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }, JSON.stringify({ username }))
      .then(data => {
        console.log(`Bot started successfully`);
        console.log(`  Bot ID: ${data.botId}`);
        console.log(`  Username: ${data.username}`);
      })
      .catch(err => {
        console.log(`Error: ${err.message}`);
      });
      break;
      
    case 'stop':
      if (!botId) {
        console.log('Error: botId is required');
        return;
      }
      makeRequest({
        hostname: botHost,
        port: botPort,
        path: `/api/bot/${botId}/stop`,
        method: 'POST'
      })
      .then(data => {
        console.log(`Bot stopped successfully`);
      })
      .catch(err => {
        console.log(`Error: ${err.message}`);
      });
      break;
      
    case 'automatic':
      if (!username) {
        console.log('Error: username is required');
        return;
      }
      makeRequest({
        hostname: botHost,
        port: botPort,
        path: '/api/bot/automatic',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }, JSON.stringify({ username, mode: mode || 'survival' }))
      .then(data => {
        console.log(`Automatic behavior started`);
        console.log(`  Bot ID: ${data.botId}`);
        console.log(`  Username: ${data.username}`);
        console.log(`  Mode: ${mode || 'survival'}`);
      })
      .catch(err => {
        console.log(`Error: ${err.message}`);
      });
      break;
      
    case 'list':
      makeRequest({
        hostname: botHost,
        port: botPort,
        path: '/api/bots',
        method: 'GET'
      })
      .then(data => {
        console.log(`Bots (${data.count}):`);
        data.bots.forEach(bot => {
          console.log(`  ${bot.username} (${bot.botId})`);
          console.log(`    State: ${bot.state}`);
          console.log(`    Connected: ${bot.connected}`);
          if (bot.position) {
            console.log(`    Position: ${bot.position.x}, ${bot.position.y}, ${bot.position.z}`);
          }
        });
      })
      .catch(err => {
        console.log(`Error: ${err.message}`);
      });
      break;
      
    case 'status':
      console.log('bot server:');
      const http = require('http');
      const req = http.request(`http://${botHost}:${botPort}/api/health`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode === 200) {
              console.log(`  RUNNING`);
            } else {
              console.log(`  ERROR`);
            }
          } catch (e) {
            console.log(`  NOT RUNNING`);
          }
        });
      });
      
      req.on('error', () => {
        console.log(`  NOT RUNNING`);
      });
      
      req.on('timeout', () => {
        req.destroy();
        console.log(`  TIMEOUT`);
      });
      
      req.end();

      const net = require('net');
      const socket = new net.Socket();
      
      socket.setTimeout(2000);
      socket.connect({ host: 'localhost', port: 25565 }, () => {
        socket.destroy();
        console.log('minecraft server: RUNNING');
      });
      
      socket.on('error', () => {
        console.log('minecraft server: NOT RUNNING');
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        console.log('minecraft server: NOT RUNNING');
      });
      
      break;
      
    default:
      console.log(`Unknown action: ${action}`);
  }
}

function showHelp() {
  console.log(`Usage: minebot <system> <action> [args...]

minebot - Minecraft AI Robot System

Systems:
  bot         Bot control (use "minebot bot help" for details)
  mc          Minecraft server control (use "minebot mc help" for details)
  server      Bot server management (use "minebot server help" for details)
  dev         Start development mode

Top-level commands:
  status [--json]  Show system status (bot server, bots, Minecraft server)
                   --json    Output in JSON format
  help            Show this help message

Examples:
  minebot bot start MyBot
  minebot bot s MyBot
  minebot bot stop bot_123
  minebot bot a MyBot survival
  minebot bot list
  minebot mc start
  minebot mc s
  minebot server start
  minebot server stop
  minebot status
  minebot status --json
`);
}

// Main CLI logic
const args = process.argv.slice(2);

if (args.length === 0) {
  showHelp();
  process.exit(0);
}

// Parse system and action (2-level subcommands)
const system = args[0];
let action = args[1];
const commandArgs = args.slice(2);

// Define aliases
const aliases = {
  bot: {
    s: 'start',
    st: 'stop',
    a: 'automatic',
    ls: 'list'
  },
  mc: {
    s: 'start',
    st: 'stop',
    r: 'restart'
  },
  server: {
    s: 'start',
    st: 'stop',
    r: 'restart'
  }
};

// Resolve aliases
if (aliases[system] && aliases[system][action]) {
  action = aliases[system][action];
}

switch(system) {
  case 'bot':
    switch(action) {
      case 'start':
        botControl('start', commandArgs[0]);
        break;
      case 'stop':
      case 'st':
        botControl('stop', null, commandArgs[0]);
        break;
      case 'automatic':
      case 'a':
        const autoMode = commandArgs[0] && ['survival', 'creative', 'building', 'gathering'].includes(commandArgs[0]) ? commandArgs[0] : (commandArgs[1] || 'survival');
        const autoUsername = commandArgs[0] && !['survival', 'creative', 'building', 'gathering'].includes(commandArgs[0]) ? commandArgs[0] : `auto_${Date.now().toString(36)}`;
        botControl('automatic', autoUsername, null, autoMode);
        break;
      case 'list':
      case 'ls':
        botControl('list');
        break;
      case 'help':
      case '-h':
      case '--help':
        console.log(`minebot bot <action> - Bot control

Bot Actions:
  start <user>     Start a bot with username
  s <user>         Alias for start
  stop <id>        Stop a bot by ID
  st <id>          Alias for stop
  automatic <user|mode> [mode]
                    Start automatic behavior (survival|creative|building|gathering)
                    If one arg: treated as mode (username auto-generated)
                    If two args: first is username, second is mode
  a <user|mode> [mode]  Alias for automatic
  list             List bots
  ls               Alias for list

Examples:
  minebot bot start MyBot
  minebot bot s MyBot
  minebot bot stop bot_123
  minebot bot a MyBot survival
  minebot bot automatic building
  minebot bot automatic myuser creative
  minebot bot list
`);
        break;
      default:
        console.log(`Unknown bot action: ${action}`);
        console.log('Run "minebot bot help" for available commands');
        process.exit(1);
    }
    break;
    
  case 'mc':
    switch(action) {
      case 'help':
      case '-h':
      case '--help':
        console.log(`minebot mc <action> - Minecraft server control

MC Actions:
  start         Start Minecraft server
  s             Alias for start
  stop          Stop Minecraft server
  st            Alias for stop
  restart       Restart Minecraft server
  r             Alias for restart

Examples:
  minebot mc start
  minebot mc s
  minebot mc stop
  minebot mc r
`);
        break;
      case 'start':
      case 's':
        startMinecraftServer();
        break;
      case 'stop':
      case 'st':
        stopMinecraftServer();
        break;
      case 'restart':
      case 'r':
        restartMinecraftServer();
        break;
      default:
        console.log(`Unknown MC action: ${action}`);
        console.log('Run "minebot mc help" for available commands');
        process.exit(1);
    }
    break;
    
  case 'server':
    switch(action) {
      case 'help':
      case '-h':
      case '--help':
        console.log(`minebot server <action> - Bot server management

Server Actions:
  start         Start bot server
  s             Alias for start
  stop          Stop bot server
  st            Alias for stop
  restart       Restart bot server
  r             Alias for restart

Examples:
  minebot server start
  minebot server s
  minebot server stop
  minebot server r
`);
        break;
      case 'start':
      case 's':
        startBotServer();
        break;
      case 'stop':
      case 'st':
        stopBotServer();
        break;
      case 'restart':
      case 'r':
        restartBotServer();
        break;
      default:
        console.log(`Unknown server action: ${action}`);
        console.log('Run "minebot server help" for available commands');
        process.exit(1);
    }
    break;
    
  case 'dev':
    console.log('Starting development environment...');
    startBotServer();
    break;
    
  case 'prod':
    console.log('Starting bot server...');
    startBotServer();
    break;
    
  case 'status':
    const jsonOutput = args.length > 1 && args[1] === '--json';
    showSystemStatus(jsonOutput);
    break;
    
  case 'help':
  case '-h':
  case '--help':
    showHelp();
    break;
    
  default:
    if (!system) {
      showHelp();
    } else {
      console.log(`Unknown system: ${system}`);
      console.log('Run "minebot help" for available commands');
    }
    process.exit(1);
}

function showSystemStatus(jsonOutput) {
  const http = require('http');
  
  function getStatus() {
    return new Promise((resolve, reject) => {
      const req = http.request(`http://${botHost}:${botPort}/api/health`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({ botServer: parsed });
          } catch (e) {
            resolve({ botServer: null });
          }
        });
      });
      
      req.on('error', () => {
        resolve({ botServer: null });
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve({ botServer: null });
      });
      
      req.end();
    });
  }
  
  function getBots() {
    return new Promise((resolve, reject) => {
      const req = http.request(`http://${botHost}:${botPort}/api/bots`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({ bots: parsed });
          } catch (e) {
            resolve({ bots: null });
          }
        });
      });
      
      req.on('error', () => {
        resolve({ bots: null });
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve({ bots: null });
      });
      
      req.end();
    });
  }
  
  function getMinecraftStatus() {
    return new Promise((resolve) => {
      const net = require('net');
      const socket = new net.Socket();
      
      socket.setTimeout(2000);
      socket.connect({ host: 'localhost', port: 25565 }, () => {
        socket.destroy();
        resolve({ mcServer: true });
      });
      
      socket.on('error', () => {
        resolve({ mcServer: false });
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        resolve({ mcServer: false });
      });
      
      socket.end();
    });
  }
  
  async function showStatus(showJson) {
    const [botStatus, botsStatus, mcStatus] = await Promise.all([getStatus(), getBots(), getMinecraftStatus()]);
    
    if (showJson) {
      const status = {
        botServer: botStatus.botServer ? {
          status: botStatus.botServer.status,
          uptimeSeconds: botStatus.botServer.uptimeSeconds,
          serverMode: botStatus.botServer.serverMode
        } : { status: 'OFFLINE' },
        bots: botsStatus.bots ? {
          count: botsStatus.bots.count,
          bots: botsStatus.bots.bots
        } : { count: 0, bots: [] },
        mcServer: mcStatus.mcServer ? { status: 'RUNNING' } : { status: 'OFFLINE' }
      };
      console.log(JSON.stringify(status, null, 2));
    } else {
      console.log('System Status:');
      console.log('==============');
      
      if (botStatus.botServer) {
        console.log(`Bot Server: ${botStatus.botServer.status}`);
        console.log(`  Uptime: ${botStatus.botServer.uptimeSeconds || 0} seconds`);
        console.log(`  Mode: ${botStatus.botServer.serverMode}`);
      } else {
        console.log('Bot Server: OFFLINE');
      }
      
      if (botsStatus.bots && botsStatus.bots.count > 0) {
        console.log(`Bots (${botsStatus.bots.count}):`);
        botsStatus.bots.bots.forEach(bot => {
          console.log(`  ${bot.username}: ${bot.state} (${bot.connected ? 'connected' : 'disconnected'})`);
        });
      }
      
      console.log(`Minecraft Server: ${mcStatus.mcServer ? 'RUNNING' : 'OFFLINE'}`);
    }
  }
  
  showStatus(jsonOutput);
}
