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

// Timeout settings
const STARTUP_TIMEOUT_MS = 30000; // 30 seconds

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
  if (botServerProcess) {
    console.log('Bot server is already running');
    return;
  }

  const LOG_DIR = path.join(__dirname, 'logs');
  const LOG_FILE = path.join(LOG_DIR, 'bot_server.log');
  
  // Create logs directory if it doesn't exist
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }

  console.log(`Starting Minecraft AI Bot Server on ${botHost}:${botPort}...`);
  console.log(`Log file: ${LOG_FILE}`);
  
  // Write start script to file
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
  
  // Wait for PID file to be created
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
  if (minecraftServerProcess) {
    console.log('Minecraft server is already running');
    return;
  }

  const jarPath = minecraftJarPath || MINECRAFT_SERVER_JAR;
  if (!fs.existsSync(jarPath)) {
    console.log(`Minecraft server jar not found at ${jarPath}`);
    return;
  }

  const LOG_DIR = path.join(__dirname, 'logs');
  const LOG_FILE = path.join(LOG_DIR, 'minecraft_server.log');
  
  // Create logs directory if it doesn't exist
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }

  console.log('Starting Minecraft Java Server...');
  console.log(`Log file: ${LOG_FILE}`);
  
  // Write start script to file
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
  
  // Wait for PID file to be created
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
  const https = require('https');
  const http = require('http');
  
  function makeRequest(options, postData = null) {
    return new Promise((resolve, reject) => {
      const req = (options.protocol === 'https:' ? https : http).request(options, (res) => {
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
        console.log('Error: Username is required');
        return;
      }
      console.log(`[CLI] Attempting to start bot with username: ${username}`);
      console.log(`[CLI] Sending request to http://${botHost}:${botPort}/api/bot/start`);
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
        console.log(`[CLI] ✓ Bot started successfully`);
        console.log(`[CLI]   Bot ID: ${data.botId}`);
        console.log(`[CLI]   Username: ${data.username}`);
        console.log(`[CLI]   Message: ${data.message}`);
      })
      .catch(err => {
        console.log(`[CLI] ✗ Error starting bot: ${err.message}`);
        console.log(`[CLI]   Please check:`);
        console.log(`[CLI]   1. Bot server is running (minebot bot:server:start)`);
        console.log(`[CLI]   2. Minecraft server is running on localhost:25565 (minebot mc:server:start)`);
        console.log(`[CLI]   3. Server.properties has online-mode=false`);
        console.log(`[CLI]   4. Bot server logs for detailed error information`);
      });
      break;
      
    case 'stop':
      if (!botId) {
        console.log('Error: Bot ID is required');
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
        console.log(`Bot ID: ${botId}`);
        console.log(`Message: ${data.message}`);
      })
      .catch(err => {
        console.log(`Error stopping bot: ${err.message}`);
      });
      break;
      
    case 'automatic':
      if (!username) {
        console.log('Error: Username is required');
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
         console.log(`Bot ID: ${data.botId}`);
         console.log(`Username: ${data.username}`);
         console.log(`Mode: ${mode || 'survival'}`);
         console.log(`Message: ${data.message}`);
       })
       .catch(err => {
         console.log(`Error starting automatic behavior: ${err.message}`);
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
        console.log('Bot server status:');
        console.log(`  Status: ${data.status}`);
        console.log(`  Mode: ${data.serverMode}`);
        console.log(`  Timestamp: ${data.timestamp}`);
        console.log(`  Note: ${data.note}`);
      })
      .catch(err => {
        console.log(`Bot server: NOT RUNNING`);
        console.log(`  Error: ${err.message}`);
      });
      break;
      
    case 'status':
      console.log('=== Service Status ===');
      
      // Check bot server
      const http = require('http');
      const req = http.request(`http://${botHost}:${botPort}/api/health`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode === 200) {
              console.log(`Bot server: RUNNING on ${botHost}:${botPort}`);
              console.log(`  Status: ${parsed.status}`);
              console.log(`  Mode: ${parsed.serverMode}`);
            } else {
              console.log('Bot server: ERROR');
            }
          } catch (e) {
            console.log('Bot server: NOT RUNNING');
          }
        });
      });
      
      req.on('error', () => {
        console.log('Bot server: NOT RUNNING');
      });
      
      req.on('timeout', () => {
        req.destroy();
        console.log('Bot server: TIMEOUT');
      });
      
      req.end();

      // Check Minecraft server
      const net = require('net');
      const socket = new net.Socket();
      
      socket.setTimeout(2000);
      socket.connect({ host: 'localhost', port: 25565 }, () => {
        socket.destroy();
        console.log('Minecraft server: RUNNING on localhost:25565');
      });
      
      socket.on('error', () => {
        console.log('Minecraft server: NOT RUNNING');
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        console.log('Minecraft server: NOT RUNNING');
      });
      
      break;
      
    default:
      console.log(`Unknown bot action: ${action}`);
  }
}

function showHelp() {
  console.log(`
Minecraft AI Robot System CLI

Usage:
  minebot [options] <command> [options]

Options:
  --host <host>   Bot server host (default: localhost)
  --port <port>   Bot server port (default: 9500)
  --jar <path>    Path to Minecraft server jar file (default: resources/minecraft_server.1.21.11.jar)

Commands:
  bot:server:start                    Start the Minecraft AI Bot server
  bot:server:stop                     Stop the Minecraft AI Bot server
  bot:server:restart                  Restart the Minecraft AI Bot server
  mc:server:start                     Start the Minecraft Java Server (port 25565)
  mc:server:stop                      Stop the Minecraft Java Server
  mc:server:restart                   Restart the Minecraft Java Server
    bot:status                          Show status of all services
   bot:start <username>                Start a bot with the given username
  bot:stop <botId>                    Stop a bot by its ID
  bot:automatic <username> [mode]     Start automatic behavior for a bot (mode: survival|creative|building|gathering)
  bot:list                            Check bot server status
  dev                                 Start development environment (bot server + frontend)
  prod                                Build and start in production mode
  help                                Show this help message

Examples:
  minebot --host 0.0.0.0 --port 8080 bot:server:start
  minebot bot:server:start
  minebot --jar /path/to/server.jar mc:server:start
   minebot mc:server:start
   minebot bot:start MyBotUsername
`);
}

// Main CLI logic
const args = process.argv.slice(2);
let command = null;
let commandArgs = [];

// Parse global options
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--host' && i + 1 < args.length) {
    botHost = args[i + 1];
    i++;
  } else if (args[i] === '--port' && i + 1 < args.length) {
    botPort = parseInt(args[i + 1], 10);
    if (isNaN(botPort)) {
      console.log('Error: Port must be a number');
      process.exit(1);
    }
    i++;
  } else if (args[i] === '--jar' && i + 1 < args.length) {
    minecraftJarPath = args[i + 1];
    i++;
  } else if (!command && !args[i].startsWith('-')) {
    command = args[i];
  } else {
    commandArgs.push(args[i]);
  }
}

switch(command) {
  case 'bot:server:start':
    startBotServer();
    break;
  case 'mc:server:start':
    startMinecraftServer();
    break;
  case 'bot:server:stop':
    stopBotServer();
    break;
  case 'bot:server:restart':
    restartBotServer();
    break;
  case 'mc:server:stop':
    stopMinecraftServer();
    break;
  case 'mc:server:restart':
    restartMinecraftServer();
    break;
  case 'bot:start':
    botControl('start', commandArgs[0]);
    break;
  case 'bot:stop':
    botControl('stop', null, commandArgs[0]);
    break;
   case 'bot:automatic':
     botControl('automatic', commandArgs[0], null, commandArgs[1]);
     break;
   case 'bot:status':
     botControl('status');
     break;
   case 'bot:list':
     botControl('list');
     break;
  case 'dev':
    console.log('Starting development environment...');
    startBotServer();
    break;
  case 'prod':
    console.log('Starting bot server...');
    startBotServer();
    break;
  case 'help':
  case '-h':
  case '--help':
    showHelp();
    break;
  default:
    if (!command) {
      showHelp();
    } else {
      console.log(`Unknown command: ${command}`);
      console.log('Run "minebot help" for available commands');
    }
    process.exit(1);
}