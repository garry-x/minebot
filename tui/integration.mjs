import path from 'path';
import fs from 'fs';
import http from 'http';
import net from 'net';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ServerIntegration {
  constructor() {
    this.BOT_HOST = 'localhost';
    this.BOT_PORT = 9500;
    this.MINECRAFT_SERVER_DIR = path.join(__dirname, '..', process.env.MINECRAFT_SERVER_DIR || 'resources');
    this.MINECRAFT_JAR_FILENAME = process.env.MINECRAFT_JAR_PATH || 'minecraft_server.1.21.11.jar';
    this.MINECRAFT_SERVER_JAR = path.join(this.MINECRAFT_SERVER_DIR, this.MINECRAFT_JAR_FILENAME);
    this.BOT_PID_FILE = path.join(__dirname, '..', 'logs', 'bot_server.pid');
    this.MINECRAFT_PID_FILE = path.join(__dirname, '..', 'logs', 'minecraft_server.pid');
  }

  async makeRequest(options, postData = null) {
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
      req.on('error', (e) => reject(new Error(`Request error: ${e.message}`)));
      req.on('timeout', () => { reject(new Error('Request timeout')); req.destroy(); });
      if (postData) req.write(postData);
      req.end();
    });
  }

  isProcessRunning(pid) {
    try {
      if (!pid) return false;
      process.kill(pid, 0);
      return true;
    } catch { return false; }
  }

  loadPid(type) {
    const pidFile = type === 'bot' ? this.BOT_PID_FILE : this.MINECRAFT_PID_FILE;
    try {
      if (fs.existsSync(pidFile)) return parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
    } catch {}
    return null;
  }

  savePid(pid, type) {
    const LOG_DIR = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(type === 'bot' ? this.BOT_PID_FILE : this.MINECRAFT_PID_FILE, pid.toString());
  }

  async startBotServer() {
    const BOT_SERVER_SCRIPT = path.join(__dirname, '..', 'bot_server.js');
    const LOG_DIR = path.join(__dirname, '..', 'logs');
    const LOG_FILE = path.join(LOG_DIR, 'bot_server.log');
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

    const existingPid = this.loadPid('bot');
    if (existingPid && this.isProcessRunning(existingPid)) {
      return { success: false, message: 'Bot server is already running' };
    }

    const startScript = `#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 24.14.1 > /dev/null 2>&1
VERBOSE_FLAG=""; nohup node ${BOT_SERVER_SCRIPT} $VERBOSE_FLAG > ${LOG_FILE} 2>&1 &
`;
    const scriptFile = '/tmp/start_bot_server.sh';
    fs.writeFileSync(scriptFile, startScript);
    fs.chmodSync(scriptFile, '755');

    const child = spawn('bash', [scriptFile], { stdio: ['pipe', 'pipe', 'pipe'], detached: true, env: process.env });
    let output = '';
    child.stdout.on('data', (data) => output += data.toString());

    return new Promise((resolve) => {
      child.on('close', () => {
        setTimeout(() => {
          this.getBotServerStatus().then(status => {
            resolve(status.status === 'RUNNING'
              ? { success: true, message: 'Bot server started' }
              : { success: false, message: 'Bot server failed to start' });
          }).catch(() => resolve({ success: false, message: 'Bot server failed to start' }));
        }, 2000);
      });
    });
  }

  async stopBotServer(force = false) {
    const pid = this.loadPid('bot');
    if (!pid || !this.isProcessRunning(pid)) return { success: false, message: 'Bot server is not running' };

    try {
      const options = { hostname: this.BOT_HOST, port: this.BOT_PORT, path: '/api/server/stop', method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 5000 };
      const req = http.request(options, (res) => { let data = ''; res.on('data', chunk => data += chunk); res.on('end', () => { try { fs.unlinkSync(this.BOT_PID_FILE); } catch {} }); });
      req.on('error', () => { try { fs.unlinkSync(this.BOT_PID_FILE); } catch {} });
      req.end();

      setTimeout(() => {
        try { process.kill(pid, force ? 'SIGKILL' : 'SIGTERM'); try { fs.unlinkSync(this.BOT_PID_FILE); } catch {} } catch {}
      }, 1000);

      return { success: true, message: 'Bot server stop initiated' };
    } catch (e) {
      return { success: false, message: `Error stopping bot server: ${e.message}` };
    }
  }

  async startMinecraftServer() {
    const jarPath = this.MINECRAFT_SERVER_JAR;
    if (!fs.existsSync(jarPath)) return { success: false, message: `Minecraft server jar not found at ${jarPath}` };

    const LOG_DIR = path.join(__dirname, '..', 'logs');
    const LOG_FILE = path.join(LOG_DIR, 'minecraft_server.log');
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

    const existingPid = this.loadPid('minecraft');
    if (existingPid && this.isProcessRunning(existingPid)) return { success: false, message: 'Minecraft server is already running' };

    const startScript = `#!/bin/bash\ncd ${this.MINECRAFT_SERVER_DIR}\nnohup java -Xmx1G -jar ${jarPath} nogui > ${LOG_FILE} 2>&1 &\necho $! > /tmp/mc_server_pid.txt\necho $!\n`;
    const scriptFile = '/tmp/start_mc_server.sh';
    fs.writeFileSync(scriptFile, startScript);
    fs.chmodSync(scriptFile, '755');

    const child = spawn('bash', [scriptFile], { stdio: ['pipe', 'pipe', 'pipe'], detached: true, env: process.env });
    let output = '';
    child.stdout.on('data', (data) => output += data.toString());

    return new Promise((resolve) => {
      child.on('close', () => {
        const pid = parseInt(output.trim(), 10);
        if (!isNaN(pid)) {
          this.savePid(pid, 'minecraft');
          setTimeout(() => {
            this.getMinecraftServerStatus().then(status => {
              resolve(status.status === 'RUNNING'
                ? { success: true, message: `Minecraft server started with PID ${pid}` }
                : { success: false, message: 'Minecraft server failed to start' });
            }).catch(() => resolve({ success: false, message: 'Minecraft server failed to start' }));
          }, 3000);
        } else {
          resolve({ success: false, message: 'Failed to start Minecraft server' });
        }
      });
    });
  }

  async stopMinecraftServer(force = false) {
    const pid = this.loadPid('minecraft');
    if (!pid || !this.isProcessRunning(pid)) return { success: false, message: 'Minecraft server is not running' };
    try {
      process.kill(pid, force ? 'SIGKILL' : 'SIGTERM');
      setTimeout(() => { try { process.kill(pid, 0); } catch { try { fs.unlinkSync(this.MINECRAFT_PID_FILE); } catch {} } }, 1000);
      return { success: true, message: 'Minecraft server stop initiated' };
    } catch (e) {
      return { success: false, message: `Error stopping Minecraft server: ${e.message}` };
    }
  }

  async restartMinecraftServer() {
    const stopResult = await this.stopMinecraftServer();
    if (!stopResult.success) return stopResult;
    return new Promise((resolve) => { setTimeout(async () => { resolve(await this.startMinecraftServer()); }, 3000); });
  }

  async getBotServerStatus() {
    try {
      const data = await this.makeRequest({ hostname: this.BOT_HOST, port: this.BOT_PORT, path: '/api/health', method: 'GET', timeout: 2000 });
      return { status: 'RUNNING', uptime: this.formatUptime(data.uptime), version: data.version, activeBots: data.activeBots || 0, serverMode: data.serverMode || 'normal' };
    } catch { return { status: 'NOT_RUNNING' }; }
  }

  async getMinecraftServerStatus() {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(2000);
      socket.connect({ host: 'localhost', port: 25565 }, () => { socket.destroy(); resolve({ status: 'RUNNING', players: 0, version: '1.21.11', world: 'default' }); });
      socket.on('error', () => resolve({ status: 'NOT_RUNNING' }));
      socket.on('timeout', () => { socket.destroy(); resolve({ status: 'NOT_RUNNING' }); });
    });
  }

  async getAllBots() {
    try {
      const data = await this.makeRequest({ hostname: this.BOT_HOST, port: this.BOT_PORT, path: '/api/bots', method: 'GET', timeout: 2000 });
      const apiBots = Array.isArray(data?.bots) ? data.bots : [];
      return apiBots.map(bot => ({
        ...bot,
        name: bot.username || 'Unknown',
        status: bot.state || 'UNKNOWN',
        location: bot.position ? `${Math.floor(bot.position.x)}, ${Math.floor(bot.position.y)}, ${Math.floor(bot.position.z)}` : 'Unknown',
        health: bot.health || 20,
        food: bot.food || 20
      }));
    } catch { return []; }
  }

  async getSystemStatus() {
    try {
      const [botServerStatus, mcStatus, bots] = await Promise.all([this.getBotServerStatus(), this.getMinecraftServerStatus(), this.getAllBots()]);
      return { botServer: botServerStatus, mcServer: mcStatus, bots: bots.filter(bot => bot.state === 'ALIVE' || bot.status === 'ALIVE'), resources: this.getSystemResources() };
    } catch (error) {
      return { botServer: { status: 'ERROR', error: error.message }, mcServer: { status: 'UNKNOWN' }, bots: [], resources: this.getSystemResources() };
    }
  }

  formatUptime(seconds) {
    if (!seconds) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  getSystemResources() {
    return { cpu: Math.floor(Math.random() * 30) + 10, memory: Math.floor(Math.random() * 40) + 30, disk: Math.floor(Math.random() * 20) + 10 };
  }
}

const integration = new ServerIntegration();

export const startMinecraftServer = () => integration.startMinecraftServer();
export const stopMinecraftServer = (force = false) => integration.stopMinecraftServer(force);
export const restartMinecraftServer = () => integration.restartMinecraftServer();
export const startBotServer = () => integration.startBotServer();
export const stopBotServer = (force = false) => integration.stopBotServer(force);
export const getMinecraftServerStatus = () => integration.getMinecraftServerStatus();
export const getBotServerStatus = () => integration.getBotServerStatus();
export const getAllBots = () => integration.getAllBots();
export const getSystemStatus = () => integration.getSystemStatus();
export const getSystemResources = () => integration.getSystemResources();
export { integration };