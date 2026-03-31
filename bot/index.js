const mineflayer = require('mineflayer');
const WebSocket = require('ws');
const Pathfinder = require('./pathfinder');
const { Vec3 } = require('vec3');

class MinecraftBot {
  constructor(options) {
    this.options = options;
    this.bot = null;
    this.ws = null;
    this.isConnected = false;
    this.behaviors = null;
    this.events = null;
    this.pathfinder = null;
    this.statusInterval = null;
    this.botId = options.botId || null;
    this.botServerHost = options.botServerHost || 'localhost';
    this.botServerPort = options.botServerPort || 9500;
  }

async connect(username, accessToken) {
  return new Promise((resolve, reject) => {
    console.log(`[Bot] Creating bot with username: ${username}`);
    console.log(`[Bot] Target server: ${this.options.host || 'localhost'}:${this.options.port || 25565}`);
    
    // For offline mode, we need to provide a dummy access token
    // This prevents connection errors in some server configurations
    const botOptions = {
      host: this.options.host || 'localhost',
      port: this.options.port || 25565,
      username: username,
      version: '1.21.11' // Match server version
    };
    
    // Only use accessToken if provided
    if (accessToken && accessToken.trim() !== '') {
      botOptions.accessToken = accessToken;
    }
    
    this.bot = mineflayer.createBot(botOptions);

      // Set botId if not already set
      if (!this.botId) {
        this.botId = `bot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        console.log(`[Bot] Bot ID set to: ${this.botId}`);
      }

      console.log('[Bot] Setting up event listeners');
      this.setupEventListeners();
      this.setupWebSocket();

      // Track if we've resolved to avoid double-resolution
      let isResolved = false;
      
      // Set up timeout for connection
      const connectTimeout = setTimeout(() => {
        if (!isResolved && !this.isConnected) {
          console.log('[Bot] Connection timeout after 30 seconds');
          reject(new Error('Connection timeout - failed to spawn'));
          if (this.bot) {
            this.bot.end();
            this.bot = null;
          }
        }
      }, 30000);

      this.bot.once('spawn', () => {
        console.log('[Bot] Bot spawned');
        this.isConnected = true;
        // Load and attach mcData after bot is ready (pathfinder needs it)
        const mcData = require('minecraft-data')(this.bot.version);
        console.log('[Bot] mcData loaded:', !!mcData);
        if (!mcData) {
          console.error('[Bot] mcData is null or undefined!');
          throw new Error('Failed to load mcData');
        }
        // Attach mcData to bot's _client for pathfinder access
        this.bot._client.mcData = mcData;
        console.log('[Bot] mcData attached to _client:', !!this.bot._client.mcData);
        
        // Wait a bit for bot to fully initialize
        setTimeout(() => {
          try {
            console.log('[Bot] Bot version:', this.bot.version);
            
            // Initialize modules after bot is ready
            this.pathfinder = new Pathfinder(this.bot);
            this.behaviors = require('./behaviors')(this.bot, this.pathfinder);
            this.events = require('./events')(this.bot);
            this.events.setupListeners();
           
           // Generate bot ID if not already set
           if (!this.botId) {
             this.botId = `bot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
           }
            console.log(`[Bot] Bot ready with ID: ${this.botId}`);
            isResolved = true;
            clearTimeout(connectTimeout);
            resolve();
          } catch (initError) {
            console.error(`[Bot] Error initializing modules:`, initError);
            reject(initError);
          }
        }, 1500); // Increased timeout
      });

    this.bot.once('error', (err) => {
      console.log(`[Bot] Error: ${err.message}`);
      isResolved = true;
      clearTimeout(connectTimeout);
      reject(err);
    });

    // The end/disconnect handler is in setupEventListeners()
    
    // Add a timeout to prevent hanging
    setTimeout(() => {
      if (!this.isConnected) {
        console.log('[Bot] Connection timeout after 30 seconds');
        reject(new Error('Connection timeout - failed to spawn'));
        if (this.bot) {
          this.bot.end();
          this.bot = null;
        }
      }
    }, 30000);
  });
}

  setupEventListeners() {
    // Handle chat messages
    this.bot.on('chat', (username, message) => {
      if (username === this.bot.username) return; // Ignore our own messages
      
      // Broadcast chat message via WebSocket
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'chat',
          data: {
            username,
            message
          }
        }));
      }
    });

    // Handle death
    this.bot.on('death', () => {
      console.log('[Bot] Bot died');
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'status_update',
          data: {
            connected: this.isConnected,
            message: 'Bot died',
            position: null
          }
        }));
      }
    });

    // Handle respawn - bot comes back to life after death
    this.bot.on('respawn', () => {
      console.log('[Bot] Bot respawned');
      this.isConnected = true;
      // Send status update to update position after respawn
      setTimeout(() => {
        this.sendStatusUpdate();
      }, 1000);
    });

    // Handle error
    this.bot.on('error', (err) => {
      console.error('Bot error:', err);
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'status_update',
          data: {
            connected: this.isConnected,
            message: `Bot error: ${err.message}`,
            position: null
          }
        }));
      }
    });

    // Handle end/disconnect
    this.bot.on('end', () => {
      console.log('[Bot] End event triggered - connection closed');
      this.isConnected = false;
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'status_update',
          data: {
            connected: this.isConnected,
            message: 'Bot disconnected',
            position: null
          }
        }));
      }
      
      // Clear status interval
      if (this.statusInterval) {
        clearInterval(this.statusInterval);
        this.statusInterval = null;
      }
    });
  }

    setupWebSocket() {
      // Connect to the backend WebSocket server
      const wsHost = this.options.botServerHost || 'localhost';
      const wsPort = this.options.botServerPort || 9500;
      this.ws = new WebSocket(`ws://${wsHost}:${wsPort}/`);
      
      this.ws.on('open', () => {
        console.log(`WebSocket connected to backend at ${wsHost}:${wsPort}/`);
        
        // Register this bot's WebSocket connection with the backend
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            type: 'register_bot',
            data: { 
              botId: this.botId || `bot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` 
            }
          }));
        }
        
        // Start sending periodic status updates
        this.statusInterval = setInterval(() => {
          this.sendStatusUpdate();
        }, 3000); // Update every 3 seconds to match backend broadcast interval
      });
    
    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        this.handleWebSocketMessage(message);
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
      }
    });
    
    this.ws.on('close', () => {
      console.log('WebSocket disconnected from backend');
      if (this.statusInterval) {
        clearInterval(this.statusInterval);
        this.statusInterval = null;
      }
    });
    
    this.ws.on('error', (err) => {
      console.error('WebSocket error:', err);
    });
  }

  handleWebSocketMessage(message) {
    switch (message.type) {
      case 'command':
        this.executeCommand(message.data);
        break;
      case 'build':
        this.behaviors.buildStructure(message.data);
        break;
      case 'gather':
        this.behaviors.gatherResources(message.data);
        break;
      case 'fly':
        this.behaviors.flyTo(message.data);
        break;
      case 'status_update':
      // Ignore status updates from server - we don't need to act on them
      break;
      case 'registration_ack':
      // Acknowledgment that bot is registered - log it
      console.log('Bot registration acknowledged');
      break;

default:
        console.warn('Unknown WebSocket message type:', message.type);
    }
  }

  executeCommand(commandData) {
    switch (commandData.action) {
      case 'move':
        this.pathfinder.moveTo(commandData.target);
        break;
      case 'look':
        this.bot.lookAt(commandData.target);
        break;
      case 'jump':
        this.bot.setControlState('jump', true);
        setTimeout(() => this.bot.setControlState('jump', false), 100);
        break;
      case 'sprint':
        this.bot.setControlState('sprint', commandData.state || true);
        break;
      case 'status_update':
      // Ignore status updates from server - we don't need to act on them
      break;

default:
        console.warn('Unknown command action:', commandData.action);
    }
  }

    sendStatusUpdate() {
      if (!this.isConnected || !this.bot || !this.ws) return;
      
      try {
        const position = this.bot.entity.position.floored();
        const health = this.bot.health;
        const food = this.bot.food;
        const experience = this.bot.experience;
        const inventory = this.bot.inventory.items().map(item => ({
          type: item.name,
          count: item.count,
          metadata: item.metadata
        }));
        
        // Calculate exploration percentage (simplified)
        const exploration = Math.min((this.bot.entity.position.distanceTo(new Vec3(0, 64, 0)) / 1000) * 100, 100);
        
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            type: 'status_update',
            data: {
              connected: this.isConnected,
              position: { x: position.x, y: position.y, z: position.z },
              health,
              food,
              experience,
              exploration: exploration,
              inventory,
              message: `Bot at (${position.x}, ${position.y}, ${position.z})`
            }
          }));
        }
      } catch (err) {
        console.error('Error sending status update:', err);
      }
    }

  async disconnect() {
    if (this.bot) {
      this.bot.end();
    }
    if (this.ws) {
      this.ws.close();
    }
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
    }
    this.isConnected = false;
  }
}

module.exports = MinecraftBot;