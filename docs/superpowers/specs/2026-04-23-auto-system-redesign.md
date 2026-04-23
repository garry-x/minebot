# Auto System Redesign — Layered Architecture (Mindcraft Reference)

**Date:** 2026-04-23
**Status:** Approved
**Scope:** Full rewrite of bot/ auto system, replacing monolithic `autonomous-engine.ts` and `behaviors.ts`

## Problem Statement

Current auto system has two major issues:
1. `autonomous-engine.ts` (649 lines): Single class doing assessment, decision, and execution — no separation of concerns
2. `behaviors.ts` (1282 lines): Monolithic file with all action implementations crammed together

The system uses a top-down imperative loop (assess → decide → execute every 2s) with no reactive behavior, no mode-based priority handling, and no LLM command interface.

## Design Goal

Redesign the auto system following the Mindcraft architecture pattern:
- **Reactive** bottom-up modes (tick-driven, priority-based, interruptible)
- **Deliberative** LLM command system (!cmd format)
- **Atomic** skills library for all actions
- **Autonomous** self-prompter loop for goal generation

## Architecture Overview

```
┌─────────────────────────────────────────┐
│         Deliberation Layer              │  ← Goal-oriented
│  ┌─────────────┐  ┌──────────────────┐  │
│  │ SelfPrompter │  │  Command System  │  │  LLM controls bot via !cmd
│  └─────────────┘  └──────────────────┘  │
├─────────────────────────────────────────┤
│           Reaction Layer                │  ← Event-driven
│  ┌──────────────────────────────────┐   │
│  │     Mode Controller              │   │  Priority mode tick loop
│  │  self_preservation > hunting >   │   │
│  │  item_collecting > torch_placing │   │
│  └──────────────────────────────────┘   │
├─────────────────────────────────────────┤
│          Execution Layer                │  ← Action implementation
│  ┌──────────────────────────────────┐   │
│  │     Skills Library               │   │  Atomic operations
│  │  gather, combat, build, craft,   │   │
│  │  move, place, avoid, etc.        │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

### Design Principles

1. **Mode → Skills**: Modes execute via SkillRegistry, never directly
2. **Command → Mode/Skills**: Commands activate modes or call skills
3. **Self-Prompter → Command**: Self-prompter parses LLM output into commands
4. **Decoupled layers**: Communicate through interfaces and registries, not direct imports
5. **Shared WorldState snapshot**: One snapshot per tick, all layers share it (avoids concurrency)

---

## Module 1: Reaction Layer — Mode System

### Mode Interface

```typescript
interface Mode {
  name: string;                    // Unique identifier, e.g. "self_preservation"
  priority: number;                // Lower = higher priority
  description: string;             // For Self-Prompter context
  tickRate?: number;               // Default 300ms, customizable per mode
  isEventDriven?: boolean;         // true = event-triggered, not tick-driven
  on?(bot: MinecraftBot): void;          // Called on mode start
  onUpdate?(bot: MinecraftBot, delta: number): boolean;  // Tick loop, false = deactivate
  onEvent?(bot: MinecraftBot, event: GameEvent): void;  // Event-driven mode only
  off?(bot: MinecraftBot): void;     // Called on mode stop
}
```

### Mode Controller

```typescript
class ModeController {
  private modes: Mode[];
  private activeMode: Mode | null;
  private pausedMode: Mode | null;
  private tickInterval: number;

  start(): void;         // Start tick loop
  register(mode: Mode): void;   // Register a new mode
  stop(): void;          // Stop all modes
}
```

### Behavior Rules

- Each tick, check modes in priority order (lowest number first)
- A mode returning `true` from `onUpdate()` becomes active
- Higher-priority modes can interrupt lower-priority ones
- `pausedMode` allows temporarily pausing (e.g., pause building during combat)
- All modes share an execution queue to prevent action conflicts

### Preset Modes

| Mode | Priority | Tick/Event | Trigger |
|------|----------|------------|---------|
| self_preservation | 0 | tick | HP < 50%, on fire, in void |
| unstuck | 1 | tick | Position unchanged for N frames |
| self_defense | 2 | tick | Hostile entity in attack range |
| hunting | 3 | tick | Actively chase and attack entities |
| item_collecting | 4 | tick | Pick-up items nearby |
| torch_placing | 5 | tick | No light source nearby |
| building | 6 | event | Activated by build command |
| idle | 7 | tick | Default fallback |

---

## Module 2: Execution Layer — Skills System

### Skill Interface

```typescript
interface SkillContext {
  bot: MinecraftBot;
  world: WorldState;     // Snapshot: entities, blocks, items
  inventory: Inventory;   // Current inventory state
}

interface Skill {
  name: string;
  description: string;    // For LLM understanding
  cooldown?: number;      // Cooldown in ms
  canRun?(ctx: SkillContext): boolean;  // Precondition check
  execute(ctx: SkillContext): Promise<void>;
}
```

### Skill Registry

```typescript
class SkillRegistry {
  private skills: Map<string, Skill> = new Map();
  private cooldowns: Map<string, number> = new Map();

  register(skill: Skill): void;
  async execute(name: string, ctx: SkillContext): Promise<void>;
  isReady(name: string): boolean;  // Check cooldown
}
```

### Skills Classification

| Category | Skills |
|----------|--------|
| Movement | flyTo, moveTo, pathTo, retreat |
| Combat | attackEntity, combatMode, defendSelf |
| Gathering | gatherResources, pickupNearbyItems, mineBlock |
| Building | placeBlock, buildStructure, craftItem |
| Survival | eat, placeTorch, findSafeRetreat, avoidDamage |
| Query | scanEntities, checkHealth, lookForItem, findBlock |

### Design Decisions

- All skills are async and cancellable
- SkillRegistry manages cooldowns to prevent duplicate execution
- Modes and Commands call skills via registry, never directly
- Each skill encapsulates one atomic operation that cannot be decomposed further

---

## Module 3: Deliberation Layer — Command System

### Command Interface

```typescript
interface Command {
  name: string;                    // Short name, e.g. "build"
  prompt: string;                  // Full command for LLM, e.g. "!build a house"
  description: string;             // Explanation for LLM
  paramSchema?: object;            // JSON Schema for parameter validation
  execute(params: Record<string, string>, ctx: CommandContext): Promise<void>;
}

interface CommandContext {
  bot: MinecraftBot;
  world: WorldState;
  skillRegistry: SkillRegistry;
  modeController: ModeController;
}
```

### Command Registry

```typescript
class CommandRegistry {
  private commands: Map<string, Command> = new Map();

  register(cmd: Command): void;
  getAllPromptText(): string;    // Generate command list for LLM
  getByName(name: string): Command | undefined;
  execute(name: string, rawParams: string, ctx: CommandContext): Promise<void>;
}
```

### Command Groups

| Group | Commands | Purpose |
|-------|----------|---------|
| Action | `!build`, `!craft`, `!attack`, `!goTo`, `!gather` | Drive modes/skills |
| Query | `!status`, `!inventory`, `!entities`, `!nearby` | Return world state |
| Control | `!startAuto`, `!stopAuto`, `!pause`, `!resume` | Control auto system |
| Task | `!task craft`, `!task build`, `!task list` | Composite tasks |

### LLM Interaction Flow

1. LLM outputs: `!build a stone house`
2. Parser extracts command="build", rawParams="a stone house"
3. Validate against paramSchema (if defined)
4. Call `build.execute(params, ctx)`
5. execute() internally activates a Mode or calls Skills

---

## Module 4: Self-Prompter

### State Machine

```
STOPPED → ACTIVE → ACTIVE → ... → ACTIVE → STOPPED
          ↑           ↓paused       ↓failed
          └────── PAUSED ←───────────┘
```

### Core Interface

```typescript
enum SelfPrompterState { STOPPED, ACTIVE, PAUSED }

interface PromptResult {
  success: boolean;
  goal?: string;
  commands?: string[];
  failureReason?: string;
}

class SelfPrompter {
  state: SelfPrompterState;
  maxFailedAttempts: number;   // Default 3
  idleInterval: number;        // Wake interval when idle, default 30s

  start(): void;       // Start autonomous loop
  stop(): void;        // Full stop
  pause(): void;       // Pause
  resume(): void;      // Resume
}
```

### Prompt Template (context for LLM)

```
Current state:
- HP: 14/20
- Inventory: Stone Sword x1, Bread x5
- Nearby entities: Zombie(5 blocks), Cow(12 blocks)
- Weather: Clear
- Last goal: buildStoneHouse (completed)

Available commands:
- !attack <entity> - attack specified entity
- !build <structure> - build a structure
- !gather - gather nearby resources
- ...

Current mode: idle (no other modes active)

Decide next goal:
```

### Behavior Rules

- `cycle()` loop: promptLLM → parse commands → executeCommands → if success, stay ACTIVE; if fail, record and retry
- After `maxFailedAttempts` consecutive failures, auto-stop and wait for external trigger
- `idleInterval` triggers auto-restart from STOPPED → ACTIVE
- Self-Prompter commands activate modes via Command Registry

---

## Module 5: Goal System

### New Goal Interface

```typescript
interface Goal {
  id: string;
  name: string;
  description: string;    // Natural language description
  state: GoalState;       // PENDING, ACTIVE, COMPLETED, FAILED
  type: GoalType;         // SELF_PROMPTER | COMMAND | MANUAL
  createdAt: number;
  completedAt?: number;
  commands?: string[];    // Decomposed sub-commands
  result?: string;        // Result description after completion
}

type GoalState = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'FAILED';
type GoalType = 'SELF_PROMPTER' | 'COMMAND' | 'MANUAL';
```

### Goal Manager

```typescript
class GoalManager {
  private goals: Map<string, Goal> = new Map();
  private activeGoals: Set<string> = new Set();

  create(type: GoalType, params: GoalParams): Goal;
  complete(id: string, result?: string): void;
  fail(id: string, reason?: string): void;
  getActive(): Goal[];
  getHistory(): Goal[];
  toContextString(): string;  // Generate context for Self-Prompter
}
```

### Integration with Upper Layers

- Self-Prompter creates COMPLETED goals after successful cycles
- Command execution creates corresponding goals
- `GoalManager.toContextString()` returns recent goal list, injected into Self-Prompter prompt

---

## Module 6: File Structure & Dependencies

### Directory Structure

```
bot/
├── index.ts                  # MinecraftBot - entry point, assembles all modules
├── engine/
│   ├── index.ts              # Agent - assembles Reaction/Deliberation/Execution layers
│   ├── mode-controller.ts    # ModeController
│   └── modes/
│       ├── base.ts           # Mode interface definition
│       ├── self-preservation.ts
│       ├── unstuck.ts
│       ├── self-defense.ts
│       ├── hunting.ts
│       ├── item-collecting.ts
│       ├── torch-placing.ts
│       ├── building.ts
│       └── idle.ts
├── skills/
│   ├── index.ts              # Skill interface + SkillRegistry
│   ├── movement.ts           # flyTo, moveTo, pathTo, retreat
│   ├── combat.ts             # attackEntity, combatMode, defendSelf
│   ├── gathering.ts          # gatherResources, pickupNearbyItems, mineBlock
│   ├── building.ts           # placeBlock, buildStructure, craftItem
│   ├── survival.ts           # eat, placeTorch, findSafeRetreat
│   └── world-utils.ts        # scanEntities, checkHealth, lookForItem, findBlock
├── commands/
│   ├── index.ts              # Command interface + CommandRegistry
│   ├── action-commands.ts    # !build, !craft, !attack, !goTo, !gather
│   ├── query-commands.ts     # !status, !inventory, !entities, !nearby
│   └── control-commands.ts   # !startAuto, !stopAuto, !pause, !resume
├── self-prompter.ts          # SelfPrompter class
├── goal-manager.ts           # GoalManager class
└── types.ts                  # Shared types: WorldState, Inventory, GameEvent
```

### Module Dependencies

```
MinecraftBot (index.ts)
  ├── ModeController ──→ Skills (read-only reference)
  ├── CommandRegistry ──→ Skills, ModeController
  ├── SelfPrompter ────→ CommandRegistry, GoalManager
  ├── GoalManager
  └── WorldState (shared snapshot)
```

---

## Migration Notes

- **Complete rewrite, no backward compatibility required**
- Old `autonomous-engine.ts` and `behaviors.ts` will be removed
- Old `goal-system.ts` will be replaced by `goal-manager.ts`
- All logic from `behaviors.ts` will be redistributed into new `skills/` modules
- The bot lifecycle (connection, WebSocket, event listeners) in `bot/index.ts` remains as-is; only auto behavior layer changes
