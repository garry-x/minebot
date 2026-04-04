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
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 24.14.1 > /dev/null 2>&1
VERBOSE_FLAG=${verbose ? '"--verbose"' : '""'}; nohup node ${BOT_SERVER_SCRIPT} $VERBOSE_FLAG > ${LOG_FILE} 2>&1 &
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
echo \$! > /tmp/mc_server_pid.txt
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
    process.kill(pid, 0);
  } catch (e) {
    console.log('Removing stale PID file');
    try {
      fs.unlinkSync(MINECRAFT_PID_FILE);
    } catch (e2) {}
    console.log('Minecraft server is not running');
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
    console.log('Stopping Minecraft server...');
    setTimeout(() => {
      try {
        process.kill(pid, 0);
        console.log('Minecraft server failed to stop');
      } catch (e) {
        try {
          fs.unlinkSync(MINECRAFT_PID_FILE);
        } catch (e2) {}
        console.log('Minecraft server stopped');
      }
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
        timeout: 60000
      }, JSON.stringify({ username }))
      .then(data => {
        console.log(`Bot started successfully`);
        console.log(`  Bot ID: ${data.botId}`);
        console.log(`  Username: ${data.username}`);
        console.log(`  Mode: ${data.mode || 'survival'}`);
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
          if (bot.mode) {
            console.log(`    Mode: ${bot.mode}`);
          }
          if (bot.deadReason) {
            console.log(`    Reason: ${bot.deadReason}`);
          }
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
      
    case 'restart':
      if (!botId) {
        console.log('Error: botId is required');
        return;
      }
      makeRequest({
        hostname: botHost,
        port: botPort,
        path: `/api/bot/${botId}/restart`,
        method: 'POST'
      })
      .then(data => {
        console.log(`Bot restart initiated`);
        console.log(`  Bot ID: ${data.botId}`);
        console.log(`  Username: ${data.username}`);
      })
      .catch(err => {
        console.log(`Error: ${err.message}`);
      });
       break;
       
    case 'remove':
      if (!botId) {
        console.log('Error: botId is required');
        return;
      }
      makeRequest({
        hostname: botHost,
        port: botPort,
        path: `/api/bot/${botId}`,
        method: 'DELETE'
      })
      .then(data => {
        console.log(`Bot removed successfully`);
        console.log(`  Bot ID: ${botId}`);
      })
      .catch(err => {
        console.log(`Error: ${err.message}`);
      });
      break;
      
    case 'removeAll':
      const http = require('http');
      
      function tryRemoveAll(retryCount = 0) {
        const req = http.request({
          hostname: botHost,
          port: botPort,
          path: '/api/bots',
          method: 'DELETE'
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              if (res.statusCode >= 200 && res.statusCode < 300) {
                console.log(`All bots removed successfully`);
                if (parsed.message) {
                  console.log(`  ${parsed.message}`);
                }
              } else {
                throw new Error(parsed.error || `HTTP ${res.statusCode}`);
              }
            } catch (e) {
              console.log(`Request failed: ${e.message}`);
              if (retryCount < 3) {
                console.log(`Retrying... (attempt ${retryCount + 1})`);
                setTimeout(() => tryRemoveAll(retryCount + 1), 1000);
              } else {
                console.log(`Error: Failed to remove all bots after 3 attempts`);
              }
            }
          });
        });
        
        req.on('error', (err) => {
          console.log(`Connection error: ${err.message}`);
          if (retryCount < 3) {
            console.log(`Retrying... (attempt ${retryCount + 1})`);
            setTimeout(() => tryRemoveAll(retryCount + 1), 1000);
          } else {
            console.log(`Error: Failed to remove all bots after 3 attempts`);
          }
        });
        
        req.end();
      }
      
      tryRemoveAll();
      break;
      
    case 'monitor':
      const http2 = require('http');
      let interval = actionArgs && actionArgs.interval ? parseInt(actionArgs.interval, 10) : 5000;
      let monitorCount = 0;
      const maxCount = actionArgs && actionArgs.count ? parseInt(actionArgs.count, 10) : 0;
      let running = true;
      
      function clearScreen() {
        process.stdout.write('\x1B[2J\x1B[0f');
      }
      
      function formatUptime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h}h ${m}m ${s}s`;
      }
      
      function formatPosition(pos) {
        if (!pos) return 'N/A';
        return `${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`;
      }
      
      function fetchAndDisplay() {
        if (!running) return;
        
        const req = http2.request({
          hostname: botHost,
          port: botPort,
          path: '/api/bots',
          method: 'GET'
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              clearScreen();
              monitorCount++;
              
              const now = new Date();
              console.log(`\x1B[36m=== Bot Monitor ===\x1B[0m Time: ${now.toLocaleTimeString()}`);
              console.log(`Interval: ${interval}ms | Count: ${monitorCount}${maxCount > 0 ? `/${maxCount}` : ''} | Press Ctrl+C to stop`);
              console.log(`\x1B[36m${'='.repeat(60)}\x1B[0m`);
              
              if (parsed.count === 0) {
                console.log('No active bots');
              } else {
                console.log(`\x1B[32mTotal Bots: ${parsed.count}\x1B[0m\n`);
                
                parsed.bots.forEach((bot, idx) => {
                  const stateColor = bot.state === 'ALIVE' ? '\x1B[32m' : (bot.state === 'DEAD' ? '\x1B[31m' : '\x1B[33m');
                  console.log(`\x1B[1m[${idx + 1}] ${bot.username}\x1B[0m (${bot.botId})`);
                  console.log(`    State: ${stateColor}${bot.state}\x1B[0m | Connected: ${bot.connected ? '\x1B[32mYes\x1B[0m' : '\x1B[31mNo\x1B[0m'}`);
                  console.log(`    Health: \x1B[31m${bot.health}\x1B[0m/\x1B[32m20\x1B[0m | Food: \x1B[33m${bot.food}\x1B[0m/\x1B[32m20\x1B[0m`);
                  console.log(`    Position: ${formatPosition(bot.position)}`);
                  console.log(`    Mode: ${bot.mode || 'N/A'} | Game: ${bot.gameMode || 'N/A'}`);
                  if (bot.deadReason) {
                    console.log(`    \x1B[31mDead: ${bot.deadReason}\x1B[0m`);
                  }
                  console.log('');
                });
              }
              
              if (maxCount > 0 && monitorCount >= maxCount) {
                running = false;
                console.log(`\x1B[36mMonitor stopped after ${maxCount} updates\x1B[0m`);
                process.exit(0);
              }
            } catch (e) {
              console.log(`\x1B[31mError parsing data: ${e.message}\x1B[0m`);
            }
          });
        });
        
        req.on('error', (err) => {
          console.log(`\x1B[31mConnection error: ${err.message}\x1B[0m`);
          running = false;
          process.exit(1);
        });
        
        req.setTimeout(5000, () => {
          req.destroy();
          console.log(`\x1B[31mRequest timeout\x1B[0m`);
        });
        
        req.end();
      }
      
      process.on('SIGINT', () => {
        console.log(`\n\x1B[36mMonitor stopped (Ctrl+C)\x1B[0m`);
        running = false;
        process.exit(0);
      });
      
      fetchAndDisplay();
      const monitorInterval = setInterval(() => {
        if (running) {
          fetchAndDisplay();
        }
      }, interval);
      break;
      
    case 'debug':
      const fs3 = require('fs');
      const path3 = require('path');
      const LOG_FILE = path3.join(__dirname, 'logs', 'bot_server.log');
      
      console.log('\x1B[36m=== Bot Debug Console ===\x1B[0m');
      console.log(`Watching log file: ${LOG_FILE}`);
      console.log('Press Ctrl+C to exit\n');
      
      let lastSize = 0;
      let runningDebug = true;
      
      function tailLog() {
        if (!runningDebug) return;
        
        try {
          const stats = fs3.statSync(LOG_FILE);
          if (stats.size > lastSize) {
            const stream = fs3.createReadStream(LOG_FILE, { start: lastSize, encoding: 'utf8' });
            stream.on('data', (data) => {
              // Colorize log output
              const lines = data.split('\n');
              lines.forEach(line => {
                if (line.trim() === '') return;
                
                let coloredLine = line;
                if (line.includes('[ERROR]') || line.includes('Error:')) {
                  coloredLine = `\x1B[31m${line}\x1B[0m`;
                } else if (line.includes('[WARN]') || line.includes('Warning:')) {
                  coloredLine = `\x1B[33m${line}\x1B[0m`;
                } else if (line.includes('[INFO]')) {
                  coloredLine = `\x1B[32m${line}\x1B[0m`;
                } else if (line.includes('[Bot]')) {
                  coloredLine = `\x1B[36m${line}\x1B[0m`;
                } else if (line.includes('[Pathfinder]')) {
                  coloredLine = `\x1B[35m${line}\x1B[0m`;
                }
                console.log(coloredLine);
              });
            });
            stream.on('end', () => {
              lastSize = stats.size;
            });
          }
        } catch (err) {
          console.error(`\x1B[31mError reading log file: ${err.message}\x1B[0m`);
        }
        
        setTimeout(tailLog, 1000);
      }
      
      process.on('SIGINT', () => {
        console.log('\n\x1B[36mDebug console stopped\x1B[0m');
        runningDebug = false;
        process.exit(0);
      });
      
      // Show last 20 lines initially
      try {
        const content = fs3.readFileSync(LOG_FILE, 'utf8');
        const lines = content.split('\n').filter(line => line.trim() !== '');
        const lastLines = lines.slice(-20);
        lastLines.forEach(line => {
          let coloredLine = line;
          if (line.includes('[ERROR]') || line.includes('Error:')) {
            coloredLine = `\x1B[31m${line}\x1B[0m`;
          } else if (line.includes('[WARN]') || line.includes('Warning:')) {
            coloredLine = `\x1B[33m${line}\x1B[0m`;
          } else if (line.includes('[INFO]')) {
            coloredLine = `\x1B[32m${line}\x1B[0m`;
          } else if (line.includes('[Bot]')) {
            coloredLine = `\x1B[36m${line}\x1B[0m`;
          } else if (line.includes('[Pathfinder]')) {
            coloredLine = `\x1B[35m${line}\x1B[0m`;
          }
          console.log(coloredLine);
        });
        lastSize = fs3.statSync(LOG_FILE).size;
      } catch (err) {
        console.error(`\x1B[31mError reading log file: ${err.message}\x1B[0m`);
      }
      
      tailLog();
      break;
      
    case 'status':
      console.log('bot server:');
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
      
    case 'cleanup':
      makeRequest({
        hostname: botHost,
        port: botPort,
        path: '/api/bot/cleanup',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }, '{}')
      .then(data => {
        console.log(`Cleanup completed`);
        if (data.message) {
          console.log(`  ${data.message}`);
        }
      })
      .catch(err => {
        console.log(`Error: ${err.message}`);
      });
      break;
      
    case 'gather':
      if (!actionArgs?.botId || !actionArgs?.blocks) {
        console.log('Usage: minebot bot gather --botId <bot-id> --blocks "oak_log,cobblestone" [--radius 30]');
        console.log('Example: minebot bot gather --botId bot_123 --blocks oak_log,cobblestone --radius 30');
        return;
      }
      
      const blocks = typeof actionArgs.blocks === 'string' ? actionArgs.blocks.split(',').map(b => b.trim()) : [];
      const radius = typeof actionArgs.radius !== 'undefined' ? parseInt(actionArgs.radius, 10) : 20;
      
      makeRequest({
        hostname: botHost,
        port: botPort,
        path: `/api/bot/${actionArgs.botId}/gather`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }, JSON.stringify({ targetBlocks: blocks, radius }))
      .then(data => {
        console.log(`Gathering started successfully`);
        console.log(`  Bot ID: ${actionArgs.botId}`);
        console.log(`  Target blocks: ${blocks.join(', ')}`);
        console.log(`  Radius: ${radius} blocks`);
      })
      .catch(err => {
        console.log(`Error: ${err.message}`);
      });
      break;
      
    case 'build':
      if (!actionArgs?.botId || !actionArgs?.block || !actionArgs?.size) {
        console.log('Usage: minebot bot build --botId <bot-id> --block oak_log --size 5x5x3 [--offset 0,0,0]');
        console.log('Example: minebot bot build --botId bot_123 --block oak_log --size 5x5x3 --offset 0,0,0');
        return;
      }
      
      const [width, length, height] = typeof actionArgs.size === 'string' ? actionArgs.size.split('x').map(v => parseInt(v.trim(), 10)) : [];
      const [offsetX, offsetY, offsetZ] = typeof actionArgs.offset === 'string' ? actionArgs.offset.split(',').map(v => parseInt(v.trim(), 10)) : [0, 0, 0];
      
      makeRequest({
        hostname: botHost,
        port: botPort,
        path: `/api/bot/${actionArgs.botId}/build`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 120000 // 2 minute timeout for building
      }, JSON.stringify({ 
        width, length, height, 
        blockType: actionArgs.block,
        offsetX, offsetY, offsetZ
      }))
      .then(data => {
        console.log(`Building started successfully`);
        console.log(`  Bot ID: ${actionArgs.botId}`);
        console.log(`  Block type: ${actionArgs.block}`);
        console.log(`  Structure size: ${width}x${length}x${height}`);
        console.log(`  Offset: ${offsetX}, ${offsetY}, ${offsetZ}`);
      })
      .catch(err => {
        console.log(`Error: ${err.message}`);
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
  minebot bot stop bot_123
  minebot bot automatic MyBot survival
  minebot bot list
  minebot bot restart bot_123
  minebot mc start
  minebot mc stop
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

// Parse verbose flag
let verbose = false;
const nonFlagArgs = args.filter(arg => {
  if (arg === '--verbose') {
    verbose = true;
    return false;
  }
  return true;
});

// Parse additional options for certain commands
let actionArgs = {};
const remainingArgs = [];
nonFlagArgs.forEach((arg, idx) => {
  if (arg.startsWith('--')) {
    const rest = arg.slice(2);
    const eqIndex = rest.indexOf('=');
    if (eqIndex !== -1) {
      // Handle --key=value format
      const key = rest.substring(0, eqIndex);
      const value = rest.substring(eqIndex + 1);
      actionArgs[key] = value;
    } else {
      // Handle --key value format
      const key = rest;
      // Get next non-flag argument as value
      const nextIdx = idx + 1;
      if (nextIdx < args.length && !args[nextIdx].startsWith('--')) {
        actionArgs[key] = args[nextIdx];
      } else {
        actionArgs[key] = true;
      }
    }
  } else {
    remainingArgs.push(arg);
  }
});

// Parse system and action (2-level subcommands)
const system = remainingArgs[0];
let action = remainingArgs[1];
const commandArgs = remainingArgs.slice(2);

switch(system) {
  case 'bot':
    switch(action) {
      case 'start':
        botControl('start', commandArgs[0]);
        break;
      case 'stop':
        botControl('stop', null, commandArgs[0]);
        break;
      case 'automatic':
        const autoMode = commandArgs[0] && ['survival', 'creative', 'building', 'gathering'].includes(commandArgs[0]) ? commandArgs[0] : (commandArgs[1] || 'survival');
        const autoUsername = commandArgs[0] && !['survival', 'creative', 'building', 'gathering'].includes(commandArgs[0]) ? commandArgs[0] : commandArgs[0];
        if (!autoUsername) {
          console.log('Error: username is required for automatic behavior. Use "minebot bot start <user>" first.');
          process.exit(1);
        }
        botControl('automatic', autoUsername, null, autoMode);
        break;
      case 'list':
        botControl('list');
        break;
      case 'restart':
        botControl('restart', null, commandArgs[0]);
        break;
      case 'remove':
        if (commandArgs[0] === 'all') {
          botControl('removeAll');
        } else {
          botControl('remove', null, commandArgs[0]);
        }
        break;
      case 'cleanup':
        botControl('cleanup');
        break;
      case 'monitor':
        botControl('monitor', null, null, null, commandArgs);
        break;
      case 'debug':
        botControl('debug');
        break;
      case 'gather':
        botControl('gather');
        break;
      case 'build':
        botControl('build');
        break;
      case 'help':
      case '-h':
      case '--help':
        console.log(`minebot bot <action> - Bot control

Bot Actions:
  start <user>     Start a bot with username
  stop <id>        Stop a bot by ID
  automatic <user> [mode]
                    Start automatic behavior on existing bot (survival|creative|building|gathering)
  list             List bots
  restart <id>     Restart a stopped bot by ID
  remove <id>      Remove a bot by ID (from DB and server)
  remove all       Remove all bots
  cleanup          Remove stale bot entries (older than 30 days)
  monitor          Monitor bot status in real-time
  debug            Show real-time bot server logs with color coding
  gather           Gather resources for a specific bot
                     --botId <id>       Bot ID to control
                     --blocks <list>    Comma-separated block types (e.g. oak_log,cobblestone)
                     --radius <num>     Search radius (default: 20)
  build            Build structures for a specific bot
                     --botId <id>       Bot ID to control
                     --block <type>     Block type to use (e.g. oak_log)
                     --size <WxLxH>     Structure dimensions (e.g. 5x5x3)
                     --offset <x,y,z>   Build offset from bot position (default: 0,0,0)

Examples:
  minebot bot start MyBot
  minebot bot stop bot_123
  minebot bot automatic MyBot survival
  minebot bot list
   minebot bot restart bot_123
   minebot bot remove bot_123
   minebot bot remove all
   minebot bot cleanup
   minebot bot monitor
   minebot bot debug
   minebot bot gather --botId bot_123 --blocks oak_log,cobblestone --radius 30
   minebot bot build --botId bot_123 --block oak_log --size 5x5x3 --offset 0,0,0
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
      case 'start':
        startMinecraftServer();
        break;
      case 'stop':
        stopMinecraftServer();
        break;
      case 'restart':
        restartMinecraftServer();
        break;
      case 'help':
      case '-h':
      case '--help':
        console.log(`minebot mc <action> - Minecraft server control

MC Actions:
  start         Start Minecraft server
  stop          Stop Minecraft server
  restart       Restart Minecraft server

Examples:
  minebot mc start
  minebot mc stop
  minebot mc restart
`);
        break;
      default:
        console.log(`Unknown MC action: ${action}`);
        console.log('Run "minebot mc help" for available commands');
        process.exit(1);
    }
    break;
    
  case 'server':
    switch(action) {
      case 'start':
        startBotServer();
        break;
      case 'stop':
        stopBotServer();
        break;
      case 'restart':
        restartBotServer();
        break;
      case 'help':
      case '-h':
      case '--help':
        console.log(`minebot server <action> - Bot server management

Server Actions:
  start         Start bot server
  stop          Stop bot server
  restart       Restart bot server

Examples:
  minebot server start
  minebot server stop
  minebot server restart
`);
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

  function getFrontendStatus() {
    return new Promise((resolve, reject) => {
      const req = http.request(`http://${botHost}:${botPort}/api/frontend/status`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (e) {
            resolve(null);
          }
        });
      });
      
      req.on('error', () => {
        resolve(null);
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
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
    const [botStatus, botsStatus, frontendStatus, mcStatus] = await Promise.all([getStatus(), getBots(), getFrontendStatus(), getMinecraftStatus()]);
    
    if (showJson) {
      const status = {
        botServer: botStatus.botServer ? {
          status: botStatus.botServer.status,
          uptimeSeconds: botStatus.botServer.uptimeSeconds,
          serverMode: botStatus.botServer.serverMode,
          frontendUrl: botStatus.botServer.frontendUrl
        } : { status: 'OFFLINE' },
        bots: botsStatus.bots ? {
          count: botsStatus.bots.count,
          bots: botsStatus.bots.bots
        } : { count: 0, bots: [] },
        frontend: frontendStatus.frontend ? {
          status: frontendStatus.frontend.status
        } : { status: 'unavailable' },
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
          if (bot.mode) {
            console.log(`    Mode: ${bot.mode}`);
          }
        });
      }
      
      if (frontendStatus && frontendStatus.frontend) {
        console.log('Frontend:');
        console.log(`  Status: ${frontendStatus.frontend.status}`);
        if (botStatus.botServer && botStatus.botServer.frontendUrl) {
          console.log(`  URL: ${botStatus.botServer.frontendUrl}`);
        }
      } else {
        console.log('Frontend: UNAVAILABLE');
      }
      
      console.log(`Minecraft Server: ${mcStatus.mcServer ? 'RUNNING' : 'OFFLINE'}`);
    }
  }
  
  showStatus(jsonOutput);
}
