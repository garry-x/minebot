require('dotenv').config();
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const fs = require('fs');
const path = require('path');
const app = express();
const HOST = process.env.HOST || '0.0.0.0';
const PORT = process.env.PORT || 9500;

const logger = require('./bot/logger');

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
const BotConfig = require('./config/models/BotConfig');
const BotState = require('./config/models/BotState');
const GoalSystem = require('./bot/goal-system');
const BotGoal = require('./config/models/BotGoal');
const StrategyEvolutionManager = require('./bot/evolution/strategy-manager');

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

// CLI only mode - no frontend routes

const activeBots = new Map();
const botConnections = new Map();
const botServerStartTime = Date.now();
const retryQueue = new Map();

// Initialize streaming routes (needs access to activeBots)
const streamRoutes = require('./routes/stream')(activeBots);
app.use('/api', streamRoutes);

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

app.get('/api/bots', (req, res) => {
  const bots = Array.from(activeBots.entries()).map(([botId, bot]) => {
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
  
  res.json({
    count: bots.length,
    bots: bots
  });
});

app.post('/api/bot/start', async (req, res) => {
  try {
    const { username } = req.body;
    
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
    
    const mcHost = process.env.MINECRAFT_SERVER_HOST || 'localhost';
    const mcPort = parseInt(process.env.MINECRAFT_SERVER_PORT || '25565');
      logger.info(`[API] Creating bot instance for host: ${mcHost}:${mcPort}`);
      logger.trace('[API] Loading bot/index.js from:', require.resolve('./bot/index'));
    const MinecraftBot = require('./bot/index');
    const bot = new MinecraftBot({ 
      host: mcHost, 
      port: mcPort,
      botServerHost: process.env.HOST || 'localhost',
      botServerPort: process.env.PORT || 9500
    });
    
      logger.trace('[API] Bot instance created, botId from constructor:', bot.botId);
      const botId = `bot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      bot.botId = botId;
      logger.trace('[API] After setting botId:', bot.botId);
      
      logger.info(`[API] Attempting to connect bot...`);
    await bot.connect(username, null, true);
    
    activeBots.set(botId, bot);
    
      logger.info(`[API] Bot started successfully with ID: ${botId}`);
    
    // Record evolution state on bot creation
    if (bot.evolutionManager) {
      try {
        await bot.evolutionManager.recordExperience({
          bot_id: botId,
          type: 'resource',
          context: 'bot_creation',
          action: 'bot_initialized',
          outcome: 1.0,
          metrics: { evolutions_initialized: 3 }
        });
          logger.info(`[API] Evolution initialized and recorded: ${bot.evolutionManager.experienceCount} experiences`);
      } catch (evoErr) {
          logger.error(`[API] Failed to record evolution: ${evoErr.message}`);
      }
    }
    
    res.json({ 
      success: true, 
      botId,
      username,
      mode: 'survival',
      message: 'Bot started successfully (offline mode) with automatic behavior enabled'
    });
    
    // Save bot state to persistent store (after bot is ready)
    setTimeout(async () => {
      try {
        if (bot.bot && bot.bot.entity && bot.bot.entity.position) {
          const position = bot.bot.entity.position;
          await BotState.saveBot(botId, {
            username: bot.bot.username,
            mode: 'survival',
            position_x: position.x,
            position_y: position.y,
            position_z: position.z,
            health: bot.bot.health,
            food: bot.bot.food,
            status: 'active'
          });
            logger.info(`[API] Bot state saved successfully`);
          
          // Start automatic behavior automatically
          bot.currentMode = 'survival';
          bot.behaviors.automaticBehavior({ 
            mode: 'survival',
            initialGoal: 'basic_survival'
          }).catch(err => {
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
        mode: mode || 'survival',
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
      mode: mode || 'survival',
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
    const bot = activeBots.get(botId);
    
    if (!bot) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    
    await bot.disconnect();
    activeBots.delete(botId);
    
    // Update bot status in persistent store
    try {
      await BotState.updateBotStatus(botId, 'stopped');
    } catch (saveErr) {
        logger.error(`[API] Failed to update bot state: ${saveErr.message}`);
    }
    
    res.json({
      success: true,
      message: 'Bot stopped successfully'
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
    const MinecraftBot = require('./bot/index');
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
    
    // Get evolution stats if available
    let evolutionData = null;
    if (bot.evolutionManager) {
      try {
        const stats = await bot.evolutionManager.getEvolutionStats();
        evolutionData = {
          enabled: true,
          experienceCount: stats.totalExperiences,
          baselineFitness: stats.baselineFitness,
          recentFitness: stats.recentFitness.slice(-5),
          domains: stats.domains
        };
      } catch (e) {
        evolutionData = {
          enabled: true,
          error: e.message
        };
      }
    } else {
      evolutionData = { enabled: false };
    }
    
    res.json({
      success: true,
      bot: botData,
      inventory: {
        totalItems: inventory.length,
        breakdown: inventoryBreakdown,
        itemCount: Object.values(inventoryBreakdown).reduce((sum, v) => sum + v.count, 0)
      },
      movement: movementState,
      behavior: behaviorState,
      evolution: evolutionData
    });
  } catch (error) {
    logger.error('Error getting bot inspect data:', error);
    res.status(500).json({ error: `Failed to get inspect data: ${error.message}` });
  }
});

// ===================== EVOLUTION API ENDPOINTS =====================

// GET /api/bot/:botId/evolution/stats - Get evolution statistics
app.get('/api/bot/:botId/evolution/stats', async (req, res) => {
  try {
    const { botId } = req.params;
    const bot = activeBots.get(botId);
    
    if (!bot) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    
    if (!bot.evolutionManager) {
      return res.status(404).json({ error: 'Evolution manager not initialized for this bot' });
    }
    
    const stats = await bot.evolutionManager.getEvolutionStats();
    res.json({ success: true, stats });
  } catch (error) {
    logger.error('Error getting evolution stats:', error);
    res.status(500).json({ error: `Failed to get evolution stats: ${error.message}` });
  }
});

// POST /api/bot/:botId/evolution/record - Record a new experience
app.post('/api/bot/:botId/evolution/record', async (req, res) => {
  try {
    const { botId } = req.params;
    const { type, context, action, outcome } = req.body;
    
    const bot = activeBots.get(botId);
    
    if (!bot) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    
    if (!bot.evolutionManager) {
      return res.status(404).json({ error: 'Evolution manager not initialized for this bot' });
    }
    
    if (!type || !context || !action || outcome === undefined) {
      return res.status(400).json({ error: 'type, context, action, and outcome are required' });
    }
    
    const experience = {
      bot_id: botId,
      type,
      context,
      action,
      outcome
    };
    
    const result = await bot.evolutionManager.recordExperience(experience);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Error recording experience:', error);
    res.status(500).json({ error: `Failed to record experience: ${error.message}` });
  }
});

// POST /api/bot/:botId/evolution/rollback - Rollback to a specific snapshot
app.post('/api/bot/:botId/evolution/rollback', async (req, res) => {
  try {
    const { botId } = req.params;
    const { snapshotId } = req.body;
    
    const bot = activeBots.get(botId);
    
    if (!bot) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    
    if (!bot.evolutionManager) {
      return res.status(404).json({ error: 'Evolution manager not initialized for this bot' });
    }
    
    if (!snapshotId) {
      return res.status(400).json({ error: 'snapshotId is required' });
    }
    
    const result = await bot.evolutionManager.rollbackToSnapshot(snapshotId);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Error rolling back:', error);
    res.status(500).json({ error: `Failed to rollback: ${error.message}` });
  }
});

// GET /api/bot/:botId/evolution/history - Get weight history
app.get('/api/bot/:botId/evolution/history', async (req, res) => {
  try {
    const { botId } = req.params;
    const { domain, limit = 10 } = req.query;
    
    const bot = activeBots.get(botId);
    
    if (!bot) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    
    if (!bot.evolutionManager) {
      return res.status(404).json({ error: 'Evolution manager not initialized for this bot' });
    }
    
    if (!domain) {
      return res.status(400).json({ error: 'domain is required' });
    }
    
    const history = await bot.evolutionManager.storage.getWeightHistory(botId, domain, parseInt(limit));
    res.json({ success: true, history });
  } catch (error) {
    logger.error('Error getting weight history:', error);
    res.status(500).json({ error: `Failed to get weight history: ${error.message}` });
  }
});

// POST /api/bot/:botId/evolution/reset - Reset evolution data
app.post('/api/bot/:botId/evolution/reset', async (req, res) => {
  try {
    const { botId } = req.params;
    
    const bot = activeBots.get(botId);
    
    if (!bot) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    
    if (!bot.evolutionManager) {
      return res.status(404).json({ error: 'Evolution manager not initialized for this bot' });
    }
    
    await bot.evolutionManager.reset();
    res.json({ success: true, message: 'Evolution data reset successfully' });
  } catch (error) {
    logger.error('Error resetting evolution:', error);
    res.status(500).json({ error: `Failed to reset evolution: ${error.message}` });
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

// Auto-reconnect saved bots
async function autoReconnectBots() {
  logger.trace('[Server] Loading saved bots for auto-reconnect...');
  const savedBots = await BotState.getActiveBots();
  
  if (savedBots.length === 0) {
    logger.trace('[Server] No active bots to reconnect');
    return;
  }
  
  for (const savedBot of savedBots) {
    await attemptBotReconnect(savedBot);
  }
}

// Attempt to reconnect a single bot with hybrid approach
async function attemptBotReconnect(savedBot) {
  try {
    const mcHost = process.env.MINECRAFT_SERVER_HOST || 'localhost';
    const mcPort = parseInt(process.env.MINECRAFT_SERVER_PORT || '25565');
    const MinecraftBot = require('./bot/index');
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
  ws.on('message', (data) => {
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
    botConnections.forEach((botId, connectionWs) => {
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
      // Forward status updates from bots to all frontend clients
      if (verbose) {
        logger.trace('Forwarding status update from bot:', message.data);
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
setInterval(broadcastStatusUpdate, 3000); // Broadcast every 3 seconds for more real-time feel

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
  
  // Mark all active bots as stopped
  for (const [botId, bot] of activeBots.entries()) {
    try {
      await BotState.updateBotStatus(botId, 'stopped');
    } catch (err) {
      logger.error(`[Server] Failed to update bot ${botId} status: ${err.message}`);
    }
  }
  
  server.close(async (err) => {
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