const mineflayer = require('mineflayer');
const WebSocket = require('ws');
const Pathfinder = require('./pathfinder');

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
  }

  async connect(username, accessToken) {
    return new Promise((resolve, reject) => {
      this.bot = mineflayer.createBot({
        host: this.options.host || 'localhost',
        port: this.options.port || 25565,
        username: username,
        accessToken: accessToken,
        version: false // Let mineflayer determine version
      });

      // Initialize modules
      this.pathfinder = new Pathfinder(this.bot);
      this.behaviors = require('./behaviors')(this.bot, this.pathfinder);
      this.events = require('./events')(this.bot);

      this.setupEventListeners();
      this.setupWebSocket();

      this.bot.once('spawn', () => {
        this.isConnected = true;
        // Generate bot ID if not already set
        if (!this.botId) {
          this.botId = `bot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
        resolve();
      });

      this.bot.once('error', (err) => {
        reject(err);
      });
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
    this.ws = new WebSocket(`ws://localhost:${this.options.port || 9000}/bot/status`);
    
    this.ws.on('open', () => {
      console.log('WebSocket connected to backend');
      
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
      const inventory = this.bot.inventory.items().map(item => ({
        type: item.name,
        count: item.count,
        metadata: item.metadata
      }));
      
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'status_update',
          data: {
            connected: this.isConnected,
            position: { x: position.x, y: position.y, z: position.z },
            health,
            food,
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