require('dotenv').config();
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const app = express();
const HOST = process.env.HOST || '0.0.0.0';
const PORT = process.env.PORT || 9500;

require('./config/db');
require('./config/models/BotConfig');

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
app.use(express.static('frontend/build'));

const activeBots = new Map();
const botConnections = new Map();

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    serverMode: 'online',
    mcServer: process.env.MINECRAFT_SERVER_HOST || 'localhost',
    mcPort: process.env.MINECRAFT_SERVER_PORT || 25565
  });
});

app.post('/api/bot/start', async (req, res) => {
  try {
    const { username } = req.body;
    
    console.log(`[API] Received request to start bot with username: ${username}`);
    
    if (!username) {
      console.log('[API] Error: Username is required');
      return res.status(400).json({ error: 'Username is required' });
    }
    
    const validUsername = /^[a-zA-Z0-9_]{3,16}$/.test(username);
    if (!validUsername) {
      console.log(`[API] Error: Invalid username format: ${username}`);
      return res.status(400).json({ error: 'Invalid username format (3-16 characters, letters, numbers, underscores)' });
    }
    
    const mcHost = process.env.MINECRAFT_SERVER_HOST || 'localhost';
    const mcPort = parseInt(process.env.MINECRAFT_SERVER_PORT || '25565');
    console.log(`[API] Creating bot instance for host: ${mcHost}:${mcPort}`);
    const MinecraftBot = require('./bot/index');
    const bot = new MinecraftBot({ 
      host: mcHost, 
      port: mcPort,
      botServerHost: process.env.HOST || 'localhost',
      botServerPort: process.env.PORT || 9500
    });
    
    console.log(`[API] Attempting to connect bot...`);
    await bot.connect(username, null);
    
    const botId = `bot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    activeBots.set(botId, bot);
    
    console.log(`[API] Bot started successfully with ID: ${botId}`);
    res.json({ 
      success: true, 
      botId,
      username,
      message: 'Bot started successfully (offline mode)'
    });
  } catch (error) {
    console.error('Error starting bot:', error);
    res.status(500).json({ error: `Failed to start bot: ${error.message}` });
  }
});

app.post('/api/bot/automatic', async (req, res) => {
  try {
    const { username, mode } = req.body;
    
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }
    
    let foundBotEntry = Array.from(activeBots.entries()).find(([bid, b]) => b.bot && b.bot.username === username);
    let bot;
    
    if (!foundBotEntry) {
      const mcHost = process.env.MINECRAFT_SERVER_HOST || 'localhost';
      const mcPort = parseInt(process.env.MINECRAFT_SERVER_PORT || '25565');
      const MinecraftBot = require('./bot/index');
      bot = new MinecraftBot({ 
        host: mcHost, 
        port: mcPort,
        botServerHost: process.env.HOST || 'localhost',
        botServerPort: process.env.PORT || 9500
      });
      
      await bot.connect(username, null);
      const botId = `bot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      activeBots.set(botId, bot);
    } else {
      bot = foundBotEntry[1];
      console.log(`[API] Reusing existing bot for username: ${username}`);
    }
    
    // Start automatic behavior in background (don't block response)
    bot.behaviors.automaticBehavior({ 
      mode: mode || 'survival',
      targetBlockType: 'oak_log',
      structureType: 'house',
      structureSize: { width: 4, length: 4, height: 3 },
      gatherRadius: 100
    }).catch(err => {
      console.error('Error in automatic behavior:', err);
    });
    
    res.json({ 
      success: true,
      botId: bot.botId,
      username,
      message: `Automatic behavior started in ${mode || 'survival'} mode (offline)`
    });
  } catch (error) {
    console.error('Error starting automatic behavior:', error);
    res.status(500).json({ error: `Failed to start automatic behavior: ${error.message}` });
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
    
    res.json({
      success: true,
      message: 'Bot stopped successfully'
    });
  } catch (error) {
    console.error('Error stopping bot:', error);
    res.status(500).json({ error: `Failed to stop bot: ${error.message}` });
  }
});

// WebSocket endpoint for bot status and control
const server = http.createServer(app);
server.listen(PORT, HOST, () => {
  console.log(`WebSocket server listening on ${HOST}:${PORT}`);
});
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  console.log('WebSocket client connected');
  
  // Handle incoming messages from frontend
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      handleWebSocketMessage(ws, message);
    } catch (err) {
      console.error('Error parsing WebSocket message:', err);
      ws.send(JSON.stringify({
        type: 'error',
        data: { message: 'Invalid message format' }
      }));
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    // Clean up any bot connections associated with this ws
    botConnections.forEach((botId, connectionWs) => {
      if (connectionWs === ws) {
        botConnections.delete(botId);
      }
    });
  });
  
  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

// Handle WebSocket messages from frontend
function handleWebSocketMessage(ws, message) {
  switch (message.type) {
    case 'command':
      // Forward command to bot
      if (message.data && message.data.botId) {
        const bot = activeBots.get(message.data.botId);
        if (bot) {
          // Execute command on the bot
          executeBotCommand(bot, message.data, ws);
        } else {
          ws.send(JSON.stringify({
            type: 'error',
            data: { message: 'Bot not found' }
          }));
        }
      }
      break;
    case 'get_status':
      // Send status of all bots
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
        console.log(`Registered WebSocket for bot ${message.data.botId}`);
        ws.send(JSON.stringify({
          type: 'registration_ack',
          data: { message: 'Bot WebSocket registered' }
        }));
      }
      break;
    case 'status_update':
      // Forward status updates from bots to all frontend clients
      console.log('Forwarding status update from bot:', message.data);
      ws.send(JSON.stringify({
        type: 'status_update',
        data: { bots: [message.data] }
      }));
      break;
    case 'error':
      // Error messages from bots are logged but don't require special handling
      console.log('Received error message from bot:', message.data.message);
      break;
    default:
      ws.send(JSON.stringify({
        type: 'error',
        data: { message: 'Unknown message type' }
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
    console.error('Error executing bot command:', error);
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
            console.error('Error getting bot data for broadcast:', err);
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

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: err.message 
  });
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
    console.error('Error in LLM endpoint:', error);
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

// Start server
server.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
});

// Graceful shutdown
const shutdown = () => {
  console.log('Received shutdown signal, shuttingting down gracefully');
  server.close(async (err) => {
    if (err) {
      console.error('Error closing server:', err);
      process.exit(1);
    }
    // Close WebSocket server
    wss.close(() => {
      console.log('WebSocket server closed');
    });
    console.log('Server closed');
    process.exit(0);
  });
};

// process.on('SIGINT', shutdown);
// process.on('SIGTERM', shutdown);