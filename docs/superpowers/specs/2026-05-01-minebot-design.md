# Minebot — Minecraft Bedrock Autonomous Bot Design

## Overview

A TypeScript/Node.js bot that connects to Minecraft Bedrock Edition servers using a Microsoft account, autonomously performs resource gathering, combat, crafting, and building, with the ultimate goal of defeating the Ender Dragon.

Target test server: `115.191.51.70:19132`

## Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Language | TypeScript (strict mode) |
| Protocol | `bedrock-protocol` npm package |
| Authentication | `@minecraft/auth` / `prismarine-auth` |
| Vector math | `vec3` |
| AI Behavior | Custom HFSM (Hierarchical Finite State Machine) |
| Pathfinding | Custom A* / JPS |
| CLI | `commander` / `yargs` + shell wrapper |
| Build | `tsx` / `ts-node` |

## Architecture

### Layer Diagram

```
┌─────────────────────────────────────┐
│         High-Level Planner          │  Goal selection, task decomposition
├─────────────────────────────────────┤
│     Skill / FSM Layer               │  Mining, combat, crafting, building
├─────────────────────────────────────┤
│     World State Manager             │  Blocks, entities, inventory
├─────────────────────────────────────┤
│     Pathfinding (A*/JPS)            │  3D navigation
├─────────────────────────────────────┤
│     Protocol Layer (bedrock-protocol)│  RakNet + Bedrock packets
├─────────────────────────────────────┤
│     Auth Layer (Microsoft OAuth)    │  Account login
└─────────────────────────────────────┘
```

### Data Flow

```
Minecraft Server
      │ (RakNet packets)
      ▼
┌─────────────┐
│  Connection  │ ─── packet_parse ──▶ EventBus
└─────────────┘
      ▲ sendPacket()
      │
┌─────┴───────────────────────────────┐
│            EventBus                  │
│  block_update → WorldState          │
│  entity_move  → WorldState          │
│  chat_message → SkillManager        │
│  health_low   → SkillManager (中断) │
│  inventory    → Inventory           │
└─────────────────────────────────────┘
      │
      ▼
┌─────────────┐  tick(50ms)  ┌──────────────┐
│ WorldState  │◄────────────▶│ SkillManager │
└─────────────┘              └──────┬───────┘
                                    │
                              ┌─────┴──────┐
                              │ Pathfinding│
                              └─────┬──────┘
                                    │
                              ┌─────┴──────┐
                              │  Movement  │──sendPacket()──▶ Server
                              └────────────┘
```

- Tick frequency: 50ms (20tps), aligned with Minecraft server tick rate
- All inter-module communication via EventBus to avoid circular dependencies
- WorldState is a shared read-only data layer queried by Skills

## Module Design

### Bot (Main Controller)

```
Bot
├── AuthManager        - Microsoft OAuth login
├── Connection         - RakNet connection (wraps bedrock-protocol)
├── WorldState         - World state cache (chunks, entities, block changes)
├── Inventory          - Inventory/equipment management
├── Movement/Pathfinding - Movement control + A* pathfinding
├── SkillManager       - FSM dispatch center
├── EventBus           - Decoupled inter-module communication
└── Logger             - Structured logging
```

### AuthManager

- Accept email + password
- Obtain Xbox Live token
- Exchange for Minecraft Bedrock token
- Return auth chain for server login

### Connection

- Wrap `bedrock-protocol` client
- Handle RakNet connect/disconnect
- Parse incoming packets → emit to EventBus
- Provide `sendPacket()` for outgoing packets
- Exponential backoff reconnection (1s, 2s, 4s... max 30s)

### WorldState

- Maintain sliding window chunk cache (N chunks around player)
- Cache block types, entities, light info
- Query API: `getBlock(pos)`, `getEntitiesNear(pos, radius)`, `findBlock(type, radius)`
- Update on protocol events

### Movement

- Basic movement: walk forward/backward, jump, sneak, sprint
- View control: yaw/pitch rotation
- Execute waypoints from Pathfinding

### Pathfinding

- A* algorithm with 3D support
- Heuristic: 3D Manhattan/Euclidean distance
- Climbable blocks (ladders, vines) treated as passable
- Accounts for gravity, jump height
- Returns `Waypoint[]` for Movement execution
- Timeout on unreachable paths → abandon + replan

### SkillManager (HFSM Core)

Hierarchical state machine structure:

```
TOP: IDLE ←→ GATHERING ←→ COMBAT ←→ CRAFTING ←→ BUILDING
     │           │           │          │           │
SUB: wander     mine_ore    melee     craft_recipe place_block
     wait        collect     ranged    smelt        scaffold
     eat          deposit    flee      enchant      terraform
```

- Each Skill = a state with `enter()`, `tick()`, `exit()` lifecycle
- Skills can nest sub-states
- Priority interrupt mechanism (e.g., low health → force switch to COMBAT/flee)
- Exception caught → fallback to IDLE → log error

### Inventory

- Track 36 hotbar + inventory slots
- Equipment (armor, offhand) tracking
- Query: `hasItem(type)`, `countItem(type)`, `findSlot(type)`
- Window interaction helpers (click, swap, drop)

### EventBus

- Type-safe event emitter
- Event types: `block_update`, `entity_move`, `entity_spawn`, `entity_despawn`, `chat_message`, `health_change`, `inventory_change`, `player_position`, `player_death`

## Project Structure

```
minebot/
├── minebot                    # CLI wrapper (shell script)
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Entry point
│   ├── cli.ts                # yargs/commander CLI definitions
│   ├── bot.ts                # Bot main controller
│   ├── auth/
│   │   └── auth-manager.ts   # Microsoft OAuth
│   ├── connection/
│   │   └── connection.ts     # bedrock-protocol wrapper
│   ├── world/
│   │   ├── world-state.ts    # World state manager
│   │   └── types.ts          # Block, Entity, etc types
│   ├── movement/
│   │   ├── movement.ts       # Movement control
│   │   └── pathfinding.ts    # A* pathfinding
│   ├── skills/
│   │   ├── skill-manager.ts  # FSM dispatch center
│   │   ├── skill.ts          # Skill base class
│   │   ├── idle.ts           # IDLE state
│   │   └── gathering.ts      # Resource gathering/mining
│   ├── inventory/
│   │   └── inventory.ts      # Inventory management
│   ├── events/
│   │   └── event-bus.ts      # Event bus
│   └── utils/
│       ├── logger.ts         # Logging
│       └── vec3.ts           # Vector utilities
├── config/
│   └── default.json          # Default configuration
└── tests/
    └── ...
```

## CLI Interface

```bash
./minebot --host <ip> --port <port> --email <ms-email> --password <ms-password> [--debug]
```

| Argument | Required | Description |
|---|---|---|
| `--host` | Yes | Server IP address |
| `--port` | Yes | Server port |
| `--email` | Yes | Microsoft account email |
| `--password` | Yes | Microsoft account password |
| `--debug` | No | Enable debug logging |

## Phase Plan

### Phase 1 — Foundation + Basic Mining
**Goal**: Bot can connect, authenticate, navigate, and mine simple ores.

Deliverables:
- AuthManager: Microsoft OAuth login flow
- Connection: bedrock-protocol wrapper, packet handling
- WorldState: chunk cache, block/entity queries
- Movement: walk, jump, sneak, view control
- Pathfinding: A* 3D navigation with obstacle avoidance
- SkillManager: FSM framework + IDLE + GATHERING/mine_ore skills
- CLI: argument parsing, shell wrapper
- Config: default configuration file

### Phase 2 — Combat + Crafting
**Goal**: Bot can fight mobs and craft basic items.

Deliverables:
- COMBAT skill: melee attack, ranged attack, flee on low HP
- CRAFTING skill: recipe lookup, workbench interaction
- Inventory enhancements: equipment management, window clicks
- Food management: auto-eat when hungry

### Phase 3 — Building + Ender Dragon Hunt
**Goal**: Bot can build structures and complete the Ender Dragon fight.

Deliverables:
- BUILDING skill: block placement, scaffolding, terraforming
- High-level planner: goal selection and task sequencing
- Stronghold locator: Ender Eye tracking + stronghold search
- End Portal activation
- Ender Dragon combat strategy (destroy crystals, attack dragon)

### Phase 4 — Integration & Testing
**Goal**: Full end-to-end automation verified on test server.

Deliverables:
- Integration tests against `115.191.51.70:19132`
- Performance profiling and optimization
- Error recovery hardening

## Error Handling Strategy

| Scenario | Handling |
|---|---|
| Connection lost | Exponential backoff retry (1s, 2s, 4s... max 30s) |
| Auth failure | Clear error message, exit |
| Skill exception | Catch → fallback to IDLE → log error |
| Path unreachable | Timeout → abandon target → replan |
| Server kick | Log reason, attempt reconnect |
| Death/respawn | Reset current skill, return to IDLE |

## Key Dependencies (package.json)

```json
{
  "dependencies": {
    "bedrock-protocol": "^3.x",
    "prismarine-auth": "^2.x",
    "vec3": "^0.1.x",
    "yargs": "^17.x",
    "pino": "^8.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "@types/node": "^20.x",
    "@types/yargs": "^17.x",
    "tsx": "^4.x"
  }
}
```
