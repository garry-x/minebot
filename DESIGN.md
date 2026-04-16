# MineBot Design Documentation

| Version | Date | Status | Author |
| :--- | :--- | :--- | :--- |
| v1.0 | 2026-04-16 | Design Documentation | Sisyphus AI Agent |

## Table of Contents

1. [Introduction](#introduction)
2. [Core Modules](#core-modules)
   - [Bot Server Orchestrator](#bot-server-orchestrator)
   - [Bot Runtime System](#bot-runtime-system)
   - [Evolution Engine](#evolution-engine)
3. [Supporting Modules](#supporting-modules)
   - [LLM Integration](#llm-integration)
   - [Data Layer](#data-layer)
   - [Streaming System](#streaming-system)
   - [CLI Interface](#cli-interface)
4. [Design Decisions](#design-decisions)
5. [Integration Points](#integration-points)

---

## Introduction

This document provides detailed design documentation for all modules in the MineBot system. It complements the [Architecture Documentation](architecture.md) by focusing on design decisions, component responsibilities, and integration patterns.

The design follows these core principles:
- **Modularity**: Each module has clearly defined responsibilities and interfaces
- **Extensibility**: New features can be added without modifying existing code
- **Testability**: Components are designed for easy unit and integration testing
- **Observability**: Built-in logging and monitoring capabilities

---

## Core Modules

### Bot Server Orchestrator

**File**: `bot_server.js`

**Purpose**: Central coordination hub for all bot instances, providing REST API and WebSocket interfaces.

#### Responsibilities

1. **HTTP Server Management**
   - Express.js web server on configurable host/port (default: 0.0.0.0:9500)
   - Middleware for CORS, rate limiting, JSON parsing
   - Static file serving for web UI

2. **WebSocket Server**
   - Real-time bidirectional communication with bots
   - Message routing between server and individual bots
   - Heartbeat and connection health monitoring

3. **Bot Lifecycle Management**
   - Spawn new bot instances
   - Monitor bot status and health
   - Handle bot termination and cleanup
   - Database persistence of bot configurations

4. **Single Instance Enforcement**
   - PID file management (`logs/bot_server.pid`)
   - Prevention of multiple server instances
   - Graceful handling of stale PID files

#### Key Data Structures

```javascript
// Active bot tracking
const activeBots = new Map();  // botId -> MinecraftBot instance

// WebSocket connections
const botConnections = new Map();  // botId -> WebSocket instance

// Rate limiting
const rateLimitMap = new Map();  // ip -> { windowStart, count }

// Cache for API responses
const watchCache = new Map();  // botId -> cached response
const eventsCache = new Map();  // botId -> events array
```

#### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | System health check |
| `/api/bots` | GET | List all bots |
| `/api/bot/start` | POST | Start a new bot |
| `/api/bot/:botId/stop` | POST | Stop a bot |
| `/api/bot/:botId/delete` | DELETE | Remove a bot |
| `/api/bot/:botId/watch` | GET | Get bot status for monitoring |
| `/api/bot/:botId/goal/select` | POST | Set bot goal |
| `/api/server/stop` | POST | Stop the bot server |
| `/api/goals` | GET | List available goals |

#### Design Rationale

- **Express.js**: Chosen for simplicity and middleware ecosystem
- **WebSocket**: Required for real-time bot communication (status updates, command execution)
- **PID File**: Simple but effective single-instance guarantee without external dependencies
- **Rate Limiting**: Prevents API abuse; in-memory for simplicity (can be extended to Redis)

---

### Bot Runtime System

**Location**: `bot/` directory

**Purpose**: Minecraft bot implementation using Mineflayer, providing game interaction capabilities.

#### Components

##### 1. Main Bot Class (`bot/index.js`)

**Class**: `MinecraftBot`

```javascript
class MinecraftBot {
  constructor(options)
  async connect(username, accessToken, startAutomatic)
  setupEventListeners()
  setupWebSocket()
  // ... game interaction methods
}
```

**Responsibilities**:
- Mineflayer bot instance management
- WebSocket client for server communication
- Event handling (spawn, death, chat, block events)
- State management and persistence
- Screenshot capture

**Key Properties**:
- `bot`: Mineflayer bot instance
- `ws`: WebSocket client to bot server
- `botId`: Unique identifier
- `statusInterval`: Periodic status reporting

##### 2. Pathfinder (`bot/pathfinder.js`)

**Responsibilities**:
- Navigation and pathfinding using mineflayer-pathfinder
- Goal-based movement
- Obstacle avoidance
- Path optimization

**Design**: Wraps mineflayer-pathfinder with custom heuristics for game-specific navigation.

##### 3. Event System (`bot/events.js`)

**Responsibilities**:
- Mineflayer event hooks
- Event filtering and processing
- Event broadcasting to server

**Events Handled**:
- `spawn`, `death`, `respawn`
- `chat`, `whisper`
- `blockBreak`, `blockPlace`
- `itemPickup`, `itemDrop`
- `healthChange`, `foodChange`
- `entitySpawn`, `entityDeath`

##### 4. Behaviors (`bot/behaviors.js`)

**Responsibilities**:
- Atomic behavior definitions
- Behavior chaining and composition
- Behavior execution context

**Behavior Types**:
- Movement behaviors (moveTo, followPath)
- Mining behaviors (mineBlock, mineArea)
- Building behaviors (placeBlock, buildStructure)
- Gathering behaviors (gatherResource, collectDrops)

##### 5. Autonomous Engine (`bot/autonomous-engine.js`)

**Responsibilities**:
- Goal decomposition into executable tasks
- Task scheduling and execution
- Progress tracking and reporting

**Design Pattern**: Goal → Tasks → Actions hierarchy

##### 6. Goal System (`bot/goal-system.js`)

**Responsibilities**:
- Goal definition and validation
- Goal state management
- Progress calculation
- Sub-task coordination

**Goal Interface**:
```javascript
{
  id: string,
  name: string,
  description: string,
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert',
  subTasks: Task[],
  requirements: Requirement[],
  onComplete: Function
}
```

---

### Evolution Engine

**Location**: `bot/evolution/`

**Purpose**: Adaptive learning system that improves bot behavior through experience.

#### Components

##### 1. Strategy Manager (`bot/evolution/strategy-manager.js`)

**Responsibilities**:
- Strategy selection and switching
- Strategy performance tracking
- Evolution coordination

**Strategy Types**:
- `pathfinding`: Navigation strategies
- `resource_gathering`: Resource collection approaches
- `building`: Construction methods

##### 2. Weight Engine (`bot/evolution/weight-engine.js`)

**Responsibilities**:
- Strategy weight management
- Weight adjustment based on fitness
- Weight persistence

**Algorithm**: Simplified reinforcement learning with configurable learning rate.

```javascript
// Weight update formula
newWeight = oldWeight + learningRate * (fitness - baselineFitness)
```

##### 3. Fitness Calculator (`bot/evolution/fitness-calculator.js`)

**Responsibilities**:
- Performance metric calculation
- Reward assignment for actions
- Historical fitness tracking

**Metrics**:
- Task completion time
- Resource efficiency
- Survival rate
- Error frequency

##### 4. Evolution Storage (`bot/evolution/evolution-storage.js`)

**Responsibilities**:
- SQLite-based weight persistence
- Experience log storage
- Snapshot creation and restoration

**Database Schema**:
```sql
CREATE TABLE evolution_weights (
  id INTEGER PRIMARY KEY,
  domain TEXT NOT NULL,
  strategy TEXT NOT NULL,
  weight REAL NOT NULL,
  last_updated TEXT NOT NULL
);

CREATE TABLE experience_log (
  id INTEGER PRIMARY KEY,
  bot_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  action TEXT NOT NULL,
  reward REAL NOT NULL,
  timestamp TEXT NOT NULL
);
```

##### 5. Experience Logger (`bot/evolution/experience-logger.js`)

**Responsibilities**:
- Action logging
- Reward calculation
- Experience buffer management

#### Learning Process Flow

```
1. Bot performs action
         ↓
2. Experience Logger records action + outcome
         ↓
3. Fitness Calculator computes reward
         ↓
4. Weight Engine adjusts strategy weights
         ↓
5. Strategy Manager selects best strategy
         ↓
6. Evolution Storage persists learning
         ↓
7. Repeat
```

---

## Supporting Modules

### LLM Integration

**Location**: `llm/` directory

**Purpose**: Integration with Large Language Models for complex strategy generation.

#### Components

##### 1. LLM Gateway (`llm/index.js`)

**Responsibilities**:
- REST API for LLM requests
- Request formatting and validation
- Response parsing

##### 2. Strategy Engine (`llm/strategy.js`)

**Responsibilities**:
- Strategy generation from LLM responses
- Fallback strategy handling
- Error recovery

**Operation Modes**:

1. **VLLM Mode**
   - Connect to external VLLM service
   - Send goal context and receive strategy
   - Parse JSON response into actionable tasks

2. **Fallback Mode**
   - Rule-based strategy generation
   - Guaranteed availability
   - Simpler but less adaptive strategies

3. **Hybrid Mode**
   - Try VLLM first, fallback on failure
   - Best of both worlds
   - Configurable via `USE_FALLBACK` env var

**Configuration**:
```javascript
{
  serviceUrl: process.env.VLLM_URL || 'http://localhost:8000',
  useFallback: process.env.USE_FALLBACK === 'true',
  timeout: 30000,
  maxRetries: 3
}
```

---

### Data Layer

**Location**: `config/` directory

**Purpose**: Configuration management and data persistence.

#### Components

##### 1. Database Module (`config/db.js`)

**Responsibilities**:
- SQLite connection management
- Schema initialization
- Query execution helpers

**Database Files**:
- `bot_config.db` - Bot configurations
- `minebot.db` - General data

##### 2. Bot Config Model (`config/models/BotConfig.js`)

```javascript
class BotConfig {
  botId: string
  username: string
  host: string
  port: number
  version: string
  mode: string
  createdAt: Date
  updatedAt: Date
}
```

##### 3. Bot State Model (`config/models/BotState.js`)

```javascript
class BotState {
  botId: string
  state: 'CONNECTING' | 'ALIVE' | 'DEAD' | 'STOPPED'
  position: { x, y, z }
  health: number
  food: number
  inventory: Item[]
  lastSeen: Date
}
```

##### 4. Bot Goal Model (`config/models/BotGoal.js`)

```javascript
class BotGoal {
  botId: string
  goalId: string
  progress: number
  subTasks: SubTask[]
  startedAt: Date
  completedAt: Date | null
}
```

---

### Streaming System

**Location**: `streaming/` directory

**Purpose**: Real-time bot visualization and monitoring.

#### Components

##### 1. Stream Manager (`streaming/StreamManager.js`)

**Responsibilities**:
- Coordinate multiple streaming sessions
- Manage WebSocket streams
- Handle stream lifecycle

##### 2. Bot Stream (`streaming/BotStream.js`)

**Responsibilities**:
- Individual bot streaming
- Position updates
- Screenshot capture
- Event streaming

##### 3. Screenshot Module (`bot/ScreenshotModule.js`)

**Responsibilities**:
- Canvas-based screenshot capture
- Image encoding (JPEG/PNG)
- WebSocket streaming

---

### CLI Interface

**File**: `cli.js`

**Purpose**: Command-line administration tool for MineBot management.

#### Design Pattern

Uses `commander.js` for CLI framework with hierarchical command structure.

```
minebot
├── server
│   ├── start
│   ├── stop
│   ├── restart
│   └── status
├── bot
│   ├── start <name>
│   ├── stop <botId>
│   ├── list
│   ├── goal [botId] [goalId]
│   ├── watch <botId>
│   ├── auto <botId>
│   └── remove [botId]
├── mc
│   ├── start
│   ├── stop / end
│   ├── restart
│   └── status
└── status
```

#### Key Features

1. **Async API Communication**: All commands use HTTP requests to bot server
2. **PID File Management**: Track server processes for clean startup/shutdown
3. **Real-time Monitoring**: `bot watch` provides live status updates
4. **Chinese Localization**: Optional `--chinese` flag for Chinese translations

#### Error Handling

- Connection failures with informative messages
- Timeout handling for all API requests
- Graceful degradation when services unavailable

---

## Design Decisions

### 1. Why Mineflayer?

**Decision**: Use Mineflayer as the Minecraft client library.

**Alternatives Considered**:
- Craftern - Less maintained
- Minecart - Less feature-complete
- Custom protocol implementation - Too complex

**Rationale**: Mineflayer is the most mature and actively maintained Node.js Minecraft library with excellent plugin ecosystem.

### 2. Why SQLite?

**Decision**: Use SQLite for persistence.

**Alternatives Considered**:
- MongoDB - Overkill for this use case
- PostgreSQL - Requires external service
- File-based JSON - No query capability

**Rationale**: SQLite provides:
- Zero configuration
- Embedded operation (no external service needed)
- Adequate performance for single-server deployments
- ACID compliance for data integrity

### 3. Why WebSocket over HTTP for Bot Communication?

**Decision**: Use WebSocket for bot-server communication.

**Rationale**:
- Bidirectional communication (bot can push updates)
- Lower latency for real-time operations
- Persistent connection reduces handshake overhead
- Better for streaming data (screenshots, position updates)

### 4. Why Goal-Based Autonomy?

**Decision**: Implement goal-oriented behavior system rather than imperative commands.

**Rationale**:
- Higher-level abstraction for users
- Enables evolutionary learning (goals can be optimized)
- More robust to interruptions
- Allows hierarchical task decomposition

### 5. Why Separate Evolution Storage?

**Decision**: Maintain separate SQLite database for evolution data.

**Rationale**:
- Isolation of concerns
- Different access patterns (frequent writes for evolution)
- Can be cleared independently
- Future: easier migration to distributed storage

---

## Integration Points

### Bot ↔ Server Communication

```
┌─────────────┐    WebSocket     ┌─────────────┐
│   Bot       │ ←──────────────→ │   Server    │
│  (Client)   │                  │  (Master)   │
└─────────────┘                  └──────┬──────┘
                                         │
                              ┌──────────▼──────────┐
                              │   REST API          │
                              │   (External Client) │
                              └─────────────────────┘
```

**Message Types**:
- `status` - Bot status updates
- `command` - Server to bot commands
- `command_response` - Command execution results
- `event` - Game events (blocks, entities)
- `inventory` - Inventory changes
- `error` - Error notifications

### Server ↔ LLM Communication

```
┌─────────────┐    HTTP     ┌─────────────┐
│   Server    │ ──────────→ │   VLLM      │
│             │ ←────────── │   Service   │
└─────────────┘             └─────────────┘
      │
      │ (fallback)
      ↓
┌─────────────┐
│   Local     │
│   Strategy  │
│   Generator │
└─────────────┘
```

### CLI ↔ Server Communication

```
┌─────────────┐    HTTP     ┌─────────────┐
│    CLI      │ ──────────→ │   Server    │
│             │ ←────────── │   (REST)    │
└─────────────┘             └─────────────┘
```

---

## Future Design Considerations

### 1. Horizontal Scaling

**Current**: Single server instance

**Future**: Multiple server instances with:
- Load balancer
- Shared database backend (PostgreSQL)
- Distributed WebSocket handling

### 2. Plugin System

**Current**: Hardcoded behaviors

**Future**: Plugin API for:
- Custom behaviors
- Third-party integrations
- Custom goals

### 3. Cloud Deployment

**Current**: Local deployment

**Future**: 
- Docker containerization
- Kubernetes support
- Cloud provider integrations (AWS, GCP, Azure)

### 4. Advanced AI

**Current**: Simple weight-based evolution

**Future**:
- Reinforcement learning integration
- Neural network-based strategy selection
- Imitation learning from expert players

---

## Appendix: Module Dependencies

```
bot_server.js
├── config/db.js
├── config/models/BotConfig.js
├── config/models/BotState.js
├── config/models/BotGoal.js
├── bot/goal-system.js
├── bot/evolution/strategy-manager.js
├── llm/index.js
└── streaming/StreamManager.js

bot/index.js (Bot Runtime)
├── mineflayer
├── mineflayer-pathfinder
├── ws (WebSocket client)
└── bot/ScreenshotModule.js

cli.js
└── commander.js (CLI framework)

bot/evolution/
├── strategy-manager.js
├── weight-engine.js
├── fitness-calculator.js
├── evolution-storage.js (SQLite)
└── experience-logger.js
```

---

*This document provides detailed design documentation for the MineBot system. For operational guidance, refer to [deployment.md](deployment.md) and [maintenance.md](maintenance.md).*