# AI Robot System for Minecraft Java Server Design

## Overview
This document describes the design for an AI Robot System for Minecraft Java Server (version 1.21.x) that can:
1. Login with user-provided Microsoft account
2. Construct things, collect resources, and fly autonomously
3. Use LLM to assist its strategy
4. Be configured and controlled via a web interface
5. Display all robot actions through the web interface
6. Use the provided server binary for testing

## Architecture (Hybrid Approach - Recommended)
The system consists of four main components:

### 1. Minecraft Bot Module
- Built with Node.js and Mineflayer
- Handles connection to Minecraft server using proper Xbox Live authentication
- Implements robot behaviors: building, resource gathering, flying
- Communicates with the API server via WebSocket or REST
- Receives commands and sends status updates

### 2. Express API Server
- Node.js/Express backend
- Provides REST endpoints for:
  - Authentication (Microsoft/Xbox Live flow)
  - Bot control (start/stop/pause commands)
  - Configuration (building patterns, resource priorities)
  - Status reporting (position, inventory, current task)
- Serves static React frontend files
- Manages WebSocket connections for real-time updates

### 3. LLM Service
- Separate service for LLM integration (using vllm as specified)
- Receives strategy requests from bot module
- Returns strategic advice for building, resource gathering, etc.
- Could be implemented as a simple HTTP service or integrated directly

### 4. React Frontend
- Single Page Application (SPA)
- Provides web interface for:
  - Microsoft account login
  - Bot configuration and control
  - Real-time monitoring of bot actions
  - Viewing bot status, position, inventory
  - Sending commands to the bot

## Data Flow
1. User logs in via React frontend → Auth API → Xbox Live authentication service
2. Authenticated session stored (secure HTTP session or JWT)
3. User configures bot via frontend → API server stores configuration
4. User starts bot → API server signals bot module to connect
5. Bot module connects to Minecraft server using authenticated session
6. Bot module performs actions and sends status updates to API server
7. API server broadcasts updates to all connected frontend clients via WebSocket
8. When bot needs strategic decisions, it queries LLM service
9. LLM service processes request and returns advice to bot module

## Components Details

### Minecraft Bot Module
- Uses Mineflayer for Minecraft protocol handling
- Implements Xbox Live authentication flow:
  1. Get user to authenticate via Microsoft login page (handled by API)
  2. Obtain Xbox Live token
  3. Obtain XSTS token
  4. Obtain Minecraft access token
- Core bot logic:
  - Movement and flying capabilities
  - Block placement/breaking for construction
  - Resource collection algorithms
  - Event listeners for game events
  - Command execution from API
- Status reporting: position, inventory, health, current task

### Express API Server
- Authentication endpoints for Microsoft OAuth flow
- Bot control endpoints:
  - POST /bot/start - Start bot with configuration
  - POST /bot/stop - Stop currently running bot
  - POST /bot/pause - Pause bot operations
  - GET /bot/status - Get current bot status
- Configuration endpoints:
  - POST /config/building - Set building patterns
  - POST /config/resources - Set resource gathering priorities
- Static file serving for React build
- WebSocket server for real-time updates
- Session management for authenticated users

### LLM Service
- Simple HTTP service accepting POST requests
- Endpoint: /strategy
- Request: { context: string, goal: string, current_state: object }
- Response: { advice: string, suggested_actions: array }
- Implemented using vllm to serve local LLM as specified
- Could be co-located with API server or separate

### React Frontend
- Login page with Microsoft authentication button
- Dashboard showing:
  - Bot status (connected/disconnected, task)
  - 3D representation or coordinates of bot position
  - Inventory display
  - Chat/log area showing bot actions
- Control panel:
  - Start/stop/pause buttons
  - Building configuration (what to build, where)
  - Resource gathering settings
  - LLM strategy advice display
- Real-time updates via WebSocket connection

## Error Handling
- Authentication failures: Show user-friendly error messages
- Connection losses: Automatic reconnection with exponential backoff
- Game errors (e.g., trying to place block where not allowed): Log and continue
- LLM service unavailable: Fall back to predefined strategies
- Invalid commands: Validate on API server before sending to bot

## Security Considerations
- Secure storage of authentication tokens (HTTP-only cookies or secure localStorage)
- Rate limiting on API endpoints
- Input validation and sanitization
- CORS configuration for frontend-backend communication
- HTTPS in production (self-signed cert acceptable for local testing)

## Testing Strategy
- Unit tests for individual components (bot logic, API endpoints)
- Integration tests for bot-server communication
- End-to-end testing using the provided minecraft_server.1.21.11.jar
- Manual testing scenarios for core functionalities

## Development Approach
1. Start with basic bot module that can connect to server
2. Implement Xbox Live authentication flow
3. Add basic movement and block interaction
4. Build API server with authentication endpoints
5. Create React frontend with login and basic controls
6. Implement WebSocket for real-time updates
7. Add building and resource gathering behaviors
8. Integrate LLM service for strategy assistance
9. Polish UI and add advanced features
10. Test with provided Minecraft server binary

## Deployment
- All components can run locally for development
- For production: 
  - Bot module and API server can be deployed together
  - LLM service may need separate deployment for GPU resources
  - Frontend can be served via static file hosting
- Environment variables for configuration:
  - MINECRAFT_SERVER_IP
  - MINECRAFT_SERVER_PORT
  - LLM_SERVICE_URL
  - SESSION_SECRET
  - MICROSOFT_CLIENT_ID (for OAuth)
