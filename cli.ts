#!/usr/bin/env node
import 'dotenv/config';

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as net from 'net';
import { spawn } from 'child_process';
import * as readline from 'readline';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const program = new Command();

// ============== Type Definitions ==============

interface BotInfo {
  botId?: string;
  id?: string;
  username?: string;
  status?: string;
  state?: string;
  position?: { x: number; y: number; z: number };
  position_x?: number;
  position_y?: number;
  position_z?: number;
  health?: number;
  food?: number;
  created_at?: string;
  updated_at?: string;
}

interface BotsResponse {
  bots?: BotInfo[];
  success?: boolean;
  error?: string;
  message?: string;
}

interface HealthResponse {
  status?: string;
  uptimeSeconds?: number;
  serverMode?: string;
  timestamp?: string;
  mcServer?: string;
  mcPort?: number;
  pid?: number;
  port?: number;
}

interface ServerStatusResponse {
  activeBots?: number;
}

interface BotServerStatus {
  status: string;
  uptime?: string;
  version?: string;
  activeBots?: number;
  serverMode?: string;
  timestamp?: string;
  mcServer?: string;
  mcPort?: number;
  uptimeSeconds?: number;
  pid?: number | null;
  port?: number;
}

interface MinecraftServerStatus {
  status: string;
  players?: number;
  version?: string;
  world?: string;
}

interface GoalInfo {
  id: string;
  name?: string;
  difficulty?: string;
  description?: string;
}

interface GoalsResponse {
  success?: boolean;
  goals?: GoalInfo[];
  error?: string;
}

interface GoalStatusResponse {
  currentGoal?: { name?: string; id?: string; description?: string };
  goalState?: { name?: string; goalId?: string; progress?: number };
  progress?: number;
  subTasks?: Array<{ name?: string; id?: string; completed?: boolean; started?: boolean; progress?: number }>;
  materials?: Record<string, number>;
  startedAt?: string;
  error?: string;
}

interface WatchResponse {
  success?: boolean;
  error?: string;
  username?: string;
  botId?: string;
  state?: string;
  mode?: string;
  attributes?: {
    health: { current: number; max: number; food: number };
    experience: { level: number; points: number };
    armor: { pieces: Array<{ slot: number; name: string; durability?: number; maxDurability?: number }> };
  };
  environment?: {
    position?: { x: number; y: number; z: number; world: string; biome: string };
    weather?: { isThundering: boolean; isRaining: boolean };
    time?: { isDay: boolean; formattedTime?: string };
    conditions?: { dimension: string; difficulty: string; isInWater: boolean };
    nearby?: {
      resources?: Array<{ resource: string; distance: number }>;
      entities?: Array<{ displayName: string; distance: number; category: string }>;
      drops?: Array<{ item: string; distance: number }>;
    };
  };
  gameMode?: string;
  goal?: { currentGoal?: string; progress?: number };
  autonomousState?: {
    currentAction?: string;
    decisionReason?: string;
    priority?: number;
    healthStatus?: string;
  };
  resources?: {
    inventory: Array<{ slot?: number; name: string; count: number }>;
    summary: Record<string, number>;
  };
  events?: {
    list: Array<{ timestamp: string; type: string; message: string }>;
  };
}

type ProcessType = 'bot' | 'minecraft';

// ============== Constants ==============

const LOG_DIR = path.join(__dirname, 'logs');
const BOT_PID_FILE = path.join(LOG_DIR, 'bot_server.pid');
const MINECRAFT_PID_FILE = path.join(LOG_DIR, 'minecraft_server.pid');
const BOT_SERVER_SCRIPT = path.join(__dirname, 'bot_server');
const MINECRAFT_SERVER_DIR = path.join(__dirname, process.env.MINECRAFT_SERVER_DIR || 'resources');
const MINECRAFT_JAR_FILENAME = process.env.MINECRAFT_JAR_PATH || 'minecraft_server.1.21.11.jar';
const MINECRAFT_SERVER_JAR = path.join(MINECRAFT_SERVER_DIR, MINECRAFT_JAR_FILENAME);

// ============== Utility Functions ==============

function isProcessRunning(pid: number | null): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function loadPid(type: ProcessType): number | null {
  const pidFile = type === 'bot' ? BOT_PID_FILE : MINECRAFT_PID_FILE;
  try {
    if (fs.existsSync(pidFile)) {
      const pidStr = fs.readFileSync(pidFile, 'utf8').trim();
      return parseInt(pidStr, 10) || null;
    }
  } catch { /* empty */ }
  return null;
}

function savePid(pid: number, type: ProcessType): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
  const pidFile = type === 'bot' ? BOT_PID_FILE : MINECRAFT_PID_FILE;
  fs.writeFileSync(pidFile, pid.toString());
}

function findNodeProcessPid(): number | null {
  try {
    const result = execSync("pgrep -f 'node.*bot_server' | head -1", { encoding: 'utf8' }).trim();
    if (result) return parseInt(result, 10);
  } catch { /* empty */ }
  return null;
}

interface RequestOptions {
  hostname: string;
  port: number;
  path: string;
  method: string;
  headers?: Record<string, string>;
  timeout?: number;
}

async function makeRequest(options: RequestOptions, postData: string | null = null): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk: string) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
            }
          } catch (e: any) {
            reject(new Error(`Invalid response: ${e.message}`));
          }
        });
      });
      req.on('error', (e: any) => {
        reject(new Error(`Request error: ${e.message}`));
      });
      req.on('timeout', () => {
        reject(new Error('Request timeout'));
        req.destroy();
      });
      if (postData) req.write(postData);
      req.end();
    } catch (error: any) {
      reject(new Error(`Request creation failed: ${error.message}`));
    }
  });
}

async function resolveBotId(botIdOrName: string, customHost: string | null = null, customPort: number | null = null): Promise<string> {
  const host = customHost || 'localhost';
  const port = customPort || parseInt(process.env.BOT_SERVER_PORT || process.env.PORT || '9500', 10);
  const data = await makeRequest({
    hostname: host,
    port: port,
    path: '/api/bots',
    method: 'GET',
    timeout: 5000
  }) as BotsResponse;

  if (data.bots) {
    const byBotId = data.bots.find(b => b.botId === botIdOrName);
    if (byBotId) return byBotId.botId!;

    const byBotName = data.bots.find(b => b.username === botIdOrName);
    if (byBotName) return byBotName.botId!;
  }

  return botIdOrName;
}

function formatUptime(seconds: number | undefined): string {
  if (!seconds) return 'N/A';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

async function getBotServerStatus(customHost: string | null = null, customPort: number | null = null): Promise<BotServerStatus> {
  const host = customHost || 'localhost';
  const port = customPort || parseInt(process.env.BOT_SERVER_PORT || process.env.PORT || '9500', 10);
  try {
    const healthData = await makeRequest({
      hostname: host,
      port: port,
      path: '/api/health',
      method: 'GET',
      timeout: 2000
    }) as HealthResponse;

    let serverStatusData: ServerStatusResponse = { activeBots: 0 };
    try {
      serverStatusData = await makeRequest({
        hostname: host,
        port: port,
        path: '/api/server/status',
        method: 'GET',
        timeout: 2000
      }) as ServerStatusResponse;
    } catch (statusError) {
      console.warn('⚠️  无法获取服务器状态详情，使用默认值');
    }

    return {
      status: healthData.status === 'OK' ? 'RUNNING' : healthData.status || 'UNKNOWN',
      uptime: healthData.uptimeSeconds ? formatUptime(healthData.uptimeSeconds) : 'N/A',
      version: '1.0.0',
      activeBots: serverStatusData.activeBots || 0,
      serverMode: healthData.serverMode || 'normal',
      timestamp: healthData.timestamp,
      mcServer: healthData.mcServer,
      mcPort: healthData.mcPort,
      uptimeSeconds: healthData.uptimeSeconds,
      pid: healthData.pid || loadPid('bot'),
      port: healthData.port || parseInt(process.env.PORT || '9500', 10)
    };
  } catch (error) {
    return { status: 'NOT_RUNNING' };
  }
}

async function getMinecraftServerStatus(): Promise<MinecraftServerStatus> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.connect({ host: 'localhost', port: 25565 }, () => {
      socket.destroy();
      resolve({ status: 'RUNNING', players: 0, version: '1.21.11', world: 'default' });
    });
    socket.on('error', () => resolve({ status: 'NOT_RUNNING' }));
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ status: 'NOT_RUNNING' });
    });
  });
}

// ============== LLM Configuration Functions ==============

const ENV_FILE = path.join(__dirname, '.env');

function readEnvFile(): Record<string, string> {
  const envVars: Record<string, string> = {};
  try {
    if (fs.existsSync(ENV_FILE)) {
      const content = fs.readFileSync(ENV_FILE, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const equalIndex = trimmed.indexOf('=');
          if (equalIndex > 0) {
            const key = trimmed.substring(0, equalIndex).trim();
            const value = trimmed.substring(equalIndex + 1).trim();
            envVars[key] = value;
          }
        }
      }
    }
  } catch (error: any) {
    console.error(`⚠️  读取.env文件失败: ${error.message}`);
  }
  return envVars;
}

function writeEnvFile(envVars: Record<string, string>): boolean {
  try {
    const lines: string[] = [];
    lines.push('# Bot Server Configuration');
    if (envVars.HOST) lines.push(`HOST=${envVars.HOST}`);
    if (envVars.PORT) lines.push(`PORT=${envVars.PORT}`);
    if (envVars.LOG_DIR) lines.push(`LOG_DIR=${envVars.LOG_DIR}`);
    if (envVars.BOT_PID_FILE) lines.push(`BOT_PID_FILE=${envVars.BOT_PID_FILE}`);
    if (envVars.BOT_LOG_FILE) lines.push(`BOT_LOG_FILE=${envVars.BOT_LOG_FILE}`);

    lines.push('');
    lines.push('# Minecraft Server Configuration');
    if (envVars.MINECRAFT_SERVER_HOST) lines.push(`MINECRAFT_SERVER_HOST=${envVars.MINECRAFT_SERVER_HOST}`);
    if (envVars.MINECRAFT_SERVER_PORT) lines.push(`MINECRAFT_SERVER_PORT=${envVars.MINECRAFT_SERVER_PORT}`);
    if (envVars.MINECRAFT_SERVER_DIR) lines.push(`MINECRAFT_SERVER_DIR=${envVars.MINECRAFT_SERVER_DIR}`);
    if (envVars.MINECRAFT_JAR_PATH) lines.push(`MINECRAFT_JAR_PATH=${envVars.MINECRAFT_JAR_PATH}`);
    if (envVars.MINECRAFT_PID_FILE) lines.push(`MINECRAFT_PID_FILE=${envVars.MINECRAFT_PID_FILE}`);
    if (envVars.MINECRAFT_MAX_MEMORY) lines.push(`MINECRAFT_MAX_MEMORY=${envVars.MINECRAFT_MAX_MEMORY}`);
    if (envVars.MINECRAFT_SERVER_ARGS) lines.push(`MINECRAFT_SERVER_ARGS=${envVars.MINECRAFT_SERVER_ARGS}`);

    lines.push('');
    lines.push('# Bot Server Connection (for cli and other services)');
    if (envVars.BOT_SERVER_HOST) lines.push(`BOT_SERVER_HOST=${envVars.BOT_SERVER_HOST}`);
    if (envVars.BOT_SERVER_PORT) lines.push(`BOT_SERVER_PORT=${envVars.BOT_SERVER_PORT}`);

    lines.push('');
    lines.push('# LLM / AI Configuration');
    if (envVars.VLLM_URL) lines.push(`VLLM_URL=${envVars.VLLM_URL}`);
    if (envVars.LLM_SERVICE_URL) lines.push(`LLM_SERVICE_URL=${envVars.LLM_SERVICE_URL}`);
    if (envVars.USE_LLM !== undefined) lines.push(`USE_LLM=${envVars.USE_LLM}`);
    if (envVars.USE_FALLBACK !== undefined) lines.push(`USE_FALLBACK=${envVars.USE_FALLBACK}`);

    lines.push('');
    lines.push('# Frontend Configuration');
    if (envVars.FRONTEND_PORT) lines.push(`FRONTEND_PORT=${envVars.FRONTEND_PORT}`);
    if (envVars.API_TARGET) lines.push(`API_TARGET=${envVars.API_TARGET}`);

    // Keep any other existing variables that weren't explicitly handled
    const existingContent = fs.readFileSync(ENV_FILE, 'utf8');
    const existingLines = existingContent.split('\n');
    const handledKeys = new Set([
      'HOST', 'PORT', 'LOG_DIR', 'BOT_PID_FILE', 'BOT_LOG_FILE',
      'MINECRAFT_SERVER_HOST', 'MINECRAFT_SERVER_PORT', 'MINECRAFT_SERVER_DIR',
      'MINECRAFT_JAR_PATH', 'MINECRAFT_PID_FILE', 'MINECRAFT_MAX_MEMORY', 'MINECRAFT_SERVER_ARGS',
      'BOT_SERVER_HOST', 'BOT_SERVER_PORT',
      'VLLM_URL', 'LLM_SERVICE_URL', 'USE_LLM', 'USE_FALLBACK',
      'FRONTEND_PORT', 'API_TARGET'
    ]);
    for (const line of existingLines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const equalIndex = trimmed.indexOf('=');
        if (equalIndex > 0) {
          const key = trimmed.substring(0, equalIndex).trim();
          if (!handledKeys.has(key) && envVars[key] !== undefined) {
            lines.push(`${key}=${envVars[key]}`);
          }
        }
      }
    }

    fs.writeFileSync(ENV_FILE, lines.join('\n') + '\n');
    return true;
  } catch (error: any) {
    console.error(`⚠️  写入.env文件失败: ${error.message}`);
    return false;
  }
}

function updateEnvVar(key: string, value: string): boolean {
  const envVars = readEnvFile();
  envVars[key] = value;
  return writeEnvFile(envVars);
}

function getEnvVar(key: string): string | null {
  const envVars = readEnvFile();
  return envVars[key] || null;
}

async function testVllmConnection(vllmUrl: string): Promise<{ available: boolean; models?: string[]; error?: string }> {
  try {
    const url = new URL(vllmUrl);
    const modelsResponse = await makeRequest({
      hostname: url.hostname,
      port: parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80),
      path: '/v1/models',
      method: 'GET',
      timeout: 5000
    });

    if (modelsResponse && Array.isArray(modelsResponse.data)) {
      const modelNames = modelsResponse.data.map((m: any) => m.id || m.name || 'unknown');
      return { available: true, models: modelNames };
    }
    return { available: true, models: [] };
  } catch (error: any) {
    return { available: false, error: error.message };
  }
}

// ============== Commander Program Setup ==============

program
  .name('minebot')
  .description('Minecraft AI Robot System - 命令行管理工具')
  .version('1.0.0');

const serverCommand = program.command('server').description('Bot服务器管理');

serverCommand
  .command('start')
  .description('启动Bot服务器')
  .option('--verbose', '详细模式输出')
  .action(async (options: any) => {
    console.log('🚀 启动Minecraft AI Bot服务器...');

    const existingPid = loadPid('bot');
    if (existingPid && isProcessRunning(existingPid)) {
      console.log('❌ Bot服务器已经在运行中');
      return;
    }

    const LOG_FILE = path.join(LOG_DIR, 'bot_server.log');
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

    const verboseFlag = options.verbose ? '--verbose' : '';
    const startScript = `#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 24.14.1 > /dev/null 2>&1
nohup npx tsx ${BOT_SERVER_SCRIPT}.ts ${verboseFlag} > ${LOG_FILE} 2>&1 &
`;

    const scriptFile = '/tmp/start_bot_server.sh';
    fs.writeFileSync(scriptFile, startScript);
    fs.chmodSync(scriptFile, '755');

    try {
      const child = spawn('bash', [scriptFile], {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: true,
        env: process.env as any
      });

      await new Promise(resolve => setTimeout(resolve, 2000));
      const pid = findNodeProcessPid();
      if (pid) {
        savePid(pid, 'bot');
        console.log(`📝 Bot PID: ${pid}`);
      }

      let output = '';
      child.stdout?.on('data', (data: Buffer) => (output += data.toString()));

      child.on('close', async () => {
        await new Promise(resolve => setTimeout(resolve, 2000));

        const status = await getBotServerStatus();
        if (status.status === 'RUNNING') {
          console.log('✅ Bot服务器启动成功！');
          console.log(`📊 状态: ${status.status}`);
          console.log(`⏱️  运行时间: ${status.uptime || '刚刚启动'}`);
          console.log(`🤖 活跃机器人: ${status.activeBots || 0}`);
          console.log(`🔌 服务器模式: ${status.serverMode || 'normal'}`);
        } else {
          console.log('❌ Bot服务器启动失败');
        }
      });
    } catch (error: any) {
      console.error(`❌ 启动失败: ${error.message}`);
    }
  });

serverCommand
  .command('status')
  .description('查看Bot服务器状态')
  .action(async () => {
    const status = await getBotServerStatus();

    if (status.status === 'RUNNING') {
      console.log('\n🤖 Bot服务器状态');
      console.log('─'.repeat(40));
      console.log(`📊 状态: ${status.status}`);
      console.log(`⏱️  运行时间: ${status.uptime || 'N/A'}`);
      console.log(`🤖 活跃机器人: ${status.activeBots || 0}`);
      console.log(`🔌 服务器模式: ${status.serverMode || 'normal'}`);
      console.log(`📡 端口: ${status.port || 9500}`);
      if (status.pid) {
        console.log(`🔧 进程ID: ${status.pid}`);
      }
    } else {
      console.log('❌ Bot服务器未运行');
      console.log('   运行 "./minebot server start" 启动服务器');
    }
  });

serverCommand
  .command('stop')
  .description('停止Bot服务器')
  .option('-f, --force', '强制停止')
  .action(async (options: any) => {
    console.log('🛑 停止Bot服务器...');

    const pid = loadPid('bot');
    if (!pid || !isProcessRunning(pid)) {
      console.log('ℹ️  Bot服务器未运行');
      return;
    }

    try {
      const reqOptions = {
        hostname: 'localhost',
        port: parseInt(process.env.BOT_SERVER_PORT || process.env.PORT || '9500', 10),
        path: '/api/server/stop',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      };

      const req = http.request(reqOptions, (res) => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          try {
            fs.unlinkSync(BOT_PID_FILE);
          } catch { /* empty */ }
        });
      });

      req.on('error', () => {
        try {
          fs.unlinkSync(BOT_PID_FILE);
        } catch { /* empty */ }
      });

      req.end();

      setTimeout(() => {
        try {
          process.kill(pid, options.force ? 'SIGKILL' : 'SIGTERM');
          try {
            fs.unlinkSync(BOT_PID_FILE);
          } catch { /* empty */ }
        } catch { /* empty */ }
      }, 1000);

      console.log('✅ Bot服务器停止命令已发送');
    } catch (error: any) {
      console.error(`❌ 停止失败: ${error.message}`);
    }
  });

serverCommand
  .command('restart')
  .description('重启Bot服务器')
  .action(async () => {
    console.log('🔄 重启Bot服务器...');

    const pid = loadPid('bot');
    if (pid && isProcessRunning(pid)) {
      console.log('⏳ 停止当前服务器...');

      try {
        await makeRequest(
          {
            hostname: 'localhost',
            port: parseInt(process.env.BOT_SERVER_PORT || process.env.PORT || '9500', 10),
            path: '/api/server/stop',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            timeout: 5000
          },
          JSON.stringify({})
        );
        console.log('✅ 发送停止请求成功');
      } catch (error: any) {
        console.log(`⚠️  API请求失败: ${error.message}，使用SIGTERM...`);
        try {
          process.kill(pid, 'SIGTERM');
        } catch { /* empty */ }
      }

      console.log('⏳ 等待服务器优雅关闭...');
      const maxWaitTime = 10000;
      const checkInterval = 500;
      let waited = 0;

      while (waited < maxWaitTime && isProcessRunning(pid)) {
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        waited += checkInterval;
        if (waited % 2000 === 0) {
          console.log(`⏳ 已等待 ${waited/1000}秒...`);
        }
      }

      if (isProcessRunning(pid)) {
        console.log('⚠️  服务器未响应，强制停止...');
        try {
          process.kill(pid, 'SIGKILL');
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch { /* empty */ }
      }

      try {
        if (fs.existsSync(BOT_PID_FILE)) {
          fs.unlinkSync(BOT_PID_FILE);
        }
      } catch { /* empty */ }

      console.log('✅ 服务器已停止');
    } else if (pid) {
      try {
        if (fs.existsSync(BOT_PID_FILE)) {
          fs.unlinkSync(BOT_PID_FILE);
        }
      } catch { /* empty */ }
    }

    console.log('🚀 启动新服务器...');

    const existingPid = loadPid('bot');
    if (existingPid && isProcessRunning(existingPid)) {
      console.log('❌ 服务器已经在运行中');
      return;
    }

    const LOG_FILE = path.join(LOG_DIR, 'bot_server.log');
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

    const startScript = `#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 24.14.1 > /dev/null 2>&1
nohup npx tsx ${BOT_SERVER_SCRIPT}.ts > ${LOG_FILE} 2>&1 &
`;

    const scriptFile = '/tmp/restart_bot_server.sh';
    fs.writeFileSync(scriptFile, startScript);
    fs.chmodSync(scriptFile, '755');

    try {
      spawn('bash', [scriptFile], {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: true,
        env: process.env as any
      });

      await new Promise(resolve => setTimeout(resolve, 2000));
      const newPid = findNodeProcessPid();
      if (newPid) {
        savePid(newPid, 'bot');
        console.log(`📝 Bot PID: ${newPid}`);
      }

      const status = await getBotServerStatus();
      if (status.status === 'RUNNING') {
        console.log('✅ Bot服务器重启成功！');
        console.log(`📊 状态: ${status.status}`);
        console.log(`⏱️  运行时间: ${status.uptime || '刚刚启动'}`);
        console.log(`🤖 活跃机器人: ${status.activeBots || 0}`);
        console.log(`🔌 服务器模式: ${status.serverMode || 'normal'}`);
      } else {
        console.log('❌ Bot服务器重启失败');
      }
    } catch (error: any) {
      console.error(`❌ 启动失败: ${error.message}`);
    }
  });

const botCommand = program.command('bot').description('机器人管理');

botCommand
  .command('start <botName>')
  .description('启动一个机器人')
  .option('-h, --host <host>', 'Minecraft服务器地址', 'localhost')
  .option('-p, --port <port>', 'Minecraft服务器端口', '25565')
  .option('--version <version>', 'Minecraft版本', '1.21.11')
  .action(async (botName: string, options: any) => {
    console.log(`🤖 启动机器人 "${botName}"...`);

    const botStatus = await getBotServerStatus();
    if (botStatus.status !== 'RUNNING') {
      console.log('❌ Bot服务器未运行，请先运行 "minebot server start"');
      return;
    }

    const useLlm = getEnvVar('USE_LLM') || process.env.USE_LLM || 'false';
    if (useLlm === 'true') {
      console.log('🧠 LLM Brain决策支持: 已启用 (全局)');
    }

    try {
      const data = await makeRequest(
        {
          hostname: 'localhost',
          port: parseInt(process.env.BOT_SERVER_PORT || process.env.PORT || '9500', 10),
          path: '/api/bot/start',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          timeout: 5000
        },
        JSON.stringify({
          username: botName,
          host: options.host,
          port: parseInt(options.port, 10),
          version: options.version
        })
      ) as any;

      if (data.success) {
        console.log(`✅ 机器人 "${botName}" 启动成功！`);
        if (data.botId) console.log(`🤖 Bot ID: ${data.botId}`);
        if (data.goal) console.log(`🎯 自动目标: ${data.goal}`);
        console.log(`📝 ${data.message || '自动行为已启用'}`);
      } else {
        console.log(`❌ 启动失败: ${data.error || '未知错误'}`);
      }
    } catch (error: any) {
      console.error(`❌ 请求失败: ${error.message}`);
    }
  });

botCommand
  .command('stop <botId>')
  .description('停止一个机器人')
  .action(async (botId: string) => {
    const resolvedBotId = await resolveBotId(botId);
    console.log(`🛑 停止机器人 "${botId}"...`);

    const botStatus = await getBotServerStatus();
    if (botStatus.status !== 'RUNNING') {
      console.log('❌ Bot服务器未运行');
      return;
    }

    try {
      const data = await makeRequest({
        hostname: 'localhost',
        port: parseInt(process.env.BOT_SERVER_PORT || process.env.PORT || '9500', 10),
        path: `/api/bot/${resolvedBotId}/stop`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      }) as any;

      if (data.success) {
        console.log(`✅ 机器人 "${botId}" 停止成功！`);
      } else {
        console.log(`❌ 停止失败: ${data.error || '未知错误'}`);
      }
    } catch (error: any) {
      console.error(`❌ 请求失败: ${error.message}`);
    }
  });

botCommand
  .command('status <botIdOrName>')
  .description('查看机器人详细状态')
  .option('-i, --interval <ms>', '自动刷新间隔(毫秒)', '3000')
  .option('--once', '仅显示一次后退出')
  .action(async (botIdOrName: string, options: any) => {
    const botStatus = await getBotServerStatus();
    if (botStatus.status !== 'RUNNING') {
      console.log('❌ Bot服务器未运行');
      return;
    }

    const resolvedBotId = await resolveBotId(botIdOrName);

    const showStatus = async () => {
      try {
        const data = await makeRequest({
          hostname: 'localhost',
          port: parseInt(process.env.BOT_SERVER_PORT || process.env.PORT || '9500', 10),
          path: `/api/bot/${resolvedBotId}/watch`,
          method: 'GET',
          timeout: 5000
        }) as any;

        if (!data.success) {
          console.log(`❌ 获取状态失败: ${data.error}`);
          return false;
        }

        console.log(`\n🤖 ${data.username} [${data.botId}]`);
        console.log(`📡 状态: ${data.state} | 模式: ${data.mode}`);
        console.log('─'.repeat(60));

        if (data.attributes?.health) {
          const h = data.attributes.health;
          const hpPercent = Math.round((h.current / h.max) * 100);
          const hpBar = '█'.repeat(Math.floor(hpPercent / 10)) + '░'.repeat(10 - Math.floor(hpPercent / 10));
          console.log(`❤️  生命: ${hpBar} ${h.current}/${h.max} (${hpPercent}%)`);
        }
        if (data.attributes?.hunger) {
          const hunger = data.attributes.hunger;
          console.log(`🍖 饥饿: ${hunger.current}/20`);
        }

        if (data.environment?.position) {
          const pos = data.environment.position;
          console.log(`📍 位置: (${pos.x}, ${pos.y}, ${pos.z}) - ${pos.biome}`);
        }
        if (data.environment?.weather) {
          const w = data.environment.weather;
          console.log(`☀️  天气: ${w.isRaining ? '下雨' : '晴朗'} | ${w.isThundering ? '⛈️ 雷暴' : ''}`);
        }
        if (data.environment?.time) {
          console.log(`🌙 时间: ${data.environment.time.isDay ? '☀️ 白天' : '🌙 夜晚'} (${data.environment.time.formattedTime || ''})`);
        }

        if (data.goal?.currentGoal) {
          const progress = data.goal.progress || 0;
          const bar = '█'.repeat(Math.floor(progress / 10)) + '░'.repeat(10 - Math.floor(progress / 10));
          console.log(`\n🎯 目标: ${data.goal.currentGoal}`);
          console.log(`   进度: ${bar} ${Math.round(progress)}%`);
        }

        if (data.autonomousState?.currentAction && data.autonomousState.currentAction !== 'idle') {
          const icons: Record<string, string> = {
            'gather': '⛏️', 'combat': '⚔️', 'build': '🏗️', 'craft': '🔨',
            'heal_immediate': '❤️', 'find_shelter': '🏠', 'explore': '🧭'
          };
          const icon = icons[data.autonomousState.currentAction] || '🤖';
          const llmIcon = data.autonomousState.usedLLM ? ' 🧠' : '';
          console.log(`\n${icon} 当前行为: ${data.autonomousState.currentAction}${llmIcon}`);
          if (data.autonomousState.decisionReason) {
            const reason = data.autonomousState.decisionReason.substring(0, 80);
            console.log(`   决策: ${reason}${data.autonomousState.decisionReason.length > 80 ? '...' : ''}`);
          }
          console.log(`   优先级: ${data.autonomousState.priority}`);

          if (data.autonomousState.llmStats) {
            const s = data.autonomousState.llmStats;
            console.log(`   🧠 LLM: ${s.hits}次命中, ${s.misses}次未命中, ${(s.hitRate * 100).toFixed(1)}%命中率`);
          }
        }

        if (data.attributes?.experience) {
          console.log(`\n⭐ 经验: Lv.${data.attributes.experience.level} (${data.attributes.experience.points}pts)`);
        }

        return true;
      } catch (err: any) {
        console.log(`❌ 请求失败: ${err.message}`);
        return false;
      }
    };

    await showStatus();

    if (options.once) {
      return;
    }

    const interval = parseInt(options.interval, 10);
    console.log(`\n⏹️  Ctrl+C 退出 | 刷新: ${interval}ms\n`);

    try {
      setInterval(async () => {
        await showStatus();
      }, interval);
    } catch { }
  });

botCommand
  .command('list')
  .description('列出所有机器人')
  .option('-a, --all', '显示所有机器人（包括已停止的）')
  .action(async (options: any) => {
    const showAll = options.all || false;
    console.log(`📋 机器人列表${showAll ? '（包括已停止）' : ''}...\n`);

    const botStatus = await getBotServerStatus();
    if (botStatus.status !== 'RUNNING') {
      console.log('❌ Bot服务器未运行');
      return;
    }

    try {
      const queryParam = showAll ? '?all=true' : '';
      const data = await makeRequest({
        hostname: 'localhost',
        port: parseInt(process.env.BOT_SERVER_PORT || process.env.PORT || '9500', 10),
        path: `/api/bots${queryParam}`,
        method: 'GET',
        timeout: 5000
      }) as BotsResponse;

      const bots = Array.isArray(data?.bots) ? data.bots : [];

      if (bots.length === 0) {
        console.log(showAll ? '没有任何机器人记录' : '没有运行的机器人');
        return;
      }

      const activeCount = bots.filter(b => b.status === 'active' || b.state === 'ALIVE').length;
      const stoppedCount = bots.length - activeCount;

      console.log(`总共 ${bots.length} 个机器人 (运行中: ${activeCount} | 已停止: ${stoppedCount}):\n`);

      for (const bot of bots) {
        const botId = bot.botId || bot.id || 'Unknown';
        const isStopped = bot.status === 'stopped' || bot.state === 'STOPPED';

        console.log(`🤖 ID: ${botId}`);
        console.log(`  名称: ${bot.username || 'Unknown'}`);
        console.log(`  状态: ${isStopped ? 'STOPPED' : (bot.state || 'UNKNOWN')}`);

        if (!isStopped) {
          try {
            const goalData = await makeRequest({
              hostname: 'localhost',
              port: parseInt(process.env.BOT_SERVER_PORT || process.env.PORT || '9500', 10),
              path: `/api/bot/${botId}/goal/status`,
              method: 'GET',
              timeout: 3000
            }) as GoalStatusResponse;

            if (goalData.currentGoal || goalData.goalState) {
              const goalState = goalData.currentGoal || goalData.goalState;
              const goalName = (goalState as any).name || (goalState as any).goalId || 'Unknown';
              const progress = Math.round((goalData.progress || (goalState as any).progress || 0) * 100);
              const progressBar = '█'.repeat(Math.floor(progress / 10)) + '░'.repeat(10 - Math.floor(progress / 10));
              console.log(`  🎯 目标: ${goalName} ${progressBar} ${progress}%`);
            } else {
              console.log(`  🎯 目标: 未设置`);
            }
          } catch (goalError) {
            console.log(`  🎯 目标: 获取失败`);
          }

          if (bot.position) {
            console.log(`  位置: ${Math.floor(bot.position.x)}, ${Math.floor(bot.position.y)}, ${Math.floor(bot.position.z)}`);
          }
          console.log(`  生命值: ${bot.health || 20}/20`);
          console.log(`  饥饿值: ${bot.food || 20}/20`);
        } else {
          console.log(`  🎯 目标: 已停止`);
          if (bot.position_x) {
            console.log(`  位置: ${Math.floor(bot.position_x)}, ${Math.floor(bot.position_y)}, ${Math.floor(bot.position_z)}`);
          }
          if (bot.created_at) {
            console.log(`  创建时间: ${bot.created_at}`);
          }
          if (bot.updated_at) {
            console.log(`  更新时间: ${bot.updated_at}`);
          }
        }
        console.log('---');
      }
    } catch (error: any) {
      console.error(`❌ 请求失败: ${error.message}`);
    }
  });

botCommand
  .command('goal [botId] [goalId]')
  .description('设置机器人目标或列出所有可用目标')
  .option('-s, --status', '查看机器人目标状态')
  .action(async (botId: string | undefined, goalId: string | undefined, options: any) => {
    if (!botId) {
      const botStatus = await getBotServerStatus();
      if (botStatus.status !== 'RUNNING') {
        console.log('❌ Bot服务器未运行');
        return;
      }

      try {
        const data = await makeRequest({
          hostname: 'localhost',
          port: parseInt(process.env.BOT_SERVER_PORT || process.env.PORT || '9500', 10),
          path: '/api/goals',
          method: 'GET',
          timeout: 5000
        }) as GoalsResponse;

        if (data.success && data.goals) {
          const difficultyLabels: Record<string, string> = {
            beginner: '🟢',
            intermediate: '🟡',
            advanced: '🔴',
            expert: '🔵'
          };

          console.log(`\n🎯 可用目标 (${data.goals.length}个):\n`);
          console.log('  ID                    难度  名称');

          data.goals.forEach(goal => {
            const diffEmoji = difficultyLabels[goal.difficulty] || '⚪';
            const name = goal.name || goal.id;
            console.log(`  ${goal.id.padEnd(20)} ${diffEmoji}   ${name}`);
          });

          console.log('\n用法: minebot bot goal <botId> <goalId>');
          console.log('例:  minebot bot goal testbot basic_survival');
        } else {
          console.log('❌ 获取目标列表失败');
        }
      } catch (error: any) {
        console.error(`❌ 请求失败: ${error.message}`);
      }
      return;
    }

    if (!goalId && options.status) {
      const resolvedBotId = await resolveBotId(botId);
      console.log(`📊 查看机器人 "${botId}" 目标状态...`);

      const botStatus = await getBotServerStatus();
      if (botStatus.status !== 'RUNNING') {
        console.log('❌ Bot服务器未运行');
        return;
      }

      try {
        const data = await makeRequest({
          hostname: 'localhost',
          port: parseInt(process.env.BOT_SERVER_PORT || process.env.PORT || '9500', 10),
          path: `/api/bot/${resolvedBotId}/goal/status`,
          method: 'GET',
          timeout: 5000
        }) as GoalStatusResponse;

        console.log(`🤖 机器人 "${botId}" 目标状态:`);

        if (data.error) {
          console.log(`  ❌ ${data.error}`);
          return;
        }

        if (data.currentGoal) {
          console.log(`  🎯 当前目标: ${data.currentGoal.name || data.currentGoal.id || '未知'}`);
          if (data.currentGoal.description) console.log(`  📝 描述: ${data.currentGoal.description}`);
        }

        if (data.progress !== undefined) {
          const progressBar = '█'.repeat(Math.floor(data.progress / 10)) + '░'.repeat(10 - Math.floor(data.progress / 10));
          console.log(`  📈 总体进度: ${progressBar} ${data.progress}%`);
        }

        if (data.subTasks && Array.isArray(data.subTasks)) {
          console.log(`  📋 子任务进度:`);
          data.subTasks.forEach((task) => {
            const status = task.completed ? '✅' : (task.started ? '🔄' : '⏳');
            const progress = task.progress !== undefined ? ` (${task.progress}%)` : '';
            console.log(`    ${status} ${task.name || task.id}: ${task.completed ? '已完成' : '进行中'}${progress}`);
          });
        }

        if (data.materials && Object.keys(data.materials).length > 0) {
          console.log(`  🧱 收集材料:`);
          Object.entries(data.materials).forEach(([material, count]) => {
            console.log(`    📦 ${material}: ${count}`);
          });
        }

        if (data.startedAt) {
          const started = new Date(data.startedAt);
          const now = new Date();
          const duration = Math.floor((now.getTime() - started.getTime()) / 1000 / 60);
          console.log(`  ⏱️  已运行: ${duration}分钟`);
        }

      } catch (error: any) {
        console.error(`❌ 请求失败: ${error.message}`);
      }
      return;
    }

    if (!goalId) {
      console.log('❌ 请提供目标ID或使用 --status 选项查看状态');
      console.log('💡 使用 "minebot bot goal" 查看所有可用目标');
      console.log('💡 使用 "minebot bot goal <botId> --status" 查看机器人目标状态');
      return;
    }

    const resolvedBotId = await resolveBotId(botId);
    console.log(`🎯 设置机器人 "${botId}" 目标为 "${goalId}"...`);

    const botStatus = await getBotServerStatus();
    if (botStatus.status !== 'RUNNING') {
      console.log('❌ Bot服务器未运行');
      return;
    }

    try {
      const data = await makeRequest(
        {
          hostname: 'localhost',
          port: parseInt(process.env.BOT_SERVER_PORT || process.env.PORT || '9500', 10),
          path: `/api/bot/${resolvedBotId}/goal/select`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          timeout: 5000
        },
        JSON.stringify({ goalId })
      ) as any;

      if (data.success) {
        console.log(`✅ 机器人目标设置成功！`);
        console.log(`🎯 目标: ${data.goalName || goalId}`);
        if (data.message) console.log(`📝 ${data.message}`);
      } else {
        console.log(`❌ 设置失败: ${data.error || '未知错误'}`);
      }
    } catch (error: any) {
      console.error(`❌ 请求失败: ${error.message}`);
    }
  });

botCommand
  .command('watch <botIdOrName>')
  .description('实时查看机器人状态')
  .option('-n, --events <number>', '显示最近多少条事件', '10')
  .option('-i, --interval <ms>', '刷新间隔(毫秒)', '1000')
  .option('--chinese', '显示中文翻译（物品、生物名称等）')
  .option('--zh', '显示中文翻译（简写）')
  .option('-h, --host <address>', 'Bot服务器地址', 'localhost')
  .option('-p, --port <port>', 'Bot服务器端口', '9500')
  .action(async (botIdOrName: string, options: any) => {
    const host = options.host;
    const port = parseInt(options.port, 10);

    let resolvedBotId;
    try {
      resolvedBotId = await resolveBotId(botIdOrName, host, port);
    } catch (error: any) {
      console.log(`❌ 无法连接到Bot服务器 (${host}:${port}): ${error.message}`);
      return;
    }

    let botStatus;
    try {
      botStatus = await getBotServerStatus(host, port);
    } catch (error: any) {
      console.log(`❌ 无法连接到Bot服务器 (${host}:${port}): ${error.message}`);
      return;
    }

    if (botStatus.status !== 'RUNNING') {
      console.log('❌ Bot服务器未运行');
      return;
    }

    const eventLimit = parseInt(options.events, 10);
    const interval = parseInt(options.interval, 10);

    const useChinese = options.chinese || options.zh;
    let isFirst = true;

    const showEnhancedBotStatus = async () => {
      try {
        const langParam = useChinese ? '&lang=zh' : '';

        const data = await makeRequest({
          hostname: host,
          port: port,
          path: `/api/bot/${resolvedBotId}/watch?events=${eventLimit}${langParam}`,
          method: 'GET',
          timeout: 5000
        }) as WatchResponse;

        if (!data.success) {
          console.log(`❌ 获取机器人状态失败: ${data.error}`);
          return;
        }

        process.stdout.write('\x1b[2J\x1b[H');

        console.log(`\n🔍 监控: ${data.username} | 🌐 Web: http://${host}:${port}/watch/${data.botId}`);
        console.log(`📊 刷新: ${interval}ms | ⏹️ Ctrl+C 退出`);
        console.log('─'.repeat(60));

        console.log(`\n🤖 Bot: ${data.username} | ID: ${data.botId}`);
        console.log(`📡 Status: ${data.state} | Mode: ${data.mode || 'N/A'}`);
        console.log('─'.repeat(60));

        if (data.attributes?.health) {
          console.log(`❤️  ${useChinese ? '生命值' : 'Health'}: ${data.attributes.health.current}/${data.attributes.health.max}  |  🍖 ${useChinese ? '饥饿值' : 'Hunger'}: ${data.attributes.health.food}/20`);
        }

        if (data.environment?.position) {
          const pos = data.environment.position;
          console.log(`📍 ${useChinese ? '位置' : 'Position'}: (${pos.x}, ${pos.y}, ${pos.z}) - ${pos.world} - ${pos.biome}`);
        }

        if (data.environment?.weather) {
          const weatherIcon = data.environment.weather.isThundering ? '⛈️' : (data.environment.weather.isRaining ? '🌧️' : '☀️');
          const weatherText = data.environment.weather.isThundering ? 'Thunder' : (data.environment.weather.isRaining ? 'Rain' : 'Clear');
          console.log(`${weatherIcon} ${useChinese ? '天气' : 'Weather'}: ${weatherText}`);
        }

        if (data.environment?.time) {
          const timeIcon = data.environment.time.isDay ? '☀️' : '🌙';
          const timeText = data.environment.time.formattedTime || (data.environment.time.isDay ? 'Day' : 'Night');
          console.log(`${timeIcon} ${useChinese ? '时间' : 'Time'}: ${timeText}`);
        }

        if (data.environment?.conditions) {
          const cond = data.environment.conditions;
          const waterIcon = cond.isInWater ? '🌊' : '🏝️';
          console.log(`${waterIcon} ${useChinese ? '环境' : 'Environment'}: ${cond.dimension} | ${useChinese ? '难度' : 'Difficulty'}: ${cond.difficulty}${cond.isInWater ? ' | ' + (useChinese ? '水中' : 'In Water') : ''}`);
        }

        if (data.gameMode) {
          console.log(`🎮 ${useChinese ? '游戏模式' : 'Game Mode'}: ${data.gameMode}`);
        }

        if (data.goal?.currentGoal) {
          console.log(`\n🎯 ${useChinese ? '当前目标' : 'Current Goal'}: ${data.goal.currentGoal}`);
          const progress = data.goal.progress || 0;
          const progressBar = '█'.repeat(Math.floor(progress / 10)) + '░'.repeat(10 - Math.floor(progress / 10));
          console.log(`   ${useChinese ? '进度' : 'Progress'}: ${progressBar} ${Math.round(progress)}%`);
        }

        if (data.autonomousState?.currentAction && data.autonomousState.currentAction !== 'idle') {
          const actionIcons: Record<string, string> = {
            'gather': '⛏️',
            'combat': '⚔️',
            'build': '🏗️',
            'craft': '🔨',
            'heal_immediate': '❤️',
            'find_shelter': '🏠',
            'explore': '🧭'
          };
          const icon = actionIcons[data.autonomousState.currentAction] || '🤖';
          const llmIndicator = data.autonomousState.usedLLM ? ' 🧠' : '';
          console.log(`\n${icon} ${useChinese ? '自动决策' : 'Auto Decision'}${llmIndicator}:`);
          console.log(`   ${useChinese ? '动作' : 'Action'}: ${data.autonomousState.currentAction}`);
          if (data.autonomousState.decisionReason) {
            const reason = data.autonomousState.decisionReason.length > 50 
              ? data.autonomousState.decisionReason.substring(0, 47) + '...'
              : data.autonomousState.decisionReason;
            console.log(`   ${useChinese ? '原因' : 'Reason'}: ${reason}`);
          }
          console.log(`   ${useChinese ? '优先级' : 'Priority'}: ${data.autonomousState.priority}`);
          if (data.autonomousState.healthStatus) {
            console.log(`   ${useChinese ? '状态' : 'Status'}: ${data.autonomousState.healthStatus}`);
          }
          if (data.autonomousState.llmStats) {
            const stats = data.autonomousState.llmStats;
            console.log(`   🧠 LLM Cache: ${stats.hits} hits, ${stats.misses} misses, ${(stats.hitRate * 100).toFixed(1)}% hit rate`);
          }
        }

        if (data.attributes?.experience) {
          console.log(`\n📊 ${useChinese ? '经验等级' : 'Experience Level'}: ${data.attributes.experience.level}`);
          console.log(`⭐ ${useChinese ? '经验点数' : 'Experience Points'}: ${data.attributes.experience.points}`);
        }

        if (data.environment?.nearby?.resources && data.environment.nearby.resources.length > 0) {
          console.log(`\n💎 ${useChinese ? '附近资源' : 'Nearby Resources'}:`);
          data.environment.nearby.resources.slice(0, 10).forEach(r => {
            console.log(`   ${r.resource}: ${r.distance}m away`);
          });
        }

        if (data.attributes?.armor?.pieces && data.attributes.armor.pieces.length > 0) {
          console.log(`🛡️  ${useChinese ? '护甲装备' : 'Armor'}:`);
          const slotNames = ['头盔', '胸甲', '护腿', '靴子'];
          data.attributes.armor.pieces.forEach(piece => {
            const slot = useChinese ? slotNames[piece.slot] : `slot ${piece.slot}`;
            console.log(`   ${slot}: ${piece.name} (${useChinese ? '防御值' : 'defense'}: ${piece.durability || 'N/A'}/${piece.maxDurability || 'N/A'})`);
          });
        }

        if (data.resources?.inventory && data.resources.inventory.length > 0) {
          console.log(`\n🎒 ${useChinese ? '背包物品' : 'Inventory'} (${data.resources.inventory.length} ${useChinese ? '物品' : 'items'}):`);
          const slotWidth = 5;
          const nameWidth = 30;
          const countWidth = 6;
          console.log(`   ${'SLOT'.padEnd(slotWidth)} ${'ITEM'.padEnd(nameWidth)} ${'COUNT'.padEnd(countWidth)}`);
          console.log(`   ${'─'.repeat(slotWidth)} ${'─'.repeat(nameWidth)} ${'─'.repeat(countWidth)}`);
          data.resources.inventory.slice(0, 30).forEach(item => {
            const name = item.name.length > nameWidth ? item.name.substring(0, nameWidth-3) + '...' : item.name;
            console.log(`   ${String(item.slot || '').padEnd(slotWidth)} ${name.padEnd(nameWidth)} ${String(item.count).padEnd(countWidth)}`);
          });
          if (data.resources.inventory.length > 30) {
            console.log(`   ... ${useChinese ? '还有' : 'and'} ${data.resources.inventory.length - 30} ${useChinese ? '件物品' : 'more items'}`);
          }
        }

        if (data.resources?.summary && Object.keys(data.resources.summary).length > 0) {
          console.log(`\n📊 ${useChinese ? '资源统计' : 'Resource Summary'}:`);
          const sortedResources = Object.entries(data.resources.summary)
            .sort(([,a], [,b]) => b - a);

          sortedResources.forEach(([item, count]) => {
            console.log(`   ${item}: ${count}`);
          });

          if (sortedResources.length > 20) {
            console.log(`   ... ${useChinese ? '共' : 'Total'}: ${sortedResources.length} ${useChinese ? '种物品' : 'item types'}`);
          }
        }

        if (data.environment?.nearby?.entities && data.environment.nearby.entities.length > 0) {
          console.log(`\n👥 ${useChinese ? '附近实体' : 'Nearby Entities'}:`);
          data.environment.nearby.entities.slice(0, 10).forEach(entity => {
            const categoryIcon =
              entity.category === 'hostile' ? '👿' :
              entity.category === 'friendly' ? '😊' :
              entity.category === 'ambient' ? '🦇' :
              entity.category === 'water' ? '🐟' :
              entity.category === 'player' ? '🎮' :
              '😐';
            console.log(`   ${categoryIcon} ${entity.displayName} - ${useChinese ? '距离' : 'distance'}: ${entity.distance}m`);
          });
        }

        if (data.environment?.nearby?.drops && data.environment.nearby.drops.length > 0) {
          console.log(`\n💰 ${useChinese ? '附近掉落物' : 'Nearby Drops'}:`);
          data.environment.nearby.drops.slice(0, 10).forEach(drop => {
            console.log(`   📦 ${drop.item} - ${drop.distance}m`);
          });
        }

        if (data.events?.list && data.events.list.length > 0) {
          console.log(`\n📜 ${useChinese ? '最近事件' : 'Recent Events'}:`);
          console.log('─'.repeat(60));

          data.events.list.slice(0, eventLimit).forEach(event => {
            const time = new Date(event.timestamp).toLocaleTimeString();
            const typeIcon: Record<string, string> = {
              'status': '📡',
              'health': '❤️',
              'health_change': '❤️',
              'food': '🍖',
              'food_change': '🍖',
              'movement': '👣',
              'death': '💀',
              'respawn': '✨',
              'disconnect': '🔌',
              'connect': '🔗',
              'damage_taken': '⚔️',
              'heal': '💚',
              'eating': '🍽️',
              'item_pickup': '💎',
              'block_break': '⛏️',
              'block_place': '🧱'
            };

            console.log(`  ${typeIcon[event.type] || '📝'} [${time}] ${event.message}`);
          });
        }

        console.log('\n' + '─'.repeat(60));
        console.log(`⏰ ${useChinese ? '最后更新' : 'Last Updated'}: ${new Date().toLocaleTimeString()}`);
        console.log(`   ${useChinese ? '按 Ctrl+C 退出监控' : 'Press Ctrl+C to exit'}`);

      } catch (error: any) {
        if (isFirst) {
          console.log(`❌ ${useChinese ? '请求失败' : 'Request Failed'}: ${error.message}`);
          isFirst = false;
        }
      }
    };

    await showEnhancedBotStatus();
    isFirst = false;

    const watchInterval = setInterval(showEnhancedBotStatus, interval);

    process.on('SIGINT', () => {
      clearInterval(watchInterval);
      process.stdout.write('\x1b[2J\x1b[H');
      console.log(`\n👋 ${useChinese ? '监控已退出' : 'Monitoring stopped'}`);
      process.exit(0);
    });
  });

botCommand
  .command('auto <botId>')
  .description('机器人自动目标控制')
  .option('-s, --start', '启动自动目标')
  .option('--stop', '停止自动目标')
  .action(async (botId: string, options: any) => {
    const resolvedBotId = await resolveBotId(botId);

    if (!options.start && !options.stop) {
      console.log(`📊 查看机器人 "${botId}" 自动目标状态...`);

      const botStatus = await getBotServerStatus();
      if (botStatus.status !== 'RUNNING') {
        console.log('❌ Bot服务器未运行');
        return;
      }

      try {
        const data = await makeRequest({
          hostname: 'localhost',
          port: parseInt(process.env.BOT_SERVER_PORT || process.env.PORT || '9500', 10),
          path: `/api/bot/${resolvedBotId}/goal/status`,
          method: 'GET',
          timeout: 5000
        }) as GoalStatusResponse;

        console.log(`🤖 机器人 "${botId}" 状态:`);
        if ((data as any).status) console.log(`  🔄 状态: ${(data as any).status}`);
        if (data.progress) console.log(`  📈 进度: ${data.progress}%`);
        if (data.currentGoal) console.log(`  🎯 目标: ${(data.currentGoal as any).name || (data.currentGoal as any).id}`);
        if (data.subTasks) {
          console.log(`  📋 子任务:`);
          data.subTasks.forEach((task, index) => {
            const status = task.completed ? '✅' : '⏳';
            console.log(`    ${status} ${task.name}: ${task.progress || 0}%`);
          });
        }
        if (data.materials) {
          console.log(`  🧱 收集材料:`);
          Object.entries(data.materials).forEach(([material, count]) => {
            console.log(`    📦 ${material}: ${count}`);
          });
        }
      } catch (error: any) {
        console.error(`❌ 请求失败: ${error.message}`);
      }
      return;
    }

    if (options.start) {
      console.log(`🤖 启动机器人 "${botId}" 自动目标...`);

      const botStatus = await getBotServerStatus();
      if (botStatus.status !== 'RUNNING') {
        console.log('❌ Bot服务器未运行');
        return;
      }

      try {
        const data = await makeRequest(
          {
            hostname: 'localhost',
            port: parseInt(process.env.BOT_SERVER_PORT || process.env.PORT || '9500', 10),
            path: '/api/bot/automatic',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            timeout: 5000
          },
          JSON.stringify({
            botId: resolvedBotId
          })
        ) as any;

        if (data.success) {
          console.log(`✅ 机器人 "${botId}" 自动目标启动成功！`);
          if (data.message) console.log(`📝 ${data.message}`);
        } else {
          console.log(`❌ 启动失败: ${data.error || '未知错误'}`);
        }
      } catch (error: any) {
        console.error(`❌ 请求失败: ${error.message}`);
      }
      return;
    }

    if (options.stop) {
      console.log(`🛑 停止机器人 "${botId}" 自动目标...`);

      const botStatus = await getBotServerStatus();
      if (botStatus.status !== 'RUNNING') {
        console.log('❌ Bot服务器未运行');
        return;
      }

      try {
        const data = await makeRequest({
          hostname: 'localhost',
          port: parseInt(process.env.BOT_SERVER_PORT || process.env.PORT || '9500', 10),
          path: `/api/bot/${resolvedBotId}/stop`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          timeout: 5000
        }) as any;

        if (data.success) {
          console.log(`✅ 机器人 "${botId}" 自动目标停止成功！`);
        } else {
          console.log(`❌ 停止失败: ${data.error || '未知错误'}`);
        }
      } catch (error: any) {
        console.error(`❌ 请求失败: ${error.message}`);
      }
      return;
    }

    console.log('❌ 请指定操作: --start 或 --stop');
    console.log('用法: minebot bot auto <botId> --start');
    console.log('查看状态: minebot bot auto <botId>');
  });

botCommand
  .command('remove [botId]')
  .description('删除一个机器人或所有机器人')
  .option('-a, --all', '删除所有机器人（需要二次确认）')
  .option('-y, --yes', '自动确认删除操作，跳过二次确认')
  .action(async (botId: string | undefined, options: any) => {
    const botStatus = await getBotServerStatus();
    if (botStatus.status !== 'RUNNING') {
      console.log('❌ Bot服务器未运行');
      return;
    }

    if (options.all || !botId) {
      console.log('⚠️  警告：您将要删除所有机器人！');

      if (!options.yes) {
        console.log('此操作将：');
        console.log('  - 停止所有正在运行的机器人');
        console.log('  - 从数据库中删除所有机器人记录');
        console.log('  - 无法撤销！');

        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });

        try {
          const answer = await new Promise(resolve => {
            rl.question('确定要删除所有机器人吗？(输入 "yes" 确认): ', resolve);
          }) as string;
          rl.close();

          if (String(answer).toLowerCase() !== 'yes') {
            console.log('❌ 操作已取消');
            return;
          }
        } catch (error: any) {
          console.error('❌ 确认失败:', error.message);
          rl.close();
          return;
        }
      }

      console.log('🗑️  删除所有机器人...');

      try {
        const data = await makeRequest({
          hostname: 'localhost',
          port: parseInt(process.env.BOT_SERVER_PORT || process.env.PORT || '9500', 10),
          path: '/api/bots',
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000
        }) as any;

        if (data.success) {
          console.log(`✅ 成功删除 ${data.removed || 0} 个机器人！`);
          console.log(`📝 ${data.message || '所有机器人已删除'}`);
        } else {
          console.log(`❌ 删除失败: ${data.error || '未知错误'}`);
        }
      } catch (error: any) {
        console.error(`❌ 请求失败: ${error.message}`);
      }
      return;
    }

    const resolvedBotId = await resolveBotId(botId);

    let displayName = botId;
    try {
      const botData = await makeRequest({
        hostname: 'localhost',
        port: parseInt(process.env.BOT_SERVER_PORT || process.env.PORT || '9500', 10),
        path: '/api/bots',
        method: 'GET',
        timeout: 3000
      }) as BotsResponse;

      if (botData.bots) {
        const bot = botData.bots.find(b => b.botId === resolvedBotId);
        if (bot && bot.username) {
          displayName = bot.username;
        }
      }
    } catch (error) {
      // continue with original name
    }

    console.log(`🗑️  删除机器人 "${displayName}"...`);

    if (!options.yes) {
      console.log(`⚠️  警告：您将要删除机器人 "${displayName}" (ID: ${resolvedBotId})`);

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      try {
        const answer = await new Promise(resolve => {
          rl.question('确定要删除这个机器人吗？(输入 "yes" 确认): ', resolve);
        }) as string;
        rl.close();

        if (String(answer).toLowerCase() !== 'yes') {
          console.log('❌ 操作已取消');
          return;
        }
      } catch (error: any) {
        console.error('❌ 确认失败:', error.message);
        rl.close();
        return;
      }
    }

    try {
      const data = await makeRequest({
        hostname: 'localhost',
        port: parseInt(process.env.BOT_SERVER_PORT || process.env.PORT || '9500', 10),
        path: `/api/bot/${resolvedBotId}`,
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      }) as any;

      if (data.success) {
      console.log(`✅ 机器人 "${displayName}" 删除成功！`);
      console.log(`📝 ${data.message || '机器人已删除'}`);
    } else {
      console.log(`❌ 删除失败: ${data.error || '未知错误'}`);
    }
  } catch (error: any) {
      console.error(`❌ 请求失败: ${error.message}`);
    }
  });

const mcCommand = program.command('mc').description('Minecraft服务器管理');

mcCommand
  .command('start')
  .description('启动Minecraft服务器')
  .option('-p, --path <path>', 'Minecraft服务器JAR文件路径，默认从.env读取')
  .option('-m, --memory <memory>', '分配内存大小，默认从.env读取MINECRAFT_MAX_MEMORY')
  .option('--args <args>', '服务器启动参数，默认从.env读取MINECRAFT_SERVER_ARGS')
  .action(async (options: any) => {
    console.log('🎮 启动Minecraft服务器...');

    const existingPid = loadPid('minecraft');
    if (existingPid && isProcessRunning(existingPid)) {
      console.log('❌ Minecraft服务器已经在运行中');
      return;
    }

    let serverJarPath;
    if (options.path) {
      serverJarPath = options.path;
      console.log(`📁 使用自定义路径: ${serverJarPath}`);
    } else {
      const serverDir = process.env.MINECRAFT_SERVER_DIR || 'resources';
      const jarFilename = process.env.MINECRAFT_JAR_PATH || 'minecraft_server.1.21.11.jar';
      serverJarPath = path.join(__dirname, serverDir, jarFilename);
      console.log(`📁 使用环境配置路径: ${serverJarPath}`);
    }

    if (!fs.existsSync(serverJarPath)) {
      console.error(`❌ Minecraft服务器JAR文件不存在: ${serverJarPath}`);
      console.error('请确保文件存在或使用 --path 参数指定正确路径');
      return;
    }

    const memory = options.memory || process.env.MINECRAFT_MAX_MEMORY || '1G';
    const serverArgs = options.args || process.env.MINECRAFT_SERVER_ARGS || 'nogui';

    console.log(`⚙️  配置: 内存=${memory}, 参数=${serverArgs}`);

    const LOG_FILE = path.join(LOG_DIR, 'minecraft_server.log');
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }

    const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

    try {
      const child = spawn(
        'java',
        [`-Xmx${memory}`, `-Xms${memory}`, '-jar', serverJarPath, serverArgs],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
          detached: true,
          cwd: path.dirname(serverJarPath),
          env: process.env as any
        }
      );

      savePid(child.pid!, 'minecraft');

      child.stdout?.on('data', (data: Buffer) => {
        const output = data.toString().trim();
        if (output) {
          console.log(`[MC] ${output}`);
          logStream.write(`[MC] ${output}\n`);
        }
      });

      child.stderr?.on('data', (data: Buffer) => {
        const error = data.toString().trim();
        if (error) {
          console.error(`[MC Error] ${error}`);
          logStream.write(`[MC Error] ${error}\n`);
        }
      });

      child.on('close', (code) => {
        console.log(`🛑 Minecraft服务器已退出，代码: ${code}`);
        logStream.end();
        try {
          if (fs.existsSync(MINECRAFT_PID_FILE)) {
            fs.unlinkSync(MINECRAFT_PID_FILE);
          }
        } catch { /* empty */ }
      });

      console.log(`✅ Minecraft服务器启动成功！PID: ${child.pid}`);
      console.log(`📝 日志文件: ${LOG_FILE}`);
      console.log('ℹ️  使用 "minebot mc status" 检查服务器状态');
      console.log('ℹ️  使用 "minebot mc end" 停止服务器');
    } catch (error: any) {
      console.error(`❌ 启动失败: ${error.message}`);
    }
  });

mcCommand
  .command('end')
  .description('停止Minecraft服务器')
  .alias('stop')
  .option('-f, --force', '强制停止')
  .action(async (options: any) => {
    console.log('🛑 停止Minecraft服务器...');

    const pid = loadPid('minecraft');
    if (!pid || !isProcessRunning(pid)) {
      console.log('ℹ️  Minecraft服务器未运行');
      return;
    }

    try {
      process.kill(pid, 'SIGTERM');
      console.log('✅ 已发送停止信号 (SIGTERM)');

      setTimeout(() => {
        if (isProcessRunning(pid)) {
          if (options.force) {
            console.log('⚠️  服务器未响应，强制停止 (SIGKILL)...');
            try {
              process.kill(pid, 'SIGKILL');
            } catch { /* empty */ }
          } else {
            console.log('⚠️  服务器未响应，尝试再次发送SIGTERM...');
            try {
              process.kill(pid, 'SIGTERM');
            } catch { /* empty */ }
          }
        }
      }, 5000);

      try {
        if (fs.existsSync(MINECRAFT_PID_FILE)) {
          fs.unlinkSync(MINECRAFT_PID_FILE);
        }
      } catch { /* empty */ }

      console.log('✅ Minecraft服务器停止命令已发送');
      console.log('ℹ️  服务器可能需要几秒钟来保存世界并关闭');
    } catch (error: any) {
      console.error(`❌ 停止失败: ${error.message}`);
    }
  });

mcCommand
  .command('restart')
  .description('重启Minecraft服务器')
  .option('-p, --path <path>', 'Minecraft服务器JAR文件路径，默认从.env读取')
  .option('-m, --memory <memory>', '分配内存大小，默认从.env读取MINECRAFT_MAX_MEMORY')
  .option('--args <args>', '服务器启动参数，默认从.env读取MINECRAFT_SERVER_ARGS')
  .action(async (options: any) => {
    console.log('🔄 重启Minecraft服务器...');

    const pid = loadPid('minecraft');
    if (pid && isProcessRunning(pid)) {
      try {
        process.kill(pid, 'SIGTERM');
        console.log('✅ 已发送停止信号');
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch { /* empty */ }
    }

    try {
      let serverJarPath;
      if (options.path) {
        serverJarPath = options.path;
      } else {
        const serverDir = process.env.MINECRAFT_SERVER_DIR || 'resources';
        const jarFilename = process.env.MINECRAFT_JAR_PATH || 'minecraft_server.1.21.11.jar';
        serverJarPath = path.join(__dirname, serverDir, jarFilename);
      }

      if (!fs.existsSync(serverJarPath)) {
        console.error(`❌ Minecraft服务器JAR文件不存在: ${serverJarPath}`);
        return;
      }

      const memory = options.memory || process.env.MINECRAFT_MAX_MEMORY || '1G';
      const serverArgs = options.args || process.env.MINECRAFT_SERVER_ARGS || 'nogui';

      const child = spawn(
        'java',
        [`-Xmx${memory}`, `-Xms${memory}`, '-jar', serverJarPath, serverArgs],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
          detached: true,
          cwd: path.dirname(serverJarPath),
          env: process.env as any
        }
      );

      savePid(child.pid!, 'minecraft');
      console.log(`✅ Minecraft服务器重启成功！PID: ${child.pid}`);

      child.stdout?.on('data', (data: Buffer) => {
        const output = data.toString().trim();
        if (output) console.log(`[MC] ${output}`);
      });

      child.stderr?.on('data', (data: Buffer) => {
        const error = data.toString().trim();
        if (error) console.error(`[MC Error] ${error}`);
      });

      console.log('✅ Minecraft服务器已重启');
      console.log('ℹ️  使用 "minebot mc status" 检查服务器状态');
    } catch (error: any) {
      console.error(`❌ 重启失败: ${error.message}`);
    }
  });

mcCommand
  .command('status')
  .description('查看Minecraft服务器状态')
  .action(async () => {
    console.log('📊 检查Minecraft服务器状态...');

    const status = await getMinecraftServerStatus();

    if (status.status === 'RUNNING') {
      console.log(`✅ 状态: ${status.status}`);
      console.log(`🏷️  版本: ${status.version}`);
      console.log(`👥 在线玩家: ${status.players}`);
      console.log(`🌍 世界: ${status.world}`);

      const pid = loadPid('minecraft');
      if (pid && isProcessRunning(pid)) {
        console.log(`🔢 PID: ${pid}`);
      }
    } else {
      console.log(`❌ 状态: ${status.status}`);
      console.log('ℹ️  使用 "minebot mc start" 启动服务器');
    }
  });

program
  .command('status')
  .description('查看系统状态')
  .action(async () => {
    console.log('📊 检查系统状态...\n');

    const [botStatus, mcStatus] = await Promise.all([
      getBotServerStatus(),
      getMinecraftServerStatus()
    ]);

    console.log('🤖 Bot服务器状态:');
    if (botStatus.status === 'RUNNING') {
      console.log(`  ✅ 状态: ${botStatus.status}`);
      console.log(`  ⏱️  运行时间: ${botStatus.uptime || 'N/A'}`);
      console.log(`  🔌 版本: ${botStatus.version || 'N/A'}`);
      console.log(`  🤖 活跃机器人: ${botStatus.activeBots || 0}`);
      console.log(`  🎮 服务器模式: ${botStatus.serverMode || 'normal'}`);
    } else {
      console.log(`  ❌ 状态: ${botStatus.status}`);
    }

    console.log('\n🎮 Minecraft服务器状态:');
    if (mcStatus.status === 'RUNNING') {
      console.log(`  ✅ 状态: ${mcStatus.status}`);
      console.log(`  🏷️  版本: ${mcStatus.version}`);
      console.log(`  👥 在线玩家: ${mcStatus.players}`);
      console.log(`  🌍 世界: ${mcStatus.world}`);
    } else {
      console.log(`  ❌ 状态: ${mcStatus.status}`);
    }
  });

const llmCommand = program.command('llm').description('LLM Brain管理');

llmCommand
  .command('enable')
  .description('启用LLM Brain')
  .action(async () => {
    console.log('🧠 启用LLM Brain...');

    if (updateEnvVar('USE_LLM', 'true')) {
      console.log('✅ LLM Brain已启用');
      const vllmUrl = getEnvVar('VLLM_URL') || process.env.VLLM_URL || 'http://localhost:8000';
      console.log(`📡 vLLM URL: ${vllmUrl}`);
      console.log('ℹ️  使用 "minebot llm status" 查看服务状态');
    } else {
      console.log('❌ 启用失败');
    }
  });

llmCommand
  .command('disable')
  .description('禁用LLM Brain')
  .action(async () => {
    console.log('🧠 禁用LLM Brain...');

    if (updateEnvVar('USE_LLM', 'false')) {
      console.log('✅ LLM Brain已禁用');
    } else {
      console.log('❌ 禁用失败');
    }
  });

llmCommand
  .command('config')
  .description('配置LLM设置')
  .option('--url <url>', '设置vLLM服务URL')
  .option('--enable', '启用LLM')
  .option('--disable', '禁用LLM')
  .action(async (options: any) => {
    console.log('⚙️  配置LLM设置...');

    let hasChanges = false;

    if (options.url) {
      if (updateEnvVar('VLLM_URL', options.url)) {
        console.log(`✅ vLLM URL已设置为: ${options.url}`);
        hasChanges = true;
      }
    }

    if (options.enable) {
      if (updateEnvVar('USE_LLM', 'true')) {
        console.log('✅ LLM已启用');
        hasChanges = true;
      }
    }

    if (options.disable) {
      if (updateEnvVar('USE_LLM', 'false')) {
        console.log('✅ LLM已禁用');
        hasChanges = true;
      }
    }

    if (!hasChanges) {
      const currentUrl = getEnvVar('VLLM_URL') || process.env.VLLM_URL || 'http://localhost:8000';
      const useLlm = getEnvVar('USE_LLM') || process.env.USE_LLM || 'false';
      console.log('📋 当前配置:');
      console.log(`   vLLM URL: ${currentUrl}`);
      console.log(`   LLM启用: ${useLlm === 'true' ? '是' : '否'}`);
      console.log('\n用法:');
      console.log('   minebot llm config --url <url>');
      console.log('   minebot llm config --enable');
      console.log('   minebot llm config --disable');
    }
  });

llmCommand
  .command('status')
  .description('查看LLM状态')
  .action(async () => {
    console.log('📊 检查LLM状态...\n');

    const useLlm = getEnvVar('USE_LLM') || process.env.USE_LLM || 'false';
    const vllmUrl = getEnvVar('VLLM_URL') || process.env.VLLM_URL || 'http://localhost:8000';

    console.log('🧠 LLM Brain状态:');
    console.log(`   启用: ${useLlm === 'true' ? '✅ 是' : '❌ 否'}`);
    console.log(`   vLLM URL: ${vllmUrl}`);

    console.log('\n🔗 测试vLLM服务连接...');
    const testResult = await testVllmConnection(vllmUrl);

    if (testResult.available) {
      console.log('   服务状态: ✅ 可用');
      if (testResult.models && testResult.models.length > 0) {
        console.log(`   可用模型: ${testResult.models.length}个`);
        testResult.models.slice(0, 5).forEach((model, index) => {
          console.log(`      ${index + 1}. ${model}`);
        });
        if (testResult.models.length > 5) {
          console.log(`      ... 还有 ${testResult.models.length - 5}个模型`);
        }
      } else {
        console.log('   可用模型: 未找到模型');
      }
    } else {
      console.log('   服务状态: ❌ 不可用');
      console.log(`   错误: ${testResult.error || '未知错误'}`);
      console.log('\n💡 提示:');
      console.log('   - 确保vLLM服务正在运行');
      console.log('   - 检查URL是否正确');
      console.log('   - 使用 "minebot llm config --url <url>" 设置正确的URL');
    }
  });

llmCommand
  .command('models')
  .description('列出可用模型')
  .action(async () => {
    console.log('📋 获取可用模型列表...\n');

    const vllmUrl = getEnvVar('VLLM_URL') || process.env.VLLM_URL || 'http://localhost:8000';
    console.log(`🔗 连接: ${vllmUrl}`);

    const testResult = await testVllmConnection(vllmUrl);

    if (testResult.available && testResult.models) {
      if (testResult.models.length === 0) {
        console.log('❌ 未找到可用模型');
      } else {
        console.log(`\n✅ 可用模型 (${testResult.models.length}个):\n`);
        testResult.models.forEach((model, index) => {
          console.log(`   ${index + 1}. ${model}`);
        });
      }
    } else {
      console.log(`❌ 无法连接到vLLM服务`);
      console.log(`   错误: ${testResult.error || '未知错误'}`);
      console.log('\n💡 确保vLLM服务正在运行:');
      console.log('   vllm serve --model <model_name>');
    }
  });

program
  .command('help')
  .description('显示帮助信息')
  .action(() => {
    program.help();
  });

if (process.argv.length <= 2) {
  program.help();
} else {
  program.parse(process.argv);
}