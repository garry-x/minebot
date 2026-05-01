# Minebot Phase 1 — Foundation + Basic Mining Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bot connects to Bedrock server, authenticates via Microsoft OAuth, loads world state, navigates via A* pathfinding, and autonomously mines ores.

**Architecture:** Bottom-up layered construction. Utilities first (vec3, logger, event-bus), then protocol layer (auth, connection), then world representation (world-state, inventory), then control layers (movement, pathfinding), then AI (skills FSM, idle, gathering), finally orchestration (bot, cli, shell wrapper). Each layer tested before the next begins.

**Tech Stack:** TypeScript (strict), Node.js 18+, bedrock-protocol, prismarine-auth, prismarine-world, prismarine-chunk, prismarine-block, prismarine-item, prismarine-registry, minecraft-data, vec3, yargs, pino, tsx

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/` directory structure (all subdirs)
- Create: `config/default.json`

- [ ] **Step 1: Initialize package.json**

```json
{
  "name": "minebot",
  "version": "0.1.0",
  "description": "Minecraft Bedrock autonomous bot",
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "start": "tsx src/index.ts",
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/"
  },
  "dependencies": {
    "bedrock-protocol": "^3.37.0",
    "prismarine-auth": "^2.4.1",
    "prismarine-registry": "^1.8.0",
    "prismarine-world": "^3.7.1",
    "prismarine-chunk": "^2.1.1",
    "prismarine-block": "^1.17.1",
    "prismarine-item": "^1.14.0",
    "prismarine-entity": "^2.5.1",
    "minecraft-data": "^3.46.2",
    "vec3": "^0.1.10",
    "yargs": "^17.7.2",
    "pino": "^8.21.0",
    "pino-pretty": "^10.3.1"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/node": "^20.12.0",
    "@types/yargs": "^17.0.32",
    "tsx": "^4.7.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Install dependencies**

```bash
npm install
```

Expected: All packages installed, `node_modules/` created, package-lock.json generated.

- [ ] **Step 4: Create directory structure**

```bash
mkdir -p src/{auth,connection,world,movement,skills,inventory,events,utils} config tests
```

- [ ] **Step 5: Create default config**

Write `config/default.json`:

```json
{
  "host": "127.0.0.1",
  "port": 19132,
  "viewDistance": 4,
  "tickInterval": 50,
  "pathfinding": {
    "timeout": 5000,
    "maxNodes": 10000,
    "heuristic": "manhattan"
  },
  "logging": {
    "level": "info",
    "pretty": true
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add . && git commit -m "chore: scaffold project structure, dependencies, config"
```

---

### Task 2: Vec3 Utilities

**Files:**
- Create: `src/utils/vec3.ts`
- Create: `tests/utils/vec3.test.ts`

We wrap `vec3` with typed convenience functions aligned to how bedrock-protocol uses position vectors.

- [ ] **Step 1: Write tests**

Create `tests/utils/vec3.test.ts`:

```typescript
import { describe, it } from "node:test";
import assert from "node:assert";
import { add, sub, scale, length, distance, floor, equals } from "../../src/utils/vec3.js";

describe("Vec3 utilities", () => {
  it("adds two vectors", () => {
    assert.ok(equals(add({ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 }), { x: 5, y: 7, z: 9 }));
  });

  it("subtracts two vectors", () => {
    assert.ok(equals(sub({ x: 5, y: 5, z: 5 }, { x: 2, y: 1, z: 3 }), { x: 3, y: 4, z: 2 }));
  });

  it("scales a vector", () => {
    assert.ok(equals(scale({ x: 1, y: 2, z: 3 }, 2), { x: 2, y: 4, z: 6 }));
  });

  it("computes length", () => {
    assert.strictEqual(length({ x: 3, y: 4, z: 0 }), 5);
  });

  it("computes distance", () => {
    assert.strictEqual(distance({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }), 5);
  });

  it("floors a vector", () => {
    assert.ok(equals(floor({ x: 1.7, y: -2.3, z: 3.9 }), { x: 1, y: -3, z: 3 }));
  });

  it("equals returns false for different vectors", () => {
    assert.strictEqual(equals({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }), false);
  });
});
```

- [ ] **Step 2: Run tests (expect FAIL)**

```bash
tsx --test tests/utils/vec3.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/utils/vec3.ts`:

```typescript
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function length(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

export function distance(a: Vec3, b: Vec3): number {
  return length(sub(a, b));
}

export function floor(v: Vec3): Vec3 {
  return { x: Math.floor(v.x), y: Math.floor(v.y), z: Math.floor(v.z) };
}

export function equals(a: Vec3, b: Vec3): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

export function manhattan(a: Vec3, b: Vec3): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
}

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}
```

- [ ] **Step 4: Run tests (expect PASS)**

```bash
tsx --test tests/utils/vec3.test.ts
```

Expected: All 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/vec3.ts tests/utils/vec3.test.ts && git commit -m "feat: add vec3 utility functions"
```

---

### Task 3: Logger Utility

**Files:**
- Create: `src/utils/logger.ts`

Thin wrapper around `pino` with `pino-pretty` for dev output. No tests needed—this is a configurable wrapper.

- [ ] **Step 1: Implement**

Create `src/utils/logger.ts`:

```typescript
import pino from "pino";

export interface LoggerConfig {
  level: string;
  pretty: boolean;
}

const defaultConfig: LoggerConfig = {
  level: "info",
  pretty: false,
};

let loggerInstance: pino.Logger | null = null;

export function createLogger(config: Partial<LoggerConfig> = {}): pino.Logger {
  const merged = { ...defaultConfig, ...config };
  loggerInstance = pino({
    level: merged.level,
    ...(merged.pretty
      ? { transport: { target: "pino-pretty", options: { colorize: true } } }
      : {}),
  });
  return loggerInstance;
}

export function getLogger(): pino.Logger {
  if (!loggerInstance) {
    loggerInstance = pino({ level: "info" });
  }
  return loggerInstance;
}

export type Logger = pino.Logger;
```

- [ ] **Step 2: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/utils/logger.ts && git commit -m "feat: add pino logger wrapper"
```

---

### Task 4: EventBus

**Files:**
- Create: `src/events/event-bus.ts`
- Create: `tests/events/event-bus.test.ts`

Type-safe event emitter used for decoupled inter-module communication.

- [ ] **Step 1: Write tests**

Create `tests/events/event-bus.test.ts`:

```typescript
import { describe, it } from "node:test";
import assert from "node:assert";
import { EventBus } from "../../src/events/event-bus.js";

describe("EventBus", () => {
  it("emits and receives events", () => {
    const bus = new EventBus();
    const values: number[] = [];
    bus.on("test", (n: number) => values.push(n));
    bus.emit("test", 42);
    bus.emit("test", 99);
    assert.deepStrictEqual(values, [42, 99]);
  });

  it("supports multiple listeners for same event", () => {
    const bus = new EventBus();
    let a = 0;
    let b = 0;
    bus.on("x", () => a++);
    bus.on("x", () => b++);
    bus.emit("x");
    assert.strictEqual(a, 1);
    assert.strictEqual(b, 1);
  });

  it("removes listeners with off()", () => {
    const bus = new EventBus();
    let count = 0;
    const fn = () => count++;
    bus.on("y", fn);
    bus.emit("y");
    bus.off("y", fn);
    bus.emit("y");
    assert.strictEqual(count, 1);
  });

  it("once() fires only once", () => {
    const bus = new EventBus();
    let count = 0;
    bus.once("z", () => count++);
    bus.emit("z");
    bus.emit("z");
    assert.strictEqual(count, 1);
  });

  it("removeAllListeners clears all", () => {
    const bus = new EventBus();
    let count = 0;
    bus.on("w", () => count++);
    bus.on("w", () => count++);
    bus.removeAllListeners("w");
    bus.emit("w");
    assert.strictEqual(count, 0);
  });

  it("listenerCount returns correct count", () => {
    const bus = new EventBus();
    bus.on("a", () => {});
    bus.on("a", () => {});
    bus.on("b", () => {});
    assert.strictEqual(bus.listenerCount("a"), 2);
    assert.strictEqual(bus.listenerCount("b"), 1);
  });
});
```

- [ ] **Step 2: Run tests (expect FAIL)**

```bash
tsx --test tests/events/event-bus.test.ts
```

- [ ] **Step 3: Implement**

Create `src/events/event-bus.ts`:

```typescript
export type EventHandler<T = unknown> = (payload: T) => void;

interface ListenerEntry<T = unknown> {
  handler: EventHandler<T>;
  once: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventMap = Record<string, any>;

export class EventBus<TEvents extends EventMap = EventMap> {
  private listeners = new Map<keyof TEvents, ListenerEntry[]>();

  on<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): void {
    const entries = this.listeners.get(event) ?? [];
    entries.push({ handler, once: false });
    this.listeners.set(event, entries);
  }

  once<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): void {
    const entries = this.listeners.get(event) ?? [];
    entries.push({ handler, once: true });
    this.listeners.set(event, entries);
  }

  off<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): void {
    const entries = this.listeners.get(event);
    if (!entries) return;
    this.listeners.set(
      event,
      entries.filter((e) => e.handler !== handler)
    );
  }

  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
    const entries = this.listeners.get(event);
    if (!entries) return;
    const onceToRemove: EventHandler[] = [];
    for (const entry of entries) {
      entry.handler(payload);
      if (entry.once) onceToRemove.push(entry.handler);
    }
    for (const h of onceToRemove) {
      this.off(event, h);
    }
  }

  removeAllListeners<K extends keyof TEvents>(event?: K): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  listenerCount<K extends keyof TEvents>(event: K): number {
    return this.listeners.get(event)?.length ?? 0;
  }
}

// Global bot event types
export interface BotEvents {
  spawned: { x: number; y: number; z: number; yaw: number; pitch: number };
  health_change: { health: number; maxHealth: number };
  player_position: { x: number; y: number; z: number; yaw: number; pitch: number };
  block_update: { x: number; y: number; z: number; blockStateId: number };
  entity_spawn: { id: bigint; type: string; x: number; y: number; z: number };
  entity_despawn: { id: bigint };
  entity_move: { id: bigint; x: number; y: number; z: number };
  inventory_change: { slot: number; item: { id: number; count: number; metadata: number } | null };
  player_death: { message: string };
  disconnect: { reason: string };
  error: { message: string; error: Error };
}
```

- [ ] **Step 4: Run tests (expect PASS)**

```bash
tsx --test tests/events/event-bus.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/events/event-bus.ts tests/events/event-bus.test.ts && git commit -m "feat: add type-safe event bus"
```

---

### Task 5: AuthManager

**Files:**
- Create: `src/auth/auth-manager.ts`
- Augment `config/default.json` (if needed)

- [ ] **Step 1: Check prismarine-auth types for exact API**

```bash
node -e "const auth = require('prismarine-auth'); console.log(Object.keys(auth))"
```

Read `node_modules/prismarine-auth/src/index.d.ts` (or similar) to confirm the Authflow interface.

- [ ] **Step 2: Implement AuthManager**

Create `src/auth/auth-manager.ts`:

```typescript
import { Authflow, Titles } from "prismarine-auth";
import { getLogger } from "../utils/logger.js";

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface BedrockAuthResult {
  chain: string[];
  token: string;
}

export class AuthManager {
  private authflow: Authflow;

  constructor(credentials: AuthCredentials) {
    this.authflow = new Authflow(credentials.email, undefined, {
      flow: "live",
      authTitle: Titles.MinecraftNintendoSwitch,
      password: credentials.password,
    });
  }

  async authenticate(): Promise<BedrockAuthResult> {
    const logger = getLogger();
    logger.info("Authenticating with Microsoft...");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const token = await (this.authflow as any).getMinecraftBedrockToken();
      logger.info("Authentication successful");
      return {
        chain: token.chain,
        token: token.token,
      };
    } catch (err) {
      logger.error({ err }, "Authentication failed");
      throw err;
    }
  }
}
```

Note: `getMinecraftBedrockToken()` may not be on the TS types. Use `any` cast if needed; we'll verify at runtime.

- [ ] **Step 3: Verify typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/auth/auth-manager.ts && git commit -m "feat: add Microsoft OAuth auth manager"
```

---

### Task 6: Connection Layer

**Files:**
- Create: `src/connection/connection.ts`

Wraps `bedrock-protocol` client, parses incoming packets into events for the EventBus.

- [ ] **Step 1: Check bedrock-protocol createClient signature**

```bash
node -e "const b = require('bedrock-protocol'); console.log(typeof b.createClient)"
```

Then read type definitions in `node_modules/bedrock-protocol/src/index.d.ts` or `node_modules/bedrock-protocol/index.d.ts`.

- [ ] **Step 2: Implement Connection**

Create `src/connection/connection.ts`:

```typescript
import { createClient, Client, ClientOptions } from "bedrock-protocol";
import { EventBus, BotEvents } from "../events/event-bus.js";
import { getLogger } from "../utils/logger.js";

export interface ConnectionOptions {
  host: string;
  port: number;
  username: string;
  chain: string[];
  token: string;
  viewDistance?: number;
}

export class Connection {
  private client: Client | null = null;
  private opts: ConnectionOptions;
  private events: EventBus<BotEvents>;

  constructor(options: ConnectionOptions, events: EventBus<BotEvents>) {
    this.opts = options;
    this.events = events;
  }

  connect(): void {
    const logger = getLogger();
    logger.info({ host: this.opts.host, port: this.opts.port }, "Connecting to server...");

    const clientOpts: ClientOptions = {
      host: this.opts.host,
      port: this.opts.port,
      username: this.opts.username,
      offline: false,
      profilesFolder: "./.minebot-cache",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    this.client = createClient(clientOpts);

    this.client.on("connect", () => {
      logger.info("Connected to server");
    });

    this.client.on("join", () => {
      logger.info("Joined server");
    });

    this.client.on("start_game", (packet: any) => {
      logger.info("Game started");
      this.events.emit("spawned", {
        x: packet.player_position?.x ?? 0,
        y: packet.player_position?.y ?? 0,
        z: packet.player_position?.z ?? 0,
        yaw: packet.yaw ?? 0,
        pitch: packet.pitch ?? 0,
      });
    });

    this.client.on("move_player", (packet: any) => {
      if (packet.runtime_entity_id !== (this.client as any).entityId) return;
      this.events.emit("player_position", {
        x: packet.position?.x ?? 0,
        y: packet.position?.y ?? 0,
        z: packet.position?.z ?? 0,
        yaw: packet.yaw ?? 0,
        pitch: packet.pitch ?? 0,
      });
    });

    this.client.on("update_attributes", (packet: any) => {
      if (packet.runtime_entity_id !== (this.client as any).entityId) return;
      // health is one of the attributes
    });

    this.client.on("disconnect", (packet: any) => {
      const reason = packet?.message ?? "Unknown reason";
      logger.warn({ reason }, "Disconnected");
      this.events.emit("disconnect", { reason });
    });

    this.client.on("error", (err: Error) => {
      logger.error({ err }, "Connection error");
      this.events.emit("error", { message: err.message, error: err });
    });
  }

  write(name: string, params: Record<string, unknown>): void {
    if (!this.client) {
      getLogger().warn("Write called before client connected");
      return;
    }
    this.client.write(name, params);
  }

  queue(name: string, params: Record<string, unknown>): void {
    if (!this.client) {
      getLogger().warn("Queue called before client connected");
      return;
    }
    this.client.queue(name, params);
  }

  disconnect(): void {
    if (this.client) {
      this.client.close();
      this.client = null;
    }
  }

  isConnected(): boolean {
    return this.client !== null;
  }

  getEntityId(): bigint | undefined {
    return (this.client as any)?.entityId;
  }
}
```

- [ ] **Step 3: Verify typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/connection/connection.ts && git commit -m "feat: add bedrock-protocol connection wrapper"
```

---

### Task 7: World Types

**Files:**
- Create: `src/world/types.ts`

Shared types for world state, blocks, entities used across modules.

- [ ] **Step 1: Implement types**

Create `src/world/types.ts`:

```typescript
import type { Vec3 } from "../utils/vec3.js";

export interface BlockInfo {
  position: Vec3;
  type: number;       // numeric block ID
  stateId: number;    // full block state ID
  name: string;       // block name from registry
  hardness: number;
  diggable: boolean;
  solid: boolean;
  transparent: boolean;
  light: number;
}

export interface EntityInfo {
  id: bigint;
  type: string;       // entity type name (e.g., "minecraft:zombie")
  position: Vec3;
  velocity: Vec3;
  health?: number;
  isHostile: boolean;
}

export interface InventorySlot {
  slot: number;
  itemId: number;
  count: number;
  metadata?: number;
  durability?: number;
  name?: string;
}

export interface WorldBlockUpdate {
  position: Vec3;
  blockStateId: number;
}

export enum BlockCategory {
  SOLID = "solid",
  LIQUID = "liquid",
  AIR = "air",
  CLIMBABLE = "climbable",
  DANGEROUS = "dangerous",
  ORE = "ore",
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/world/types.ts && git commit -m "feat: add world type definitions"
```

---

### Task 8: WorldState Manager

**Files:**
- Create: `src/world/world-state.ts`

Backed by `prismarine-world` + `prismarine-chunk` + `prismarine-registry`. Provides query API for blocks and entities.

- [ ] **Step 1: Check prismarine-world and prismarine-registry constructors**

```bash
node -e "
const Registry = require('prismarine-registry');
const World = require('prismarine-world');
const ChunkColumn = require('prismarine-chunk');
console.log('Registry:', typeof Registry);
console.log('World:', typeof World);
console.log('ChunkColumn:', typeof ChunkColumn);
// Check constructor args
"
```

- [ ] **Step 2: Implement WorldState**

Create `src/world/world-state.ts`:

```typescript
import { World } from "prismarine-world";
import { Registry } from "prismarine-registry";
import { ChunkColumn } from "prismarine-chunk";
import type { Block } from "prismarine-block";
import type { Entity } from "prismarine-entity";
import { Vec3, vec3, floor } from "../utils/vec3.js";
import { getLogger } from "../utils/logger.js";
import type { EntityInfo, WorldBlockUpdate } from "./types.js";

export class WorldState {
  world: World;
  registry: Registry;
  private entities = new Map<bigint, EntityInfo>();
  private playerPosition: Vec3 = vec3(0, 0, 0);

  // Ores to target for mining
  static ORE_TYPES = new Set([
    "coal_ore", "deepslate_coal_ore",
    "iron_ore", "deepslate_iron_ore",
    "copper_ore", "deepslate_copper_ore",
    "gold_ore", "deepslate_gold_ore",
    "diamond_ore", "deepslate_diamond_ore",
    "emerald_ore", "deepslate_emerald_ore",
    "redstone_ore", "deepslate_redstone_ore",
    "lapis_ore", "deepslate_lapis_ore",
  ]);

  constructor(version: string) {
    this.registry = Registry(version);
    this.world = new World(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      null as any,
      (chunkX: number, chunkZ: number) => {
        const chunk = new ChunkColumn({
          x: chunkX,
          z: chunkZ,
          registry: this.registry,
        });
        return chunk;
      }
    );
  }

  loadItemStates(itemstates: Array<{ name: string; runtime_id: number; component_based: boolean }>): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.registry as any).loadItemStates(itemstates);
  }

  updatePlayerPosition(pos: Vec3): void {
    this.playerPosition = pos;
  }

  getPlayerPosition(): Vec3 {
    return this.playerPosition;
  }

  getBlock(pos: Vec3): Block | null {
    const fpos = floor(pos);
    const chunk = this.world.getColumn(fpos.x >> 4, fpos.z >> 4);
    if (!chunk) return null;
    return chunk.getBlock(new (require("vec3") as any)(fpos.x, fpos.y, fpos.z));
  }

  async addColumn(x: number, z: number, column: ChunkColumn): Promise<void> {
    return this.world.setColumn(x, z, column);
  }

  getColumn(x: number, z: number): ChunkColumn | null {
    return this.world.getColumn(x, z);
  }

  getColumns(): Map<string, ChunkColumn> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.world as any).columns ?? new Map();
  }

  addEntity(entity: EntityInfo): void {
    this.entities.set(entity.id, entity);
  }

  removeEntity(id: bigint): void {
    this.entities.delete(id);
  }

  updateEntityPosition(id: bigint, pos: Vec3): void {
    const entity = this.entities.get(id);
    if (entity) entity.position = pos;
  }

  getEntities(): EntityInfo[] {
    return Array.from(this.entities.values());
  }

  getNearbyEntities(pos: Vec3, radius: number): EntityInfo[] {
    const r2 = radius * radius;
    return this.getEntities().filter((e) => {
      const dx = e.position.x - pos.x;
      const dy = e.position.y - pos.y;
      const dz = e.position.z - pos.z;
      return dx * dx + dy * dy + dz * dz <= r2;
    });
  }

  findBlocks(
    predicate: (block: Block) => boolean,
    center: Vec3,
    radius: number
  ): Vec3[] {
    const results: Vec3[] = [];
    const cx = Math.floor(center.x);
    const cy = Math.floor(center.y);
    const cz = Math.floor(center.z);
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const pos = vec3(cx + dx, cy + dy, cz + dz);
          const block = this.getBlock(pos);
          if (block && predicate(block)) {
            results.push(pos);
          }
        }
      }
    }
    return results;
  }

  findOres(center: Vec3, radius: number): Vec3[] {
    return this.findBlocks((block) => {
      const name = block.name;
      return WorldState.ORE_TYPES.has(name);
    }, center, radius);
  }

  isBlockSolid(pos: Vec3): boolean {
    const block = this.getBlock(pos);
    if (!block) return true; // unknown, assume solid
    return block.boundingBox !== "empty";
  }

  applyBlockUpdate(update: WorldBlockUpdate): void {
    const chunk = this.world.getColumn(
      update.position.x >> 4,
      update.position.z >> 4
    );
    if (!chunk) return;
    const rx = update.position.x & 15;
    const ry = update.position.y;
    const rz = update.position.z & 15;
    chunk.setBlockStateId(new (require("vec3") as any)(rx, ry, rz), update.blockStateId);
  }
}
```

- [ ] **Step 3: Verify typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/world/world-state.ts && git commit -m "feat: add world state manager backed by prismarine-world"
```

---

### Task 9: Inventory Manager

**Files:**
- Create: `src/inventory/inventory.ts`

Tracks player inventory using `prismarine-item`.

- [ ] **Step 1: Check prismarine-item API**

```bash
node -e "
const Item = require('prismarine-item');
console.log(typeof Item, typeof Item.fromNotch);
"
```

- [ ] **Step 2: Implement Inventory**

Create `src/inventory/inventory.ts`:

```typescript
import { getLogger } from "../utils/logger.js";
import type { InventorySlot } from "../world/types.js";

export const INVENTORY_SLOTS = 36;
export const HOTBAR_SIZE = 9;
export const ARMOR_SLOTS = 4;
export const OFFHAND_SLOT = 1;

export class Inventory {
  private slots: Map<number, InventorySlot> = new Map();
  private selectedSlot = 0;

  setSlot(slot: number, item: InventorySlot | null): void {
    if (item) {
      this.slots.set(slot, item);
    } else {
      this.slots.delete(slot);
    }
  }

  getSlot(slot: number): InventorySlot | null {
    return this.slots.get(slot) ?? null;
  }

  setSelectedSlot(slot: number): void {
    this.selectedSlot = Math.min(Math.max(0, slot), HOTBAR_SIZE - 1);
  }

  getSelectedSlot(): number {
    return this.selectedSlot;
  }

  getSelectedItem(): InventorySlot | null {
    return this.getSlot(this.selectedSlot);
  }

  hasItem(filepath: string): boolean {
    return this.findItem(filepath) !== -1;
  }

  countItem(filepath: string): number {
    let total = 0;
    for (const [, item] of this.slots) {
      if (item.name === filepath) {
        total += item.count;
      }
    }
    return total;
  }

  findItem(filepath: string): number {
    for (const [slot, item] of this.slots) {
      if (item.name === filepath) return slot;
    }
    return -1;
  }

  findHotbarItem(filepath: string): number {
    for (const [slot, item] of this.slots) {
      if (slot < HOTBAR_SIZE && item.name === filepath) return slot;
    }
    return -1;
  }

  getEmptySlots(): number[] {
    const empty: number[] = [];
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      if (!this.slots.has(i)) empty.push(i);
    }
    return empty;
  }

  isFull(): boolean {
    return this.slots.size >= INVENTORY_SLOTS;
  }

  getAllItems(): Map<number, InventorySlot> {
    return new Map(this.slots);
  }

  clear(): void {
    this.slots.clear();
    this.selectedSlot = 0;
  }

  logContents(): void {
    const logger = getLogger();
    logger.info("--- Inventory ---");
    for (const [slot, item] of this.slots) {
      logger.info(`  Slot ${slot}: ${item.name ?? item.itemId} x${item.count}`);
    }
    logger.info(`  Selected slot: ${this.selectedSlot}`);
  }
}
```

- [ ] **Step 3: Write tests**

Create `tests/inventory/inventory.test.ts`:

```typescript
import { describe, it } from "node:test";
import assert from "node:assert";
import { Inventory } from "../../src/inventory/inventory.js";

describe("Inventory", () => {
  it("sets and gets items", () => {
    const inv = new Inventory();
    inv.setSlot(0, { slot: 0, itemId: 1, count: 64, name: "minecraft:stone" });
    const item = inv.getSlot(0);
    assert.ok(item);
    assert.strictEqual(item!.name, "minecraft:stone");
    assert.strictEqual(item!.count, 64);
  });

  it("finds items by name", () => {
    const inv = new Inventory();
    inv.setSlot(5, { slot: 5, itemId: 15, count: 3, name: "minecraft:iron_ore" });
    assert.strictEqual(inv.findItem("minecraft:iron_ore"), 5);
    assert.strictEqual(inv.findItem("minecraft:diamond"), -1);
  });

  it("counts items by name", () => {
    const inv = new Inventory();
    inv.setSlot(0, { slot: 0, itemId: 1, count: 10, name: "minecraft:coal" });
    inv.setSlot(1, { slot: 1, itemId: 1, count: 5, name: "minecraft:coal" });
    assert.strictEqual(inv.countItem("minecraft:coal"), 15);
  });

  it("selects hotbar slot", () => {
    const inv = new Inventory();
    inv.setSelectedSlot(3);
    assert.strictEqual(inv.getSelectedSlot(), 3);
  });

  it("clamps selected slot to 0-8", () => {
    const inv = new Inventory();
    inv.setSelectedSlot(12);
    assert.strictEqual(inv.getSelectedSlot(), 8);
    inv.setSelectedSlot(-3);
    assert.strictEqual(inv.getSelectedSlot(), 0);
  });

  it("detects empty slots", () => {
    const inv = new Inventory();
    inv.setSlot(0, { slot: 0, itemId: 1, count: 1, name: "x" });
    const empty = inv.getEmptySlots();
    assert.strictEqual(empty.length, 35);
    assert.ok(!empty.includes(0));
  });

  it("detects full inventory", () => {
    const inv = new Inventory();
    for (let i = 0; i < 36; i++) {
      inv.setSlot(i, { slot: i, itemId: 1, count: 1, name: "x" });
    }
    assert.ok(inv.isFull());
  });
});
```

- [ ] **Step 4: Run tests (expect FAIL, then implement and PASS)**

```bash
tsx --test tests/inventory/inventory.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/inventory/inventory.ts tests/inventory/inventory.test.ts && git commit -m "feat: add inventory manager"
```

---

### Task 10: Movement Controller

**Files:**
- Create: `src/movement/movement.ts`

Sends movement packets to the server. Handles walking, jumping, sneaking, sprinting, rotation.

- [ ] **Step 1: Implement Movement**

Create `src/movement/movement.ts`:

```typescript
import type { Connection } from "../connection/connection.js";
import type { Vec3 } from "../utils/vec3.js";
import { getLogger } from "../utils/logger.js";

export class Movement {
  private connection: Connection;
  private isSneaking = false;
  private isSprinting = false;
  private currentPosition: Vec3 = { x: 0, y: 0, z: 0 };
  private currentYaw = 0;
  private currentPitch = 0;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  setPosition(x: number, y: number, z: number): void {
    this.currentPosition = { x, y, z };
    this.connection.queue("move_player", {
      runtime_entity_id: this.connection.getEntityId(),
      position: { x, y, z },
      pitch: this.currentPitch,
      yaw: this.currentYaw,
      head_yaw: this.currentYaw,
      mode: "normal",
      on_ground: false,
      tick: BigInt(0),
    });
  }

  setRotation(yaw: number, pitch: number): void {
    this.currentYaw = yaw;
    this.currentPitch = pitch;
    this.connection.queue("move_player", {
      runtime_entity_id: this.connection.getEntityId(),
      position: this.currentPosition,
      pitch,
      yaw,
      head_yaw: yaw,
      mode: "normal",
      on_ground: false,
      tick: BigInt(0),
    });
  }

  lookAt(target: Vec3): void {
    const dx = target.x - this.currentPosition.x;
    const dy = target.y - this.currentPosition.y;
    const dz = target.z - this.currentPosition.z;
    const yaw = Math.atan2(-dx, dz) * (180 / Math.PI);
    const horizontal = Math.sqrt(dx * dx + dz * dz);
    const pitch = -Math.atan2(dy, horizontal) * (180 / Math.PI);
    this.setRotation(yaw, pitch);
  }

  startSneaking(): void {
    if (this.isSneaking) return;
    this.isSneaking = true;
    this.connection.queue("player_action", {
      runtime_entity_id: this.connection.getEntityId(),
      action: "start_sneak",
      x: 0, y: 0, z: 0,
      face: 0,
    });
  }

  stopSneaking(): void {
    if (!this.isSneaking) return;
    this.isSneaking = false;
    this.connection.queue("player_action", {
      runtime_entity_id: this.connection.getEntityId(),
      action: "stop_sneak",
      x: 0, y: 0, z: 0,
      face: 0,
    });
  }

  startSprinting(): void {
    if (this.isSprinting) return;
    this.isSprinting = true;
    this.connection.queue("player_action", {
      runtime_entity_id: this.connection.getEntityId(),
      action: "start_sprint",
      x: 0, y: 0, z: 0,
      face: 0,
    });
  }

  stopSprinting(): void {
    if (!this.isSprinting) return;
    this.isSprinting = false;
    this.connection.queue("player_action", {
      runtime_entity_id: this.connection.getEntityId(),
      action: "stop_sprint",
      x: 0, y: 0, z: 0,
      face: 0,
    });
  }

  jump(): void {
    this.connection.queue("player_action", {
      runtime_entity_id: this.connection.getEntityId(),
      action: "start_jump",
      x: 0, y: 0, z: 0,
      face: 0,
    });
  }

  // Block breaking
  startDigging(pos: Vec3): void {
    this.connection.queue("player_action", {
      runtime_entity_id: this.connection.getEntityId(),
      action: "start_destroy_block",
      x: pos.x, y: pos.y, z: pos.z,
      face: 0,
    });
  }

  stopDigging(pos: Vec3): void {
    this.connection.queue("player_action", {
      runtime_entity_id: this.connection.getEntityId(),
      action: "stop_destroy_block",
      x: pos.x, y: pos.y, z: pos.z,
      face: 0,
    });
  }

  // Swinging arm (for attacking)
  swingArm(): void {
    this.connection.queue("animate", {
      runtime_entity_id: this.connection.getEntityId(),
      action: "swing_arm",
      rowing_time: BigInt(0),
    });
  }

  getPosition(): Vec3 {
    return { ...this.currentPosition };
  }
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/movement/movement.ts && git commit -m "feat: add movement controller"
```

---

### Task 11: A* Pathfinding

**Files:**
- Create: `src/movement/pathfinding.ts`
- Create: `tests/movement/pathfinding.test.ts`

3D A* pathfinding with obstacle avoidance, tested with a mock block function.

- [ ] **Step 1: Write tests**

Create `tests/movement/pathfinding.test.ts`:

```typescript
import { describe, it } from "node:test";
import assert from "node:assert";
import { Pathfinder, Node } from "../../src/movement/pathfinding.js";
import { vec3 } from "../../src/utils/vec3.js";

// Simple flatworld with some walls
function createBlockGetter(walls: { x: number; y: number; z: number }[]) {
  const wallSet = new Set(walls.map((w) => `${w.x},${w.y},${w.z}`));
  return (pos: { x: number; y: number; z: number }) => {
    return !wallSet.has(`${pos.x},${pos.y},${pos.z}`);
  };
}

function createPathfinder(walls: { x: number; y: number; z: number }[]) {
  return new Pathfinder(createBlockGetter(walls));
}

describe("Pathfinder", () => {
  it("finds a straight-line path", () => {
    const pf = createPathfinder([]);
    const path = pf.findPath(vec3(0, 64, 0), vec3(5, 64, 0));
    assert.ok(path.length > 0, "path should not be empty");
    assert.strictEqual(path[path.length - 1].x, 5);
    assert.strictEqual(path[path.length - 1].z, 0);
  });

  it("navigates around a wall", () => {
    const pf = createPathfinder([
      { x: 2, y: 64, z: 0 },
    ]);
    const path = pf.findPath(vec3(0, 64, 0), vec3(4, 64, 0));
    assert.ok(path.length > 0, "should find path around wall");
  });

  it("returns empty for unreachable target", () => {
    // Surrounded by walls
    const walls: { x: number; y: number; z: number }[] = [];
    for (let x = -1; x <= 1; x++) {
      for (let z = -1; z <= 1; z++) {
        if (x === 0 && z === 0) continue;
        walls.push({ x, y: 64, z });
      }
    }
    const pf = createPathfinder(walls);
    // Target is far away and completely blocked
    const path = pf.findPath(vec3(0, 64, 0), vec3(10, 64, 10));
    assert.strictEqual(path.length, 0);
  });

  it("handles same start and target", () => {
    const pf = createPathfinder([]);
    const path = pf.findPath(vec3(1, 64, 2), vec3(1, 64, 2));
    assert.strictEqual(path.length, 1);
    assert.strictEqual(path[0].x, 1);
    assert.strictEqual(path[0].z, 2);
  });
});
```

- [ ] **Step 2: Run tests (expect FAIL)**

```bash
tsx --test tests/movement/pathfinding.test.ts
```

- [ ] **Step 3: Implement**

Create `src/movement/pathfinding.ts`:

```typescript
import { Vec3, vec3, manhattan } from "../utils/vec3.js";

export interface Node {
  x: number;
  y: number;
  z: number;
  g: number;
  h: number;
  f: number;
  parent: Node | null;
}

// Neighbors in 4 cardinal directions + diagonal (horizontal only)
const NEIGHBOR_OFFSETS = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
  // diagonal
  { x: 1, y: 0, z: 1 },
  { x: 1, y: 0, z: -1 },
  { x: -1, y: 0, z: 1 },
  { x: -1, y: 0, z: -1 },
  // vertical (limited)
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
];

export class Pathfinder {
  private isWalkable: (pos: Vec3) => boolean;
  private maxNodes: number;

  constructor(isWalkable: (pos: Vec3) => boolean, maxNodes = 10000) {
    this.isWalkable = isWalkable;
    this.maxNodes = maxNodes;
  }

  findPath(start: Vec3, end: Vec3): Node[] {
    const startNode: Node = {
      x: start.x,
      y: start.y,
      z: start.z,
      g: 0,
      h: manhattan(start, end),
      f: 0,
      parent: null,
    };
    startNode.f = startNode.g + startNode.h;

    const openSet: Node[] = [startNode];
    const closedSet = new Set<string>();
    const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

    const startKey = key(startNode.x, startNode.y, startNode.z);
    const endKey = key(end.x, end.y, end.z);

    if (startKey === endKey) return [startNode];

    let iterations = 0;

    while (openSet.length > 0 && iterations < this.maxNodes) {
      iterations++;

      // Find node with lowest f score
      let lowestIdx = 0;
      for (let i = 1; i < openSet.length; i++) {
        if (openSet[i].f < openSet[lowestIdx].f) lowestIdx = i;
      }
      const current = openSet.splice(lowestIdx, 1)[0];

      if (key(current.x, current.y, current.z) === endKey) {
        return this.reconstructPath(current);
      }

      closedSet.add(key(current.x, current.y, current.z));

      for (const offset of NEIGHBOR_OFFSETS) {
        const nx = current.x + offset.x;
        const ny = current.y + offset.y;
        const nz = current.z + offset.z;
        const nk = key(nx, ny, nz);

        if (closedSet.has(nk)) continue;
        if (!this.isWalkable({ x: nx, y: ny, z: nz })) continue;

        // For diagonal moves, check corners are walkable too
        if (offset.x !== 0 && offset.z !== 0) {
          if (
            !this.isWalkable({ x: current.x + offset.x, y: ny, z: current.z }) ||
            !this.isWalkable({ x: current.x, y: ny, z: current.z + offset.z })
          ) {
            continue;
          }
        }

        const g = current.g + (offset.x !== 0 && offset.z !== 0 ? 1.414 : offset.y !== 0 ? 1.5 : 1);
        const h = manhattan({ x: nx, y: ny, z: nz }, end);
        const f = g + h;

        const existing = openSet.find((n) => n.x === nx && n.y === ny && n.z === nz);
        if (existing) {
          if (g < existing.g) {
            existing.g = g;
            existing.f = f;
            existing.parent = current;
          }
        } else {
          openSet.push({ x: nx, y: ny, z: nz, g, h, f, parent: current });
        }
      }
    }

    return []; // No path found
  }

  private reconstructPath(node: Node): Node[] {
    const path: Node[] = [];
    let current: Node | null = node;
    while (current) {
      path.push(current);
      current = current.parent;
    }
    path.reverse();
    return path;
  }
}
```

- [ ] **Step 4: Run tests (expect PASS)**

```bash
tsx --test tests/movement/pathfinding.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/movement/pathfinding.ts tests/movement/pathfinding.test.ts && git commit -m "feat: add A* 3D pathfinding"
```

---

### Task 12: Skill Framework (Base + Manager)

**Files:**
- Create: `src/skills/skill.ts`
- Create: `src/skills/skill-manager.ts`
- Create: `tests/skills/skill-manager.test.ts`

HFSM framework: base Skill class with enter/tick/exit lifecycle, and SkillManager dispatch center with priority interrupts.

- [ ] **Step 1: Write tests for SkillManager**

Create `tests/skills/skill-manager.test.ts`:

```typescript
import { describe, it } from "node:test";
import assert from "node:assert";
import { Skill, SkillContext } from "../../src/skills/skill.js";
import { SkillManager } from "../../src/skills/skill-manager.js";

// Test skill that counts ticks
class CountingSkill extends Skill {
  public tickCount = 0;
  public entered = false;
  public exited = false;

  constructor(name: string, priority = 0) {
    super(name, priority);
  }

  async enter(ctx: SkillContext): Promise<void> {
    this.entered = true;
  }

  async tick(ctx: SkillContext): Promise<string | null> {
    this.tickCount++;
    return null; // stay in this state
  }

  async exit(ctx: SkillContext): Promise<void> {
    this.exited = true;
  }
}

describe("SkillManager", () => {
  it("starts with no active skill", () => {
    const mgr = new SkillManager();
    assert.strictEqual(mgr.getCurrentSkillName(), null);
  });

  it("enters and ticks a skill", async () => {
    const mgr = new SkillManager();
    const skill = new CountingSkill("test", 0);
    mgr.register(skill);
    mgr.setCurrent("test", {} as SkillContext);

    assert.ok(skill.entered);
    await mgr.tick({} as SkillContext);
    assert.strictEqual(skill.tickCount, 1);
  });

  it("transitions between skills", async () => {
    const mgr = new SkillManager();
    const skillA = new CountingSkill("a", 0);
    const skillB = new CountingSkill("b", 0);
    mgr.register(skillA);
    mgr.register(skillB);

    mgr.setCurrent("a", {} as SkillContext);
    assert.ok(skillA.entered);
    assert.strictEqual(mgr.getCurrentSkillName(), "a");

    mgr.setCurrent("b", {} as SkillContext);
    assert.ok(skillA.exited);
    assert.ok(skillB.entered);
    assert.strictEqual(mgr.getCurrentSkillName(), "b");
  });

  it("handles transition requested by skill tick", async () => {
    const mgr = new SkillManager();

    class TransitionSkill extends Skill {
      constructor() { super("src", 0); }
      async tick(ctx: SkillContext): Promise<string | null> {
        return "target";
      }
    }

    const src = new TransitionSkill();
    const target = new CountingSkill("target", 0);
    mgr.register(src);
    mgr.register(target);

    mgr.setCurrent("src", {} as SkillContext);
    assert.strictEqual(mgr.getCurrentSkillName(), "src");
    await mgr.tick({} as SkillContext);
    assert.strictEqual(mgr.getCurrentSkillName(), "target");
  });

  it("priority interrupt overrides current skill", async () => {
    const mgr = new SkillManager();
    const low = new CountingSkill("low", 0);
    const high = new CountingSkill("high", 10);
    mgr.register(low);
    mgr.register(high);

    mgr.setCurrent("low", {} as SkillContext);
    assert.strictEqual(mgr.getCurrentSkillName(), "low");

    mgr.requestWithPriority("high", {} as SkillContext);
    assert.strictEqual(mgr.getCurrentSkillName(), "high");
    assert.ok(low.exited);
  });

  it("ignores lower priority interrupt", async () => {
    const mgr = new SkillManager();
    const high = new CountingSkill("high", 10);
    const low = new CountingSkill("low", 0);
    mgr.register(high);
    mgr.register(low);

    mgr.setCurrent("high", {} as SkillContext);
    mgr.requestWithPriority("low", {} as SkillContext);
    assert.strictEqual(mgr.getCurrentSkillName(), "high");
    assert.ok(!high.exited);
  });
});
```

- [ ] **Step 2: Run tests (expect FAIL)**

```bash
tsx --test tests/skills/skill-manager.test.ts
```

- [ ] **Step 3: Implement Skill base class**

Create `src/skills/skill.ts`:

```typescript
import type { WorldState } from "../world/world-state.js";
import type { Movement } from "../movement/movement.js";
import type { Inventory } from "../inventory/inventory.js";
import type { EventBus, BotEvents } from "../events/event-bus.js";
import type { Logger } from "../utils/logger.js";

export interface SkillContext {
  world: WorldState;
  movement: Movement;
  inventory: Inventory;
  events: EventBus<BotEvents>;
  logger: Logger;
}

export abstract class Skill {
  public readonly name: string;
  public readonly priority: number;

  constructor(name: string, priority = 0) {
    this.name = name;
    this.priority = priority;
  }

  abstract enter(ctx: SkillContext): Promise<void>;
  // Return a skill name to transition to, or null to stay
  abstract tick(ctx: SkillContext): Promise<string | null>;
  abstract exit(ctx: SkillContext): Promise<void>;
}
```

- [ ] **Step 4: Implement SkillManager**

Create `src/skills/skill-manager.ts`:

```typescript
import type { Skill, SkillContext } from "./skill.js";
import { getLogger } from "../utils/logger.js";

export class SkillManager {
  private skills = new Map<string, Skill>();
  private current: Skill | null = null;
  private currentPriority = -Infinity;

  register(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  unregister(name: string): void {
    if (this.current?.name === name) {
      // Cannot unregister active skill
      getLogger().warn(`Cannot unregister active skill: ${name}`);
      return;
    }
    this.skills.delete(name);
  }

  setCurrent(name: string, ctx: SkillContext): void {
    const skill = this.skills.get(name);
    if (!skill) {
      getLogger().warn(`Skill not found: ${name}`);
      return;
    }
    this.transition(skill, ctx);
  }

  requestWithPriority(name: string, ctx: SkillContext): void {
    const skill = this.skills.get(name);
    if (!skill) {
      getLogger().warn(`Skill not found: ${name}`);
      return;
    }
    if (this.current && skill.priority <= this.currentPriority) {
      // Lower or equal priority, ignore
      return;
    }
    this.transition(skill, ctx);
  }

  private async transition(next: Skill, ctx: SkillContext): Promise<void> {
    if (this.current && this.current.name !== next.name) {
      const logger = getLogger();
      logger.info(`Skill transition: ${this.current.name} -> ${next.name}`);
      try {
        await this.current.exit(ctx);
      } catch (err) {
        logger.error({ err }, `Error exiting skill: ${this.current.name}`);
      }
    }
    this.current = next;
    this.currentPriority = next.priority;
    try {
      await next.enter(ctx);
    } catch (err) {
      getLogger().error({ err }, `Error entering skill: ${next.name}`);
    }
  }

  async tick(ctx: SkillContext): Promise<void> {
    if (!this.current) return;
    try {
      const next = await this.current.tick(ctx);
      if (next && next !== this.current.name) {
        this.setCurrent(next, ctx);
      }
    } catch (err) {
      getLogger().error({ err }, `Error ticking skill: ${this.current.name}`);
      // Fallback to idle
      if (this.current.name !== "idle") {
        this.setCurrent("idle", ctx);
      }
    }
  }

  getCurrentSkillName(): string | null {
    return this.current?.name ?? null;
  }

  getCurrentPriority(): number {
    return this.currentPriority;
  }
}
```

- [ ] **Step 5: Run tests (expect PASS)**

```bash
tsx --test tests/skills/skill-manager.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/skills/skill.ts src/skills/skill-manager.ts tests/skills/skill-manager.test.ts && git commit -m "feat: add HFSM skill framework"
```

---

### Task 13: IDLE Skill

**Files:**
- Create: `src/skills/idle.ts`

Default state. Wander randomly, auto-eat when hungry, watch for hostiles.

- [ ] **Step 1: Implement IDLE skill**

Create `src/skills/idle.ts`:

```typescript
import { Skill, SkillContext } from "./skill.js";
import { vec3 } from "../utils/vec3.js";

const WANDER_INTERVAL = 60; // ticks between wander actions (3s @ 20tps)
const EAT_THRESHOLD = 15;   // hunger level to trigger eating
const HOSTILE_SCAN_RADIUS = 30;

export class IdleSkill extends Skill {
  private wanderTimer = 0;

  constructor() {
    super("idle", 0);
  }

  async enter(ctx: SkillContext): Promise<void> {
    ctx.logger.info("Entering IDLE state");
    this.wanderTimer = 0;
  }

  async tick(ctx: SkillContext): Promise<string | null> {
    // Check for hostiles nearby
    const pos = ctx.world.getPlayerPosition();
    const hostiles = ctx.world.getNearbyEntities(pos, HOSTILE_SCAN_RADIUS)
      .filter((e) => e.isHostile);
    if (hostiles.length > 0) {
      ctx.logger.warn({ count: hostiles.length }, "Hostile mobs detected, switching to combat");
      return "combat";
    }

    // Wander randomly
    this.wanderTimer++;
    if (this.wanderTimer >= WANDER_INTERVAL) {
      this.wanderTimer = 0;
      const pos = ctx.world.getPlayerPosition();
      const target = vec3(
        pos.x + (Math.random() - 0.5) * 20,
        pos.y,
        pos.z + (Math.random() - 0.5) * 20
      );
      ctx.movement.lookAt(target);
      ctx.movement.setPosition(target.x, target.y, target.z);
      ctx.logger.debug({ target }, "Wandering");
    }

    // TODO Phase 2: auto-eat when food level low
    return null;
  }

  async exit(ctx: SkillContext): Promise<void> {
    ctx.logger.info("Exiting IDLE state");
  }
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/skills/idle.ts && git commit -m "feat: add IDLE skill with wandering"
```

---

### Task 14: GATHERING Skill

**Files:**
- Create: `src/skills/gathering.ts`

Mines ores in view distance. Pathfinds to ore blocks and breaks them.

- [ ] **Step 1: Implement GATHERING skill**

Create `src/skills/gathering.ts`:

```typescript
import { Skill, SkillContext } from "./skill.js";
import { Pathfinder } from "../movement/pathfinding.js";
import { Vec3, vec3, distance } from "../utils/vec3.js";

const SCAN_RADIUS = 32;
const MINE_REACH = 4;
const PATH_TIMEOUT = 5000; // ms

enum GatheringState {
  SCANNING,
  PATHING,
  MINING,
  COLLECTING,
}

export class GatheringSkill extends Skill {
  private state = GatheringState.SCANNING;
  private targetOre: Vec3 | null = null;
  private scanCooldown = 0;
  private path: { x: number; y: number; z: number }[] = [];
  private pathIndex = 0;
  private mineProgress = 0;
  private isDigging = false;

  constructor() {
    super("gathering", 5);
  }

  async enter(ctx: SkillContext): Promise<void> {
    ctx.logger.info("Entering GATHERING state");
    this.state = GatheringState.SCANNING;
    this.targetOre = null;
    this.path = [];
    this.isDigging = false;
  }

  async tick(ctx: SkillContext): Promise<string | null> {
    const pos = ctx.world.getPlayerPosition();
    const movement = ctx.movement;
    const world = ctx.world;

    // Check if inventory is full
    if (ctx.inventory.isFull()) {
      ctx.logger.info("Inventory full, returning to IDLE");
      return "idle";
    }

    switch (this.state) {
      case GatheringState.SCANNING: {
        const ores = world.findOres(pos, SCAN_RADIUS);
        if (ores.length > 0) {
          // Pick closest ore
          this.targetOre = ores.reduce((a, b) =>
            distance(pos, a) < distance(pos, b) ? a : b
          );
          ctx.logger.info({ pos: this.targetOre }, "Ore found, pathing...");
          this.state = GatheringState.PATHING;
        } else {
          // No ores in range, go back to idle
          ctx.logger.debug("No ores in range");
          return "idle";
        }
        break;
      }

      case GatheringState.PATHING: {
        if (!this.targetOre) {
          this.state = GatheringState.SCANNING;
          break;
        }
        const pf = new Pathfinder((p) =>
          world.isBlockSolid({ x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) })
            ? false // solid blocks are not walkable
            : true
        );
        const start = vec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z));
        const end = vec3(Math.floor(this.targetOre.x), Math.floor(this.targetOre.y), Math.floor(this.targetOre.z));
        const result = pf.findPath(start, end);

        if (result.length > 0) {
          this.path = result.map((n) => ({ x: n.x, y: n.y, z: n.z }));
          this.pathIndex = 0;
          ctx.logger.info({ length: this.path.length }, "Path found");
          this.state = GatheringState.MINING;
        } else {
          ctx.logger.warn("No path to ore, skipping");
          this.targetOre = null;
          this.state = GatheringState.SCANNING;
        }
        break;
      }

      case GatheringState.MINING: {
        if (!this.targetOre) {
          this.state = GatheringState.SCANNING;
          break;
        }

        const distToOre = distance(pos, this.targetOre);

        if (distToOre <= MINE_REACH) {
          // Close enough to mine
          movement.lookAt(this.targetOre);
          if (!this.isDigging) {
            movement.startDigging(vec3(
              Math.floor(this.targetOre.x),
              Math.floor(this.targetOre.y),
              Math.floor(this.targetOre.z)
            ));
            this.isDigging = true;
            ctx.logger.info("Mining ore...");
          }
          this.mineProgress++;
          // After enough ticks, consider it mined
          if (this.mineProgress > 40) { // ~2 seconds at 20tps
            movement.stopDigging(vec3(
              Math.floor(this.targetOre.x),
              Math.floor(this.targetOre.y),
              Math.floor(this.targetOre.z)
            ));
            this.isDigging = false;
            this.mineProgress = 0;
            ctx.logger.info("Ore mined!");
            this.targetOre = null;
            this.state = GatheringState.COLLECTING;
          }
        } else if (this.pathIndex < this.path.length) {
          // Follow path
          const waypoint = this.path[this.pathIndex];
          movement.lookAt(vec3(waypoint.x, waypoint.y, waypoint.z));
          movement.setPosition(waypoint.x, waypoint.y, waypoint.z);

          const wpDist = distance(pos, vec3(waypoint.x, waypoint.y, waypoint.z));
          if (wpDist < 1.5) {
            this.pathIndex++;
            if (this.pathIndex >= this.path.length) {
              // Final approach directly to ore
              movement.lookAt(this.targetOre);
            }
          }
        } else {
          // Path exhausted but still not at ore, rescan
          this.state = GatheringState.SCANNING;
        }
        break;
      }

      case GatheringState.COLLECTING: {
        // Handle dropped items
        ctx.logger.debug("Waiting for items to drop...");
        this.state = GatheringState.SCANNING;
        break;
      }
    }

    return null;
  }

  async exit(ctx: SkillContext): Promise<void> {
    if (this.isDigging && this.targetOre) {
      ctx.movement.stopDigging(vec3(
        Math.floor(this.targetOre.x),
        Math.floor(this.targetOre.y),
        Math.floor(this.targetOre.z)
      ));
    }
    ctx.logger.info("Exiting GATHERING state");
  }
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/skills/gathering.ts && git commit -m "feat: add GATHERING skill with ore mining"
```

---

### Task 15: Bot Main Controller

**Files:**
- Create: `src/bot.ts`

Orchestrator: wires Auth → Connection → WorldState → Movement → SkillManager → tick loop.

- [ ] **Step 1: Check bedrock-protocol for chunk handling patterns**

Read `node_modules/bedrock-protocol/` examples or type definitions to understand how chunk packets (`level_chunk`, `subchunk`, etc.) arrive and how to feed them into prismarine-world.

- [ ] **Step 2: Implement Bot class**

Create `src/bot.ts`:

```typescript
import { AuthManager, AuthCredentials } from "./auth/auth-manager.js";
import { Connection, ConnectionOptions } from "./connection/connection.js";
import { WorldState } from "./world/world-state.js";
import { Movement } from "./movement/movement.js";
import { Inventory } from "./inventory/inventory.js";
import { SkillManager } from "./skills/skill-manager.js";
import { IdleSkill } from "./skills/idle.js";
import { GatheringSkill } from "./skills/gathering.js";
import { EventBus, BotEvents } from "./events/event-bus.js";
import { createLogger, getLogger } from "./utils/logger.js";
import type { SkillContext } from "./skills/skill.js";

export interface BotConfig {
  host: string;
  port: number;
  email: string;
  password: string;
  username?: string;
  viewDistance?: number;
  tickInterval?: number;
  debug?: boolean;
}

export class Bot {
  private config: BotConfig;
  private events = new EventBus<BotEvents>();
  private connection!: Connection;
  private world!: WorldState;
  private movement!: Movement;
  private inventory!: Inventory;
  private skills!: SkillManager;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  constructor(config: BotConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    const logger = createLogger({
      level: this.config.debug ? "debug" : "info",
      pretty: true,
    });

    logger.info("Minebot starting...");

    // 1. Authenticate
    const auth = new AuthManager({
      email: this.config.email,
      password: this.config.password,
    });
    const result = await auth.authenticate();

    // 2. Connect
    this.connection = new Connection(
      {
        host: this.config.host,
        port: this.config.port,
        username: this.config.username ?? "Minebot",
        chain: result.chain,
        token: result.token,
        viewDistance: this.config.viewDistance,
      },
      this.events
    );

    // 3. Initialize world state
    this.world = new WorldState("bedrock_1.21"); // TODO: make version configurable
    this.movement = new Movement(this.connection);
    this.inventory = new Inventory();

    // 4. Register skills
    this.skills = new SkillManager();
    this.skills.register(new IdleSkill());
    this.skills.register(new GatheringSkill());

    // 5. Wire up events
    this.setupEventHandlers();

    // 6. Connect
    this.connection.connect();

    // 7. Wait for spawn, then start tick loop
    this.events.once("spawned", (pos) => {
      logger.info({ pos }, "Spawned, starting tick loop");
      this.world.updatePlayerPosition(pos);
      this.isRunning = true;

      const ctx: SkillContext = {
        world: this.world,
        movement: this.movement,
        inventory: this.inventory,
        events: this.events,
        logger,
      };

      this.skills.setCurrent("idle", ctx);

      const tickInterval = this.config.tickInterval ?? 50;
      this.tickTimer = setInterval(() => {
        if (!this.isRunning) return;
        this.skills.tick(ctx).catch((err) => {
          logger.error({ err }, "Tick error");
        });
      }, tickInterval);

      logger.info(`Tick loop started (${tickInterval}ms)`);
    });

    // Handle disconnect
    this.events.on("disconnect", ({ reason }) => {
      logger.warn({ reason }, "Disconnected, stopping");
      this.stop();
    });
  }

  private setupEventHandlers(): void {
    const logger = getLogger();

    // Feed chunk data to WorldState when available
    // bedrock-protocol emits level_chunk events

    // Track entity spawns/despawns
    // Track player position
    this.events.on("player_position", (pos) => {
      this.world.updatePlayerPosition(pos);
    });

    // Track inventory changes
    // bedrock-protocol emits inventory_slot, inventory_content events

    // Track health
    this.events.on("health_change", ({ health, maxHealth }) => {
      logger.debug({ health, maxHealth }, "Health update");
    });
  }

  stop(): void {
    this.isRunning = false;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.connection) {
      this.connection.disconnect();
    }
    getLogger().info("Minebot stopped");
  }
}
```

- [ ] **Step 3: Verify typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/bot.ts && git commit -m "feat: add bot main controller with tick loop"
```

---

### Task 16: CLI + Entry Point

**Files:**
- Create: `src/cli.ts`
- Create: `src/index.ts`

yargs-based CLI and entry point.

- [ ] **Step 1: Implement CLI**

Create `src/cli.ts`:

```typescript
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

export interface CliArgs {
  host: string;
  port: number;
  email: string;
  password: string;
  username?: string;
  debug?: boolean;
  config?: string;
}

export function parseArgs(argv: string[] = process.argv): CliArgs {
  return yargs(hideBin(argv))
    .option("host", {
      type: "string",
      demandOption: true,
      description: "Server host",
    })
    .option("port", {
      type: "number",
      demandOption: true,
      description: "Server port",
    })
    .option("email", {
      type: "string",
      demandOption: true,
      description: "Microsoft account email",
    })
    .option("password", {
      type: "string",
      demandOption: true,
      description: "Microsoft account password",
    })
    .option("username", {
      type: "string",
      description: "Bot display name",
    })
    .option("debug", {
      type: "boolean",
      default: false,
      description: "Enable debug logging",
    })
    .option("config", {
      type: "string",
      description: "Path to config file",
    })
    .parseSync() as CliArgs;
}
```

- [ ] **Step 2: Implement index.ts**

Create `src/index.ts`:

```typescript
import { parseArgs } from "./cli.js";
import { Bot } from "./bot.js";

async function main(): Promise<void> {
  const args = parseArgs();

  const bot = new Bot({
    host: args.host,
    port: args.port,
    email: args.email,
    password: args.password,
    username: args.username,
    debug: args.debug,
  });

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    bot.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    bot.stop();
    process.exit(0);
  });

  try {
    await bot.start();
  } catch (err) {
    console.error("Failed to start bot:", err);
    process.exit(1);
  }
}

main();
```

- [ ] **Step 3: Verify typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/cli.ts src/index.ts && git commit -m "feat: add CLI and entry point"
```

---

### Task 17: Shell Wrapper

**Files:**
- Create: `minebot`

- [ ] **Step 1: Create shell script**

Create `minebot`:

```bash
#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec npx tsx "${SCRIPT_DIR}/src/index.ts" "$@"
```

- [ ] **Step 2: Make executable**

```bash
chmod +x minebot
```

- [ ] **Step 3: Verify it works (syntax check)**

```bash
bash -n minebot
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add minebot && git commit -m "feat: add CLI shell wrapper script"
```

---

### Task 18: Integration Verification

**Files:**
- (No new files — verification step)

- [ ] **Step 1: Full typecheck**

```bash
npx tsc --noEmit
```

Expected: No type errors. If any, fix and re-run.

- [ ] **Step 2: Run all unit tests**

```bash
tsx --test tests/utils/vec3.test.ts tests/events/event-bus.test.ts tests/inventory/inventory.test.ts tests/movement/pathfinding.test.ts tests/skills/skill-manager.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Verify CLI help output**

```bash
npx tsx src/index.ts --help
```

Expected: Shows yargs help with all options.

- [ ] **Step 4: Commit if any changes**

```bash
git status && git add -A && git commit -m "chore: finalize Phase 1 with tests passing" || echo "No changes to commit"
```
