# MineBot - AI-Driven Minecraft Robot System

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-16%2B-green?style=flat-square" alt="Node.js">
  <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/Minecraft-1.21.11-brightgreen?style=flat-square" alt="Minecraft">
</p>

## Overview

MineBot is an AI-driven robotic system for Minecraft Java Edition that provides automated bot management, intelligent task execution, and evolutionary learning capabilities. The system combines a Node.js backend with a CLI interface, LLM integration, and a sophisticated evolution engine for adaptive bot behavior.

## Features

- **🤖 Intelligent Bot Management**: Create, control, and monitor multiple Minecraft bots simultaneously
- **🎯 Goal-Oriented Autonomy**: Define high-level goals (survival, resource gathering, building) that bots autonomously achieve
- **🧬 Evolutionary Learning**: Adaptive behavior system that learns from experience to improve task execution
- **🧠 LLM Strategy Integration**: Optional integration with Large Language Models for complex strategy generation
- **📡 Real-time Monitoring**: WebSocket-based live monitoring with detailed bot status, inventory, and environment data
- **💻 CLI Administration**: Full-featured command-line interface for server and bot management
- **🔌 REST API**: Programmatic access to all system features
- **📊 Streaming System**: Real-time screenshot and video capture for bot visualization

## Quick Start

### Prerequisites

- Node.js 16+ (recommended: Node.js 20+)
- Java 17+ (for Minecraft server)
- Minecraft Java Edition server (1.21.x recommended)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd minebot

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Start Bot server
node cli.js server start

# Start Minecraft server (in another terminal)
node cli.js mc start
```

### Basic Usage

```bash
# Check system status
node cli.js status

# Start a bot
node cli.js bot start MyBot

# List all bots
node cli.js bot list

# Set bot goal
node cli.js bot goal MyBot basic_survival

# Monitor bot in real-time
node cli.js bot watch MyBot

# Stop a bot
node cli.js bot stop MyBot
```

## CLI Commands Reference

### System Commands

| Command | Description |
|---------|-------------|
| `minebot status` | Display system status (Bot server + Minecraft server) |
| `minebot help` | Display help information |

### Server Management

| Command | Description |
|---------|-------------|
| `minebot server start` | Start the Bot server |
| `minebot server stop` | Stop the Bot server |
| `minebot server restart` | Restart the Bot server |
| `minebot server status` | Check Bot server status |

### Minecraft Server Management

| Command | Description |
|---------|-------------|
| `minebot mc start` | Start the Minecraft server |
| `minebot mc stop` or `minebot mc end` | Stop the Minecraft server |
| `minebot mc restart` | Restart the Minecraft server |
| `minebot mc status` | Check Minecraft server status |

### Bot Management

| Command | Description |
|---------|-------------|
| `minebot bot start <name>` | Start a new bot |
| `minebot bot stop <botId>` | Stop a bot |
| `minebot bot list` | List all bots |
| `minebot bot list --all` | List all bots including stopped ones |
| `minebot bot goal [botId] [goalId]` | Set bot goal or list available goals |
| `minebot bot goal <botId> --status` | View bot goal status |
| `minebot bot watch <botId>` | Real-time bot monitoring |
| `minebot bot watch <botId> --chinese` | Monitor with Chinese translations |
| `minebot bot auto <botId>` | View bot auto goal status |
| `minebot bot auto <botId> --start` | Start bot auto goal |
| `minebot bot auto <botId> --stop` | Stop bot auto goal |
| `minebot bot remove <botId>` | Remove a bot |
| `minebot bot remove --all` | Remove all bots |

### Bot Options

For `bot start` command:
```bash
minebot bot start MyBot -h localhost -p 25565 --version 1.21.11
```

For `bot watch` command:
```bash
minebot bot watch MyBot -n 20 -i 1000 --chinese
# -n, --events: Number of recent events to display (default: 10)
# -i, --interval: Refresh interval in ms (default: 1000)
# --chinese, --zh: Show Chinese translations
```

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
# Bot Server Configuration
HOST=0.0.0.0
PORT=9500
LOG_DIR=logs

# Minecraft Server
MINECRAFT_SERVER_HOST=localhost
MINECRAFT_SERVER_PORT=25565

# LLM Integration (optional)
VLLM_URL=http://localhost:8000
USE_FALLBACK=false

# Logging
LOG_LEVEL=info

# Minecraft Server Files
MINECRAFT_SERVER_DIR=resources
MINECRAFT_JAR_PATH=minecraft_server.1.21.11.jar
MINECRAFT_MAX_MEMORY=2G
MINECRAFT_SERVER_ARGS=nogui
```

### Available Goals

MineBot supports various goal types for autonomous bot behavior:

- `basic_survival` - Basic survival tasks (find food, shelter)
- `resource_gathering` - Gather resources (wood, stone, ore)
- `building` - Build structures
- `exploration` - Explore the world
- `farming` - Automated farming

View all available goals:
```bash
node cli.js bot goal
```

## Architecture

MineBot uses a modular architecture:

```
┌─────────────────────────────────────────────────────────┐
│                    CLI Interface                         │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│                 Bot Server Orchestrator                  │
│  - REST API Gateway                                      │
│  - WebSocket Server                                      │
│  - Bot Lifecycle Management                              │
└───────┬─────────────────────────┬───────────────────────┘
        │                         │
┌───────▼───────┐       ┌────────▼────────┐
│  Bot Runtime  │       │ Evolution Engine│
│  (Mineflayer) │       │ (Adaptive Learn)│
└───────┬───────┘       └────────┬────────┘
        │                         │
┌───────▼─────────────────────────▼───────────────────────┐
│              Minecraft Server (Java Edition)             │
└─────────────────────────────────────────────────────────┘
```

For detailed architecture documentation, see [docs/architecture.md](docs/architecture.md).

## API Reference

MineBot provides a RESTful API for programmatic access:

- `GET /api/health` - System health check
- `GET /api/bots` - List all bots
- `POST /api/bot/start` - Start a new bot
- `DELETE /api/bot/:botId` - Remove a bot
- `GET /api/bot/:botId/watch` - Get bot status for monitoring
- `POST /api/bot/:botId/goal/select` - Set bot goal

For complete API documentation, see [docs/api.md](docs/api.md).

## Development

```bash
# Development mode with hot reload
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

## Project Structure

```
minebot/
├── bot/                    # Bot runtime system
│   ├── index.js           # Main bot class
│   ├── pathfinder.js      # Navigation system
│   ├── events.js          # Event handling
│   ├── behaviors.js       # Behavior definitions
│   ├── autonomous-engine.js
│   ├── goal-system.js
│   └── evolution/         # Evolutionary learning
│       ├── strategy-manager.js
│       ├── weight-engine.js
│       ├── fitness-calculator.js
│       └── evolution-storage.js
├── config/                # Configuration & models
├── streaming/             # Streaming system
├── llm/                   # LLM integration
├── lib/                   # Utilities
├── docs/                  # Documentation
├── cli.js                 # CLI interface
└── bot_server.js          # Main server
```

## Documentation

- [Architecture](docs/architecture.md) - System architecture details
- [API Documentation](docs/api.md) - REST API reference
- [CLI Features](docs/CLI_FEATURES.md) - CLI command details
- [Testing Strategy](docs/testing.md) - Testing guidelines
- [Deployment Guide](docs/deployment.md) - Deployment instructions
- [Maintenance](docs/maintenance.md) - Maintenance and troubleshooting

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

<p align="center">Built with ❤️ for Minecraft automation</p>