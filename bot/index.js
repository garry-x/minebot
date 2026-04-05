const logger = require('./logger');

logger.info('[Bot] Loading bot/index.js module');
const mineflayer = require('mineflayer');
const WebSocket = require('ws');
const Pathfinder = require('./pathfinder');
const { Vec3 } = require('vec3');
const ScreenshotModule = require('./ScreenshotModule');

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
    this.deadReason = null;
    this.currentMode = null;
    this.screenshotModule = null;
    this.screenshotCaptureFn = null;
    this._streamCaptureInterval = null;
    this.evolutionManager = null;
  }

async connect(username, accessToken, startAutomatic = false) {
  logger.info('[Bot] connect() called, this.botId is:', this.botId);
  return new Promise((resolve, reject) => {
    logger.info(`[Bot] Creating bot with username: ${username}`);
    logger.info(`[Bot] Target server: ${this.options.host || 'localhost'}:${this.options.port || 25565}`);
    logger.info(`[Bot] Start automatic: ${startAutomatic}`);
    logger.trace('[Bot] Inside Promise, this.botId is:', this.botId);
    
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
    this.startAutomatic = startAutomatic;
    
    logger.trace('[Bot] After createBot, this.botId is:', this.botId);

    // Set botId if not already set
    logger.trace('[Bot] Before ID check, this.botId is:', this.botId);
    if (!this.botId) {
      this.botId = `bot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      logger.info(`[Bot] Bot ID set to: ${this.botId}`);
    } else {
      logger.trace('[Bot] Using existing botId:', this.botId);
    }

    logger.info('[Bot] Setting up event listeners');
    this.setupEventListeners();
    
    // Set up events for basic bot events that fire before spawn
    this.bot.on('error', (err) => {
      logger.error(`[Bot] Error: ${err.message}`);
    });

    let isResolved = false;
    let connectTimeout = null;

    this.bot.once('spawn', () => {
         // Set up WebSocket connection after bot spawns
      this.setupWebSocket();
      logger.info('[Bot] Bot spawned');
      this.isConnected = true;
      // Set wrapper reference on mineflayer bot for behaviors access
      this.bot.__wrapper = this;
      // Load and attach mcData after bot is ready (pathfinder needs it)
      const mcData = require('minecraft-data')(this.bot.version);
      logger.trace('[Bot] mcData loaded:', !!mcData);
      if (!mcData) {
        logger.error('[Bot] mcData is null or undefined!');
        throw new Error('Failed to load mcData');
      }
      // Attach mcData to bot's _client for pathfinder access
      this.bot._client.mcData = mcData;
      logger.trace('[Bot] mcData attached to _client:', !!this.bot._client.mcData);
      
      // Wait a bit for bot to fully initialize
      setTimeout(async () => {
        try {
          logger.trace('[Bot] Bot version:', this.bot.version);
          
          // Initialize evolution manager
          try {
            logger.info('[Bot] Initializing evolution manager with botId:', this.botId);
            const StrategyEvolutionManager = require('./evolution/strategy-manager');
            this.evolutionManager = new StrategyEvolutionManager(this.botId);
            await this.evolutionManager.connect();
            logger.info('[Bot] Evolution manager initialized successfully');
          } catch (evoErr) {
            logger.error('[Bot] Evolution manager initialization failed:', evoErr.message);
            logger.trace('[Bot] Evolution manager error stack:', evoErr.stack);
          }
            
             // Initialize modules after bot is ready
             this.pathfinder = new Pathfinder(this.bot);
             this.behaviors = require('./behaviors')(this.bot, this.pathfinder, this.evolutionManager);
             this.autonomousRunning = false;
             this.goalState = null;
             this.events = require('./events')(this.bot, this.evolutionManager);
             this.events.setupListeners();
           
              // Initialize screenshot module and start streaming (non-blocking)
              this.initializeScreenshot()
                .then((success) => {
                  if (success) {
                    logger.info('[Bot] Screenshot module initialized, starting stream');
                    const captureFn = this.startScreenshotStream({ fps: 20, quality: 0.8 });
                    logger.trace('[Bot] Screenshot stream started', captureFn ? 'success' : 'failed');
                  } else {
                    logger.error('[Bot] Screenshot module initialization failed');
                  }
                })
                .catch(err => {
                  logger.error(`[Bot] Screenshot init failed: ${err.message}`);
                });
           
           // Generate bot ID if not already set
           if (!this.botId) {
             this.botId = `bot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
           }
               logger.info(`[Bot] Bot ready with ID: ${this.botId}`);
               
               // Start automatic behavior if requested
               if (this.startAutomatic) {
                 const automaticMode = 'survival';
                 logger.info(`[Bot] Starting automatic behavior in ${automaticMode} mode`);
                 // Start automatic behavior in the background without blocking
                 this.behaviors.automaticBehavior({ mode: automaticMode })
                   .then(() => {
                     logger.info(`[Bot] Automatic behavior started with mode: ${automaticMode}`);
                   })
                   .catch((err) => {
                     logger.error(`[Bot] Error in automatic behavior: ${err.message}`);
                   });
                isResolved = true;
                clearTimeout(connectTimeout);
                resolve();
              } else {
                isResolved = true;
                clearTimeout(connectTimeout);
                resolve();
              }
            } catch (initError) {
              logger.error(`[Bot] Error initializing modules:`, initError);
              reject(initError);
            }
            }, 0);
        });

    this.bot.once('error', (err) => {
      logger.info(`[Bot] Error: ${err.message}`);
      isResolved = true;
      clearTimeout(connectTimeout);
      reject(err);
    });

    // The end/disconnect handler is in setupEventListeners()
    
    // Add a timeout to prevent hanging
    connectTimeout = setTimeout(() => {
      if (!isResolved) {
        logger.info('[Bot] Connection timeout after 60 seconds');
        reject(new Error('Connection timeout - failed to spawn'));
        if (this.bot) {
          this.bot.end();
          this.bot = null;
        }
      }
    }, 60000);
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
      logger.info('[Bot] Bot died');
      this.deadReason = 'Bot died';
      
      // Update bot state to stopped
      if (this.botId) {
        const db = require('../config/models/BotState');
        db.updateBotStatus(this.botId, 'stopped').catch(err => {
          logger.error(`[Bot] Failed to update state on death: ${err.message}`);
        });
      }
      
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
      logger.info('[Bot] Bot respawned');
      this.isConnected = true;
      // Send status update to update position after respawn
      setTimeout(() => {
        this.sendStatusUpdate();
      }, 1000);
    });

    // Handle error
    this.bot.on('error', (err) => {
      logger.error('Bot error:', err);
      this.deadReason = `Error: ${err.message}`;
      
      // Update bot state to stopped on error
      if (this.botId) {
        const db = require('../config/models/BotState');
        db.updateBotStatus(this.botId, 'stopped').catch(err => {
          logger.error(`[Bot] Failed to update state on error: ${err.message}`);
        });
      }
      
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'status_update',
          data: {
            connected: this.isConnected,
            message: this.deadReason,
            position: null
          }
        }));
      }
    });

    // Handle end/disconnect
    this.bot.on('end', () => {
      logger.info('[Bot] End event triggered - connection closed');
      this.isConnected = false;
      if (!this.deadReason) {
        this.deadReason = 'Disconnected';
      }
      
      // Update bot state to stopped on disconnect
      if (this.botId) {
        const db = require('../config/models/BotState');
        db.updateBotStatus(this.botId, 'stopped').catch(err => {
          logger.error(`[Bot] Failed to update state on disconnect: ${err.message}`);
        });
      }
      
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'status_update',
          data: {
            connected: this.isConnected,
            message: this.deadReason,
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
        logger.trace(`WebSocket connected to backend at ${wsHost}:${wsPort}/`);
        
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
        logger.error('Error parsing WebSocket message:', err);
      }
    });
    
    this.ws.on('close', () => {
      logger.trace('WebSocket disconnected from backend');
      if (this.statusInterval) {
        clearInterval(this.statusInterval);
        this.statusInterval = null;
      }
    });
    
    this.ws.on('error', (err) => {
      logger.error('WebSocket error:', err);
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
      logger.trace('Bot registration acknowledged');
      break;

default:
        logger.warn('Unknown WebSocket message type:', message.type);
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
        logger.warn('Unknown command action:', commandData.action);
    }
  }

    sendStatusUpdate() {
      if (!this.isConnected || !this.bot || !this.bot.entity || !this.ws) return;
      
      try {
        const position = this.bot.entity.position;
        const health = this.bot.health;
        const food = this.bot.food;
        const experience = this.bot.experience;
        const inventory = this.bot.inventory ? this.bot.inventory.items().map(item => ({
          type: item.name,
          count: item.count,
          metadata: item.metadata
        })) : [];
        
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
              message: `Bot at (${Math.floor(position.x)}, ${Math.floor(position.y)}, ${Math.floor(position.z)})`
            }
          }));
        }
        
        // Save bot state to persistent store
        if (this.botId && this.bot && this.bot.username) {
          const db = require('../config/models/BotState');
          db.saveBot(this.botId, {
            username: this.bot.username,
            mode: this.currentMode || 'survival',
            position_x: position.x,
            position_y: position.y,
            position_z: position.z,
            health: health,
            food: food,
            status: 'active'
          }).catch(err => {
            logger.error(`[Bot] Failed to save state: ${err.message}`);
          });
        }
      } catch (err) {
        logger.error('Error sending status update:', err);
      }
    }

  async initializeScreenshot() {
    if (this.screenshotModule) {
      this.screenshotModule.destroy();
    }
    
    try {
      this.screenshotModule = new ScreenshotModule(this.bot);
      await this.screenshotModule.initialize(854, 480);
      return true;
    } catch (err) {
      logger.error(`[Screenshot] Failed to initialize: ${err.message}`);
      return false;
    }
  }

  startScreenshotStream(options = {}) {
    const { fps = 20, quality = 0.8 } = options;
    
    if (!this.screenshotModule || !this.screenshotModule.isReady()) {
      logger.error('[Screenshot] Module not ready');
      return null;
    }

    this.screenshotCaptureFn = async (captureOptions) => {
      try {
        const buffer = await this.screenshotModule.captureWithOptions(captureOptions);
        return buffer;
      } catch (err) {
        logger.error(`[Screenshot] Capture error: ${err.message}`);
        return null;
      }
    };
    
    return this.screenshotCaptureFn;
  }

  stopScreenshotStream() {
    this.screenshotCaptureFn = null;
  }

  getScreenshotFn() {
    return this.screenshotCaptureFn;
  }

  async disconnect() {
    this.stopScreenshotStream();
    
    if (this._streamCaptureInterval) {
      clearInterval(this._streamCaptureInterval);
      this._streamCaptureInterval = null;
    }
    
    if (this.screenshotModule) {
      this.screenshotModule.destroy();
      this.screenshotModule = null;
    }
    
    // Update bot state to stopped
    if (this.botId) {
      const db = require('../config/models/BotState');
      db.updateBotStatus(this.botId, 'stopped').catch(err => {
        logger.error(`[Bot] Failed to update state on disconnect: ${err.message}`);
      });
    }
    
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