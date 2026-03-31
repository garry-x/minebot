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
echo \$! > ${BOT_PID_FILE}
`;
  const scriptFile = '/tmp/start_bot_server.sh';
  fs.writeFileSync(scriptFile, startScript);
  fs.chmodSync(scriptFile, '755');
  
  spawn('bash', [scriptFile], {
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true,
    env: process.env
  });
  
  const waitPid = () => {
    if (fs.existsSync(BOT_PID_FILE)) {
      const pid = parseInt(fs.readFileSync(BOT_PID_FILE, 'utf8').trim(), 10);
      console.log(`Bot server started with PID ${pid}`);
      return;
    }
    setTimeout(waitPid, 100);
  };
  waitPid();
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

  console.log('Starting Minecraft server...');
  
  const startScript = `
#!/bin/bash
cd ${MINECRAFT_SERVER_DIR}
nohup java -Xmx1G -jar ${jarPath} nogui > ${LOG_FILE} 2>&1 &
echo \$! > ${MINECRAFT_PID_FILE}
`;
  const scriptFile = '/tmp/start_mc_server.sh';
  fs.writeFileSync(scriptFile, startScript);
  fs.chmodSync(scriptFile, '755');
  
  spawn('bash', [scriptFile], {
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true,
    env: process.env
  });
  
  const waitPid = () => {
    if (fs.existsSync(MINECRAFT_PID_FILE)) {
      const pid = parseInt(fs.readFileSync(MINECRAFT_PID_FILE, 'utf8').trim(), 10);
      console.log(`Minecraft server started with PID ${pid}`);
      return;
    }
    setTimeout(waitPid, 100);
  };
  waitPid();
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
        path: '/api/health',
        method: 'GET'
      })
      .then(data => {
        console.log(`Bot server: ${data.status}`);
        console.log(`  Mode: ${data.serverMode}`);
      })
      .catch(err => {
        console.log(`Bot server: NOT RUNNING`);
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
  bot         Bot control
  mc          Minecraft server control
  dev         Start development mode

Bot Actions (minebot bot <action>):
  start <user>     Start a bot with username
  s <user>         Alias for start
  stop <id>        Stop a bot by ID
  st <id>          Alias for stop
  automatic <user> [mode]
                    Start automatic behavior (survival|creative|building|gathering)
  a <user> [mode]  Alias for automatic
  list             List bots
  ls               Alias for list

MC Actions (minebot mc <action>):
  start         Start Minecraft server
  s             Alias for start
  stop          Stop Minecraft server
  st            Alias for stop
  restart       Restart Minecraft server
  r             Alias for restart

Top-level commands:
  status [--json]  Show system status
  help            Show this help message

Examples:
  minebot bot start MyBot
  minebot bot s MyBot
  minebot bot stop bot_123
  minebot bot a MyBot survival
  minebot mc start
  minebot mc s
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
        botControl('automatic', commandArgs[0], null, commandArgs[1]);
        break;
      case 'list':
      case 'ls':
        botControl('list');
        break;
      default:
        console.log(`Unknown bot action: ${action}`);
        console.log('Run "minebot help" for available commands');
        process.exit(1);
    }
    break;
    
  case 'mc':
    switch(action) {
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
        console.log('Run "minebot help" for available commands');
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
    const [botStatus, mcStatus] = await Promise.all([getStatus(), getMinecraftStatus()]);
    
    if (showJson) {
      const status = {
        botServer: botStatus.botServer ? {
          status: botStatus.botServer.status,
          uptimeSeconds: botStatus.botServer.uptimeSeconds,
          serverMode: botStatus.botServer.serverMode
        } : { status: 'OFFLINE' },
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
      
      console.log(`Minecraft Server: ${mcStatus.mcServer ? 'RUNNING' : 'OFFLINE'}`);
    }
  }
  
  showStatus(jsonOutput);
}
