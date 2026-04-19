import type WebSocket from 'ws';

type BotInstance = any;

// Interfaces
interface BotOptions {
  botId?: string;
  botServerHost?: string;
  botServerPort?: number;
  host?: string;
  port?: number;
  enableLLM?: boolean;
}

interface BotStateData {
  username?: string;
  mode: string;
  position_x: number;
  position_y: number;
  position_z: number;
  health: number;
  food: number;
  status: string;
}

interface WebSocketMessage {
  type: string;
  data?: unknown;
}

interface CommandData {
  action: string;
  target?: { x: number; y: number; z: number };
  state?: boolean;
}

interface ScreenshotOptions {
  fps?: number;
  quality?: number;
}

interface EventListeners {
  setupListeners: () => void;
}

class MinecraftBot {
  private options: BotOptions;
  private bot: BotInstance | null;
  private ws: WebSocket | null;
  private isConnected: boolean;
  private behaviors: unknown;
  private events: EventListeners | null;
  private pathfinder: unknown;
  private statusInterval: ReturnType<typeof setInterval> | null;
  private botId: string | null;
  private botServerHost: string;
  private botServerPort: number;
  private deadReason: string | null;
  private currentMode: string | null;
  private screenshotModule: unknown;
  private screenshotCaptureFn: (() => Promise<Buffer>) | null;
  private _streamCaptureInterval: ReturnType<typeof setInterval> | null;
  private _lastSavedState: BotStateData | null;
  private _lastDbWriteTime: number;
  private shouldReconnect: boolean;
  private startAutomatic: boolean;
  private autonomousRunning: boolean;
  private autonomousEngine: unknown;
  private goalState: unknown;
  public enableLLM: boolean;

  constructor(options: BotOptions = {}) {
    this.options = options;
    this.bot = null;
    this.ws = null;
    this.isConnected = false;
    this.behaviors = null;
    this.events = null;
    this.pathfinder = null;
    this.statusInterval = null;
    this.botId = options.botId || null;
    this.botServerHost = options.botServerHost || process.env.BOT_SERVER_HOST || 'localhost';
    this.botServerPort = options.botServerPort || parseInt(process.env.BOT_SERVER_PORT || '9500');
    this.deadReason = null;
    this.currentMode = null;
    this.screenshotModule = null;
    this.screenshotCaptureFn = null;
    this._streamCaptureInterval = null;
    this._lastSavedState = null;
    this._lastDbWriteTime = 0;
    this.shouldReconnect = false;
    this.startAutomatic = false;
    this.autonomousRunning = false;
    this.autonomousEngine = null;
    this.goalState = null;
    this.enableLLM = this.options.enableLLM || false;
  }

  async connect(username: string, accessToken?: string, startAutomatic = false): Promise<void> {
    const logger = require('./logger');
    const fs = require('fs');
    const path = require('path');
    const mineflayer = require('mineflayer');
    const WebSocket = require('ws');
    const Pathfinder = require('./pathfinder');
    const ScreenshotModule = require('./ScreenshotModule');

    logger.info('[Bot] connect() called, this.botId is:', this.botId);
    return new Promise((resolve, reject) => {
      logger.info(`[Bot] Creating bot with username: ${username}`);
      logger.info(`[Bot] Target server: ${this.options.host || 'localhost'}:${this.options.port || 25565}`);
      logger.info(`[Bot] Start automatic: ${startAutomatic}`);
      logger.trace('[Bot] Inside Promise, this.botId is:', this.botId);
      
      // For offline mode, we need to provide a dummy access token
      const botOptions: { host: string; port: number; username: string; version: string; accessToken?: string } = {
        host: this.options.host || process.env.MINECRAFT_SERVER_HOST || 'localhost',
        port: this.options.port || parseInt(process.env.MINECRAFT_SERVER_PORT || '25565'),
        username: username,
        version: '1.21.11'
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
      this.bot.on('error', (err: Error) => {
        logger.error(`[Bot] Error: ${err.message}`);
      });

      let isResolved = false;
      let connectTimeout: NodeJS.Timeout | null = null;

      this.bot.once('spawn', () => {
        // Set up WebSocket connection after bot spawns
        this.setupWebSocket();
        logger.info('[Bot] Bot spawned');
        this.isConnected = true;
        
        const syncGameMode = (attempt = 1, maxAttempts = 5): void => {
          logger.info(`[Bot] ====== GAME MODE SYNC (attempt ${attempt}/${maxAttempts}) ======`);
          
          let serverGamemode = 'survival';
          try {
            const serverPropsPath = path.join(process.cwd(), 'resources/java-1.21.11/server.properties');
            if (fs.existsSync(serverPropsPath)) {
              const props = fs.readFileSync(serverPropsPath, 'utf8');
              const match = props.match(/^gamemode=(\S+)/m);
              if (match) {
                serverGamemode = match[1].trim().toLowerCase();
              }
            }
          } catch(e) {
            logger.info('[Bot] Read error:', (e as Error).message);
          }
          
          const currentGM = this.bot!.gameMode;
          logger.info(`[Bot] Server GM: ${serverGamemode}, Bot GM: ${currentGM} (${typeof currentGM})`);
          
          if (serverGamemode === 'survival' && currentGM === 0) {
            logger.info('[Bot] Already in survival mode, skipping');
            return;
          }
          
          if (serverGamemode === 'survival' && currentGM !== 0) {
            logger.info('[Bot] Sending /gamemode survival command...');
            this.bot!.chat('/gamemode survival');
            
            setTimeout(() => {
              const newGM = this.bot!.gameMode;
              logger.info(`[Bot] After cmd, Bot GM: ${newGM}`);
              
              if (newGM !== 0 && attempt < maxAttempts) {
                logger.info(`[Bot] Game mode not changed, retrying in 2s...`);
                setTimeout(() => syncGameMode(attempt + 1, maxAttempts), 2000);
              } else if (newGM === 0) {
                logger.info('[Bot] Game mode successfully changed to survival');
              } else {
                logger.warn(`[Bot] Game mode sync failed after ${maxAttempts} attempts`);
              }
            }, 1500);
          }
        };
        
        setTimeout(syncGameMode, 2500);
        
        this.bot!.__wrapper = this;
        const mcData = require('minecraft-data')(this.bot!.version);
        logger.trace('[Bot] mcData loaded:', !!mcData);
        if (!mcData) {
          logger.error('[Bot] mcData is null or undefined!');
          throw new Error('Failed to load mcData');
        }
        this.bot!._client.mcData = mcData;
        this.bot!.mcData = mcData;
        logger.trace('[Bot] mcData attached to _client:', !!this.bot!._client.mcData);
        
        try {
          const pf = require('mineflayer-pathfinder');
          const originalInject = pf.pathfinder;
          pf.pathfinder = (bot: any) => {
            const md = bot.mcData || bot._client?.mcData;
            if (!md || !md.blocksByName) {
              throw new Error('mcData not available for pathfinder');
            }
            const Module = require('module');
            const originalRequire = Module.prototype.require;
            Module.prototype.require = function(id: string) {
              if (id === 'minecraft-data') {
                return () => md;
              }
              return originalRequire.apply(this, arguments);
            };
            try {
              originalInject(bot);
            } finally {
              Module.prototype.require = originalRequire;
            }
          };
          this.bot!.loadPlugin(pf.pathfinder);
          logger.info('[Bot] Loaded mineflayer-pathfinder plugin');
        } catch (pfErr) {
          logger.warn('[Bot] Could not load mineflayer-pathfinder:', (pfErr as Error).message);
        }
        
        // Wait a bit for bot to fully initialize
        setTimeout(async () => {
          try {
            logger.trace('[Bot] Bot version:', this.bot!.version);
            
            this.pathfinder = new Pathfinder(this.bot!);
            this.behaviors = require('./behaviors')(this.bot!, this.pathfinder);
            this.autonomousRunning = false;
            this.autonomousEngine = null;
            this.goalState = null;
            this.events = require('./events')(this.bot!);
            this.events.setupListeners();
          
            // Initialize screenshot module and start streaming (non-blocking)
            this.initializeScreenshot()
              .then((success) => {
                if (success) {
                  logger.info('[Bot] Screenshot module initialized, starting stream');
                  const captureFn = this.startScreenshotStream({ fps: 10, quality: 0.6 });
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
              (this.behaviors as { automaticBehavior: (options: { mode: string }) => Promise<void> }).automaticBehavior({ mode: automaticMode })
                .then(() => {
                  logger.info(`[Bot] Automatic behavior started with mode: ${automaticMode}`);
                })
                .catch((err) => {
                  logger.error(`[Bot] Error in automatic behavior: ${err.message}`);
                });
              isResolved = true;
              if (connectTimeout) clearTimeout(connectTimeout);
              resolve();
            } else {
              isResolved = true;
              if (connectTimeout) clearTimeout(connectTimeout);
              resolve();
            }
          } catch (initError) {
            logger.error(`[Bot] Error initializing modules:`, initError);
            reject(initError);
          }
        }, 0);
      });

      this.bot.once('error', (err: Error) => {
        logger.info(`[Bot] Error: ${err.message}`);
        isResolved = true;
        if (connectTimeout) clearTimeout(connectTimeout);
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
      }, parseInt(process.env.BOT_CONNECTION_TIMEOUT || '60000'));
    });
  }

  private setupEventListeners(): void {
    const logger = require('./logger');
    const WebSocket = require('ws');

    if (!this.bot) return;

    // Handle chat messages
    this.bot.on('chat', (username: string, message: string) => {
      if (username === this.bot!.username) return; // Ignore our own messages
      
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
      
      setTimeout(() => {
        if (this.bot && !this.bot.isAlive) {
          logger.info('[Bot] Auto-respawning...');
          try {
            this.bot!.respawn();
          } catch (err) {
            logger.error(`[Bot] Auto-respawn failed: ${(err as Error).message}`);
          }
        }
      }, 1000);
      
      if (this.botId) {
        const db = require('../config/models/BotState');
        db.updateBotStatus(this.botId, 'dead').catch(err => {
          logger.error(`[Bot] Failed to update state on death: ${err.message}`);
        });
      }
      
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'status_update',
          data: {
            connected: this.isConnected,
            message: 'Bot died - auto-respawning...',
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
    this.bot.on('error', (err: Error) => {
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

    this.bot.on('end', (reason: string) => {
      logger.info(`[Bot] End event triggered: ${reason || 'unknown'}`);
      this.isConnected = false;
      if (!this.deadReason) {
        this.deadReason = reason || 'Disconnected';
      }
      
      if (this.statusInterval) {
        clearInterval(this.statusInterval);
        this.statusInterval = null;
      }
      
      const attemptReconnect = async (attempt = 1, maxAttempts = 10): Promise<void> => {
        if (attempt > maxAttempts) {
          logger.info('[Bot] Reconnect failed, giving up');
          return;
        }
        
        logger.info(`[Bot] Reconnecting... attempt ${attempt}/${maxAttempts}`);
        await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
        
        if (!this.shouldReconnect) {
          return;
        }
        
        try {
          await this.bot!.connect(this.options);
          logger.info('[Bot] Reconnected successfully!');
          this.isConnected = true;
          this.deadReason = null;
          
          if (this.botId) {
            const db = require('../config/models/BotState');
            db.updateBotStatus(this.botId, 'active').catch(err => {});
          }
          
          if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.setupWebSocket();
          }
          
          if (this.autonomousRunning) {
            (this.behaviors as { automaticBehavior: (options: { mode: string; initialGoal: string; goalState: unknown }) => Promise<void> })
              .automaticBehavior({ mode: 'autonomous', initialGoal: 'basic_survival', goalState: this.goalState });
          }
          
        } catch (err) {
          logger.info(`[Bot] Reconnect failed: ${(err as Error).message}`);
          attemptReconnect(attempt + 1, maxAttempts);
        }
      };
      
      this.shouldReconnect = true;
      attemptReconnect();
    });
  }

  private setupWebSocket(): void {
    const logger = require('./logger');
    const WebSocket = require('ws');

    // Connect to the backend WebSocket server
    const wsHost = this.options.botServerHost || process.env.BOT_SERVER_HOST || 'localhost';
    const wsPort = this.options.botServerPort || parseInt(process.env.BOT_SERVER_PORT || '9500');
    this.ws = new WebSocket(`ws://${wsHost}:${wsPort}/`);
    
    this.ws.on('open', () => {
      logger.trace(`WebSocket connected to backend at ${wsHost}:${wsPort}/`);
      
      // Register this bot's WebSocket connection with the backend
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'register_bot',
          data: { 
            botId: this.botId || `bot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` 
          }
        }));
      }
      
      // Start sending periodic status updates (reduced from 3s to 10s for performance)
      this.statusInterval = setInterval(() => {
        this.sendStatusUpdate();
      }, parseInt(process.env.STATUS_UPDATE_INTERVAL || '10000'));
    });

    this.ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleWebSocketMessage(message);
      } catch (err) {
        logger.error('Error parsing WebSocket message:', err);
      }
    });
    
    this.ws.on('close', () => {
      logger.trace('WebSocket disconnected from backend');
      this.isConnected = false;
      if (this.statusInterval) {
        clearInterval(this.statusInterval);
        this.statusInterval = null;
      }
    });
    
    this.ws.on('error', (err: Error) => {
      logger.error('WebSocket error:', err);
    });
  }

  private handleWebSocketMessage(message: WebSocketMessage): void {
    const logger = require('./logger');
    
    switch (message.type) {
      case 'command':
        this.executeCommand(message.data as CommandData);
        break;
      case 'build':
        (this.behaviors as { buildStructure: (data: unknown) => void }).buildStructure(message.data);
        break;
      case 'gather':
        (this.behaviors as { gatherResources: (data: unknown) => void }).gatherResources(message.data);
        break;
      case 'fly':
        (this.behaviors as { flyTo: (data: unknown) => void }).flyTo(message.data);
        break;
      case 'status_update':
        // Ignore status updates from server - we don't need to act on them
        break;
      case 'registration_ack':
        // Acknowledgment that bot is registered - log it
        logger.trace('Bot registration acknowledged');
        break;
      case 'bots_list':
        // Response to register_bot with current bots list - log and ignore
        logger.trace('Received bots list from server');
        break;

      default:
        logger.trace('Unknown WebSocket message type:', message.type);
    }
  }

  private executeCommand(commandData: CommandData): void {
    const logger = require('./logger');
    
    switch (commandData.action) {
      case 'move':
        (this.pathfinder as { moveTo: (target: { x: number; y: number; z: number }) => Promise<void> }).moveTo(commandData.target!);
        break;
      case 'look':
        this.bot!.lookAt(commandData.target!);
        break;
      case 'jump':
        this.bot!.setControlState('jump', true);
        setTimeout(() => this.bot!.setControlState('jump', false), 100);
        break;
      case 'sprint':
        this.bot!.setControlState('sprint', commandData.state !== undefined ? commandData.state : true);
        break;
      case 'status_update':
        // Ignore status updates from server - we don't need to act on them
        break;

      default:
        logger.warn('Unknown command action:', commandData.action);
    }
  }

  private _shouldSaveToDb(currentState: BotStateData): boolean {
    const now = Date.now();
    const minWriteInterval = parseInt(process.env.MIN_DB_WRITE_INTERVAL || '30000');
    
    if (now - this._lastDbWriteTime < minWriteInterval) {
      return false;
    }
    
    if (!this._lastSavedState) {
      return true;
    }
    
    const hasSignificantChange = 
      Math.abs(currentState.health - this._lastSavedState.health) >= 2 ||
      Math.abs(currentState.food - this._lastSavedState.food) >= 2 ||
      Math.sqrt(
        Math.pow(currentState.position_x - this._lastSavedState.position_x, 2) +
        Math.pow(currentState.position_y - this._lastSavedState.position_y, 2) +
        Math.pow(currentState.position_z - this._lastSavedState.position_z, 2)
      ) >= 5;
    
    return hasSignificantChange;
  }

  private sendStatusUpdate(): void {
    const logger = require('./logger');
    const WebSocket = require('ws');
    
    if (!this.isConnected || !this.bot || !this.bot.entity || !this.ws) return;
    
    try {
      const position = this.bot.entity.position;
      const health = this.bot.health;
      const food = this.bot.food;
      const experience = this.bot.experience;
      
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'status_update',
          data: {
            connected: this.isConnected,
            position: { x: position.x, y: position.y, z: position.z },
            health,
            food,
            experience,
            message: `Bot at (${Math.floor(position.x)}, ${Math.floor(position.y)}, ${Math.floor(position.z)})`
          }
        }));
      }
      
      if (this.botId && this.bot && this.bot.username) {
        const currentState: BotStateData = {
          username: this.bot.username,
          mode: this.currentMode || 'survival',
          position_x: position.x,
          position_y: position.y,
          position_z: position.z,
          health: health,
          food: food,
          status: 'active'
        };
        
        if (this._shouldSaveToDb(currentState)) {
          const db = require('../config/models/BotState');
          db.saveBot(this.botId, currentState).catch(err => {
            logger.error(`[Bot] Failed to save state: ${err.message}`);
          });
          this._lastSavedState = { ...currentState };
          this._lastDbWriteTime = Date.now();
        }
      }
    } catch (err) {
      logger.error('Error sending status update:', err);
    }
  }

  async initializeScreenshot(): Promise<boolean> {
    const logger = require('./logger');
    const ScreenshotModule = require('./ScreenshotModule');
    
    if (this.screenshotModule) {
      (this.screenshotModule as { destroy: () => void }).destroy();
    }
    
    try {
      this.screenshotModule = new ScreenshotModule(this.bot!);
      await (this.screenshotModule as { initialize: (width: number, height: number) => Promise<boolean> }).initialize(854, 480);
      return true;
    } catch (err) {
      logger.error(`[Screenshot] Failed to initialize: ${(err as Error).message}`);
      return false;
    }
  }

  startScreenshotStream(options: ScreenshotOptions = {}): (() => Promise<Buffer>) | null {
    const logger = require('./logger');
    const { fps = 10, quality = 0.6 } = options;
    
    if (!this.screenshotModule || !(this.screenshotModule as { isReady: () => boolean }).isReady()) {
      logger.error('[Screenshot] Module not ready');
      return null;
    }

    this.screenshotCaptureFn = async (captureOptions?: { width?: number; height?: number; quality?: number }) => {
      try {
        const buffer = await (this.screenshotModule as { captureWithOptions: (options: unknown) => Promise<Buffer> }).captureWithOptions(captureOptions);
        return buffer;
      } catch (err) {
        logger.error(`[Screenshot] Capture error: ${(err as Error).message}`);
        return Buffer.alloc(0);
      }
    };
    
    return this.screenshotCaptureFn;
  }

  stopScreenshotStream(): void {
    this.screenshotCaptureFn = null;
  }

  getScreenshotFn(): (() => Promise<Buffer>) | null {
    return this.screenshotCaptureFn;
  }

  async disconnect(): Promise<void> {
    const logger = require('./logger');
    
    this.shouldReconnect = false;
    this.stopScreenshotStream();
    
    if (this._streamCaptureInterval) {
      clearInterval(this._streamCaptureInterval);
      this._streamCaptureInterval = null;
    }
    
    if (this.screenshotModule) {
      (this.screenshotModule as { destroy: () => void }).destroy();
      this.screenshotModule = null;
    }
    
    if (this.botId) {
      const db = require('../config/models/BotState');
      db.updateBotStatus(this.botId, 'stopped').catch(err => {});
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

export = MinecraftBot;
