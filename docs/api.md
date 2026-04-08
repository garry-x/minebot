# MineBot API Documentation

| Version | Date | Status | Author |
| :--- | :--- | :--- | :--- |
| v1.0 | 2026-04-07 | API Reference | Sisyphus AI Agent |

## 1. Overview

MineBot provides a RESTful API for managing Minecraft bots, configurations, and system operations. The API runs on the Bot Server (`bot_server.js`) and is accessible via HTTP/HTTPS.

**Base URL**: `http://localhost:9500` (or your configured host:port)
**Default Port**: 9500
**Content-Type**: `application/json`

## 2. Authentication

Currently, the API uses IP-based access control. For production deployments, consider implementing:

1. **API Keys** (Recommended for automated access)
2. **JWT Tokens** (For user sessions)
3. **OAuth 2.0** (For third-party integrations)

## 3. Health and System Endpoints

### 3.1 Health Check

**Endpoint**: `GET /api/health`

**Description**: Returns system health status

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2026-04-07T12:00:00.000Z",
  "uptime": 3600,
  "version": "1.0.0",
  "components": {
    "database": "healthy",
    "websocket": "connected",
    "llm": "available"
  }
}
```

**Status Codes**:
- `200 OK`: System is healthy
- `503 Service Unavailable`: System is unhealthy

### 3.2 System Information

**Endpoint**: `GET /api/system/info`

**Description**: Returns detailed system information

**Response**:
```json
{
  "system": {
    "node_version": "20.11.0",
    "platform": "linux",
    "arch": "x64",
    "memory": {
      "total": 8589934592,
      "free": 2147483648,
      "used": 6442450944
    }
  },
  "minebot": {
    "version": "1.0.0",
    "uptime": 3600,
    "active_bots": 3,
    "max_bots": 10
  }
}
```

## 4. Bot Management Endpoints

### 4.1 List All Bots

**Endpoint**: `GET /api/bots`

**Description**: Returns list of all bots (active and inactive)

**Response**:
```json
{
  "bots": [
    {
      "id": "bot_123456789",
      "username": "minebot1",
      "status": "running",
      "host": "localhost",
      "port": 25565,
      "mode": "autonomous",
      "created_at": "2026-04-07T10:00:00.000Z",
      "last_seen": "2026-04-07T12:00:00.000Z"
    }
  ],
  "total": 1,
  "active": 1,
  "inactive": 0
}
```

### 4.2 Create/Start Bot

**Endpoint**: `POST /api/bots`

**Description**: Creates and starts a new bot instance

**Request Body**:
```json
{
  "username": "minebot1",
  "host": "localhost",
  "port": 25565,
  "mode": "autonomous",
  "access_token": "optional_minecraft_token",
  "config": {
    "building_width": 5,
    "building_length": 5,
    "gathering_radius": 10
  }
}
```

**Response**:
```json
{
  "success": true,
  "bot_id": "bot_123456789",
  "message": "Bot started successfully",
  "websocket_url": "ws://localhost:9500/ws/bot_123456789"
}
```

**Status Codes**:
- `201 Created`: Bot started successfully
- `400 Bad Request`: Invalid parameters
- `409 Conflict`: Bot with same ID already exists
- `503 Service Unavailable`: Maximum bot limit reached

### 4.3 Get Bot Details

**Endpoint**: `GET /api/bots/{bot_id}`

**Description**: Returns detailed information about a specific bot

**Response**:
```json
{
  "id": "bot_123456789",
  "username": "minebot1",
  "status": "running",
  "position": {
    "x": 100.5,
    "y": 64.0,
    "z": 200.3
  },
  "health": 20,
  "food": 20,
  "inventory": [
    {"type": "oak_log", "count": 32},
    {"type": "cobblestone", "count": 64}
  ],
  "current_goal": "gather_resources",
  "goal_progress": 65,
  "statistics": {
    "blocks_mined": 150,
    "distance_traveled": 1250.5,
    "items_collected": 96
  }
}
```

### 4.4 Stop Bot

**Endpoint**: `DELETE /api/bots/{bot_id}`

**Description**: Stops and removes a bot instance

**Response**:
```json
{
  "success": true,
  "message": "Bot stopped successfully",
  "bot_id": "bot_123456789"
}
```

### 4.5 Send Command to Bot

**Endpoint**: `POST /api/bots/{bot_id}/command`

**Description**: Sends a command to a specific bot

**Request Body**:
```json
{
  "command": "move",
  "parameters": {
    "direction": "north",
    "distance": 10
  }
}
```

**Available Commands**:
```json
{
  "move": {"direction": "north|south|east|west", "distance": number},
  "mine": {"block_type": "stone|dirt|ore_type"},
  "place": {"block_type": "stone|wood", "position": {"x": number, "y": number, "z": number}},
  "craft": {"item": "stick|planks|tool_type"},
  "gather": {"resource_type": "wood|stone|ore", "radius": number}
}
```

**Response**:
```json
{
  "success": true,
  "message": "Command accepted",
  "command_id": "cmd_123456789"
}
```

## 5. Configuration Endpoints

### 5.1 Get System Configuration

**Endpoint**: `GET /api/config`

**Description**: Returns current system configuration

**Response**:
```json
{
  "server": {
    "host": "0.0.0.0",
    "port": 9500,
    "log_level": "info",
    "max_bots": 10
  },
  "minecraft": {
    "default_host": "localhost",
    "default_port": 25565,
    "max_memory": "1G"
  },
  "llm": {
    "service_url": "http://localhost:8000",
    "use_fallback": false
  },
  "behavior": {
    "building_width": 5,
    "building_length": 5,
    "gathering_radius": 10
  }
}
```

### 5.2 Update Configuration

**Endpoint**: `PUT /api/config`

**Description**: Updates system configuration (requires restart for some changes)

**Request Body**:
```json
{
  "server": {
    "log_level": "debug"
  },
  "behavior": {
    "gathering_radius": 15
  }
}
```

**Response**:
```json
{
  "success": true,
  "message": "Configuration updated",
  "requires_restart": false
}
```

## 6. Evolution Engine Endpoints

### 6.1 Get Evolution Status

**Endpoint**: `GET /api/evolution/status`

**Description**: Returns evolution engine status and statistics

**Response**:
```json
{
  "status": "active",
  "domains": ["pathfinding", "resource_gathering", "building"],
  "total_experiences": 1500,
  "last_snapshot": "2026-04-07T11:30:00.000Z",
  "weights": {
    "pathfinding": {
      "current": [0.1, 0.2, 0.3, 0.4],
      "improvement": 15.5
    }
  }
}
```

### 6.2 Get Evolution Data

**Endpoint**: `GET /api/evolution/data`

**Query Parameters**:
- `domain` (optional): Filter by specific domain
- `limit` (optional): Number of records to return (default: 100)
- `offset` (optional): Pagination offset (default: 0)

**Response**:
```json
{
  "experiences": [
    {
      "id": 1,
      "bot_id": "bot_123456789",
      "domain": "pathfinding",
      "action": "move_north",
      "reward": 0.8,
      "timestamp": "2026-04-07T10:00:00.000Z"
    }
  ],
  "total": 1500,
  "limit": 100,
  "offset": 0
}
```

## 7. Streaming Endpoints

### 7.1 Get Bot Stream

**Endpoint**: `GET /api/stream/{bot_id}`

**Description**: Returns streaming information for a bot

**Response**:
```json
{
  "available": true,
  "stream_url": "http://localhost:9500/api/stream/{bot_id}/video",
  "screenshot_url": "http://localhost:9500/api/stream/{bot_id}/screenshot",
  "websocket_url": "ws://localhost:9500/ws/stream/{bot_id}",
  "format": "mjpeg",
  "fps": 5
}
```

### 7.2 Get Screenshot

**Endpoint**: `GET /api/stream/{bot_id}/screenshot`

**Description**: Returns a current screenshot from the bot's perspective

**Headers**:
- `Accept: image/jpeg` (default)
- `Accept: image/png`

**Response**: Binary image data

## 8. WebSocket Interface

### 8.1 Bot WebSocket

**URL**: `ws://localhost:9500/ws/{bot_id}`

**Connection**: Bidirectional communication with individual bots

**Messages from Server to Bot**:
```json
{
  "type": "command",
  "command": "move",
  "parameters": {"direction": "north"},
  "id": "cmd_123"
}
```

**Messages from Bot to Server**:
```json
{
  "type": "status",
  "bot_id": "bot_123456789",
  "status": "running",
  "position": {"x": 100, "y": 64, "z": 200},
  "health": 20,
  "timestamp": "2026-04-07T12:00:00.000Z"
}
```

**Message Types**:
- `status`: Bot status updates
- `inventory`: Inventory changes
- `event`: Game events (chat, block broken, etc.)
- `error`: Error notifications
- `command_response`: Command execution results

### 8.2 Stream WebSocket

**URL**: `ws://localhost:9500/ws/stream/{bot_id}`

**Connection**: Real-time streaming data (position, events, etc.)

**Messages**:
```json
{
  "type": "position",
  "bot_id": "bot_123456789",
  "position": {"x": 100.5, "y": 64.0, "z": 200.3},
  "timestamp": 1712491200000
}
```

## 9. Error Handling

### 9.1 Error Response Format

```json
{
  "error": {
    "code": "BOT_NOT_FOUND",
    "message": "Bot with ID 'bot_123' not found",
    "details": {
      "bot_id": "bot_123",
      "suggested_action": "Check available bots at /api/bots"
    },
    "timestamp": "2026-04-07T12:00:00.000Z"
  }
}
```

### 9.2 Common Error Codes

| Code | HTTP Status | Description |
| :--- | :--- | :--- |
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `BOT_NOT_FOUND` | 404 | Specified bot not found |
| `BOT_ALREADY_EXISTS` | 409 | Bot with same ID already exists |
| `MAX_BOTS_EXCEEDED` | 503 | Maximum bot limit reached |
| `LLM_SERVICE_UNAVAILABLE` | 503 | LLM service not available |
| `DATABASE_ERROR` | 500 | Database operation failed |

## 10. Rate Limiting

**Default Limits**:
- 100 requests per minute per IP
- 10 concurrent connections per IP
- 5 bot creation requests per minute per IP

**Headers**:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1712491260
```

## 11. Examples

### 11.1 Complete Bot Lifecycle

```bash
# 1. Check system health
curl http://localhost:9500/api/health

# 2. Create a new bot
curl -X POST http://localhost:9500/api/bots \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testbot",
    "host": "localhost",
    "port": 25565,
    "mode": "autonomous"
  }'

# 3. Get bot status
curl http://localhost:9500/api/bots/bot_123456789

# 4. Send command to bot
curl -X POST http://localhost:9500/api/bots/bot_123456789/command \
  -H "Content-Type: application/json" \
  -d '{
    "command": "gather",
    "parameters": {
      "resource_type": "wood",
      "radius": 20
    }
  }'

# 5. Stop bot
curl -X DELETE http://localhost:9500/api/bots/bot_123456789
```

### 11.2 WebSocket Example (JavaScript)

```javascript
const WebSocket = require('ws');

// Connect to bot WebSocket
const ws = new WebSocket('ws://localhost:9500/ws/bot_123456789');

ws.on('open', () => {
  console.log('Connected to bot');
  
  // Send command to bot
  ws.send(JSON.stringify({
    type: 'command',
    command: 'move',
    parameters: { direction: 'north', distance: 10 },
    id: 'cmd_001'
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data);
  
  switch (message.type) {
    case 'status':
      console.log(`Bot position: ${JSON.stringify(message.position)}`);
      break;
    case 'command_response':
      console.log(`Command ${message.command_id}: ${message.result}`);
      break;
  }
});
```

## 12. API Versioning

**Current Version**: v1
**Version Header**: `X-API-Version: 1`

**Future Changes**:
- Breaking changes will increment major version
- New endpoints will be added to current version
- Deprecated endpoints will be marked with warning headers

---

*This API documentation covers the core endpoints. For implementation details, refer to the source code in `bot_server.js` and `routes/` directory.*