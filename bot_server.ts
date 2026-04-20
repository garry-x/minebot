import 'dotenv/config';
import express, { Express, Request, Response, NextFunction, RequestHandler } from 'express';
import * as http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import * as fs from 'fs';
import * as path from 'path';

const logger = require('./bot/logger');
const BotConfig = require('./config/models/BotConfig').default || require('./config/models/BotConfig');
const BotState = require('./config/models/BotState').default || require('./config/models/BotState');
const GoalSystem = require('./bot/goal-system').default || require('./bot/goal-system');
const BotGoal = require('./config/models/BotGoal').default || require('./config/models/BotGoal');
const streamRoutesModule = require('./routes/stream');

// ============================================
// Type Definitions
// ============================================

interface BotInstance {
  bot: any;
  username: string;
  isConnected: boolean;
  currentMode: string | null;
  deadReason: string | null;
  botTime: number;
  goalState: any;
  autonomousRunning: boolean;
  autonomousEngine: any;
  getScreenshotFn?: () => any;
  behaviors: any;
  pathfinder: any;
  autonomousGoalChange?: boolean;
  goalChanged?: boolean;
  disconnect?: () => Promise<void>;
}

interface RateLimitRecord {
  windowStart: number;
  count: number;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface RetryQueueEntry {
  username: string;
  mode: string;
  retries: number;
}

interface BotLastState {
  health: number;
  food: number;
  pos: any;
}

// ============================================
// Express Types
// ============================================

interface EnvVars {
  [key: string]: string;
}

interface ServerDefaults {
  HOST: string;
  PORT: string;
  autoReconnectRetries: number;
  autoReconnectDelay: number;
  broadcastInterval: number;
  serverStateSaveInterval: number;
  botStaleCleanupDays: number;
  databaseBusyTimeout: number;
  botStatusCheckTimeout: number;
  minecraftMaxMemory: string;
  minecraftJarPath: string;
  minecraftServerDir: string;
  logDir: string;
  defaultBuildingWidth: number;
  defaultBuildingLength: number;
  defaultBuildingHeight: number;
  defaultBuildingBlockType: string;
  defaultGatheringRadius: number;
  defaultGatheringTargets: string[];
  defaultBotMode: string;
}

// ============================================
// App and Server Setup
// ============================================

const app: Express = express();
const HOST: string = process.env.HOST || '0.0.0.0';
const PORT: number = parseInt(process.env.PORT || '9500');

// Parse verbose flag
const verbose = process.argv.includes('--verbose');

// Setup PID file paths
const LOG_DIR = path.join(__dirname, 'logs');
const pidFile = path.join(LOG_DIR, 'bot_server.pid');

// Atomically create and write PID file
let fd;
try {
  fd = fs.openSync(pidFile, 'wx');
  fs.writeSync(fd, process.pid.toString());
  fs.closeSync(fd);
  logger.trace(`PID file written: ${pidFile} (PID: ${process.pid})`);
} catch (e) {
  // PID file exists, read it to check if it's stale
  try {
    const existingPidRaw = fs.readFileSync(pidFile, 'utf8').trim();
    const existingPid = parseInt(existingPidRaw);
    
    if (!Number.isInteger(existingPid) || existingPid <= 0) {
      // Invalid PID, remove stale file and retry
      logger.trace('Removing invalid PID file');
      fs.unlinkSync(pidFile);
      fd = fs.openSync(pidFile, 'wx');
      fs.writeSync(fd, process.pid.toString());
      fs.closeSync(fd);
      logger.trace(`PID file written: ${pidFile} (PID: ${process.pid})`);
    } else if (existingPid === process.pid) {
      // Same process, just continue
      logger.trace(`PID file already owned by this process: ${process.pid}`);
    } else {
      try {
        process.kill(existingPid, 0);
        // Process exists, another instance is running
        logger.error(`Another instance is already running (PID: ${existingPid})`);
        process.exit(1);
      } catch (e) {
        // Process doesn't exist, stale PID file, remove it and retry
        logger.info('Removing stale PID file');
        fs.unlinkSync(pidFile);
        fd = fs.openSync(pidFile, 'wx');
        fs.writeSync(fd, process.pid.toString());
        fs.closeSync(fd);
        logger.info(`PID file written: ${pidFile} (PID: ${process.pid})`);
      }
    }
  } catch (readErr) {
    logger.error(`Failed to read PID file: ${readErr.message}`);
    process.exit(1);
  }
}

// Frontend removed, CLI only mode

require('./config/db');

// Pre-load translation module at startup
let translate = null;
try {
  translate = require('./lib/translations');
} catch (err) {
  logger.warn('Chinese translations not available:', err.message);
}

const API_CACHE_TTL = parseInt(process.env.API_CACHE_TTL || '5000');
const watchCache = new Map<string, any>();

const eventsCache = new Map<string, any>();
const EVENTS_CACHE_TTL = parseInt(process.env.EVENTS_CACHE_TTL || '2000');

const rateLimitMap = new Map<string, RateLimitRecord>();
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW || '60000');
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '100');

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  
  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { windowStart: now, count: 1 });
    return true;
  }
  
  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }
  
  record.count++;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now - record.windowStart > RATE_LIMIT_WINDOW) {
      rateLimitMap.delete(ip);
    }
  }
  for (const [key, cached] of watchCache.entries()) {
    if (now - cached.timestamp > API_CACHE_TTL * 2) {
      watchCache.delete(key);
    }
  }
  for (const [key, cached] of eventsCache.entries()) {
    if (now - cached.timestamp > EVENTS_CACHE_TTL * 2) {
      eventsCache.delete(key);
    }
  }
}, 30000);

app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  next();
});

// Serve static files for web UI
app.use(express.static(path.join(__dirname, 'public')));

// CLI only mode - no frontend routes

const activeBots = new Map<string, BotInstance>();
const botConnections = new Map<string, WebSocket>();

const retryQueue = new Map<string, RetryQueueEntry>();
const botLastStates = new Map<string, BotLastState>();
const botServerStartTime = Date.now();

// 根据 botId 或 botName 查找 bot
function findBotByIdOrName(botIdOrName) {
  // 先按 botId 查找
  if (activeBots.has(botIdOrName)) {
    return { bot: activeBots.get(botIdOrName), botId: botIdOrName };
  }
  // 再按 botName (username) 查找
  for (const [botId, bot] of activeBots.entries()) {
    if (bot.bot && bot.bot.username === botIdOrName) {
      return { bot, botId };
    }
  }
  return null;
}

// 中间件：根据 botId 或 botName 查找 bot 并添加到 req
function resolveBot(req, res, next) {
  const botIdOrName = req.params.botId;
  if (!botIdOrName) {
    return next();
  }
  
  const result = findBotByIdOrName(botIdOrName);
  if (!result) {
    return res.status(404).json({ error: 'Bot not found' });
  }
  
  req.bot = result.bot;
  req.botId = result.botId;
  next();
}

// Initialize streaming routes (needs access to activeBots)
const streamRoutes = require('./routes/stream');
app.use('/api', streamRoutesModule.streamRoutes(activeBots));

// Initialize database tables (async - will be awaited in server.listen)

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    serverMode: 'cli-only',
    mcServer: process.env.MINECRAFT_SERVER_HOST || 'localhost',
    mcPort: process.env.MINECRAFT_SERVER_PORT || 25565,
    uptimeSeconds: Math.floor((Date.now() - botServerStartTime) / 1000)
  });
});

// GET /api/goals - 获取所有可用目标
app.get('/api/goals', (req, res) => {
  try {
    const goals = GoalSystem.getAllGoals();
    res.json({
      success: true,
      goals: goals
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/server/logs - Get recent log entries
app.get('/api/server/logs', (req, res) => {
  try {
    const logFile = path.join(__dirname, 'logs', 'bot_server.log');
    if (!fs.existsSync(logFile)) {
      return res.json({ lines: [], total: 0 });
    }
    
    const content = fs.readFileSync(logFile, 'utf8');
    const allLines = content.trim().split('\n').filter(line => line.trim());
    const maxLines = 500;
    const recentLines = allLines.slice(-maxLines);
    
    const parsedLines = recentLines.map(line => {
      let level = 'log';
      let message = line;
      let timestamp = '';
      
      const timestampMatch = line.match(/^\[([^\]]+)\]\s*(.*)/);
      if (timestampMatch) {
        timestamp = timestampMatch[1];
        message = timestampMatch[2];
      }
      
      if (message.startsWith('WARN:')) {
        level = 'warn';
        message = message.replace(/^WARN:\s*/, '');
      } else if (message.toLowerCase().includes('error') || message.toLowerCase().includes('fail') || message.toLowerCase().includes('exception')) {
        level = 'error';
      }
      
      return { timestamp, level, message };
    });
    
    res.json({ lines: parsedLines, total: allLines.length });
  } catch (err) {
    logger.error(`[API] Failed to read logs: ${err.message}`);
    res.status(500).json({ error: 'Failed to read logs' });
  }
});

// GET /api/server/config - Get all current configuration
app.get('/api/server/config', async (req, res) => {
  try {
    const envPath = path.join(__dirname, '.env');
    const envVars = {};
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      envContent.split('\n').forEach(line => {
        line = line.trim();
        if (line && !line.startsWith('#')) {
          const [key, ...valueParts] = line.split('=');
          if (key) envVars[key.trim()] = valueParts.join('=').trim();
        }
      });
    }
    
    const defaults = {
      HOST: process.env.HOST || '0.0.0.0',
      PORT: process.env.PORT || '9500',
      autoReconnectRetries: 3,
      autoReconnectDelay: 10000,
      broadcastInterval: 3000,
      serverStateSaveInterval: 3000,
      botStaleCleanupDays: 30,
      databaseBusyTimeout: 5000,
      botStatusCheckTimeout: 2000,
      minecraftMaxMemory: '1G',
      minecraftJarPath: 'resources/minecraft_server.1.21.11.jar',
      minecraftServerDir: 'resources/',
      logDir: 'logs/',
      defaultBuildingWidth: 5,
      defaultBuildingLength: 5,
      defaultBuildingHeight: 3,
      defaultBuildingBlockType: 'oak_planks',
      defaultGatheringRadius: 10,
      defaultGatheringTargets: ['oak_log', 'cobblestone', 'iron_ore', 'coal_ore'],
      defaultBotMode: 'survival'
    };
    
    res.json({ env: envVars, defaults: defaults, source: process.env });
  } catch (err) {
    logger.error(`[API] Failed to get config: ${err.message}`);
    res.status(500).json({ error: 'Failed to get configuration' });
  }
});

// PUT /api/server/config/env - Update .env variable
app.put('/api/server/config/env', (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) {
      return res.status(400).json({ error: 'Key is required' });
    }
    
    const validKeys = [
      'HOST', 'PORT', 'MINECRAFT_SERVER_HOST', 'MINECRAFT_SERVER_PORT',
      'SESSION_SECRET', 'MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET',
      'LLM_SERVICE_URL', 'VLLM_URL', 'USE_FALLBACK'
    ];
    
    if (!validKeys.includes(key)) {
      return res.status(400).json({ error: `Invalid config key: ${key}` });
    }
    
    const envPath = path.join(__dirname, '.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    
    const keyRegex = new RegExp(`^${key}\\s*=`, 'm');
    if (keyRegex.test(envContent)) {
      envContent = envContent.replace(new RegExp(`^${key}\\s*=.*$`, 'm'), `${key}=${value}`);
    } else {
      envContent += (envContent.endsWith('\n') ? '' : '\n') + `${key}=${value}\n`;
    }
    
    fs.writeFileSync(envPath, envContent, 'utf8');
    
    res.json({
      success: true,
      key,
      value,
      requiresRestart: true,
      message: `Updated ${key}. Server restart required for changes to take effect.`
    });
  } catch (err) {
    logger.error(`[API] Failed to update config: ${err.message}`);
    res.status(500).json({ error: 'Failed to update configuration' });
  }
});

// PUT /api/server/config/database - Update database defaults
app.put('/api/server/config/database', async (req, res) => {
  try {
    const { category, values } = req.body;
    
    if (!category || !values) {
      return res.status(400).json({ error: 'Category and values are required' });
    }
    
    const validCategories = ['building', 'gathering', 'bot_defaults'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ error: `Invalid category: ${category}` });
    }
    
    res.json({
      success: true,
      category,
      values,
      message: `Updated ${category} defaults`
    });
  } catch (err) {
    logger.error(`[API] Failed to update database config: ${err.message}`);
    res.status(500).json({ error: 'Failed to update configuration' });
  }
});

app.get('/api/llm/status', async (req, res) => {
  try {
    const vllmUrl = process.env.VLLM_URL || process.env.LLM_SERVICE_URL || 'http://localhost:8000';
    const enabled = process.env.USE_FALLBACK === 'true' ? false : true;
    
    let available = false;
    let model = null;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch(`${vllmUrl}/v1/models`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json() as { data?: { id: string }[] };
        available = true;
        model = data.data && data.data[0] ? data.data[0].id : null;
      }
    } catch (err) {
      logger.debug(`[LLM] Service availability check failed: ${err.message}`);
    }
    
    res.json({ enabled, vllmUrl, available, model });
  } catch (err) {
    logger.error(`[API] Failed to get LLM status: ${err.message}`);
    res.status(500).json({ error: 'Failed to get LLM status' });
  }
});

app.post('/api/llm/config', async (req, res) => {
  try {
    const { enabled, vllmUrl } = req.body;
    
    if (enabled !== undefined && typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }
    
    if (vllmUrl !== undefined && typeof vllmUrl !== 'string') {
      return res.status(400).json({ error: 'vllmUrl must be a string' });
    }
    
    const envPath = path.join(__dirname, '.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    
    if (vllmUrl !== undefined) {
      const keyRegex = /^VLLM_URL\s*=/m;
      if (keyRegex.test(envContent)) {
        envContent = envContent.replace(/^VLLM_URL\s*=.*$/m, `VLLM_URL=${vllmUrl}`);
      } else {
        envContent += (envContent.endsWith('\n') ? '' : '\n') + `VLLM_URL=${vllmUrl}\n`;
      }
      
      const serviceUrlRegex = /^LLM_SERVICE_URL\s*=/m;
      if (serviceUrlRegex.test(envContent)) {
        envContent = envContent.replace(/^LLM_SERVICE_URL\s*=.*$/m, `LLM_SERVICE_URL=${vllmUrl}`);
      } else {
        envContent += `LLM_SERVICE_URL=${vllmUrl}\n`;
      }
    }
    
    if (enabled !== undefined) {
      const fallbackValue = enabled ? 'false' : 'true';
      const fallbackRegex = /^USE_FALLBACK\s*=/m;
      if (fallbackRegex.test(envContent)) {
        envContent = envContent.replace(/^USE_FALLBACK\s*=.*$/m, `USE_FALLBACK=${fallbackValue}`);
      } else {
        envContent += `USE_FALLBACK=${fallbackValue}\n`;
      }
    }
    
    fs.writeFileSync(envPath, envContent, 'utf8');
    
    const newVllmUrl = vllmUrl || process.env.VLLM_URL || 'http://localhost:8000';
    const newEnabled = enabled !== undefined ? enabled : (process.env.USE_FALLBACK !== 'true');
    
    res.json({
      success: true,
      config: { enabled: newEnabled, vllmUrl: newVllmUrl },
      message: 'LLM configuration updated. Server restart may be required for changes to take effect.'
    });
  } catch (err) {
    logger.error(`[API] Failed to update LLM config: ${err.message}`);
    res.status(500).json({ error: 'Failed to update LLM configuration' });
  }
});

app.post('/api/llm/test', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const vllmUrl = process.env.VLLM_URL || process.env.LLM_SERVICE_URL || 'http://localhost:8000';
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(`${vllmUrl}/v1/models`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    clearTimeout(timeoutId);
    
    const latency = Date.now() - startTime;
    
    if (response.ok) {
      res.json({ success: true, latency, error: null });
    } else {
      res.json({ success: false, latency, error: `HTTP ${response.status}: ${response.statusText}` });
    }
  } catch (err) {
    const latency = Date.now() - startTime;
    let errorMessage = err.message;
    
    if (err.name === 'AbortError') {
      errorMessage = 'Connection timeout';
    } else if (err.cause && err.cause.code === 'ECONNREFUSED') {
      errorMessage = 'Connection refused - is the vLLM service running?';
    } else if (err.cause) {
      errorMessage = err.cause.message;
    }
    
    res.json({ success: false, latency, error: errorMessage });
  }
});

app.get('/api/llm/models', async (req, res) => {
  try {
    const vllmUrl = process.env.VLLM_URL || process.env.LLM_SERVICE_URL || 'http://localhost:8000';
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${vllmUrl}/v1/models`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const data = await response.json() as { data?: { id: string }[] };
      const models = data.data ? data.data.map(m => m.id) : [];
      res.json({ models });
    } else {
      res.status(502).json({ error: `Failed to fetch models: HTTP ${response.status}` });
    }
  } catch (err) {
    logger.error(`[API] Failed to get LLM models: ${err.message}`);
    res.status(500).json({ error: `Failed to connect to LLM service: ${err.message}` });
  }
});

// GET /api/server/status - Get server runtime status
app.get('/api/server/status', (req, res) => {
  const uptimeSeconds = Math.floor((Date.now() - botServerStartTime) / 1000);
  
  res.json({
    uptime: uptimeSeconds,
    pid: process.pid,
    activeBots: activeBots.size,
    retryQueueSize: retryQueue.size,
    verbose: verbose,
    startTime: new Date(botServerStartTime).toISOString(),
    memoryUsage: process.memoryUsage(),
    port: PORT,
    host: HOST
  });
});

// POST /api/server/stop - Stop the server
app.post('/api/server/stop', (req, res) => {
  logger.info('[Server] Received stop request via API');
  res.json({ status: 'stopping', message: 'Server is shutting down' });
  setTimeout(() => {
    shutdown();
  }, 100);
});

app.get('/api/bots', async (req, res) => {
  const showAll = req.query.all === 'true';
  
  let bots = [];
  
  if (showAll) {
    try {
      const dbBots = await BotState.getAllBots();
      bots = dbBots.map(bot => ({
        botId: bot.bot_id,
        username: bot.username,
        status: bot.status,
        state: bot.status === 'active' ? 'ALIVE' : 'STOPPED',
        mode: bot.mode,
        health: bot.health,
        food: bot.food,
        position_x: bot.position_x,
        position_y: bot.position_y,
        position_z: bot.position_z,
        created_at: bot.created_at,
        updated_at: bot.updated_at
      }));
    } catch (err) {
      logger.error('[API] Error fetching all bots from DB:', err);
      bots = [];
    }
  } else {
    bots = Array.from(activeBots.entries()).map(([botId, bot]) => {
      if (!bot.bot) return null;
      
      return {
        botId: botId,
        username: bot.bot.username,
        connected: bot.isConnected,
        state: !bot.bot.isAlive ? 'DEAD' : (bot.isConnected ? 'ALIVE' : 'DISCONNECTED'),
        mode: bot.currentMode || null,
        deadReason: bot.deadReason || null,
        health: bot.bot.health,
        maxHealth: 20,
        food: bot.bot.food,
        foodSaturation: bot.bot.foodSaturation,
        position: bot.bot.entity.position,
        gameMode: bot.bot.gameMode === 0 ? 'survival' : 'creative',
        joinedAt: bot.botTime || bot.bot.joinTime || null
      };
    }).filter(Boolean);
  }
  
  res.json({
    count: bots.length,
    bots: bots
  });
});

app.post('/api/bot/start', async (req, res) => {
  try {
    const { username } = req.body;
    const enableLLM = process.env.USE_LLM === 'true';
    
    logger.info(`[API] Received request to start bot with username: ${username}`);
    
    if (!username) {
      logger.error('[API] Error: Username is required');
      return res.status(400).json({ error: 'Username is required' });
    }
    
    const validUsername = /^[a-zA-Z0-9_]{3,16}$/.test(username);
    if (!validUsername) {
      logger.error(`[API] Error: Invalid username format: ${username}`);
      return res.status(400).json({ error: 'Invalid username format (3-16 characters, letters, numbers, underscores)' });
    }
    
    // Check for bot name uniqueness (including stopped bots)
    // Check active bots in memory
    for (const [activeBotId, activeBot] of activeBots) {
      if (activeBot.username === username) {
        logger.error(`[API] Error: Bot with username ${username} is already running`);
        return res.status(409).json({ 
          error: `Bot "${username}" is already running. Stop it first or use a different name.`,
          existingBotId: activeBotId
        });
      }
    }
    
    // Check bots in database (including stopped)
    const allDbBots = await BotState.getAllBots();
    const existingBot = allDbBots.find(b => b.username === username);
    if (existingBot) {
      logger.error(`[API] Error: Bot with username ${username} already exists in database`);
      return res.status(409).json({ 
        error: `Bot "${username}" already exists (status: ${existingBot.status}). Use a different name or restart the existing bot.`,
        existingBotId: existingBot.bot_id,
        status: existingBot.status
      });
    }
    
    const mcHost = process.env.MINECRAFT_SERVER_HOST || 'localhost';
    const mcPort = parseInt(process.env.MINECRAFT_SERVER_PORT || '25565');
      logger.info(`[API] Creating bot instance for host: ${mcHost}:${mcPort}`);
      logger.trace('[API] Loading bot/index.js from:', require.resolve('./bot/index'));
    const MinecraftBot = require('./bot/index').default;
    const bot = new MinecraftBot({ 
      host: mcHost, 
      port: mcPort,
      botServerHost: process.env.HOST || 'localhost',
      botServerPort: process.env.PORT || 9500,
      enableLLM: enableLLM || false
    });
    
      logger.trace('[API] Bot instance created, botId from constructor:', bot.botId);
      const botId = `bot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      bot.botId = botId;
      logger.trace('[API] After setting botId:', bot.botId);
      
      logger.info(`[API] Attempting to connect bot...`);
    await bot.connect(username, null, true);
    
    activeBots.set(botId, bot);
    
      logger.info(`[API] Bot started successfully with ID: ${botId}`);
    
    // 自动开启自动目标模式
    try {
      const goalState = GoalSystem.createGoalState('basic_survival', botId);
      bot.goalState = goalState;
      bot.currentMode = 'auto';
      await BotGoal.saveGoal(botId, 'basic_survival', goalState);
      logger.info(`[API] Auto mode enabled for bot ${botId} with goal: basic_survival`);
    } catch (autoErr) {
      logger.error(`[API] Failed to enable auto mode: ${autoErr.message}`);
    }
    
    res.json({ 
      success: true, 
      botId,
      username,
      mode: 'auto',
      message: 'Bot started successfully with auto mode enabled'
    });
    
    // Save bot state to persistent store (after bot is ready)
    setTimeout(async () => {
      try {
        if (bot.bot && bot.bot.entity && bot.bot.entity.position) {
          const position = bot.bot.entity.position;
          await BotState.saveBot(botId, {
            username: bot.bot.username,
            mode: 'auto',
            position_x: position.x,
            position_y: position.y,
            position_z: position.z,
            health: bot.bot.health,
            food: bot.bot.food,
            status: 'active'
          });
            logger.info(`[API] Bot state saved successfully`);
          
          // Start automatic behavior automatically
          bot.currentMode = 'autonomous';
          console.log('[API] Calling automaticBehavior for', botId);
          bot.behaviors.automaticBehavior({ 
            mode: 'autonomous',
            initialGoal: 'basic_survival'
          }).then(() => {
            console.log('[API] automaticBehavior completed for', botId);
          }).catch(err => {
            console.error('[API] Error in automatic behavior:', err.message, err.stack);
            logger.error(`[API] Error in automatic behavior: ${err.message}`);
          });
            logger.info(`[API] Automatic behavior started for bot ${botId}`);
        }
      } catch (saveErr) {
        logger.error(`[API] Failed to save bot state: ${saveErr.message}`);
      }
    }, 2000);
  } catch (error) {
      logger.error('Error starting bot:', error);
      logger.error('Error stack:', error.stack);
    res.status(500).json({ error: `Failed to start bot: ${error.message}` });
  }
});

app.post('/api/bot/automatic', async (req, res) => {
  try {
    const { username, mode, initialGoal, botId } = req.body;
    
    if (!username && !botId) {
      return res.status(400).json({ error: 'Username or botId is required' });
    }
    
    let botEntry;
    if (botId) {
      botEntry = Array.from(activeBots.entries()).find(([bid, b]) => bid === botId);
    } else {
      botEntry = Array.from(activeBots.entries()).find(([bid, b]) => b.bot && b.bot.username === username);
    }
    
    if (!botEntry) {
      return res.status(404).json({ error: 'Bot not found. Use "bot start" to create a bot first.' });
    }
    
    const bot = botEntry[1];
    const foundBotId = botEntry[0];
    
    const targetBotId = botId || foundBotId;
    
    // Set initial goal if provided
    if (initialGoal) {
      const goalState = GoalSystem.createGoalState(initialGoal, targetBotId);
      bot.goalState = goalState;
      
      // Save to database
      await BotGoal.saveGoal(targetBotId, initialGoal, goalState);
    }
    
    // Track current mode
    bot.currentMode = mode || 'survival';
    
    // Save bot state
    try {
      const position = bot.bot.entity.position;
      await BotState.saveBot(targetBotId, {
        username: bot.bot.username,
        mode: mode || 'auto',
        position_x: position.x,
        position_y: position.y,
        position_z: position.z,
        health: bot.bot.health,
        food: bot.bot.food,
        status: 'active'
      });
    } catch (saveErr) {
      logger.error(`[API] Failed to save bot state: ${saveErr.message}`);
    }
    
    // Start automatic behavior
    bot.behaviors.automaticBehavior({ 
      mode: 'autonomous',
      initialGoal: initialGoal || 'basic_survival'
    }).catch(err => {
      logger.error('Error in automatic behavior:', err);
    });
    
    res.json({ 
      success: true,
      botId: targetBotId,
      username: bot.bot.username,
      goal: initialGoal || 'basic_survival',
      message: `Automatic behavior started in ${mode || 'survival'} mode with goal: ${initialGoal || 'basic_survival'}`
    });
  } catch (error) {
    logger.error('Error starting automatic behavior:', error);
    res.status(500).json({ error: `Failed to start automatic behavior: ${error.message}` });
  }
});

app.post('/api/bot/:botId/goal/select', async (req, res) => {
  try {
    const { botId } = req.params;
    const { goalId } = req.body;
    
    // Validate goalId
    if (!goalId || typeof goalId !== 'string' || goalId.trim() === '') {
      return res.status(400).json({ error: 'Valid goalId is required' });
    }
    
    const bot = activeBots.get(botId);
    if (!bot) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    
    const goalState = GoalSystem.createGoalState(goalId, botId);
    bot.goalState = goalState;
    
    // Save to database
    await BotGoal.saveGoal(botId, goalId, goalState);
    
    // Update autonomous behavior if running
    if (bot.autonomousRunning) {
      bot.goalChanged = true;
    }
    
    res.json({
      success: true,
      goalId,
      goalName: GoalSystem.getGoal(goalId).name,
      message: `Goal changed to: ${GoalSystem.getGoal(goalId).name}`
    });
  } catch (error) {
    logger.error('Error changing goal:', error);
    res.status(500).json({ error: `Failed to change goal: ${error.message}` });
  }
});

app.get('/api/bot/:botId/goal/status', async (req, res) => {
  try {
    const { botId } = req.params;
    
    const bot = activeBots.get(botId);
    const goalState = bot?.goalState;
    
    if (!goalState) {
      const dbGoal = await BotGoal.getGoal(botId);
      if (dbGoal) {
        return res.json({
          success: true,
          goalState: dbGoal.goal_state,
          progress: dbGoal.progress
        });
      }
      return res.status(404).json({ error: 'No goal set for this bot' });
    }
    
    const inventory = bot.bot?.inventory?.items() || [];
    const progress = GoalSystem.calculateProgress(goalState, inventory);
    
    res.json({
      success: true,
      goalState,
      progress: progress.progress,
      details: progress
    });
  } catch (error) {
    logger.error('Error getting goal status:', error);
    res.status(500).json({ error: `Failed to get goal status: ${error.message}` });
  }
});

app.post('/api/bot/:botId/stop', async (req, res) => {
  try {
    const { botId } = req.params;
    const { reason } = req.body;
    const bot = activeBots.get(botId);
    
    if (!bot) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    
    await bot.disconnect();
    activeBots.delete(botId);
    
    const stopReason = reason || 'manual';
    
    try {
      const botData = await BotState.getBot(botId);
      await BotState.saveBot(botId, {
        ...botData,
        status: 'stopped',
        stop_reason: stopReason
      });
    } catch (saveErr) {
        logger.error(`[API] Failed to update bot state: ${saveErr.message}`);
    }
    
    res.json({
      success: true,
      message: 'Bot stopped successfully',
      stop_reason: stopReason
    });
  } catch (error) {
      logger.error('Error stopping bot:', error);
    res.status(500).json({ error: `Failed to stop bot: ${error.message}` });
  }
});

app.post('/api/bot/:botId/restart', async (req, res) => {
  try {
    const { botId } = req.params;
    
    const savedBot = await BotState.getBotById(botId);
    
    if (!savedBot) {
      return res.status(404).json({ error: 'Bot not found in database' });
    }
    
    if (activeBots.has(botId)) {
      return res.status(400).json({ error: 'Bot is already running' });
    }
    
    const mcHost = process.env.MINECRAFT_SERVER_HOST || 'localhost';
    const mcPort = parseInt(process.env.MINECRAFT_SERVER_PORT || '25565');
    const MinecraftBot = require('./bot/index').default;
    const bot = new MinecraftBot({ 
      host: mcHost, 
      port: mcPort,
      botServerHost: process.env.HOST || 'localhost',
      botServerPort: process.env.PORT || 9500
    });
    
      logger.info(`[API] Attempting to restart bot: ${savedBot.username} (${botId})`);
    
    await bot.connect(savedBot.username, null, savedBot.mode === 'survival');
    
    activeBots.set(botId, bot);
    
    // Update bot status to active
    try {
      const position = bot.bot.entity.position;
      await BotState.saveBot(botId, {
        username: bot.bot.username,
        mode: savedBot.mode || 'survival',
        position_x: position.x,
        position_y: position.y,
        position_z: position.z,
        health: bot.bot.health,
        food: bot.bot.food,
        status: 'active'
      });
    } catch (saveErr) {
        logger.error(`[API] Failed to save bot state: ${saveErr.message}`);
    }
    
      logger.info(`[API] Bot restarted successfully: ${botId}`);
    
    res.json({
      success: true,
      botId,
      username: savedBot.username,
      message: 'Bot restarted successfully'
    });
  } catch (error) {
      logger.error('Error restarting bot:', error);
    res.status(500).json({ error: `Failed to restart bot: ${error.message}` });
  }
});

app.post('/api/bot/cleanup', async (req, res) => {
  try {
    const { daysOld } = req.body || { daysOld: 30 };
    
    const deleted = await BotState.cleanupOldBots(daysOld);
    
      logger.info(`[API] Cleanup completed: ${deleted} stale bot entries removed`);
    
    res.json({
      success: true,
      deleted,
      message: `Removed ${deleted} stale bot entries older than ${daysOld} days`
    });
  } catch (error) {
    logger.error('Error cleaning up bots:', error);
    res.status(500).json({ error: `Failed to cleanup bots: ${error.message}` });
  }
});

app.delete('/api/bots', async (req, res) => {
  try {
    // Disconnect all active bots
    for (const [botId, bot] of activeBots.entries()) {
      try {
        await bot.disconnect();
      } catch (err) {
        logger.error(`[API] Failed to disconnect bot ${botId}: ${err.message}`);
      }
      activeBots.delete(botId);
    }
    
    // Clear the retry queue to prevent auto-reconnect
    retryQueue.clear();
    
    // Delete all bots from database in a single transaction
    const bots = await BotState.getAllBots();
      logger.info(`[API] Found ${bots.length} bots to remove`);
    
    // First, stop all bots to prevent auto-reconnect
    for (const bot of bots) {
      try {
        await BotState.updateBotStatus(bot.bot_id, 'stopped');
      } catch (err) {
        logger.error(`[API] Failed to stop bot ${bot.bot_id}: ${err.message}`);
      }
    }
    
    // Then delete all bots
    const removedCount = await BotState.deleteAllBots();
    
      logger.info(`[API] All bots removed: ${removedCount} bots removed`);
    
    res.json({
      success: true,
      removed: removedCount,
      message: `Removed ${removedCount} bots from database and server`
    });
  } catch (error) {
      logger.error('Error removing all bots:', error);
    res.status(500).json({ error: `Failed to remove all bots: ${error.message}` });
  }
});

app.delete('/api/bot/:botId', async (req, res) => {
  try {
    const { botId } = req.params;
    
    const bot = activeBots.get(botId);
    
    if (bot) {
      await bot.disconnect();
      activeBots.delete(botId);
    }
    
    await BotState.updateBotStatus(botId, 'stopped');
    const deleted = await BotState.deleteBot(botId);
    
      logger.info(`[API] Bot removed: ${botId}`);
    
    res.json({
      success: true,
      deleted,
      message: `Bot ${botId} removed successfully`
    });
  } catch (error) {
      logger.error('Error removing bot:', error);
    res.status(500).json({ error: `Failed to remove bot: ${error.message}` });
  }
});

// ===================== INSPECT API ENDPOINT =====================

// GET /api/bot/:botId/inspect - Get detailed bot behavior information
app.get('/api/bot/:botId/inspect', async (req, res) => {
  try {
    const { botId } = req.params;
    const bot = activeBots.get(botId);
    
    if (!bot) {
      return res.status(404).json({ 
        error: 'Bot not found',
        availableBots: Array.from(activeBots.keys())
      });
    }
    
    if (!bot.bot) {
      return res.status(404).json({ 
        error: 'Bot not fully initialized',
        availableBots: Array.from(activeBots.keys())
      });
    }
    
    // Get basic bot data
    const botData = {
      botId: botId,
      username: bot.bot.username,
      connected: bot.isConnected,
      state: !bot.bot.isAlive ? 'DEAD' : (bot.isConnected ? 'ALIVE' : 'DISCONNECTED'),
      mode: bot.currentMode || null,
      deadReason: bot.deadReason || null,
      health: bot.bot.health,
      maxHealth: 20,
      food: bot.bot.food,
      foodSaturation: bot.bot.foodSaturation || 0,
      position: bot.bot.entity.position,
      gameMode: bot.bot.gameMode === 0 ? 'survival' : 'creative',
      joinedAt: bot.botTime || bot.bot.joinTime || null
    };
    
    // Get inventory breakdown
    const inventory = bot.bot.inventory.items();
    const inventoryBreakdown = {};
    inventory.forEach(item => {
      if (!inventoryBreakdown[item.name]) {
        inventoryBreakdown[item.name] = { count: 0, items: [] };
      }
      inventoryBreakdown[item.name].count += item.count;
      inventoryBreakdown[item.name].items.push({
        name: item.name,
        count: item.count,
        metadata: item.metadata
      });
    });
    
    // Get movement state
    const movementState = {
      position: bot.bot.entity.position,
      isMoving: bot.bot.movementState?.isMoving || false,
      target: bot.pathfinder?.target || null,
      pathQueueLength: bot.pathfinder?.path?.length || 0,
      recentTravelDistance: 0 // Would need to track this
    };
    
    // Get behavior state
    const behaviorState = {
      autonomousRunning: bot.autonomousRunning || false,
      currentGoal: bot.goalState?.currentGoal || null,
      goalProgress: bot.goalState ? (bot.goalState.progress || 0) : 0,
      currentAction: bot.behaviors?.currentAction || null
    };
    
    res.json({
      success: true,
      bot: botData,
      inventory: {
        totalItems: inventory.length,
        breakdown: inventoryBreakdown,
        itemCount: Object.values(inventoryBreakdown).reduce((sum: number, v: any) => sum + (v.count || 0), 0)
      },
      movement: movementState,
      behavior: behaviorState
    });
  } catch (error) {
    logger.error('Error getting bot inspect data:', error);
    res.status(500).json({ error: `Failed to get inspect data: ${error.message}` });
  }
});

// ===================== BOT WATCH API ENDPOINTS =====================

// GET /api/bot/:botId/events - Get recent bot events
app.get('/api/bot/:botId/events', async (req, res) => {
  try {
    const { botId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    
    const bot = activeBots.get(botId);
    if (!bot) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    
    const events = await BotState.getEvents(botId, limit);
    
    res.json({
      success: true,
      botId,
      count: events.length,
      events: events.map(e => ({
        id: e.id,
        type: e.event_type,
        message: e.message,
        data: e.data ? JSON.parse(e.data) : null,
        timestamp: e.created_at
      }))
    });
  } catch (error) {
    logger.error('Error getting bot events:', error);
    res.status(500).json({ error: `Failed to get bot events: ${error.message}` });
  }
});

// GET /api/bot/:botId/watch - Get comprehensive bot status for watch mode
app.get('/api/bot/:botId/watch', async (req, res) => {
  try {
    const { botId } = req.params;
    const eventLimit = Math.min(parseInt(req.query.events as string) || 50, 200);
    const useChinese = req.query.lang === 'zh' || req.query.language === 'zh' || req.query.chinese === 'true';
    
    const bot = activeBots.get(botId);
    if (!bot) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    
    // bot.bot must exist for the watch endpoint to work
    if (!bot.bot) {
      return res.status(404).json({ error: 'Bot not fully initialized' });
    }
    
    const cacheKey = `${botId}:${eventLimit}:${useChinese}`;
    const cached = watchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < API_CACHE_TTL) {
      return res.json(cached.data);
    }
    
    let pos = null;
    let posValid = false;
    
    const extractPosition = (rawPos) => {
      if (!rawPos) return null;
      const x = rawPos.x, y = rawPos.y, z = rawPos.z;
      if (x != null && y != null && z != null && 
          !isNaN(x) && !isNaN(y) && !isNaN(z)) {
        return { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) };
      }
      return null;
    };
    
    pos = extractPosition(bot.bot.position) || extractPosition(bot.bot.entity?.position) || null;
    posValid = pos !== null;
    
    if (!posValid) {
      logger.warn(`[watch] position detection failed - bot.position: ${!!bot.bot.position}, entity.position: ${!!bot.bot.entity?.position}`);
      pos = { x: 0, y: 0, z: 0 };
    }
    
    // Helper function to apply translations to response data
    const applyTranslations = (data) => {
      if (!translate || !useChinese) return data;
      
      const translated = { ...data };
      
      // Translate basic string fields
      if (translated.state && typeof translated.state === 'string') {
        translated.state = translate.translateToChinese(translated.state);
      }
      if (translated.mode && typeof translated.mode === 'string') {
        translated.mode = translate.translateToChinese(translated.mode);
      }
      if (translated.gameMode && typeof translated.gameMode === 'string') {
        translated.gameMode = translate.translateToChinese(translated.gameMode);
      }
      
      // Translate attributes
      if (translated.attributes && translated.attributes.armor && translated.attributes.armor.pieces) {
        translated.attributes.armor.pieces = translated.attributes.armor.pieces.map(piece => ({
          ...piece,
          name: translate.translateToChinese(piece.name)
        }));
      }
      
      // Translate resources
      if (translated.resources) {
        // Translate inventory items
        if (translated.resources.inventory) {
          translated.resources.inventory = translated.resources.inventory.map(item => ({
            ...item,
            name: translate.translateToChinese(item.name)
          }));
        }
        
        // Translate resource summary keys
        if (translated.resources.summary) {
          const translatedSummary = {};
          Object.entries(translated.resources.summary).forEach(([key, value]) => {
            const translatedKey = translate.translateToChinese(key);
            translatedSummary[translatedKey] = value;
          });
          translated.resources.summary = translatedSummary;
        }
      }
      
      // Translate environment
      if (translated.environment) {
        if (translated.environment.position && translated.environment.position.world) {
          translated.environment.position.world = translate.translateToChinese(translated.environment.position.world);
        }
        if (translated.environment.position && translated.environment.position.biome) {
          translated.environment.position.biome = translate.translateToChinese(translated.environment.position.biome);
        }
        if (translated.environment.time && translated.environment.time.formattedTime) {
          translated.environment.time.formattedTime = translate.translateToChinese(translated.environment.time.formattedTime);
        }
        if (translated.environment.conditions && translated.environment.conditions.dimension) {
          translated.environment.conditions.dimension = translate.translateToChinese(translated.environment.conditions.dimension);
        }
        if (translated.environment.conditions && translated.environment.conditions.difficulty) {
          translated.environment.conditions.difficulty = translate.translateToChinese(translated.environment.conditions.difficulty);
        }
        
        // Translate nearby entities
        if (translated.environment.nearby && translated.environment.nearby.entities) {
          translated.environment.nearby.entities = translated.environment.nearby.entities.map(entity => 
            translate.translateEntity(entity)
          );
        }
      }
      
      // Translate goal info
      if (translated.goal && translated.goal.currentGoal) {
        translated.goal.currentGoal = translate.translateToChinese(translated.goal.currentGoal);
      }
      if (translated.goal && translated.goal.details && translated.goal.details.materials) {
        const translatedMaterials = {};
        Object.entries(translated.goal.details.materials).forEach(([key, value]) => {
          const translatedKey = translate.translateToChinese(key);
          translatedMaterials[translatedKey] = value;
        });
        translated.goal.details.materials = translatedMaterials;
      }
      
      // Translate autonomous state
      if (translated.autonomousState) {
        if (translated.autonomousState.currentAction) {
          translated.autonomousState.currentAction = translate.translateToChinese(translated.autonomousState.currentAction);
        }
        if (translated.autonomousState.decisionReason) {
          translated.autonomousState.decisionReason = translate.translateToChinese(translated.autonomousState.decisionReason);
        }
        if (translated.autonomousState.priority) {
          translated.autonomousState.priority = translate.translateToChinese(translated.autonomousState.priority);
        }
        if (translated.autonomousState.healthStatus) {
          translated.autonomousState.healthStatus = translate.translateToChinese(translated.autonomousState.healthStatus);
        }
        if (translated.autonomousState.threatLevel) {
          translated.autonomousState.threatLevel = translate.translateToChinese(translated.autonomousState.threatLevel);
        }
      }
      
      return translated;
    };
    
    // Get bot state attributes
    const health = bot.bot.health || 0;
    const food = bot.bot.food || 0;
    const foodSaturation = bot.bot.foodSaturation || 0;
    const experience = bot.bot.experience || { level: 0, points: 0, progress: 0 };
    const gameMode = bot.bot.gameMode === 0 ? 'survival' : 'creative';
    
    // Get armor information
    const armor = [];
    let armorValue = 0;
    // Only include actual armor items (not regular blocks/items like dirt)
    const armorItemNames = [
      'helmet', 'chestplate', 'leggings', 'boots',
      'diamond_helmet', 'diamond_chestplate', 'diamond_leggings', 'diamond_boots',
      'iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots',
      'gold_helmet', 'gold_chestplate', 'gold_leggings', 'gold_boots',
      'leather_helmet', 'leather_chestplate', 'leather_leggings', 'leather_boots',
      'chainmail_helmet', 'chainmail_chestplate', 'chainmail_leggings', 'chainmail_boots',
      'netherite_helmet', 'netherite_chestplate', 'netherite_leggings', 'netherite_boots',
      'turtle_helmet', 'iron_chainmail'
    ];
    if (bot.bot.inventory && bot.bot.inventory.slots) {
      // Armor slots are typically 36-39 in inventory
      for (let i = 36; i <= 39; i++) {
        const slot = bot.bot.inventory.slots[i];
        if (slot) {
          // Only include items that are actually armor (not dirt, blocks, etc.)
          const itemName = slot.name.replace('minecraft:', '');
          const isArmorItem = armorItemNames.some(armorName => itemName.includes(armorName));
          if (isArmorItem) {
            armor.push({
              slot: i - 36, // Convert to armor slot index (0-3)
              name: slot.name,
              count: slot.count,
              durability: slot.durability,
              maxDurability: slot.maxDurability || 0
            });
            // Simple armor value calculation based on armor type
            if (slot.name.includes('diamond') || slot.name.includes('netherite')) armorValue += 3;
            else if (slot.name.includes('iron')) armorValue += 2;
            else if (slot.name.includes('chainmail') || slot.name.includes('gold')) armorValue += 1.5;
            else if (slot.name.includes('leather') || slot.name.includes('turtle')) armorValue += 1;
          }
        }
      }
    }
    
    // Get inventory/resources
    const inventory = [];
    const resources = {};
    let inventoryItems = [];
    if (bot.bot.inventory && bot.bot.inventory.items) {
      inventoryItems = bot.bot.inventory.items();
      inventoryItems.forEach(item => {
        if (item && item.name) {
          inventory.push({
            name: item.name,
            count: item.count,
            slot: item.slot,
            metadata: item.metadata
          });
          
          // Track resource counts
          const resourceName = item.name.split(':').pop(); // Remove 'minecraft:' prefix if present
          if (!resources[resourceName]) {
            resources[resourceName] = 0;
          }
          resources[resourceName] += item.count;
        }
      });
    }
    
    // Get environment information
    const environment: any = {
      timeOfDay: bot.bot.time ? bot.bot.time.timeOfDay || 0 : 0,
      isDay: bot.bot.time ? (bot.bot.time.timeOfDay || 0) < 13000 : true, // Daytime is 0-12000 ticks
      isNight: bot.bot.time ? (bot.bot.time.timeOfDay || 0) >= 13000 : false,
      isRaining: bot.bot.isRaining || false,
      isThundering: bot.bot.isThundering || false,
      dimension: bot.bot.game.dimension || 'overworld',
      difficulty: bot.bot.game.difficulty || 'normal'
    };
    
    // Check if bot is in water
    const botEntity = bot.bot.entity as any;
    const isInWater = botEntity && typeof botEntity.isInWater === 'function' ? botEntity.isInWater() : false;
    environment.isInWater = isInWater;
    
    // Get nearby entities (limited to 10 for performance)
    const nearbyEntities = [];
    const ENTITY_SCAN_DISTANCE = 20;
    const ENTITY_SCAN_DISTANCE_SQ = ENTITY_SCAN_DISTANCE * ENTITY_SCAN_DISTANCE;
    
    if (bot.bot.entities && pos) {
      const posX = pos.x, posY = pos.y, posZ = pos.z;
      const entities = Object.values(bot.bot.entities) as any[];
      const maxEntities = 50;
      const limitedEntities = entities.slice(0, maxEntities);
      const selfEntity = bot.bot.entity as any;

      for (const entity of limitedEntities) {
        if (entity !== selfEntity && entity.position) {
          const dx = entity.position.x - posX;
          const dy = entity.position.y - posY;
          const dz = entity.position.z - posZ;
          const distSq = dx*dx + dy*dy + dz*dz;
          
          if (distSq < ENTITY_SCAN_DISTANCE_SQ) {
            const distance = Math.sqrt(distSq);
            
            // In Mineflion: entity.name is the entity type (e.g., "spider", "zombie"), 
            // entity.displayName is the display name, entity.type is the category (hostile, passive, etc.)
            const entityName = entity.name || 'unknown';
            const entityDisplayName = entity.displayName || entityName;
            
            const entityInfo: any = {
              type: entityName,  // Use entity.name as the type (spider, zombie, etc.)
              id: entity.id,
              displayName: entityDisplayName,  // Use displayName for human-readable name
              distance: Math.round(distance * 10) / 10,
              position: {
                x: Math.floor(entity.position.x),
                y: Math.floor(entity.position.y),
                z: Math.floor(entity.position.z)
              }
            };
            
            // Categorize based on entity name (more reliable than entity.type)
            // Check for players first
            if (entity.type === 'player' || entityName === 'player') {
              entityInfo.category = 'player';
            }
            // Friendly/passive animals
            else if (entityName.includes('cow') || 
                     entityName.includes('pig') ||
                     entityName.includes('sheep') || 
                     entityName.includes('chicken') ||
                     entityName.includes('villager') ||
                     entityName.includes('horse') ||
                     entityName.includes('donkey') ||
                     entityName.includes('mule') ||
                     entityName.includes('llama') ||
                     entityName.includes('rabbit') ||
                     entityName.includes('parrot') ||
                     entityName.includes('cat') ||
                     entityName.includes('wolf') ||
                     entityName.includes('ocelot') ||
                     entityName.includes('panda') ||
                     entityName.includes('fox') ||
                     entityName.includes('bee') ||
                     entityName.includes('squid') ||
                     entityName.includes('turtle') ||
                     entityName.includes('dolphin') ||
                     entityName.includes('mooshroom') ||
                     entityName.includes('strider') ||
                     entityName.includes('axolotl') ||
                     entityName.includes('goat') ||
                     entityName.includes('sniffer')) {
              entityInfo.category = 'friendly';
            }
            // Hostile mobs
            else if (entityName.includes('zombie') || 
                     entityName.includes('skeleton') || 
                     entityName.includes('creeper') ||
                     entityName.includes('spider') || 
                     entityName.includes('witch') ||
                     entityName.includes('enderman') ||
                     entityName.includes('slime') ||
                     entityName.includes('magma') ||
                     entityName.includes('blaze') ||
                     entityName.includes('ghast') ||
                     entityName.includes('wither') ||
                     entityName.includes('phantom') ||
                     entityName.includes('pillager') ||
                     entityName.includes('vindicator') ||
                     entityName.includes('evoker') ||
                     entityName.includes('vex') ||
                     entityName.includes('ravager') ||
                     entityName.includes('hoglin') ||
                     entityName.includes('zoglin') ||
                     entityName.includes('piglin') ||
                     entityName.includes('drowned') ||
                     entityName.includes('husk') ||
                     entityName.includes('stray') ||
                     entityName.includes('guardian') ||
                     entityName.includes('shulker') ||
                     entityName.includes('elder')) {
              entityInfo.category = 'hostile';
            }
            // Ambient mobs (bats)
            else if (entityName.includes('bat')) {
              entityInfo.category = 'ambient';
            }
            // Water mobs
            else if (entityName.includes('squid') ||
                     entityName.includes('glow_squid') ||
                     entityName.includes('dolphin') ||
                     entityName.includes('axolotl') ||
                     entityName.includes('fish') ||
                     entityName.includes('puffer') ||
                     entityName.includes('salmon') ||
                     entityName.includes('tropical')) {
              entityInfo.category = 'water';
            }
            // Neutral mobs (iron golem, snow golem, wolf when not tamed, etc.)
            else if (                     entityName.includes('iron_golem') ||
                     entityName.includes('snow_golem') ||
                     entityName.includes('wolf') ||
                     entityName.includes('polar_bear')) {
              entityInfo.category = 'neutral';
            }
            // Item entities (dropped items)
            else if (entityName === 'item' || entityName === 'dropped_item') {
              entityInfo.category = 'item';
            }
            // Vehicle entities
            else if (entityName.includes('minecart') || 
                     entityName.includes('boat') ||
                     entityName.includes('horse') ||
                     entityName.includes('donkey') ||
                     entityName.includes('mule')) {
              entityInfo.category = 'vehicle';
            }
            else {
              // Use the entity.type category if available
              entityInfo.category = entity.type || 'neutral';
            }
            
            nearbyEntities.push(entityInfo);
          }
        }
      }
      
      // Sort by distance
      nearbyEntities.sort((a, b) => a.distance - b.distance);
    }
    
    // Check for nearby villages - look for villagers AND village structures
    let nearbyVillages = false;
    
    // First check for villagers
    const nearbyVillagers = nearbyEntities.filter(e => 
      e.type === 'villager' || e.displayName === 'Villager'
    ).length > 0;
    
    // If no villagers found, check for village structures (chests, beds, crafting tables, furnaces)
    if (nearbyVillagers) {
      nearbyVillages = true;
    } else if (bot && bot.bot && bot.bot.findBlocks) {
      try {
        const villageStructures = [
          'chest', 'trapped_chest', 'ender_chest',
          'bed', 'white_bed', 'orange_bed', 'magenta_bed', 'light_blue_bed',
          'yellow_bed', 'lime_bed', 'pink_bed', 'gray_bed', 'light_gray_bed',
          'cyan_bed', 'purple_bed', 'blue_bed', 'brown_bed', 'green_bed',
          'red_bed', 'black_bed',
          'crafting_table', 'furnace', 'blast_furnace', 'smoker',
          'loom', 'cartography_table', 'smithing_table', 'grindstone',
          'stonecutter', 'bell', 'lantern', 'torch'
        ];
        
        const villageDetectionRadius = parseInt(process.env.VILLAGE_SCAN_RADIUS || '24');
        
        // Single scan for all village structure types
        const foundStructures = bot.bot.findBlocks({
          point: bot.bot.entity.position,
          matching: villageStructures,
          maxDistance: villageDetectionRadius,
          minCount: 1
        });
        
        if (foundStructures && foundStructures.length > 0) {
          nearbyVillages = true;
        }
        
      } catch (error) {
        logger.error(`Error scanning for village structures: ${error.message}`);
        // Fall back to just villagers check
        nearbyVillages = false;
      }
    }
    
    // Check for nearby resources (valuable blocks within scanning radius)
    const nearbyResources = [];
    const nearbyDrops = [];
    
    if (bot && bot.bot && bot.bot.findBlocks) {
      try {
        // Define valuable resources to scan for - expanded list
        const valuableResources = [
          // Ores
          'diamond_ore', 'iron_ore', 'gold_ore', 'emerald_ore', 'coal_ore',
          'redstone_ore', 'lapis_ore', 'copper_ore', 'ancient_debris',
          // Blocks
          'diamond_block', 'iron_block', 'gold_block', 'emerald_block',
          'copper_block', 'raw_copper_block', 'raw_iron_block', 'raw_gold_block',
          // Containers & Structures
          'chest', 'trapped_chest', 'ender_chest', 'spawner', 'anvil',
          'furnace', 'blast_furnace', 'smoker', 'brewing_stand', 'beacon',
          // Nature & Building
          'oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'dark_oak_log', 'acacia_log',
          'oak_leaves', 'birch_leaves', 'spruce_leaves', 'jungle_leaves',
          'grass_block', 'dirt', 'coarse_dirt', 'podzol',
          'stone', 'granite', 'diorite', 'andesite', 'cobblestone',
          'sand', 'red_sand', 'gravel', 'clay',
          'water', 'lava', 'ice', 'snow_block',
          'cobweb', 'mushroom_block', 'nether_wart', 'soul_sand', 'soul_soil',
          // Special
          'bookshelf', 'cartography_table', 'fletching_table', 'smithing_table',
          'grindstone', 'loom', 'stonecutter', 'lectern', 'composter'
        ];
        
        // Scan for each resource type within a reasonable radius
        const scanRadius = parseInt(process.env.RESOURCE_SCAN_RADIUS || '16');
        
        // Single scan for all resource types
        const foundBlocks = bot.bot.findBlocks({
          point: bot.bot.entity.position,
          matching: valuableResources,
          maxDistance: scanRadius,
          minCount: 1
        });
        
        // Find nearest block for each resource type
        const foundResources = {};
        const botPos = bot.bot.entity.position;
        
        for (const block of foundBlocks) {
          const resource = block.name;
          
          if (!foundResources[resource]) {
            const distance = Math.sqrt(
              Math.pow(block.position.x - botPos.x, 2) +
              Math.pow(block.position.y - botPos.y, 2) +
              Math.pow(block.position.z - botPos.z, 2)
            );
            
            foundResources[resource] = {
              distance: Math.floor(distance),
              position: {
                x: Math.floor(block.position.x),
                y: Math.floor(block.position.y),
                z: Math.floor(block.position.z)
              }
            };
          }
        }
        
        // Convert to array for response
        nearbyResources.push(...Object.entries(foundResources as any).map(([resource, data]: [string, any]) => ({
          resource,
          distance: data.distance,
          position: data.position
        })));
        
        // Also scan for dropped items (item entities)
        if (bot.bot.entities) {
          const entities = Object.values(bot.bot.entities) as any[];
          const botPos = bot.bot.entity.position;
          const DROP_SCAN_DISTANCE = 16;
          const DROP_SCAN_DISTANCE_SQ = DROP_SCAN_DISTANCE * DROP_SCAN_DISTANCE;
          
          for (const entity of entities) {
            // Use entity.name to detect item entities (not entity.type which is the category)
            const entityName = entity.name || '';
            if ((entityName === 'item' || entityName === 'dropped_item') && entity.position) {
              const dx = entity.position.x - botPos.x;
              const dy = entity.position.y - botPos.y;
              const dz = entity.position.z - botPos.z;
              const distSq = dx*dx + dy*dy + dz*dz;
              
              if (distSq < DROP_SCAN_DISTANCE_SQ) {
                const distance = Math.sqrt(distSq);
                // Extract item name from entity metadata if available
                let itemName = 'item';
                const entityMeta = entity.metadata as any;
                if (entityMeta) {
                  // Try to get item name from metadata
                  const item = entityMeta.find((m: any) => m.key === 5);
                  if (item && item.value) {
                    itemName = item.value.name || itemName;
                  }
                }
                nearbyDrops.push({
                  item: itemName.replace('minecraft:', ''),
                  distance: Math.round(distance * 10) / 10,
                  position: {
                    x: Math.floor(entity.position.x),
                    y: Math.floor(entity.position.y),
                    z: Math.floor(entity.position.z)
                  }
                });
              }
            }
          }
        }
        
      } catch (error) {
        logger.error(`Error scanning nearby resources: ${error.message}`);
      }
    }
    
    let goalInfo = null;
    if (bot.goalState) {

      const progress = GoalSystem.calculateProgress(bot.goalState, inventoryItems);
      goalInfo = {
        currentGoal: bot.goalState.currentGoal,
        progress: progress.progress,
        details: progress,
        materialsCollected: progress.materials || {}
      };
    }
    
    let autonomousState = null;
    const mineflayerBot = bot.bot;
    const botObj = (bot as any);
    console.log('[Watch] bot.bot exists:', !!mineflayerBot);
    console.log('[Watch] botObj keys:', Object.keys(botObj).slice(0, 10));
    console.log('[Watch] botObj.autonomousEngine:', !!botObj.autonomousEngine);
    console.log('[Watch] botObj.autonomousRunning:', botObj.autonomousRunning);
    console.log('[Watch] bot.bot keys:', mineflayerBot ? Object.keys(mineflayerBot).slice(0, 10) : 'no bot');
    console.log('[Watch] bot.bot.autonomousEngine:', mineflayerBot ? !!(mineflayerBot as any).autonomousEngine : 'N/A');
    const engine = botObj.autonomousEngine || (mineflayerBot ? (mineflayerBot as any).autonomousEngine : null);
    const isRunning = botObj.autonomousRunning || (mineflayerBot ? (mineflayerBot as any).autonomousRunning : null);
    if (engine && isRunning) {
      console.log('[Watch] Getting engine state, engine exists:', !!engine, 'isRunning:', isRunning);
      const engineState = engine.state;
      autonomousState = {
        currentAction: engineState.currentAction,
        decisionReason: engineState.decisionReason,
        priority: engineState.priority,
        healthStatus: engineState.healthStatus,
        threatLevel: engineState.threatLevel,
        llmReasoning: engineState.llmReasoning,
        llmTarget: engineState.llmTarget,
        llmUrgency: engineState.llmUrgency,
        llmStrategy: engineState.llmStrategy
      };
      if (typeof bot.autonomousEngine.isUsingLLM === 'function') {
        (autonomousState as any).usedLLM = bot.autonomousEngine.isUsingLLM();
      }
      if (typeof bot.autonomousEngine.getLLMBrainStats === 'function') {
        (autonomousState as any).llmStats = bot.autonomousEngine.getLLMBrainStats();
      }
    }
    
    const eventsCacheKey = `${botId}:${eventLimit}`;
    const cachedEvents = eventsCache.get(eventsCacheKey);
    let events;
    if (cachedEvents && Date.now() - cachedEvents.timestamp < EVENTS_CACHE_TTL) {
      events = cachedEvents.data;
    } else {
      events = await BotState.getEvents(botId, eventLimit);
      eventsCache.set(eventsCacheKey, { data: events, timestamp: Date.now() });
    }
    
    // Enhanced events with action categories
    const enhancedEvents = events.map(e => {
      const eventData = e.data ? JSON.parse(e.data) : null;
      let category = 'system';
      
      // Categorize events
      if (e.event_type.includes('movement') || e.event_type.includes('position')) {
        category = 'movement';
      } else if (e.event_type.includes('health') || e.event_type.includes('damage') || e.event_type.includes('heal')) {
        category = 'health';
      } else if (e.event_type.includes('food') || e.event_type.includes('eating')) {
        category = 'food';
      } else if (e.event_type.includes('resource') || e.event_type.includes('item') || e.event_type.includes('collection')) {
        category = 'resource';
      } else if (e.event_type.includes('attack') || e.event_type.includes('combat')) {
        category = 'combat';
      } else if (e.event_type.includes('build') || e.event_type.includes('place') || e.event_type.includes('break')) {
        category = 'building';
      } else if (e.event_type.includes('entity') || e.event_type.includes('mob') || e.event_type.includes('creature')) {
        category = 'entity';
      } else if (e.event_type.includes('goal') || e.event_type.includes('task') || e.event_type.includes('progress')) {
        category = 'goal';
      }
      
      // Apply translations if Chinese is requested
      let translatedMessage = e.message;
      let translatedType = e.event_type;
      let translatedCategory = category;
      
      if (translate) {
        translatedMessage = translate.translateToChinese(e.message) || e.message;
        translatedType = translate.translateToChinese(e.event_type) || e.event_type;
        translatedCategory = translate.translateToChinese(category) || category;
      }
      
      return {
        id: e.id,
        type: translatedType,
        category: translatedCategory,
        message: translatedMessage,
        data: eventData,
        timestamp: e.created_at,
        humanReadableTime: new Date(e.created_at).toLocaleTimeString()
      };
    });
    
    // Build the response object
    const responseData = {
      success: true,
      botId,
      username: bot.bot.username,
      state: !bot.bot.isAlive ? 'DEAD' : (bot.isConnected ? 'ALIVE' : 'DISCONNECTED'),
      mode: bot.currentMode,
      
      // Bot state attributes (requirement 1)
      attributes: {
        health: {
          current: health,
          max: 20,
          food: food,
          foodSaturation: foodSaturation
        },
        experience: {
          level: experience.level || 0,
          points: experience.points || 0,
          progress: experience.progress || 0,
          total: experience.total || 0
        },
        armor: {
          pieces: armor,
          totalValue: Math.round(armorValue * 10) / 10,
          protectionLevel: Math.min(Math.floor(armorValue), 10)
        }
      },
      
      // Collected resources (requirement 2)
      resources: {
        inventory: inventory,
        summary: resources,
        totalItems: inventory.reduce((sum, item) => sum + item.count, 0),
        uniqueItems: Object.keys(resources).length
      },
      
      // Environment information (requirement 3)
      environment: {
        position: {
          x: pos.x != null ? Math.floor(pos.x) : 0,
          y: pos.y != null ? Math.floor(pos.y) : 0,
          z: pos.z != null ? Math.floor(pos.z) : 0,
          world: 'overworld',
          biome: bot.bot.biome || 'unknown'
        },
        time: {
          timeOfDay: environment.timeOfDay,
          isDay: environment.isDay,
          isNight: environment.isNight,
          formattedTime: environment.isDay ? 'Day' : 'Night'
        },
        weather: {
          isRaining: environment.isRaining,
          isThundering: environment.isThundering
        },
        isInWater: (environment as any).isInWater || false,
        conditions: {
          isInWater: environment.isInWater,
          dimension: environment.dimension,
          difficulty: environment.difficulty
        },
        nearby: {
          entities: nearbyEntities.slice(0, 10),
          hasVillage: nearbyVillages,
          resources: nearbyResources,
          drops: nearbyDrops.slice(0, 10)
        }
      },
      
      // Enhanced events (requirement 4 & 5)
      events: {
        list: enhancedEvents,
        summary: {
          total: enhancedEvents.length,
          byCategory: enhancedEvents.reduce((acc, event) => {
            acc[event.category] = (acc[event.category] || 0) + 1;
            return acc;
          }, {}),
          latestTimestamp: enhancedEvents.length > 0 ? enhancedEvents[0].timestamp : null
        }
      },
      
      // Additional info
      gameMode: gameMode,
      goal: goalInfo,
      autonomousState: autonomousState,
      connected: bot.isConnected,
      deadReason: bot.deadReason,
      joinedAt: bot.botTime || bot.bot.joinTime,
      lastUpdated: new Date().toISOString()
    };
    
    // Apply Chinese translations if requested
    const translatedResponse = applyTranslations(responseData);
    
    watchCache.set(cacheKey, { data: translatedResponse, timestamp: Date.now() });
    res.json(translatedResponse);
  } catch (error) {
    logger.error('Error getting bot watch data:', error);
    res.status(500).json({ error: `Failed to get bot watch data: ${error.message}` });
  }
});

// Gather resources for a specific bot
app.post('/api/bot/:botId/gather', async (req, res) => {
  try {
    const { botId } = req.params;
    const { targetBlocks, radius = 20 } = req.body;
    
    const bot = activeBots.get(botId);
    if (!bot) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    
    if (!targetBlocks || !Array.isArray(targetBlocks) || targetBlocks.length === 0) {
      return res.status(400).json({ error: 'targetBlocks array is required' });
    }
    
    // Start gathering in background
    (async () => {
      try {
        await bot.behaviors.gatherResources({ targetBlocks, radius });
        logger.trace(`[API] Gathering completed for bot ${botId}`);
      } catch (err) {
        logger.error(`[API] Gathering failed for bot ${botId}:`, err.message);
      }
    })();
    
    res.json({
      success: true,
      message: `Gathering started for bot ${botId}`,
      targetBlocks,
      radius
    });
  } catch (error) {
    logger.error('Error starting gathering:', error);
    res.status(500).json({ error: `Failed to start gathering: ${error.message}` });
  }
});

// Build structure for a specific bot
app.post('/api/bot/:botId/build', async (req, res) => {
  try {
    const { botId } = req.params;
    const { width, length, height, blockType, offsetX = 0, offsetY = 0, offsetZ = 0 } = req.body;
    
    const bot = activeBots.get(botId);
    if (!bot) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    
    if (!width || !length || !height || !blockType) {
      return res.status(400).json({ error: 'width, length, height, and blockType are required' });
    }
    
    // Start building in background
    (async () => {
      try {
        await bot.behaviors.buildStructure({ width, length, height, blockType, offsetX, offsetY, offsetZ });
        logger.trace(`[API] Building completed for bot ${botId}`);
      } catch (err) {
        logger.error(`[API] Building failed for bot ${botId}:`, err.message);
      }
    })();
    
    res.json({
      success: true,
      message: `Building started for bot ${botId}`,
      structure: { width, length, height, blockType },
      offset: { offsetX, offsetY, offsetZ }
    });
  } catch (error) {
    logger.error('Error starting building:', error);
    res.status(500).json({ error: `Failed to start building: ${error.message}` });
  }
});

// WebSocket endpoint for bot status and control
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let serverStarted = false;

// Auto-reconnect saved bots (only those stopped due to server shutdown)
async function autoReconnectBots() {
  logger.trace('[Server] Loading saved bots for auto-reconnect...');
  const savedBots = await BotState.getBotsToAutoRestart();
  
  if (savedBots.length === 0) {
    logger.trace('[Server] No bots to auto-restart (server_stop)');
    return;
  }
  
  logger.trace(`[Server] Found ${savedBots.length} bots to auto-restart`);
  
  for (const savedBot of savedBots) {
    logger.trace(`[Server] Auto-restarting bot: ${savedBot.username} (${savedBot.bot_id})`);
    await attemptBotReconnect(savedBot);
  }
}

// Attempt to reconnect a single bot with hybrid approach
async function attemptBotReconnect(savedBot) {
  try {
    const mcHost = process.env.MINECRAFT_SERVER_HOST || 'localhost';
    const mcPort = parseInt(process.env.MINECRAFT_SERVER_PORT || '25565');
    const MinecraftBot = require('./bot/index').default;
    const bot = new MinecraftBot({ 
      host: mcHost, 
      port: mcPort,
      botServerHost: process.env.HOST || 'localhost',
      botServerPort: process.env.PORT || 9500,
      botId: savedBot.bot_id
    });
    
    logger.trace(`[Server] Attempting to reconnect bot: ${savedBot.username} (${savedBot.bot_id})`);
    
    await bot.connect(savedBot.username, null, savedBot.mode === 'survival');
    
    const botId = savedBot.bot_id;
    activeBots.set(botId, bot);
    
    // Clear stop_reason and set status to active after successful reconnect
    await BotState.saveBot(botId, {
      username: savedBot.username,
      mode: savedBot.mode,
      status: 'active',
      stop_reason: null
    });
    
    logger.trace(`[Server] Bot reconnected successfully: ${botId}`);
  } catch (err) {
    logger.error(`[Server] Failed to reconnect bot ${savedBot.bot_id}: ${err.message}`);
    
    // Check if we should retry
    const retryInfo = retryQueue.get(savedBot.bot_id);
    if (retryInfo && retryInfo.retries >= 3) {
      logger.trace(`[Server] Max retries reached for bot ${savedBot.bot_id}. Marking as stopped for manual review.`);
      try {
        await BotState.updateBotStatus(savedBot.bot_id, 'stopped');
        retryQueue.delete(savedBot.bot_id);
      } catch (saveErr) {
        logger.error(`[Server] Failed to update bot status: ${saveErr.message}`);
      }
      return;
    }
    
    // Schedule retry after 10 seconds
    const retryDelay = 10000; // 10 seconds
    const nextRetry = retryInfo ? retryInfo.retries + 1 : 1;
    retryQueue.set(savedBot.bot_id, { 
      username: savedBot.username, 
      mode: savedBot.mode, 
      retries: nextRetry 
    });
    
    logger.trace(`[Server] Scheduling retry for bot ${savedBot.bot_id} in ${retryDelay/1000} seconds (attempt ${nextRetry}/3)`);
    
    setTimeout(async () => {
      const currentRetryInfo = retryQueue.get(savedBot.bot_id);
      if (currentRetryInfo) {
        logger.trace(`[Server] Retrying bot: ${savedBot.bot_id} (attempt ${currentRetryInfo.retries}/3)`);
        await attemptBotReconnect(savedBot);
        if (!activeBots.has(savedBot.bot_id)) {
          retryQueue.set(savedBot.bot_id, { 
            username: currentRetryInfo.username, 
            mode: currentRetryInfo.mode, 
            retries: currentRetryInfo.retries + 1 
          });
        } else {
          retryQueue.delete(savedBot.bot_id);
        }
      }
    }, retryDelay);
  }
}

// Start server and auto-reconnect bots
server.listen(PORT, HOST, async () => {
  logger.trace(`WebSocket server listening on ${HOST}:${PORT}`);
  serverStarted = true;
  
  // Initialize database tables first to avoid race condition
  try {
    await BotState.createTable();
    await BotState.createEventsTable();
  } catch (err) {
    logger.error(`[Server] Failed to create database tables: ${err.message}`);
  }
  
  // Save bot server state
  try {
    await BotState.saveServerState('bot_server', {
      status: 'running',
      port: PORT,
      pid: process.pid,
      uptime_seconds: 0,
      last_started_at: new Date().toISOString()
    });
  } catch (err) {
    logger.error(`[Server] Failed to save bot server state: ${err.message}`);
  }
  
  // Auto-reconnect saved bots
  await autoReconnectBots();
});

wss.on('connection', (ws, req) => {
  logger.trace('WebSocket client connected');
  
  // Handle incoming messages from frontend
  ws.on('message', (data: any) => {
    try {
      const message = JSON.parse(data);
      handleWebSocketMessage(ws, message);
    } catch (err) {
      logger.error('Error parsing WebSocket message:', err);
      ws.send(JSON.stringify({
        type: 'error',
        data: { message: 'Invalid message format' }
      }));
    }
  });
  
  ws.on('close', () => {
    logger.trace('WebSocket client disconnected');
    // Clean up any bot connections associated with this ws
    botConnections.forEach((connectionWs, botId) => {
      if (connectionWs === ws) {
        botConnections.delete(botId);
      }
    });
  });
  
  ws.on('error', (err) => {
    logger.error('WebSocket error:', err);
  });
});

// Handle WebSocket messages (CLI only)
function handleWebSocketMessage(ws, message) {
  switch (message.type) {
    case 'get_status':
      // Send status of all bots for CLI monitoring
      const botStatuses = [];
      for (const [botId, bot] of activeBots.entries()) {
        botStatuses.push({
          botId,
          username: bot.isConnected && bot.bot ? bot.bot.username : undefined,
          connected: bot.isConnected,
          // Include real data if available
          ...(bot.isConnected && bot.bot ? {
            position: bot.bot.entity.position.floored(),
            health: bot.bot.health,
            food: bot.bot.food,
            experience: bot.bot.experience,
            gamemode: bot.bot.gameMode === 0 ? 'survival' : 'creative'
          } : {})
        });
      }
      
      ws.send(JSON.stringify({
        type: 'status_list',
        data: { bots: botStatuses }
      }));
      break;
    case 'register_bot':
      // Register a bot's WebSocket connection for real-time updates
      if (message.data && message.data.botId) {
        botConnections.set(message.data.botId, ws);
        logger.trace(`Registered WebSocket for bot ${message.data.botId}`);
        ws.send(JSON.stringify({
          type: 'registration_ack',
          data: { message: 'Bot WebSocket registered' }
        }));
        // Send current bots list
        const botStatuses = [];
        for (const [botId, bot] of activeBots.entries()) {
          botStatuses.push({
            botId,
            username: bot.isConnected && bot.bot ? bot.bot.username : undefined,
            connected: bot.isConnected,
            // Include real data if available
            ...(bot.isConnected && bot.bot ? {
              position: bot.bot.entity.position.floored(),
              health: bot.bot.health,
              food: bot.bot.food,
              experience: bot.bot.experience,
              gamemode: bot.bot.gameMode === 0 ? 'survival' : 'creative'
            } : {})
          });
        }
        ws.send(JSON.stringify({
          type: 'bots_list',
          data: { bots: botStatuses }
        }));
      }
      break;
    case 'status_update':
      if (verbose) {
        logger.trace('Forwarding status update from bot:', message.data);
      }
      
      if (message.data && message.data.botId) {
        const botId = message.data.botId;
        const bot = activeBots.get(botId);
        
        if (message.data.message) {
          if (message.data.message.includes('died')) {
            BotState.addEvent(botId, 'death', 'Bot died', {
              position: message.data.position
            }).catch(() => {});
          } else if (message.data.message.includes('disconnect') || message.data.message.includes('Disconnected')) {
            BotState.addEvent(botId, 'disconnect', 'Bot disconnected', {
              reason: message.data.message
            }).catch(() => {});
          } else if (message.data.message.includes('respawn')) {
            BotState.addEvent(botId, 'respawn', 'Bot respawned', {
              position: message.data.position
            }).catch(() => {});
          }
        }
        
        botLastStates.delete(botId);
      }
      
      ws.send(JSON.stringify({
        type: 'status_update',
        data: { bots: [message.data] }
      }));
      break;
    case 'error':
      // Error messages from bots are logged but don't require special handling
      if (verbose) {
        logger.trace('Received error message from bot:', message.data.message);
      }
      break;
    default:
      ws.send(JSON.stringify({
        type: 'error',
        data: { message: 'Unknown message type' }
      }));
  }
}

// Handle stream commands via WebSocket
function handleStreamCommand(ws, data) {
  try {
    const { botId, action, config = {} } = data;
    
    if (!botId) {
      ws.send(JSON.stringify({
        type: 'stream_error',
        data: { message: 'botId is required' }
      }));
      return;
    }
    
    const bot = activeBots.get(botId);
    if (!bot) {
      ws.send(JSON.stringify({
        type: 'stream_error',
        data: { message: `Bot not found: ${botId}` }
      }));
      return;
    }
    
    switch (action) {
      case 'start':
        if (!bot.getScreenshotFn || !bot.getScreenshotFn()) {
          ws.send(JSON.stringify({
            type: 'stream_error',
            data: { 
              message: 'Screenshot not available',
              hint: 'Ensure canvas/prismarine-viewer are installed'
            }
          }));
          return;
        }
        
        try {
          const screenshotFn = bot.getScreenshotFn();
          
          const stream = require('./routes/stream.js').streamManager.getOrCreateStream(
            botId, 
            { 
              fps: config.fps || 20, 
              quality: config.quality || 0.7, 
              width: config.width || 854, 
              height: config.height || 480 
            }, 
            screenshotFn
          );
          
          ws.send(JSON.stringify({
            type: 'stream_status',
            data: {
              botId,
              isStreaming: true,
              viewerCount: 0,
              fps: stream.options.fps,
              quality: stream.options.quality,
              url: `/api/stream/${botId}/mjpeg`,
              message: 'Stream started'
            }
          }));
        } catch (err) {
          ws.send(JSON.stringify({
            type: 'stream_error',
            data: { message: `Failed to start stream: ${err.message}` }
          }));
        }
        break;
        
      case 'stop':
        try {
          const stopped = require('./routes/stream.js').streamManager.stopStream(botId);
          ws.send(JSON.stringify({
            type: 'stream_status',
            data: {
              botId,
              isStreaming: false,
              message: stopped ? 'Stream stopped' : 'Stream not found'
            }
          }));
        } catch (err) {
          ws.send(JSON.stringify({
            type: 'stream_error',
            data: { message: `Failed to stop stream: ${err.message}` }
          }));
        }
        break;
        
      case 'getStats':
        try {
          const stats = require('./routes/stream.js').streamManager.getStreamStats(botId);
          ws.send(JSON.stringify({
            type: 'stream_stats',
            data: {
              botId,
              stats: stats || { isStreaming: false, message: 'Stream not found' }
            }
          }));
        } catch (err) {
          ws.send(JSON.stringify({
            type: 'stream_error',
            data: { message: `Failed to get stream stats: ${err.message}` }
          }));
        }
        break;
        
      case 'configure':
        try {
          const stream = require('./routes/stream.js').streamManager.getStream(botId);
          if (stream) {
            stream.updateOptions({
              fps: config.fps,
              quality: config.quality,
              width: config.width,
              height: config.height
            });
            ws.send(JSON.stringify({
              type: 'stream_status',
              data: {
                botId,
                isStreaming: stream.isRunning,
                settings: stream.options,
                message: 'Stream configuration updated'
              }
            }));
          } else {
            ws.send(JSON.stringify({
              type: 'stream_error',
              data: { message: 'Stream not found' }
            }));
          }
        } catch (err) {
          ws.send(JSON.stringify({
            type: 'stream_error',
            data: { message: `Failed to configure stream: ${err.message}` }
          }));
        }
        break;
        
      default:
        ws.send(JSON.stringify({
          type: 'stream_error',
          data: { message: `Unknown stream action: ${action}` }
        }));
    }
  } catch (err) {
    logger.error('Error handling stream command:', err);
    ws.send(JSON.stringify({
      type: 'stream_error',
      data: { message: `Internal server error: ${err.message}` }
    }));
  }
}

// Execute commands on bots
async function executeBotCommand(bot, commandData, ws) {
  try {
    switch (commandData.action) {
      case 'move':
        await bot.pathfinder.moveTo(commandData.target);
        ws.send(JSON.stringify({
          type: 'command_ack',
          data: { message: 'Move command executed' }
        }));
        break;
      case 'look':
        bot.lookAt(commandData.target);
        ws.send(JSON.stringify({
          type: 'command_ack',
          data: { message: 'Look command executed' }
        }));
        break;
      case 'jump':
        bot.setControlState('jump', true);
        setTimeout(() => bot.setControlState('jump', false), 100);
        ws.send(JSON.stringify({
          type: 'command_ack',
          data: { message: 'Jump command executed' }
        }));
        break;
      case 'sprint':
        bot.setControlState('sprint', commandData.state || true);
        ws.send(JSON.stringify({
          type: 'command_ack',
          data: { message: 'Sprint command executed' }
        }));
        break;
      case 'build':
        await bot.behaviors.buildStructure(commandData);
        ws.send(JSON.stringify({
          type: 'command_ack',
          data: { message: 'Build command executed' }
        }));
        break;
      case 'gather':
        await bot.behaviors.gatherResources(commandData);
        ws.send(JSON.stringify({
          type: 'command_ack',
          data: { message: 'Gather command executed' }
        }));
        break;
      case 'fly':
        await bot.behaviors.flyTo(commandData);
        ws.send(JSON.stringify({
          type: 'command_ack',
          data: { message: 'Fly command executed' }
        }));
        break;
      case 'automatic':
        await bot.behaviors.automaticBehavior(commandData);
        ws.send(JSON.stringify({
          type: 'command_ack',
          data: { message: 'Automatic behavior started' }
        }));
        break;
      default:
        ws.send(JSON.stringify({
          type: 'error',
          data: { message: 'Unknown command action' }
        }));
    }
  } catch (error) {
    logger.error('Error executing bot command:', error);
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: `Command failed: ${error.message}` }
    }));
  }
}

// Enhanced broadcast status updates to include real bot data
function broadcastStatusUpdate() {
  const statusData = {
    type: 'status_update',
    data: {
      bots: Array.from(activeBots.entries()).map(([botId, bot]) => {
        const baseData = {
          botId,
          connected: bot.isConnected,
          message: bot.isConnected ? 'Bot connected' : 'Bot disconnected'
        };
        
        // Add real-time data if bot is connected
        if (bot.isConnected && bot.bot) {
          try {
            const position = bot.bot.entity.position.floored();
            const health = bot.bot.health;
            const food = bot.bot.food;
            // Experience is an object with level/points/progress in mineflayer
            const experience = bot.bot.experience || 0;
            const experiencePoints = typeof experience === 'object' 
              ? experience.points || experience.level || 0 
              : experience;
            const gamemode = bot.bot.gameMode === 0 ? 'survival' : 'creative';
            const inventory = bot.bot.inventory.items().map(item => ({
              type: item.name,
              count: item.count,
              metadata: item.metadata
            }));
            
            return {
              ...baseData,
              position: { x: position.x, y: position.y, z: position.z },
              health,
              food,
              experience: experiencePoints,
              gamemode,
              inventory
            };
          } catch (err) {
            logger.error('Error getting bot data for broadcast:', err);
            return baseData;
          }
        }
        
        return baseData;
      })
    }
  };
  
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(statusData));
    }
  });
}

// Set up periodic status broadcasting
setInterval(broadcastStatusUpdate, 3000);

// Record bot events for watch mode
setInterval(async () => {
  for (const [botId, bot] of activeBots.entries()) {
    if (!bot.bot || !bot.isConnected) continue;
    
    try {
      const pos = bot.bot.entity.position;
      const health = bot.bot.health;
      const food = bot.bot.food;
      const key = `${botId}_${Math.floor(Date.now() / 10000)}`;
      const lastState = botLastStates.get(botId);
      
      if (!lastState) {
        botLastStates.set(botId, { health, food, pos });
        await BotState.addEvent(botId, 'status', 'Bot connected', {
          username: bot.bot.username,
          position: { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) }
        });
        continue;
      }
      
      if (lastState.health !== health) {
        await BotState.addEvent(botId, 'health', `Health changed: ${lastState.health} -> ${health}`, {
          old: lastState.health,
          new: health
        });
      }
      
      if (lastState.food !== food) {
        await BotState.addEvent(botId, 'food', `Food changed: ${lastState.food} -> ${food}`, {
          old: lastState.food,
          new: food
        });
      }
      
      const dx = Math.abs(pos.x - lastState.pos.x);
      const dy = Math.abs(pos.y - lastState.pos.y);
      const dz = Math.abs(pos.z - lastState.pos.z);
      if (dx > 5 || dy > 3 || dz > 5) {
        await BotState.addEvent(botId, 'movement', `Moved to (${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)})`, {
          from: lastState.pos,
          to: { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) }
        });
      }
      
      botLastStates.set(botId, { health, food, pos });
      
      await BotState.clearOldEvents(botId, 100);
    } catch (err) {
      logger.error(`[Server] Failed to record bot event: ${err.message}`);
    }
  }
}, 5000);

// Set up periodic server state saving
setInterval(async () => {
  try {
    await BotState.saveServerState('bot_server', {
      status: 'running',
      port: PORT,
      pid: process.pid,
      uptime_seconds: Math.floor((Date.now() - botServerStartTime) / 1000),
      last_updated_at: new Date().toISOString()
    });
  } catch (err) {
    logger.error(`[Server] Failed to save periodic server state: ${err.message}`);
  }
}, 3000); // Save server state every 3 seconds

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: err.message 
  });
});

// Cleanup retry queue on server shutdown
process.on('beforeExit', () => {
  retryQueue.clear();
});

// Mock LLM endpoint for frontend
app.post('/api/llm/strategy', async (req, res) => {
  try {
    const { context, goal, current_state } = req.body;
    // In a real implementation, this would call an LLM service
    // For now, we return a static advice based on the goal
    let advice = 'Focus on gathering basic resources like wood and stone.';
    if (goal && goal.includes('build')) {
      advice = 'Gather wood and cobblestone, then build a simple shelter.';
    } else if (goal && goal.includes('gather')) {
      advice = 'Look for nearby trees and stone to collect resources.';
    }
    
    res.json({ advice });
  } catch (error) {
    logger.error('Error in LLM endpoint:', error);
    res.status(500).json({ error: 'Failed to generate LLM advice' });
  }
});

// Web watch page
app.get('/watch/:botId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'watch.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not found',
    message: `Cannot ${req.method} ${req.url}` 
  });
});

// Graceful shutdown
const shutdown = async () => {
  logger.trace('Received shutdown signal, shutting down gracefully');
  
  // Force exit after timeout to prevent hanging
  const FORCE_EXIT_TIMEOUT = 3000; // 3 seconds
  
  // Update bot server state
  try {
    await BotState.saveServerState('bot_server', {
      status: 'stopped',
      port: PORT,
      pid: process.pid,
      uptime_seconds: Math.floor((Date.now() - botServerStartTime) / 1000),
      last_stopped_at: new Date().toISOString()
    });
  } catch (err) {
    logger.error(`[Server] Failed to save bot server state: ${err.message}`);
  }
  
  // Mark all active bots as stopped (due to server shutdown)
  for (const [botId, bot] of activeBots.entries()) {
    try {
      const botData = await BotState.getBot(botId);
      await BotState.saveBot(botId, {
        ...botData,
        status: 'stopped',
        stop_reason: 'server_stop'
      });
    } catch (err) {
      logger.error(`[Server] Failed to update bot ${botId} status: ${err.message}`);
    }
  }
  
  // Set up force exit timer
  const forceExitTimer = setTimeout(() => {
    logger.warn('Shutdown timeout, forcing exit');
    try {
      fs.unlinkSync(pidFile);
    } catch (e) {}
    process.exit(0);
  }, FORCE_EXIT_TIMEOUT);
  
  server.close(async (err) => {
    clearTimeout(forceExitTimer);
    
    if (err) {
      logger.error('Error closing server:', err);
      process.exit(1);
    }
    // Close WebSocket server
    wss.close(() => {
      logger.trace('WebSocket server closed');
      // Clean up PID file on graceful shutdown
      try {
        fs.unlinkSync(pidFile);
      } catch (e) {
        // PID file might not exist, ignore
      }
      logger.trace('Server closed');
      process.exit(0);
    });
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', (code) => {
  try {
    fs.unlinkSync(pidFile);
  } catch (e) {
    // PID file might not exist, ignore
  }
});
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception: ${err.message}`);
  try {
    fs.unlinkSync(pidFile);
  } catch (e) {
    // Ignore
  }
  process.exit(1);
});

// Keep CommonJS export for compatibility
module.exports = app;
export default app;