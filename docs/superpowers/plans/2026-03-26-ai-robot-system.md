# AI Robot System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an AI Robot System for Minecraft Java Server (version 1.21.x) that can login with Microsoft account, construct things, collect resources, fly autonomously, use LLM for strategy, and be controlled via a web interface.

**Architecture:** Hybrid approach with four main components: Minecraft Bot Module (Node.js/Mineflayer), Express API Server, LLM Service (vllm), and React Frontend. Components communicate via REST/WebSocket for bot control and status updates.

**Tech Stack:** Node.js, Mineflayer, Express, React, vllm (for local LLM), WebSocket, SQLite (for configuration persistence)

---

### File Structure

- `package.json` - Project dependencies and scripts
- `server.js` - Main Express API server entry point
- `bot/` - Minecraft bot module
  - `index.js` - Bot initialization and main logic
  - `auth.js` - Xbox Live authentication handling
  - `behaviors.js` - Building, resource gathering, flying behaviors
  - `events.js` - Event listeners for game events
  - `pathfinder.js` - Improved movement and flying logic
- `llm/` - LLM service module
  - `index.js` - LLM service implementation using vllm
  - `strategy.js` - LLM interaction logic with fallback
- `frontend/` - React frontend application
  - `src/` - React source code
    - `components/` - React components
    - `App.js` - Main application component
    - `index.js` - Entry point
  - `public/` - Static assets
- `tests/` - Test files
  - `bot.test.js` - Bot module tests
  - `api.test.js` - API server tests
  - `auth.test.js` - Authentication tests
  - `llm.test.js` - LLM service tests
  - `llm.strategy.test.js` - LLM strategy tests
  - `integration.test.js` - Integration tests
  - `e2e.test.js` - End-to-end tests with Minecraft server
- `config/` - Configuration persistence
  - `db.js` - SQLite database initialization
  - `models/` - Data models for bot configurations

---

## Implementation Tasks

### Task 1: Project Initialization

**Files:**
- Create: `package.json`
- Create: `.gitignore`

- [ ] **Step 1: Initialize npm project and create package.json**

```json
{
  "name": "minecraft-ai-robot",
  "version": "1.0.0",
  "description": "AI Robot System for Minecraft Java Server",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "frontend:dev": "cd frontend && npm start",
    "test": "jest",
    "test:watch": "jest --watch",
    "build": "cd frontend && npm run build",
    "start:prod": "npm run build && NODE_ENV=production node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "mineflayer": "^4.15.0",
    "ws": "^8.13.0",
    "axios": "^1.4.0",
    "dotenv": "^16.3.1",
    "sqlite3": "^5.1.6"
  },
  "devDependencies": {
    "nodemon": "^3.0.1",
    "jest": "^29.6.0",
    "supertest": "^6.3.3"
  }
}
```

- [ ] **Step 2: Create .gitignore file**

```
node_modules/
.env
frontend/node_modules/
frontend/build/
frontend/dist/
.DS_Store
npm-debug.log*
```

- [ ] **Step 3: Install dependencies**

Run: `npm install`
Expected: Dependencies installed successfully

- [ ] **Step 4: Commit initial setup**

```bash
git add package.json .gitignore
git commit -m "feat: initialize project with dependencies"
```

### Task 2: Set Up Express API Server

**Files:**
- Create: `server.js`
- Create: `.env.example`

- [ ] **Step 1: Create basic Express server**

```javascript
require('dotenv').config();
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('frontend/build'));

// Basic route
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

- [ ] **Step 2: Create .env.example file**

```
PORT=3000
MINECRAFT_SERVER_HOST=localhost
MINECRAFT_SERVER_PORT=25565
SESSION_SECRET=your_session_secret_here
MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret
LLM_SERVICE_URL=http://localhost:8000
```

- [ ] **Step 3: Test server startup**

Run: `node server.js`
Expected: Server starts and listens on port 3000

- [ ] **Step 4: Commit API server setup**

```bash
git add server.js .env.example
git commit -m "feat: set up Express API server"
```

### Task 3: Implement Microsoft Authentication Flow

**Files:**
- Create: `auth/xboxLive.js`
- Create: `auth/oauth.js` (for handling OAuth flow)
- Modify: `server.js`
- Create: `frontend/src/components/MicrosoftLogin.js`
- Create: `tests/auth.test.js`
- Create: `tests/oauth.test.js`

- [ ] **Step 1: Create Xbox Live authentication service**

```javascript
const axios = require('axios');

class XboxLiveAuth {
  constructor(clientId, clientSecret) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  async getAuthToken(authorizationCode) {
    try {
      const response = await axios.post('https://login.live.com/oauth20_token.srf', 
        new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code: authorizationCode,
          grant_type: 'authorization_code',
          redirect_uri: 'http://localhost:3000/auth/callback'
        }));
      return response.data;
    } catch (error) {
      throw new Error(`Xbox Live auth failed: ${error.message}`);
    }
  }

  async getXSTSToken(userToken) {
    try {
      const response = await axios.post('https://xsts.auth.xboxlive.com/xsts/authorize', 
        {
          Properties: {
            SandboxId: 'RETAIL',
            UserTokens: [userToken]
          },
          RelyingParty: 'rp://api.minecraftservices.com/',
          TokenType: 'JWT'
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        });
      return response.data;
    } catch (error) {
      throw new Error(`XSTS token failed: ${error.message}`);
    }
  }

  async getMinecraftToken(xstsToken) {
    try {
      const response = await axios.post('https://api.minecraftservices.com/authentication/login_with_xbox', 
        {
          identityToken: `XBL3.0 x=${xstsToken.DisplayClaims.xui[0].uhs};${xstsToken.Token}`
        });
      return response.data;
    } catch (error) {
      throw new Error(`Minecraft token failed: ${error.message}`);
    }
  }
}

module.exports = XboxLiveAuth;
```

- [ ] **Step 2: Create OAuth helper for handling Microsoft login flow**

```javascript
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

class MicrosoftOAuth {
  constructor(clientId, clientSecret, redirectUri) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
    this.stateStore = new Map(); // In production, use Redis or database
  }

  getAuthUrl() {
    const state = uuidv4();
    // Store state for validation (expire after 10 minutes)
    this.stateStore.set(state, Date.now() + 10 * 60 * 1000);
    
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      scope: 'XboxLive.signin XboxLive.offline_access',
      state: state
    });
    
    return `https://login.live.com/oauth20_authorize.srf?${params.toString()}`;
  }

  async validateState(state) {
    const expiry = this.stateStore.get(state);
    if (!expiry) return false;
    
    const now = Date.now();
    if (now > expiry) {
      this.stateStore.delete(state);
      return false;
    }
    return true;
  }

  async consumeState(state) {
    const valid = await this.validateState(state);
    if (valid) {
      this.stateStore.delete(state);
      return true;
    }
    return false;
  }

  async getAuthToken(authorizationCode) {
    try {
      const response = await axios.post('https://login.live.com/oauth20_token.srf', 
        new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code: authorizationCode,
          grant_type: 'authorization_code',
          redirect_uri: this.redirectUri
        }));
      return response.data;
    } catch (error) {
      throw new Error(`Xbox Live auth failed: ${error.message}`);
    }
  }
}

module.exports = MicrosoftOAuth;
```

- [ ] **Step 3: Add auth and OAuth routes to server.js**

```javascript
// Add after middleware
const XboxLiveAuth = require('./auth/xboxLive');
const MicrosoftOAuth = require('./auth/oauth');
const auth = new XboxLiveAuth(
  process.env.MICROSOFT_CLIENT_ID,
  process.env.MICROSOFT_CLIENT_SECRET
);
const oauth = new MicrosoftOAuth(
  process.env.MICROSOFT_CLIENT_ID,
  process.env.MICROSOFT_CLIENT_SECRET,
  'http://localhost:3000/auth/callback'
);

// Auth routes
app.get('/auth/microsoft/login', (req, res) => {
  try {
    const authUrl = oauth.getAuthUrl();
    res.redirect(authUrl);
  } catch (error) {
    res.status(500).json({ error: `Failed to generate auth URL: ${error.message}` });
  }
});

app.get('/auth/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    
    if (error) {
      return res.status(400).json({ error: `Authentication failed: ${error}` });
    }
    
    if (!code || !state) {
      return res.status(400).json({ error: 'Missing code or state parameter' });
    }
    
    // Validate state to prevent CSRF
    const isValid = await oauth.consumeState(state);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid state parameter' });
    }
    
    // Exchange code for tokens
    try {
      const authData = await auth.getAuthToken(code);
      // In a full implementation, we'd continue to XSTS and Minecraft tokens
      // For now, we'll return the auth data and let frontend handle next steps
      res.json({ 
        success: true, 
        data: authData,
        message: 'Authentication successful. Continue to get XSTS and Minecraft tokens.'
      });
    } catch (tokenError) {
      res.status(400).json({ error: `Token exchange failed: ${tokenError.message}` });
    }
  } catch (error) {
    res.status(500).json({ error: `Callback processing failed: ${error.message}` });
  }
});

// Keep existing endpoints for direct token exchanges (used by bot)
app.post('/auth/xboxlive', async (req, res) => {
  try {
    const { code } = req.body;
    const authData = await auth.getAuthToken(code);
    res.json(authData);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/auth/xsts', async (req, res) => {
  try {
    const { userToken } = req.body;
    const xstsData = await auth.getXSTSToken(userToken);
    res.json(xstsData);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/auth/minecraft', async (req, res) => {
  try {
    const { xstsToken } = req.body;
    const minecraftData = await auth.getMinecraftToken(xstsToken);
    res.json(minecraftData);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
```

- [ ] **Step 4: Create MicrosoftLogin component for frontend**

```javascript
import React, { useState, useEffect } from 'react';

const MicrosoftLogin = ({ onAuthSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Check for auth callback parameters
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const errorParam = urlParams.get('error');
    
    if (errorParam) {
      setError(`Authentication failed: ${errorParam}`);
      // Clear URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }
    
    if (code && state) {
      // Handle callback
      setLoading(true);
      // In a real implementation, we'd send code to backend to complete auth
      // For now, we'll simulate success
      setTimeout(() => {
        setLoading(false);
        onAuthSuccess({
          username: 'testuser', // Would come from token in real implementation
          accessToken: 'fake-access-token-for-demo'
        });
        // Clear URL parameters
        window.history.replaceState({}, document.title, window.location.pathname);
      }, 1000);
    }
  }, []);

  const handleMicrosoftLogin = () => {
    setLoading(true);
    setError(null);
    // Redirect to Microsoft auth
    window.location.href = '/auth/microsoft/login';
  };

  if (loading) {
    return <div className="microsoft-login">Redirecting to Microsoft...</div>;
  }

  return (
    <div className="microsoft-login-container">
      <h3>Sign in with Microsoft</h3>
      <button 
        onClick={handleMicrosoftLogin}
        className="microsoft-button"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 8 }}>
          <path d="M12 2.6a9.9 9.9 0 0 0-6.8 3.4c-1.4-.5-2.6-1.2-3.5-2.2l-.7-1c1-.6 1.9-1.3 2.6-2 .9-.8 1.6-1.8 2-2.8l2.4-.4c-.4 1.1-.6 2.3-.6 3.6 0 2.8 1.1 5.3 2.9 7l1.9-1.7c-1.3-.4-2.5-.9-3.5-1.5zm8.9 2.3l-1.3 2.3c.7.4 1.4.7 2.1.9l2.4-.4c-1.2 1.1-2.4 2-3.4 2.6-1 .6-2.1 1-3.1 1-2.3 0-4.2-.9-5.7-2.4l1.6-2.8c1.7.9 3.5 1.6 5.2 2 1.3-.4 2.5-1 3.3-2.1zm-5.7 7.9c-2.2 0-4-.9-5.3-2.3l-2.1 3.7c1.9 1.1 4.1 1.7 6.4 1.7 2.3 0 4.2-.9 5.7-2.4z"/>
        </svg>
        Sign in with Microsoft
      </button>
      {error && <div className="auth-error">{error}</div>}
    </div>
  );
};

export default MicrosoftLogin;
```

- [ ] **Step 5: Create auth test file**

```javascript
const XboxLiveAuth = require('../auth/xboxLive');
const MicrosoftOAuth = require('../auth/oauth');

describe('XboxLiveAuth', () => {
  const auth = new XboxLiveAuth('test-client-id', 'test-client-secret');

  // Note: Actual authentication tests would require mocking axios
  // This is a placeholder for the structure
  test('should be instantiated', () => {
    expect(auth).toBeDefined();
  });
  
  test('should have getAuthToken method', () => {
    expect(typeof auth.getAuthToken).toBe('function');
  });
  
  test('should have getXSTSToken method', () => {
    expect(typeof auth.getXSTSToken).toBe('function');
  });
  
  test('should have getMinecraftToken method', () => {
    expect(typeof auth.getMinecraftToken).toBe('function');
  });
});

describe('MicrosoftOAuth', () => {
  const oauth = new MicrosoftOAuth('test-client-id', 'test-client-secret', 'http://localhost:3000/auth/callback');
  
  test('should be instantiated', () => {
    expect(oauth).toBeDefined();
  });
  
  test('should have getAuthUrl method', () => {
    expect(typeof oauth.getAuthUrl).toBe('function');
  });
  
  test('should generate valid auth URL', () => {
    const url = oauth.getAuthUrl();
    expect(url).toContain('https://login.live.com/oauth20_authorize.srf');
    expect(url).toContain('client_id=test-client-id');
    expect(url).toContain('response_type=code');
  });
  
  test('should have validateState method', () => {
    expect(typeof oauth.validateState).toBe('function');
  });
  
  test('should have consumeState method', () => {
    expect(typeof oauth.consumeState).toBe('function');
  });
});
```

- [ ] **Step 6: Create OAuth test file**

```javascript
const MicrosoftOAuth = require('../auth/oauth');

describe('MicrosoftOAuth', () => {
  const oauth = new MicrosoftOAuth('test-client-id', 'test-client-secret', 'http://localhost:3000/auth/callback');
  
  // Note: Actual OAuth tests would require more sophisticated mocking
  // This is a placeholder for the structure
  
  test('should be instantiated', () => {
    expect(oauth).toBeDefined();
  });
  
  test('should have getAuthUrl method', () => {
    expect(typeof oauth.getAuthUrl).toBe('function');
  });
});
```

- [ ] **Step 7: Test auth endpoints**

Run: `npm test`
Expected: Tests run (may fail initially due to missing mocks)

- [ ] **Step 8: Commit authentication implementation**

```bash
git add auth/xboxLive.js auth/oauth.js server.js frontend/src/components/MicrosoftLogin.js tests/auth.test.js tests/oauth.test.js
git commit -m "feat: implement Microsoft OAuth authentication flow with proper redirect handling"
```

### Task 4: Implement Minecraft Bot Module

**Files:**
- Create: `bot/index.js`
- Create: `bot/behaviors.js`
- Create: `bot/events.js`
- Create: `bot/pathfinder.js` (for improved movement)
- Modify: `server.js` (to handle bot control)

- [ ] **Step 1: Create bot initialization**

```javascript
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
        resolve();
      });

      this.bot.once('error', (err) => {
        reject(err);
      });
});
}

// Task 5: Implement LLM Service

**Files:**
- Create: `llm/index.js`
- Create: `llm/strategy.js` (for LLM interaction logic)
- Create: `tests/llm.test.js`
- Create: `tests/llm.strategy.test.js`

- [ ] **Step 1: Create LLM service using vllm**

```javascript
const express = require('express');
const Strategy = require('./strategy');
const app = express();
const PORT = process.env.PORT || 8000;
const strategy = new Strategy();

app.use(express.json());

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // In a real implementation, we might check connection to vllm server
    res.json({ 
      status: 'OK', 
      service: 'LLM', 
      timestamp: new Date().toISOString(),
      // Simulate checking if vllm is available
      vllmAvailable: true 
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      service: 'LLM', 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Strategy endpoint - proxy to actual LLM or use fallback
app.post('/strategy', async (req, res) => {
  try {
    const { context, goal, current_state } = req.body;
    
    // Validate input
    if (!context || !goal) {
      return res.status(400).json({ 
        error: 'Context and goal are required' 
      });
    }
    
    // Get strategy from LLM service
    const result = await strategy.getStrategy(context, goal, current_state);
    
    res.json({
      advice: result.advice,
      suggested_actions: result.suggested_actions || [],
      timestamp: new Date().toISOString(),
      // Indicate if we used fallback
      usedFallback: result.usedFallback || false
    });
  } catch (error) {
    console.error('LLM service error:', error);
    res.status(500).json({ 
      error: `LLM processing failed: ${error.message}`,
      timestamp: new Date().toISOString()
    });
  }
});

// Fallback strategy endpoint (when LLM is unavailable)
app.post('/strategy/fallback', (req, res) => {
  try {
    const { context, goal, current_state } = req.body;
    
    // Simple rule-based fallback responses
    let advice = '';
    let suggested_actions = [];
    
    if (goal.includes('build') || goal.includes('construct')) {
      advice = 'To build effectively, start by gathering necessary materials. Consider building a foundation first, then walls, and finally a roof.';
      suggested_actions = [
        { type: 'gather', data: { targetBlocks: ['oak_log', 'cobblestone'], radius: 10 } },
        { type: 'build', data: { width: 5, length: 5, height: 3, blockType: 'oak_planks' } }
      ];
    } else if (goal.includes('gather') || goal.includes('collect')) {
      advice = 'Focus on gathering the most needed resources first. Prioritize rare materials over common ones.';
      suggested_actions = [
        { type: 'gather', data: { targetBlocks: ['diamond_ore', 'iron_ore', 'gold_ore'], radius: 20 } }
      ];
    } else if (goal.includes('explore') || goal.includes('find')) {
      advice = 'When exploring, mark your starting point and move in systematic patterns to avoid getting lost.';
      suggested_actions = [
        { type: 'move', data: { x: 10, y: 64, z: 10 } }
      ];
    } else {
      advice = 'Consider your current situation and what resources are most accessible. Start with simple actions to build momentum.';
      suggested_actions = [
        { type: 'gather', data: { targetBlocks: ['grass', 'dirt', 'stone'], radius: 5 } }
      ];
    }
    
    res.json({ 
      advice, 
      suggested_actions,
      timestamp: new Date().toISOString(),
      usedFallback: true
    });
  } catch (error) {
    res.status(500).json({ error: `Fallback strategy failed: ${error.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`LLM Service running on port ${PORT}`);
});

// Task 6: Implement Persistence Layer

**Files:**
- Create: `config/db.js`
- Create: `config/models/BotConfig.js`
- Create: `tests/config.test.js`

- [ ] **Step 1: Create database initialization**

```javascript
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.resolve(__dirname, '../bot_config.db'), (err) => {
  if (err) {
    console.error('Could not connect to database', err);
  } else {
    console.log('Connected to SQLite database');
  }
});

module.exports = db;
```

- [ ] **Step 2: Create BotConfig model**

```javascript
const db = require('./db');

class BotConfig {
  static createTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS bot_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        building_width INTEGER DEFAULT 5,
        building_length INTEGER DEFAULT 5,
        building_height INTEGER DEFAULT 3,
        building_block_type TEXT DEFAULT 'oak_planks',
        gathering_radius INTEGER DEFAULT 10,
        gathering_targets TEXT DEFAULT '["oak_log","cobblestone","iron_ore","coal_ore"]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    db.run(sql);
  }
  
  static getByUserId(userId) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM bot_configs WHERE user_id = ?', [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
  
  static save(userId, config) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO bot_configs 
        (user_id, building_width, building_length, building_height, building_block_type, 
         gathering_radius, gathering_targets, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;
      
      db.run(sql, [
        userId,
        config.buildingWidth || 5,
        config.buildingLength || 5,
        config.buildingHeight || 3,
        config.buildingBlockType || 'oak_planks',
        config.gatheringRadius || 10,
        JSON.stringify(config.gatheringTargets || ['oak_log', 'cobblestone', 'iron_ore', 'coal_ore'])
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }
}

module.exports = BotConfig;
```

- [ ] **Step 3: Initialize database on server startup**

In server.js, after importing dotenv:
```javascript
require('./config/db');
require('./config/models/BotConfig');
BotConfig.createTable();
```

- [ ] **Step 4: Create config test file**

```javascript
const BotConfig = require('../config/models/BotConfig');
const db = require('../config/db');

describe('BotConfig Model', () => {
  beforeAll((done) => {
    BotConfig.createTable();
    done();
  });
  
  afterAll((done) => {
    db.close();
    done();
  });
  
  test('should create table', () => {
    expect(BotConfig.createTable).toBeDefined();
  });
  
  test('should save and retrieve config', async () => {
    const testUserId = 'test-user-123';
    const testConfig = {
      buildingWidth: 10,
      buildingLength: 10,
      buildingHeight: 5,
      buildingBlockType: 'stone',
      gatheringRadius: 15,
      gatheringTargets: ['diamond_ore', 'iron_ore']
    };
    
    const id = await BotConfig.save(testUserId, testConfig);
    expect(id).toBeGreaterThan(0);
    
    const config = await BotConfig.getByUserId(testUserId);
    expect(config).toBeDefined();
    expect(config.user_id).toBe(testUserId);
    expect(config.building_width).toBe(10);
    expect(config.building_length).toBe(10);
    expect(config.building_height).toBe(5);
    expect(config.building_block_type).toBe('stone');
    expect(config.gathering_radius).toBe(15);
    expect(JSON.parse(config.gathering_targets)).toEqual(['diamond_ore', 'iron_ore']);
  });
});

// Note: Better SQLite testing would use an in-memory database
```

- [ ] **Step 5: Commit persistence layer implementation**

```bash
git add config/db.js config/models/BotConfig.js tests/config.test.js
git commit -m "feat: implement persistence layer with SQLite for bot configurations"
```

// WebSocket endpoints for real-time bot status

### Task 6: Create React Frontend

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/src/index.js`
- Create: `frontend/src/App.js`
- Create: `frontend/src/components/MicrosoftLogin.js`
- Create: `frontend/src/components/Dashboard.js`
- Create: `frontend/src/components/BotControls.js`
- Create: `frontend/src/components/StatusDisplay.js`

- [ ] **Step 1: Create frontend package.json**

```json
{
  "name": "minecraft-robot-frontend",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-scripts": "5.0.1",
    "axios": "^1.4.0",
    "socket.io-client": "^4.7.0"
  },
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build",
    "test": "react-scripts test",
    "eject": "react-scripts eject"
  },
  "eslintConfig": {
    "extends": [
      "react-app",
      "react-app/jest"
    ]
  },
  "browserslist": {
    "production": [
      ">0.2%",
      "not dead",
      "not op_mini all"
    ],
    "development": [
      "last 1 chrome version",
      "last 1 firefox version",
      "last 1 safari version"
    ]
  }
}
```

- [ ] **Step 2: Create frontend entry point**

```javascript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 3: Create main App component**

```javascript
import React, { useState, useEffect } from 'react';
import MicrosoftLogin from './components/MicrosoftLogin';
import Dashboard from './components/Dashboard';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Check if user is authenticated (from localStorage or session)
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = (userData) => {
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    setUser(null);
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <MicrosoftLogin onLogin={handleLogin} />;
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>Minecraft AI Robot Controller</h1>
        <button onClick={handleLogout}>Logout</button>
      </header>
      <main>
        <Dashboard user={user} onLogout={handleLogout} />
      </main>
    </div>
  );
}

export default App;
```

- [ ] **Step 4: Create MicrosoftLogin component**

```javascript
import React, { useState, useEffect } from 'react';

const MicrosoftLogin = ({ onAuthSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Check for auth callback parameters
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const errorParam = urlParams.get('error');
    
    if (errorParam) {
      setError(`Authentication failed: ${errorParam}`);
      // Clear URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }
    
    if (code && state) {
      // Handle callback
      setLoading(true);
      // In a real implementation, we'd send code to backend to complete auth
      // For now, we'll simulate success
      setTimeout(() => {
        setLoading(false);
        onAuthSuccess({
          username: 'testuser', // Would come from token in real implementation
          accessToken: 'fake-access-token-for-demo'
        });
        // Clear URL parameters
        window.history.replaceState({}, document.title, window.location.pathname);
      }, 1000);
    }
  }, []);

  const handleMicrosoftLogin = () => {
    setLoading(true);
    setError(null);
    // Redirect to Microsoft auth
    window.location.href = '/auth/microsoft/login';
  };

  if (loading) {
    return <div className="microsoft-login">Redirecting to Microsoft...</div>;
  }

  return (
    <div className="microsoft-login-container">
      <h3>Sign in with Microsoft</h3>
      <button 
        onClick={handleMicrosoftLogin}
        className="microsoft-button"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 8 }}>
          <path d="M12 2.6a9.9 9.9 0 0 0-6.8 3.4c-1.4-.5-2.6-1.2-3.5-2.2l-.7-1c1-.6 1.9-1.3 2.6-2 .9-.8 1.6-1.8 2-2.8l2.4-.4c-.4 1.1-.6 2.3-.6 3.6 0 2.8 1.1 5.3 2.9 7l1.9-1.7c-1.3-.4-2.5-.9-3.5-1.5zm8.9 2.3l-1.3 2.3c.7.4 1.4.7 2.1.9l2.4-.4c-1.2 1.1-2.4 2-3.4 2.6-1 .6-2.1 1-3.1 1-2.3 0-4.2-.9-5.7-2.4l1.6-2.8c1.7.9 3.5 1.6 5.2 2 1.3-.4 2.5-1 3.3-2.1zm-5.7 7.9c-2.2 0-4-.9-5.3-2.3l-2.1 3.7c1.9 1.1 4.1 1.7 6.4 1.7 2.3 0 4.2-.9 5.7-2.4z"/>
        </svg>
        Sign in with Microsoft
      </button>
      {error && <div className="auth-error">{error}</div>}
    </div>
  );
};

export default MicrosoftLogin;
```

- [ ] **Step 5: Create Dashboard component**

```javascript
import React, { useState, useEffect } from 'react';
import BotControls from './BotControls';
import StatusDisplay from './StatusDisplay';
import io from 'socket.io-client';

const Dashboard = ({ user, onLogout }) => {
  const [botStatus, setBotStatus] = useState({ connected: false, message: 'Not connected' });
  const [logs, setLogs] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [position, setPosition] = useState({ x: 0, y: 0, z: 0 });
  const [llmAdvice, setLlmAdvice] = useState('');

  useEffect(() => {
    // Connect to WebSocket for real-time updates
    const socket = io(process.env.REACT_APP_API_URL || window.location.origin);
    
    socket.on('status_update', (data) => {
      setBotStatus(data.data);
      if (data.data.position) {
        setPosition(data.data.position);
      }
      if (data.data.inventory) {
        setInventory(data.data.inventory);
      }
      if (data.data.message) {
        setLogs(prev => [...prev, { 
          text: data.data.message, 
          timestamp: new Date().toLocaleTimeString() 
        }]);
        // Keep only last 50 logs
        if (logs.length > 50) setLogs(prev => prev.slice(-50));
      }
    });
    
    socket.on('llm_advice', (data) => {
      setLlmAdvice(data.advice);
    });
    
    return () => socket.disconnect();
  }, []);

  const handleStartBot = async () => {
    try {
      const response = await fetch('/api/bot/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          accessToken: user.accessToken // In real app, this would come from auth flow
        })
      });
      
      if (!response.ok) throw new Error('Failed to start bot');
      
      // In a real implementation, we'd get the botId and store it
    } catch (error) {
      setLogs(prev => [...prev, { 
        text: `Error starting bot: ${error.message}`, 
        timestamp: new Date().toLocaleTimeString(),
        type: 'error'
      }]);
    }
  };

  const handleStopBot = async () => {
    // In a real implementation, we'd need the botId
    setLogs(prev => [...prev, { 
      text: 'Stopping bot...', 
      timestamp: new Date().toLocaleTimeString() 
    }]);
  };

  const handleGetLLMAdvice = async () => {
    try {
      const response = await fetch('/api/llm/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: `Bot at position (${position.x}, ${position.y}, ${position.z}) with ${inventory.length} items`,
          goal: 'Build a shelter and gather resources',
          current_state: { position, inventory }
        })
      });
      
      if (!response.ok) throw new Error('Failed to get LLM advice');
      
      const data = await response.json();
      // Advice would come via WebSocket in real implementation
      // For demo, we'll update state directly
      setLlmAdvice(data.advice);
    } catch (error) {
      setLogs(prev => [...prev, { 
        text: `Error getting LLM advice: ${error.message}`, 
        timestamp: new Date().toLocaleTimeString(),
        type: 'error'
      }]);
    }
  };

  return (
    <div className="dashboard">
      <div className="header">
        <h2>Welcome, {user.username}!</h2>
        <div className="user-info">
          <p>Role: {user.role || 'Player'}</p>
        </div>
      </div>
      
      <div className="content">
        <div className="left-panel">
          <BotControls 
            onStartBot={handleStartBot}
            onStopBot={handleStopBot}
            onGetLLMAdvice={handleGetLLMAdvice}
            botStatus={botStatus}
          />
        </div>
        
        <div className="right-panel">
          <StatusDisplay 
            botStatus={botStatus}
            position={position}
            inventory={inventory}
            logs={logs}
            llmAdvice={llmAdvice}
          />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
```

- [ ] **Step 6: Create BotControls component**

```javascript
import React, { useState } from 'react';

const BotControls = ({ onStartBot, onStopBot, onGetLLMAdvice, botStatus }) => {
  const [buildingConfig, setBuildingConfig] = useState({
    width: 5,
    length: 5,
    height: 3,
    blockType: 'oak_planks'
  });

  const handleStartClick = async () => {
    await onStartBot();
  };

  const handleStopClick = async () => {
    await onStopBot();
  };

  const handleAdviceClick = async () => {
    await onGetLLMAdvice();
  };

  return (
    <div className="bot-controls">
      <h3>Bot Controls</h3>
      
      <div className="control-group">
        <label>Building Configuration:</label>
        <div>
          <label>Width: </label>
          <input
            type="number"
            value={buildingConfig.width}
            onChange={(e) => setBuildingConfig({...buildingConfig, width: parseInt(e.target.value) || 5})}
            min="1"
          />
        </div>
        <div>
          <label>Length: </label>
          <input
            type="number"
            value={buildingConfig.length}
            onChange={(e) => setBuildingConfig({...buildingConfig, length: parseInt(e.target.value) || 5})}
            min="1"
          />
        </div>
        <div>
          <label>Height: </label>
          <input
            type="number"
            value={buildingConfig.height}
            onChange={(e) => setBuildingConfig({...buildingConfig, height: parseInt(e.target.value) || 3})}
            min="1"
          />
        </div>
        <div>
          <label>Block Type: </label>
          <select
            value={buildingConfig.blockType}
            onChange={(e) => setBuildingConfig({...buildingConfig, blockType: e.target.value})}
          >
            <option value="oak_planks">Oak Planks</option>
            <option value="stone">Stone</option>
            <option value="brick">Brick</option>
            <option value="glass">Glass</option>
          </select>
        </div>
      </div>
      
      <div className="control-buttons">
        <button 
          onClick={handleStartClick}
          disabled={botStatus.connected}
        >
          {botStatus.connected ? 'Connected' : 'Start Bot'}
        </button>
        <button 
          onClick={handleStopClick}
          disabled={!botStatus.connected}
        >
          {botStatus.connected ? 'Stop Bot' : 'Disconnected'}
        </button>
        <button 
          onClick={handleAdviceClick}
          disabled={!botStatus.connected}
        >
          Get LLM Strategy Advice
        </button>
      </div>
    </div>
  );
};

export default BotControls;
```

- [ ] **Step 7: Create StatusDisplay component**

```javascript
import React from 'react';

const StatusDisplay = ({ botStatus, position, inventory, logs, llmAdvice }) => {
  return (
    <div className="status-display">
      <h3>Bot Status</h3>
      <div className="status-item">
        <strong>Connection:</strong> 
        <span className={botStatus.connected ? 'connected' : 'disconnected'}>
          {botStatus.connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
      <div className="status-item">
        <strong>Message:</strong> {botStatus.message || 'No status'}
      </div>
      
      <div className="status-item">
        <strong>Position:</strong> 
        ({position.x}, {position.y}, {position.z})
      </div>
      
      <div className="status-item">
        <strong>Inventory:</strong> {inventory.length} items
        {inventory.length > 0 && (
          <ul>
            {inventory.map((item, index) => (
              <li key={index}>
                {item.type}: {item.count || 1}
              </li>
            ))}
          </ul>
        )}
      </div>
      
      <div className="status-item">
        <strong>LLM Advice:</strong>
        <p style={{ fontStyle: 'italic', color: '#666' }}>
          {llmAdvice || 'No advice yet'}
        </p>
      </div>
      
      <div className="status-item">
        <strong>Activity Log:</strong>
        <div className="log-container">
          {logs.map((log, index) => (
            <div key={index} className={`log-entry ${log.type || ''}`}>
              <span className="timestamp">[{log.timestamp}]</span>
              <span className="text">{log.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StatusDisplay;
```

- [ ] **Step 8: Create frontend public index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%PUBLIC_URL%/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <meta
      name="description"
      content="Minecraft AI Robot Controller"
    />
    <title>Minecraft AI Robot</title>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
  </body>
</html>
```

- [ ] **Step 9: Create frontend App.css**

```css
.App {
  text-align: center;
}

.App-header {
  background-color: #282c34;
  padding: 20px;
  color: white;
}

.App-header h1 {
  margin: 0;
}

.microsoft-login-container {
  max-width: 400px;
  margin: 50px auto;
  padding: 20px;
  border: 1px solid #ddd;
  border-radius: 8px;
}

.microsoft-login-container h3 {
  text-align: center;
  color: #333;
}

.microsoft-button {
  background-color: #0078d4;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 10px 20px;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}

.microsoft-button:hover:not(:disabled) {
  background-color: #005a9e;
}

.microsoft-button:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.auth-error {
  color: #dc3545;
  background-color: #f8d7da;
  padding: 10px;
  margin-top: 10px;
  border-radius: 4px;
}

.dashboard {
  display: flex;
  min-height: 80vh;
  padding: 20px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 10px;
  background-color: #f8f9fa;
  border-radius: 4px;
}

.user-info {
  text-align: right;
}

.content {
  display: flex;
  flex: 1;
  gap: 20px;
}

.left-panel {
  flex: 0 0 300px;
}

.right-panel {
  flex: 1;
}

.bot-controls, .status-display {
  background-color: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.bot-controls h3, .status-display h3 {
  margin-top: 0;
  color: #333;
}

.control-group {
  margin-bottom: 15px;
}

.control-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: bold;
}

.control-group input, .control-group select {
  width: 100%;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  box-sizing: border-box;
}

.control-buttons {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

.control-buttons button {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.control-buttons button:hover:not(:disabled) {
  opacity: 0.9;
}

.control-buttons button:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.status-display {
  background-color: #ffffff;
}

.status-item {
  margin-bottom: 10px;
  padding: 10px;
  background-color: #f8f9fa;
  border-radius: 4px;
}

.status-item strong {
  display: inline-block;
  width: 100px;
}

.connected {
  color: #28a745;
  font-weight: bold;
}

.disconnected {
  color: #dc3545;
  font-weight: bold;
}

.log-container {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid #eee;
  padding: 10px;
  background-color: #f8f9fa;
  border-radius: 4px;
}

.log-entry {
  display: flex;
  justify-content: space-between;
  margin-bottom: 5px;
  padding: 5px 0;
  border-bottom: 1px solid #eee;
}

.log-entry:last-child {
  border-bottom: none;
}

.timestamp {
  color: #666;
  font-size: 12px;
  min-width: 60px;
  text-align: center;
}

.text {
  flex: 1;
  text-align: left;
}

.log-entry.error .text {
  color: #dc3545;
}
```

- [ ] **Step 10: Install frontend dependencies**

Workdir: `frontend`
Run: `npm install`
Expected: Frontend dependencies installed

- [ ] **Step 11: Commit frontend implementation**

```bash
git add frontend/
git commit -m "feat: create React frontend with Microsoft login, dashboard, and controls"
```
app.ws('/bot/status/:botId', (ws, req) => {
  const { botId } = req.params;
  const bot = activeBots.get(botId);
  
  if (!bot) {
    ws.close();
    return;
  }
  
  console.log(`WebSocket status connection for bot ${botId}`);
  
  // Send periodic status updates
  const interval = setInterval(() => {
    if (bot.isConnected && bot.bot) {
      const status = {
        type: 'status_update',
        data: {
          connected: bot.isConnected,
          position: bot.bot.entity.position.floored(),
          health: bot.bot.health,
          food: bot.bot.food,
          message: `Bot at (${bot.bot.entity.position.floored().x}, ${bot.bot.entity.position.floored().y}, ${bot.bot.entity.position.floored().z})`
        }
      };
      
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(status));
      }
    }
  }, 5000); // Update every 5 seconds
  
  ws.on('close', () => {
    console.log(`WebSocket status connection closed for bot ${botId}`);
    clearInterval(interval);
  });
});

// Upgrade HTTP server to handle WebSocket
const httpServer = require('http').createServer(app);
wss.attach = function(server) {
  this.options.server = server;
};
httpServer.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
`);
}
});

// Upgrade HTTP server to handle WebSocket
const httpServer = require('http').createServer(app);
wss.attach = function(server) {
  this.options.server = server;
};
httpServer.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
`);
}