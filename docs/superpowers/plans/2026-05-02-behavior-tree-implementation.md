# Behavior Tree Decision Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the linear Planner with a full Behavior Tree decision engine + enhance pathfinding to multi-mode, add durability tracking, and integrate all subsystems.

**Architecture:** 6-phase implementation. Phase A enhances existing foundation modules (WorldState, Connection, Inventory, Pathfinding, Movement). Phase B builds the BT core (types, composite nodes, conditions, actions). Phase C builds BT subsystems (Survival, Safehouse, Threat, Maintenance). Phase D builds 9 phase subtrees. Phase E integrates everything into Bot and removes old Planner. Phase F verifies.

**Tech Stack:** TypeScript strict mode, node:test (built-in), bedrock-protocol v3.55.1, prismarine-* ecosystem.

---

## Phase A — Foundation Enhancements

### Task A1: WorldState — Add Pathfinding Support Methods

**Files:**
- Modify: `src/world/world-state.ts`
- Modify: `src/world/types.ts`

- [ ] **Step 1: Add BlockCategory enum + mineable block lists to WorldState**

In `src/world/types.ts`, add mineable block name lists:

```typescript
export const CLIMBABLE_BLOCKS = new Set([
  "minecraft:ladder", "minecraft:vine", "minecraft:weeping_vines",
  "minecraft:twisting_vines", "minecraft:scaffolding"
]);

export const WATER_BLOCKS = new Set([
  "minecraft:water", "minecraft:flowing_water"
]);

export const MINEABLE_BLOCKS = new Set([
  "minecraft:dirt", "minecraft:grass_block", "minecraft:gravel",
  "minecraft:sand", "minecraft:stone", "minecraft:cobblestone",
  "minecraft:netherrack", "minecraft:oak_log", "minecraft:birch_log",
  "minecraft:spruce_log", "minecraft:jungle_log", "minecraft:acacia_log",
  "minecraft:dark_oak_log", "minecraft:mangrove_log",
  "minecraft:cherry_log", "minecraft:oak_leaves", "minecraft:birch_leaves",
  "minecraft:spruce_leaves", "minecraft:jungle_leaves", "minecraft:acacia_leaves",
  "minecraft:dark_oak_leaves", "minecraft:mangrove_leaves",
]);

export const DOOR_BLOCKS = new Set([
  "minecraft:wooden_door", "minecraft:iron_door",
  "minecraft:spruce_door", "minecraft:birch_door", "minecraft:jungle_door",
  "minecraft:acacia_door", "minecraft:dark_oak_door", "minecraft:mangrove_door",
  "minecraft:cherry_door", "minecraft:fence_gate", "minecraft:spruce_fence_gate",
  "minecraft:birch_fence_gate", "minecraft:jungle_fence_gate",
  "minecraft:acacia_fence_gate", "minecraft:dark_oak_fence_gate",
  "minecraft:mangrove_fence_gate", "minecraft:cherry_fence_gate",
]);
```

- [ ] **Step 2: Add query methods to WorldState**

In `src/world/world-state.ts`, add after `isBlockSolid`:

```typescript
import { CLIMBABLE_BLOCKS, WATER_BLOCKS, MINEABLE_BLOCKS, DOOR_BLOCKS, BlockCategory } from "./types.js";

isWaterBlock(pos: Vec3Type): boolean {
  const block = this.getBlock(pos);
  if (!block) return false;
  return WATER_BLOCKS.has(block.name);
}

isWaterSurface(pos: Vec3Type): boolean {
  if (!this.isWaterBlock(pos)) return false;
  const above = this.getBlock({ x: pos.x, y: pos.y + 1, z: pos.z });
  return !above || above.boundingBox === "empty";
}

isClimbable(pos: Vec3Type): boolean {
  const block = this.getBlock(pos);
  if (!block) return false;
  return CLIMBABLE_BLOCKS.has(block.name);
}

isMineable(pos: Vec3Type): boolean {
  const block = this.getBlock(pos);
  if (!block) return false;
  return MINEABLE_BLOCKS.has(block.name);
}

isDoor(pos: Vec3Type): boolean {
  const block = this.getBlock(pos);
  if (!block) return false;
  return DOOR_BLOCKS.has(block.name);
}

getBlockCategory(pos: Vec3Type): BlockCategory {
  const block = this.getBlock(pos);
  if (!block) return BlockCategory.AIR;
  if (WATER_BLOCKS.has(block.name)) return BlockCategory.LIQUID;
  if (CLIMBABLE_BLOCKS.has(block.name)) return BlockCategory.CLIMBABLE;
  if (DOOR_BLOCKS.has(block.name)) return BlockCategory.DOOR;
  if (MINEABLE_BLOCKS.has(block.name)) return BlockCategory.MINEABLE;
  if (block.boundingBox !== "empty") return BlockCategory.SOLID;
  return BlockCategory.AIR;
}
```

- [ ] **Step 3: Verify type check**

Run: `npm run typecheck`

---

### Task A2: Connection — Extract NBT Durability from `inventory_slot`

**Files:**
- Modify: `src/connection/connection.ts`
- Modify: `src/world/types.ts`

- [ ] **Step 1: Add durability and maxDurability to InventorySlot**

In `src/world/types.ts`, update `InventorySlot`:

```typescript
export interface InventorySlot {
  slot: number;
  itemId: number;
  count: number;
  metadata?: number;
  durability?: number;      // current damage value from NBT
  maxDurability?: number;   // max durability from minecraft-data registry
  name?: string;
}
```

- [ ] **Step 2: Extract damage from inventory_slot NBT**

In `src/connection/connection.ts`, in the `inventory_slot` handler, extract NBT damage:

```typescript
this.client.on("inventory_slot", (packet: any) => {
  // ...existing metrics/trace...
  const winId = packet.window_id ?? 0;
  if (winId !== 0 && winId !== 120) return;

  const slot = packet.slot;
  const item = packet.item;
  const isNull = !item || item.network_id === 0 || item.network_id === -1;

  // Extract NBT damage
  let damage = 0;
  if (item && item.nbt) {
    const nbt = typeof item.nbt === "string" ? JSON.parse(item.nbt) : item.nbt;
    if (nbt?.value?.Damage?.value !== undefined) {
      damage = nbt.value.Damage.value;
    }
  }

  this.events.emit("inventory_change", {
    slot: winId === 120 ? 36 + slot : slot,
    item: isNull ? null : {
      id: item.network_id ?? 0,
      count: item.count ?? 1,
      metadata: item.metadata ?? 0,
      damage: damage > 0 ? damage : undefined,
    },
  });
});
```

- [ ] **Step 3: Populate maxDurability in bot.ts inventory_change handler**

In `src/bot.ts`, in the `inventory_change` handler where `InventorySlot` is constructed, add:

```typescript
// After resolving itemName via world.getItemName(id)
const itemData = registry.itemsByName[itemName];
const maxDurability = itemData?.maxDurability ?? 0;
const durability = itemData && item.damage > 0
  ? Math.max(0, 1 - (item.damage / maxDurability))  // store as 0-1 fraction
  : 1;
```

- [ ] **Step 4: Verify type check**

Run: `npm run typecheck`

---

### Task A3: Inventory — Add Durability Query Methods

**Files:**
- Modify: `src/inventory/inventory.ts`

- [ ] **Step 1: Add durability query methods**

After `findHotbarItem`, add:

```typescript
getDurability(slot: number): number {
  const item = this.getSlot(slot);
  if (!item) return 1;
  return item.durability ?? 1;
}

getBestDurability(itemName: string): { slot: number; durability: number } | null {
  let bestSlot = -1;
  let bestDurability = -1;
  for (const [slot, item] of this.slots) {
    if (item.name === itemName && (item.durability ?? 1) > bestDurability) {
      bestDurability = item.durability ?? 1;
      bestSlot = slot;
    }
  }
  return bestSlot >= 0 ? { slot: bestSlot, durability: bestDurability } : null;
}

findBrokenTool(): number {
  for (const [slot, item] of this.slots) {
    const dur = item.durability ?? 1;
    if (dur < 0.1) return slot;
  }
  return -1;
}
```

- [ ] **Step 2: Verify type check**

Run: `npm run typecheck`

---

### Task A4: Pathfinding — Enhanced Multi-Mode

**Files:**
- Modify: `src/movement/pathfinding.ts`
- Create: `src/movement/pathfinding-types.ts`

- [ ] **Step 1: Create pathfinding type definitions**

Create `src/movement/pathfinding-types.ts`:

```typescript
import type { Vec3 } from "../utils/vec3.js";

export enum MoveType { WALK, JUMP, CLIMB, DIG, SWIM, FALL, BOAT }

export interface TraversalResult {
  traversable: boolean;
  moveType: MoveType;
  costMultiplier: number;
}

export interface TraversalContext {
  isBlockSolid: (pos: Vec3) => boolean;
  isWaterBlock: (pos: Vec3) => boolean;
  isWaterSurface: (pos: Vec3) => boolean;
  isClimbable: (pos: Vec3) => boolean;
  isMineable: (pos: Vec3) => boolean;
  isDoor: (pos: Vec3) => boolean;
}

export interface PathNode {
  x: number; y: number; z: number;
  g: number; h: number; f: number;
  parent: PathNode | null;
  moveType: MoveType;
  costMultiplier: number;
}
```

- [ ] **Step 2: Implement isTraversable function**

Add to `src/movement/pathfinding-types.ts`:

```typescript
export function isTraversable(
  pos: Vec3, from: Vec3, ctx: TraversalContext
): TraversalResult {
  const dx = pos.x - from.x, dy = pos.y - from.y, dz = pos.z - from.z;

  // 1. Water check
  if (ctx.isWaterBlock(pos)) {
    if (ctx.isWaterSurface(pos)) {
      return { traversable: true, moveType: MoveType.BOAT, costMultiplier: 0.5 };
    }
    return { traversable: true, moveType: MoveType.SWIM, costMultiplier: 1.2 };
  }

  // 2. Climbable
  if (ctx.isClimbable(pos)) {
    return { traversable: true, moveType: MoveType.CLIMB, costMultiplier: 2.0 };
  }

  // 3. SOLID: try DIG as fallback
  if (ctx.isBlockSolid(pos)) {
    if (ctx.isMineable(pos)) {
      return { traversable: true, moveType: MoveType.DIG, costMultiplier: 3.0 };
    }
    return { traversable: false, moveType: MoveType.WALK, costMultiplier: 1 };
  }

  // 4. AIR: check below
  const blockBelow = { x: pos.x, y: pos.y - 1, z: pos.z };
  if (ctx.isBlockSolid(blockBelow)) {
    // Jump: 1-block up or flat with gap
    if (dy === 1 || (dy === 0 && isGapBetween(from, pos, ctx))) {
      return { traversable: true, moveType: MoveType.JUMP, costMultiplier: 1.5 };
    }
    // Fall: drop ≤3 blocks
    if (dy <= -1 && dy >= -3) {
      return { traversable: true, moveType: MoveType.FALL, costMultiplier: 0.8 };
    }
    return { traversable: true, moveType: MoveType.WALK, costMultiplier: 1 };
  }

  return { traversable: false, moveType: MoveType.WALK, costMultiplier: 1 };
}

function isGapBetween(
  from: Vec3, to: Vec3, ctx: TraversalContext
): boolean {
  // A gap exists if the position at from.y level between from and to is empty
  // and the block below THAT is not solid
  const midX = Math.floor((from.x + to.x) / 2);
  const midZ = Math.floor((from.z + to.z) / 2);
  const mid = { x: midX, y: from.y, z: midZ };
  const belowMid = { x: midX, y: from.y - 1, z: midZ };
  if (ctx.isBlockSolid(mid)) return false;
  if (!ctx.isBlockSolid(belowMid)) return false;
  return true;
}
```

- [ ] **Step 3: Rewrite Pathfinder with enhanced traversability**

Replace `src/movement/pathfinding.ts` with enhanced version:

```typescript
import { Vec3, vec3, manhattan } from "../utils/vec3.js";
import { MoveType, isTraversable, type TraversalContext, type PathNode } from "./pathfinding-types.js";
import type { PathfindingCircuitBreaker } from "./circuit-breaker.js";

const NEIGHBOR_OFFSETS_PHASES = [
  // Phase 1: standard moves (WALK, JUMP, FALL)
  { offsets: [
      { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
      { x: 1, y: 0, z: 1 }, { x: 1, y: 0, z: -1 },
      { x: -1, y: 0, z: 1 }, { x: -1, y: 0, z: -1 },
      { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
    ], enableDig: false },
  // Phase 2: include DIG if first phase fails
  { offsets: [
      { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
      { x: 1, y: 0, z: 1 }, { x: 1, y: 0, z: -1 },
      { x: -1, y: 0, z: 1 }, { x: -1, y: 0, z: -1 },
      { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
    ], enableDig: true },
];

export class Pathfinder {
  private ctx: TraversalContext;
  private maxNodes: number;
  private onPathfinding?: (nodes: number, durationMs: number, failed: boolean) => void;
  private circuitBreaker?: PathfindingCircuitBreaker;

  constructor(
    traversalCtx: TraversalContext,
    maxNodes = 10000,
    onPathfinding?: (nodes: number, durationMs: number, failed: boolean) => void,
    circuitBreaker?: PathfindingCircuitBreaker
  ) {
    this.ctx = traversalCtx;
    this.maxNodes = maxNodes;
    this.onPathfinding = onPathfinding;
    this.circuitBreaker = circuitBreaker;
  }

  findPath(start: Vec3, end: Vec3): PathNode[] {
    if (this.circuitBreaker?.isDisabled()) {
      this.onPathfinding?.(0, 0, true);
      return [];
    }

    const startTime = Date.now();
    let iterations = 0;

    // Try each phase: first without DIG, then with DIG
    for (const phase of NEIGHBOR_OFFSETS_PHASES) {
      const result = this._findPathWithOffsets(start, end, phase.offsets, phase.enableDig, () => iterations);
      iterations += result.iterations;
      if (result.path.length > 0) {
        const durationMs = Date.now() - startTime;
        this.onPathfinding?.(iterations, durationMs, false);
        return result.path;
      }
    }

    const durationMs = Date.now() - startTime;
    this.onPathfinding?.(iterations, durationMs, true);
    return [];
  }

  private _findPathWithOffsets(
    start: Vec3, end: Vec3,
    offsets: { x: number; y: number; z: number }[],
    enableDig: boolean,
    getIterations: () => number
  ): { path: PathNode[]; iterations: number } {
    let iterations = 0;

    const startNode: PathNode = {
      x: Math.floor(start.x), y: Math.floor(start.y), z: Math.floor(start.z),
      g: 0, h: 0, f: 0, parent: null,
      moveType: MoveType.WALK, costMultiplier: 1,
    };
    startNode.h = manhattan(
      { x: startNode.x, y: startNode.y, z: startNode.z }, end
    );
    startNode.f = startNode.h;

    const endFloor = {
      x: Math.floor(end.x), y: Math.floor(end.y), z: Math.floor(end.z)
    };

    if (startNode.x === endFloor.x && startNode.y === endFloor.y && startNode.z === endFloor.z) {
      return { path: [startNode], iterations: 0 };
    }

    const openSet: PathNode[] = [startNode];
    const closedSet = new Set<string>();
    const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

    while (openSet.length > 0 && iterations < this.maxNodes) {
      iterations++;
      let lowestIdx = 0;
      for (let i = 1; i < openSet.length; i++) {
        if (openSet[i].f < openSet[lowestIdx].f) lowestIdx = i;
      }
      const current = openSet.splice(lowestIdx, 1)[0];

      if (current.x === endFloor.x && current.y === endFloor.y && current.z === endFloor.z) {
        return { path: this.reconstructPath(current), iterations };
      }

      closedSet.add(key(current.x, current.y, current.z));

      for (const offset of offsets) {
        const nx = current.x + offset.x;
        const ny = current.y + offset.y;
        const nz = current.z + offset.z;
        const nk = key(nx, ny, nz);

        if (closedSet.has(nk)) continue;

        const tr = isTraversable(
          { x: nx, y: ny, z: nz },
          { x: current.x, y: current.y, z: current.z },
          this.ctx
        );

        if (!tr.traversable) continue;

        // Skip DIG if not enabled
        if (tr.moveType === MoveType.DIG && !enableDig) continue;

        // Corner cutting prevention (for non-climb, non-swim moves)
        if (offset.x !== 0 && offset.z !== 0
          && tr.moveType !== MoveType.CLIMB
          && tr.moveType !== MoveType.SWIM
          && tr.moveType !== MoveType.BOAT) {
          const a1 = isTraversable(
            { x: current.x + offset.x, y: ny, z: current.z },
            { x: current.x, y: current.y, z: current.z }, this.ctx
          );
          const a2 = isTraversable(
            { x: current.x, y: ny, z: current.z + offset.z },
            { x: current.x, y: current.y, z: current.z }, this.ctx
          );
          if (!a1.traversable || !a2.traversable) continue;
        }

        const g = current.g + tr.costMultiplier;
        const h = manhattan({ x: nx, y: ny, z: nz }, endFloor);
        const f = g + h;

        const existing = openSet.find((n) => n.x === nx && n.y === ny && n.z === nz);
        if (existing) {
          if (g < existing.g) {
            existing.g = g;
            existing.f = f;
            existing.parent = current;
            existing.moveType = tr.moveType;
            existing.costMultiplier = tr.costMultiplier;
          }
        } else {
          openSet.push({
            x: nx, y: ny, z: nz,
            g, h, f,
            parent: current,
            moveType: tr.moveType,
            costMultiplier: tr.costMultiplier,
          });
        }
      }
    }

    return { path: [], iterations };
  }

  private reconstructPath(node: PathNode): PathNode[] {
    const path: PathNode[] = [];
    let current: PathNode | null = node;
    while (current) {
      path.push(current);
      current = current.parent;
    }
    path.reverse();
    return path;
  }
}
```

- [ ] **Step 4: Update all Pathfinder callers to pass TraversalContext**

Each skill currently does `new Pathfinder((p) => !world.isBlockSolid(p), 10000, ...)`. Update each to:

```typescript
import { TraversalContext } from "../movement/pathfinding-types.js";

const tctx: TraversalContext = {
  isBlockSolid: (p) => world.isBlockSolid(p),
  isWaterBlock: (p) => world.isWaterBlock(p),
  isWaterSurface: (p) => world.isWaterSurface(p),
  isClimbable: (p) => world.isClimbable(p),
  isMineable: (p) => world.isMineable(p),
  isDoor: (p) => world.isDoor(p),
};

const pf = new Pathfinder(tctx, 10000, (nodes, dur, failed) => {
  metrics?.recordPathfinding(nodes, dur, failed);
}, circuitBreaker);
```

Files to update (each replaces `(p) => !world.isBlockSolid(p)` with `tctx`):
- `src/skills/gathering.ts` (line ~103)
- `src/skills/combat.ts` (lines ~97, ~204)
- `src/skills/building.ts` (line ~74)
- `src/skills/crafting.ts` (line ~174)
- `src/skills/stronghold.ts` (line ~100)
- `src/skills/dragon-hunt.ts` (line ~81)

- [ ] **Step 5: Update pathfinding tests**

In `tests/movement/pathfinding.test.ts`, update to use TraversalContext:

```typescript
import { TraversalContext, MoveType } from "../../src/movement/pathfinding-types.js";

function createTraversalContext(walls: {x:number;y:number;z:number}[]): TraversalContext {
  const wallSet = new Set(walls.map(w => `${w.x},${w.y},${w.z}`));
  const checker = (pos: {x:number;y:number;z:number}) =>
    wallSet.has(`${pos.x},${pos.y},${pos.z}`);
  return {
    isBlockSolid: checker,
    isWaterBlock: () => false,
    isWaterSurface: () => false,
    isClimbable: () => false,
    isMineable: () => false,
    isDoor: () => false,
  };
}
```

- [ ] **Step 6: Verify type check**

Run: `npm run typecheck`

---

### Task A5: Movement — Enhanced Path Execution

**Files:**
- Modify: `src/movement/movement.ts`

- [ ] **Step 1: Add followPathEnhanced method**

In `src/movement/movement.ts`, add after the position/rotation methods:

```typescript
import { MoveType, PathNode } from "./pathfinding-types.js";

private currentPathNode: number = 0;
private pathNodes: PathNode[] = [];
private isFollowingPath: boolean = false;
private diggingTarget: { x: number; y: number; z: number } | null = null;
private digTimer: number = 0;

getPathProgress(): { current: number; total: number; isDigging: boolean } {
  return {
    current: this.currentPathNode,
    total: this.pathNodes.length,
    isDigging: this.diggingTarget !== null,
  };
}

clearPath(): void {
  this.pathNodes = [];
  this.currentPathNode = 0;
  this.isFollowingPath = false;
  this.diggingTarget = null;
  this.digTimer = 0;
}

initPath(nodes: PathNode[]): void {
  this.pathNodes = nodes;
  this.currentPathNode = 0;
  this.isFollowingPath = nodes.length > 0;
  this.diggingTarget = null;
  this.digTimer = 0;
}

tickPath(): boolean {
  if (!this.isFollowingPath || this.currentPathNode >= this.pathNodes.length) {
    return true; // path complete
  }

  const node = this.pathNodes[this.currentPathNode];
  const target = { x: node.x + 0.5, y: node.y, z: node.z + 0.5 };

  switch (node.moveType) {
    case MoveType.WALK:
    case MoveType.FALL:
    case MoveType.SWIM:
      // Standard approach: look at target and walk
      this.lookAt(target);
      this.setPosition(target.x, target.y, target.z);
      if (this.atPosition(target)) {
        this.currentPathNode++;
      }
      break;

    case MoveType.JUMP: {
      // Approach edge, then jump
      const dx = target.x - this.currentPosition.x;
      const dz = target.z - this.currentPosition.z;
      this.lookAt(target);
      this.setPosition(target.x, target.y, target.z);
      if (Math.abs(dx) < 1.5 && Math.abs(dz) < 1.5) {
        this.jump();
      }
      if (this.atPosition(target)) {
        this.currentPathNode++;
      }
      break;
    }

    case MoveType.CLIMB:
      // Look at climbable and move upward
      this.lookAt(target);
      this.setPosition(target.x, target.y, target.z);
      if (this.atPosition(target, 1.5)) {
        this.currentPathNode++;
      }
      break;

    case MoveType.DIG:
      // Start digging if not already
      if (!this.diggingTarget) {
        this.diggingTarget = { x: node.x, y: node.y, z: node.z };
        this.startDigging({ x: node.x, y: node.y, z: node.z });
        this.digTimer = 0;
      }
      this.digTimer++;
      if (this.digTimer > 60) { // 3s at 50ms tick
        this.stopDigging();
        this.diggingTarget = null;
        this.digTimer = 0;
        this.currentPathNode++;
      }
      break;

    case MoveType.BOAT:
      // Simple: walk to water edge, interact boat, row forward
      this.lookAt(target);
      this.setPosition(target.x, target.y, target.z);
      if (this.atPosition(target, 2)) {
        this.currentPathNode++;
      }
      break;
  }

  return this.currentPathNode >= this.pathNodes.length;
}

private atPosition(target: { x: number; y: number; z: number }, threshold = 1.0): boolean {
  const dx = target.x - this.currentPosition.x;
  const dy = target.y - this.currentPosition.y;
  const dz = target.z - this.currentPosition.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) < threshold;
}
```

- [ ] **Step 2: Make currentPosition accessible for path progress**

Add a getter:

```typescript
getCurrentPosition(): Vec3 {
  return { ...this.currentPosition };
}
```

- [ ] **Step 3: Verify type check**

Run: `npm run typecheck`

---

## Phase B — Behavior Tree Core

### Task B1: BT Types

**Files:**
- Create: `src/bt/types.ts`

- [ ] **Step 1: Create types.ts**

```typescript
// src/bt/types.ts
import type { SkillContext } from "../skills/skill.js";
import type { Vec3 } from "../utils/vec3.js";

export enum NodeStatus { SUCCESS, FAILURE, RUNNING }

export enum PhaseType {
  SPAWN = 0,
  STONE = 1,
  IRON = 2,
  DIAMOND = 3,
  NETHER_ENTRY = 4,
  NETHER = 5,
  END_PREP = 6,
  STRONGHOLD = 7,
  END = 8,
}

export interface SafehouseState {
  built: boolean;
  position: Vec3 | null;
  hasWorkbench: boolean;
  hasFurnace: boolean;
  hasTorches: boolean;
  chestCount: number;
}

export interface StockpileState {
  trackedChests: Vec3[];
  lastDepositTime: number;
  stockpileMet: boolean;
}

export interface OrganizationState {
  hotbarLayoutOk: boolean;
  hasGarbage: boolean;
  lastSortTime: number;
}

export interface Blackboard {
  ctx: SkillContext;
  currentPhase: PhaseType;
  phaseData: Record<string, unknown>;
  safehouseState: SafehouseState;
  stockpileState: StockpileState;
  organizationState: OrganizationState;
  hp: number;
  daytime: boolean;
  dimension: number;
  lastSkill: string | null;
}

export interface BTNode {
  tick(bb: Blackboard): NodeStatus;
  reset(): void;
}
```

- [ ] **Step 2: Verify type check**

Run: `npm run typecheck`

---

### Task B2: BT Composite Nodes

**Files:**
- Create: `src/bt/nodes/selector.ts`
- Create: `src/bt/nodes/interruptible.ts`
- Create: `src/bt/nodes/sequence.ts`
- Create: `src/bt/nodes/condition.ts`
- Create: `src/bt/nodes/action.ts`

- [ ] **Step 1: Create Standard Selector**

```typescript
// src/bt/nodes/selector.ts
import type { BTNode, Blackboard } from "../types.js";
import { NodeStatus } from "../types.js";

export class Selector implements BTNode {
  constructor(private children: BTNode[]) {}

  tick(bb: Blackboard): NodeStatus {
    for (const child of this.children) {
      const status = child.tick(bb);
      if (status !== NodeStatus.FAILURE) return status;
    }
    return NodeStatus.FAILURE;
  }

  reset(): void {
    for (const child of this.children) child.reset();
  }
}
```

- [ ] **Step 2: Create InterruptibleSelector**

```typescript
// src/bt/nodes/interruptible.ts
import type { BTNode, Blackboard } from "../types.js";
import { NodeStatus } from "../types.js";

export class InterruptibleSelector implements BTNode {
  constructor(private children: BTNode[]) {}

  tick(bb: Blackboard): NodeStatus {
    // Always re-evaluate from first child
    for (const child of this.children) {
      const status = child.tick(bb);
      if (status !== NodeStatus.FAILURE) return status;
    }
    return NodeStatus.FAILURE;
  }

  reset(): void {
    for (const child of this.children) child.reset();
  }
}
```

- [ ] **Step 3: Create Sequence**

```typescript
// src/bt/nodes/sequence.ts
import type { BTNode, Blackboard } from "../types.js";
import { NodeStatus } from "../types.js";

export class Sequence implements BTNode {
  private currentChild: number = 0;

  constructor(private children: BTNode[]) {}

  tick(bb: Blackboard): NodeStatus {
    while (this.currentChild < this.children.length) {
      const status = this.children[this.currentChild].tick(bb);
      if (status === NodeStatus.FAILURE) {
        this.currentChild = 0;
        return NodeStatus.FAILURE;
      }
      if (status === NodeStatus.RUNNING) {
        return NodeStatus.RUNNING;
      }
      this.currentChild++;
    }
    this.currentChild = 0;
    return NodeStatus.SUCCESS;
  }

  reset(): void {
    this.currentChild = 0;
    for (const child of this.children) child.reset();
  }
}
```

- [ ] **Step 4: Create Condition leaf**

```typescript
// src/bt/nodes/condition.ts
import type { BTNode, Blackboard } from "../types.js";
import { NodeStatus } from "../types.js";

export class Condition implements BTNode {
  constructor(private check: (bb: Blackboard) => boolean) {}

  tick(bb: Blackboard): NodeStatus {
    return this.check(bb) ? NodeStatus.SUCCESS : NodeStatus.FAILURE;
  }

  reset(): void {}
}
```

- [ ] **Step 5: Create Action leaf**

```typescript
// src/bt/nodes/action.ts
import type { BTNode, Blackboard } from "../types.js";
import { NodeStatus } from "../types.js";

export class Action implements BTNode {
  constructor(
    private skillName: string,
    private onEnter?: (bb: Blackboard) => void,
    private isComplete?: (bb: Blackboard) => boolean,
  ) {}

  tick(bb: Blackboard): NodeStatus {
    if (bb.lastSkill !== this.skillName) {
      this.onEnter?.(bb);
      bb.lastSkill = this.skillName;
    }
    if (this.isComplete?.(bb)) {
      return NodeStatus.SUCCESS;
    }
    return NodeStatus.RUNNING;
  }

  reset(): void {}
}
```

- [ ] **Step 6: Verify type check**

Run: `npm run typecheck`

---

### Task B3: BT Conditions — Health, Inventory, Environment, Phase

**Files:**
- Create: `src/bt/conditions/health.ts`
- Create: `src/bt/conditions/inventory.ts`
- Create: `src/bt/conditions/environment.ts`
- Create: `src/bt/conditions/phase.ts`

- [ ] **Step 1: Create health conditions**

```typescript
// src/bt/conditions/health.ts
import { Condition } from "../nodes/condition.js";
import type { Blackboard } from "../types.js";

export const isHealthLow = (threshold = 0.3) => new Condition(
  (bb) => bb.hp < bb.ctx.hunger?.maxHealth ? bb.hp / (bb.ctx.hunger?.maxHealth ?? 20) < threshold : bb.hp < 6
);

export const isStarving = new Condition((bb) => {
  return bb.ctx.hunger?.isStarving() ?? false;
});

export const shouldEatNow = new Condition((bb) => {
  return bb.ctx.hunger?.shouldEat() ?? false;
});

export const hasFood = new Condition((bb) => {
  return (bb.ctx.inventory.countItem("apple") > 0)
    || (bb.ctx.inventory.countItem("cooked_beef") > 0)
    || (bb.ctx.inventory.countItem("cooked_porkchop") > 0)
    || (bb.ctx.inventory.countItem("bread") > 0)
    || (bb.ctx.inventory.countItem("cooked_chicken") > 0)
    || (bb.ctx.inventory.countItem("cooked_mutton") > 0)
    || (bb.ctx.inventory.countItem("cooked_salmon") > 0)
    || (bb.ctx.inventory.countItem("cooked_cod") > 0)
    || (bb.ctx.inventory.countItem("carrot") > 0)
    || (bb.ctx.inventory.countItem("melon_slice") > 0)
    || (bb.ctx.inventory.countItem("raw_beef") > 0)
    || (bb.ctx.inventory.countItem("raw_porkchop") > 0);
});

export const hasNoFood = new Condition((bb) => {
  const inv = bb.ctx.inventory;
  const foodItems = ["apple", "cooked_beef", "cooked_porkchop", "bread",
    "cooked_chicken", "cooked_mutton", "cooked_salmon", "cooked_cod",
    "carrot", "melon_slice", "raw_beef", "raw_porkchop"];
  return foodItems.every((item) => inv.countItem(item) === 0);
});
```

- [ ] **Step 2: Create inventory conditions**

```typescript
// src/bt/conditions/inventory.ts
import { Condition } from "../nodes/condition.js";
import type { Blackboard } from "../types.js";

export const hasItem = (name: string, minCount = 1) => new Condition(
  (bb) => bb.ctx.inventory.countItem(name) >= minCount
);

export const isInventoryFull = new Condition(
  (bb) => bb.ctx.inventory.isFull()
);

export const hasPickaxe = new Condition(
  (bb) => bb.ctx.inventory.hasItem("wooden_pickaxe")
    || bb.ctx.inventory.hasItem("stone_pickaxe")
    || bb.ctx.inventory.hasItem("iron_pickaxe")
    || bb.ctx.inventory.hasItem("diamond_pickaxe")
);

export const hasWeapon = new Condition(
  (bb) => bb.ctx.inventory.hasItem("wooden_sword")
    || bb.ctx.inventory.hasItem("stone_sword")
    || bb.ctx.inventory.hasItem("iron_sword")
    || bb.ctx.inventory.hasItem("diamond_sword")
    || bb.ctx.inventory.hasItem("wooden_axe")
    || bb.ctx.inventory.hasItem("stone_axe")
    || bb.ctx.inventory.hasItem("iron_axe")
    || bb.ctx.inventory.hasItem("diamond_axe")
);

export const hasWood = (minCount = 4) => new Condition(
  (bb) => ["oak_log", "birch_log", "spruce_log", "jungle_log",
    "acacia_log", "dark_oak_log", "mangrove_log", "cherry_log"]
    .reduce((sum, name) => sum + bb.ctx.inventory.countItem(name), 0) >= minCount
);

export const hasStone = (minCount = 8) => new Condition(
  (bb) => bb.ctx.inventory.countItem("cobblestone") >= minCount
);

export const hasIron = (minCount = 3) => new Condition(
  (bb) => bb.ctx.inventory.countItem("iron_ingot") >= minCount
);

export const hasDiamond = (minCount = 1) => new Condition(
  (bb) => bb.ctx.inventory.countItem("diamond") >= minCount
);
```

- [ ] **Step 3: Create environment conditions**

```typescript
// src/bt/conditions/environment.ts
import { Condition } from "../nodes/condition.js";
import type { Blackboard } from "../types.js";

export const isNight = new Condition((bb) => !bb.daytime);

export const isExposed = new Condition((bb) => {
  const pos = bb.ctx.world.getPlayerPosition();
  for (let y = pos.y + 1; y <= pos.y + 10; y++) {
    if (bb.ctx.world.isBlockSolid({ x: pos.x, y, z: pos.z })) {
      return false;
    }
  }
  return true;
});

export const hostilesInRange = (range: number) => new Condition((bb) => {
  const pos = bb.ctx.world.getPlayerPosition();
  const entities = bb.ctx.world.getNearbyEntities(pos, range);
  return entities.some((e) => {
    // Check if entity is hostile by name
    const name = (e as any).name ?? "";
    return name.includes("zombie") || name.includes("skeleton")
      || name.includes("spider") || name.includes("creeper")
      || name.includes("enderman") || name.includes("witch")
      || name.includes("blaze") || name.includes("ghast")
      || name.includes("slime") || name.includes("phantom");
  });
});

export const isInNether = new Condition((bb) => bb.dimension === 1);

export const isInEnd = new Condition((bb) => bb.dimension === 2);
```

- [ ] **Step 4: Create phase conditions**

```typescript
// src/bt/conditions/phase.ts
import { Condition } from "../nodes/condition.js";
import { PhaseType } from "../types.js";
import type { Blackboard } from "../types.js";

export const isPhase = (phase: PhaseType) => new Condition(
  (bb) => bb.currentPhase === phase
);

export const hasReachedPhase = (phase: PhaseType) => new Condition(
  (bb) => bb.currentPhase >= phase
);
```

- [ ] **Step 5: Verify type check**

Run: `npm run typecheck`

---

### Task B4: BT Conditions — Durability, Stockpile, Organization

**Files:**
- Create: `src/bt/conditions/durability.ts`
- Create: `src/bt/conditions/stockpile.ts`
- Create: `src/bt/conditions/organization.ts`

- [ ] **Step 1: Create durability conditions**

```typescript
// src/bt/conditions/durability.ts
import { Condition } from "../nodes/condition.js";
import type { Blackboard } from "../types.js";

export const toolDurabilityLow = new Condition((bb) => {
  const inv = bb.ctx.inventory;
  const tools = ["wooden_pickaxe", "stone_pickaxe", "iron_pickaxe",
    "diamond_pickaxe", "wooden_sword", "stone_sword", "iron_sword",
    "diamond_sword", "wooden_axe", "stone_axe", "iron_axe", "diamond_axe"];
  for (const tool of tools) {
    const best = inv.getBestDurability(tool);
    if (best && best.durability < 0.25) return true;
  }
  return false;
});

export const armorDurabilityLow = new Condition((bb) => {
  for (let i = 0; i < 4; i++) {
    const armor = bb.ctx.inventory.getArmor(i);
    if (armor && (armor.durability ?? 1) < 0.2) return true;
  }
  return false;
});

export const hasBackupTool = new Condition((bb) => {
  const inv = bb.ctx.inventory;
  return inv.hasItem("stone_pickaxe") || inv.hasItem("iron_pickaxe")
    || inv.hasItem("diamond_pickaxe")
    || inv.countItem("iron_ingot") >= 3
    || inv.countItem("diamond") >= 3;
});
```

- [ ] **Step 2: Create stockpile conditions**

```typescript
// src/bt/conditions/stockpile.ts
import { Condition } from "../nodes/condition.js";
import type { Blackboard } from "../types.js";

export const isStockpileMet = new Condition((bb) => {
  return bb.stockpileState.stockpileMet;
});

export const chestCountEnough = (min: number) => new Condition((bb) => {
  return bb.safehouseState.chestCount >= min;
});

export const needsRestock = new Condition((bb) => {
  const hotbar = bb.ctx.inventory;
  // Check standard hotbar layout: pickaxe, sword, food, blocks
  const hasPick = hotbar.hasItem("stone_pickaxe")
    || hotbar.hasItem("iron_pickaxe")
    || hotbar.hasItem("diamond_pickaxe")
    || hotbar.hasItem("wooden_pickaxe");
  const hasSword = hotbar.hasItem("stone_sword")
    || hotbar.hasItem("iron_sword")
    || hotbar.hasItem("diamond_sword")
    || hotbar.hasItem("wooden_sword");
  const hasFood = hotbar.countItem("cooked_beef") + hotbar.countItem("cooked_porkchop")
    + hotbar.countItem("bread") + hotbar.countItem("cooked_chicken")
    + hotbar.countItem("cooked_mutton") + hotbar.countItem("cooked_salmon")
    + hotbar.countItem("cooked_cod") + hotbar.countItem("apple")
    + hotbar.countItem("carrot") + hotbar.countItem("raw_beef")
    + hotbar.countItem("raw_porkchop") >= 16;
  return !hasPick || !hasSword || !hasFood;
});
```

- [ ] **Step 3: Create organization conditions**

```typescript
// src/bt/conditions/organization.ts
import { Condition } from "../nodes/condition.js";
import type { Blackboard } from "../types.js";

export const isHotbarOkay = new Condition((bb) => {
  return bb.organizationState.hotbarLayoutOk;
});

export const hasGarbageInInventory = new Condition((bb) => {
  const garbageItems = ["rotten_flesh", "poisonous_potato", "spider_eye"];
  return garbageItems.some((item) => bb.ctx.inventory.hasItem(item));
});

export const chestNeedsSort = new Condition((bb) => {
  // Simplified: if last sort was > 5 min ago and we have chests
  return bb.safehouseState.chestCount > 0
    && bb.organizationState.lastSortTime < Date.now() - 300000;
});
```

- [ ] **Step 4: Verify type check**

Run: `npm run typecheck`

---

### Task B5: BT Actions — Skill, Survival, Safehouse

**Files:**
- Create: `src/bt/actions/skill.ts`
- Create: `src/bt/actions/survival.ts`
- Create: `src/bt/actions/safehouse.ts`

- [ ] **Step 1: Create skill execution actions**

```typescript
// src/bt/actions/skill.ts
import { Action } from "../nodes/action.js";
import type { Blackboard } from "../types.js";

export const executeGathering = new Action(
  "gathering",
  (bb) => { bb.ctx.logger?.info("BT: starting gathering"); },
  (bb) => {
    const inv = bb.ctx.inventory;
    return inv.hasItem("oak_log") || inv.hasItem("cobblestone");
  }
);

export const executeCombat = new Action(
  "combat",
  (bb) => { bb.ctx.logger?.info("BT: engaging combat"); }
);

export const executeCrafting = new Action(
  "crafting",
  (bb) => { bb.ctx.logger?.info("BT: starting crafting"); }
);

export const executeBuilding = new Action(
  "building",
  (bb) => { bb.ctx.logger?.info("BT: starting building"); }
);

export const executeIdle = new Action(
  "idle",
  (bb) => { bb.ctx.logger?.info("BT: idle"); }
);
```

- [ ] **Step 2: Create survival actions**

```typescript
// src/bt/actions/survival.ts
import { Action } from "../nodes/action.js";
import type { Blackboard } from "../types.js";

export const eatFood = new Action(
  "idle",  // eating handled by idle skill's auto-eat
  (bb) => { bb.ctx.logger?.info("BT> SURVIVAL: eating"); }
);

export const fleeToSafety = new Action(
  "idle",
  (bb) => { bb.ctx.logger?.info("BT> SURVIVAL: fleeing"); }
);

export const digHideHole = new Action(
  "building",
  (bb) => { bb.ctx.logger?.info("BT> SURVIVAL: digging hide"); },
  (bb) => {
    const pos = bb.ctx.world.getPlayerPosition();
    // Check if we have overhead cover
    for (let y = pos.y + 1; y <= pos.y + 5; y++) {
      if (bb.ctx.world.isBlockSolid({ x: pos.x, y, z: pos.z })) return true;
    }
    return false;
  }
);
```

- [ ] **Step 3: Create safehouse actions**

```typescript
// src/bt/actions/safehouse.ts
import { Action } from "../nodes/action.js";
import type { Blackboard } from "../types.js";

export const buildSafehouse = new Action(
  "building",
  (bb) => {
    bb.safehouseState.built = false;
    bb.ctx.logger?.info("BT> SAFEHOUSE: building safehouse");
  },
  (bb) => {
    return bb.safehouseState.built;
  }
);

export const placeWorkbench = new Action(
  "building",
  (bb) => { bb.ctx.logger?.info("BT> SAFEHOUSE: placing workbench"); },
  (bb) => bb.safehouseState.hasWorkbench
);

export const placeFurnace = new Action(
  "building",
  (bb) => { bb.ctx.logger?.info("BT> SAFEHOUSE: placing furnace"); },
  (bb) => bb.safehouseState.hasFurnace
);

export const placeTorches = new Action(
  "building",
  (bb) => { bb.ctx.logger?.info("BT> SAFEHOUSE: placing torches"); },
  (bb) => bb.safehouseState.hasTorches
);
```

- [ ] **Step 4: Verify type check**

Run: `npm run typecheck`

---

### Task B6: BT Actions — Food, Storage, Organization

**Files:**
- Create: `src/bt/actions/food.ts`
- Create: `src/bt/actions/storage.ts`
- Create: `src/bt/actions/organization.ts`
- Create: `src/bt/actions/utility.ts`

- [ ] **Step 1: Create food actions**

```typescript
// src/bt/actions/food.ts
import { Action } from "../nodes/action.js";
import type { Blackboard } from "../types.js";

export const cookRawMeat = new Action(
  "crafting",
  (bb) => { bb.ctx.logger?.info("BT> FOOD: cooking raw meat"); },
  (bb) => {
    const inv = bb.ctx.inventory;
    return inv.countItem("raw_beef") + inv.countItem("raw_porkchop")
      + inv.countItem("raw_chicken") + inv.countItem("raw_mutton") === 0;
  }
);

export const huntAnimal = new Action(
  "combat",
  (bb) => { bb.ctx.logger?.info("BT> FOOD: hunting animals"); },
  (bb) => bb.ctx.inventory.countItem("cooked_beef")
    + bb.ctx.inventory.countItem("cooked_porkchop")
    + bb.ctx.inventory.countItem("cooked_chicken")
    + bb.ctx.inventory.countItem("cooked_mutton") >= 64
);
```

- [ ] **Step 2: Create storage/chest actions**

```typescript
// src/bt/actions/storage.ts
import { Action } from "../nodes/action.js";
import type { Blackboard } from "../types.js";

export const depositItems = new Action(
  "idle",
  (bb) => { bb.ctx.logger?.info("BT> STORAGE: depositing items to chest"); },
  (bb) => !bb.ctx.inventory.isFull()
);

export const placeChest = new Action(
  "building",
  (bb) => { bb.ctx.logger?.info("BT> STORAGE: placing chest"); },
  (bb) => bb.safehouseState.chestCount >= 2
);

export const sortChests = new Action(
  "idle",
  (bb) => { bb.ctx.logger?.info("BT> STORAGE: sorting chests"); },
  (bb) => {
    bb.organizationState.lastSortTime = Date.now();
    return true;
  }
);
```

- [ ] **Step 3: Create organization actions**

```typescript
// src/bt/actions/organization.ts
import { Action } from "../nodes/action.js";
import type { Blackboard } from "../types.js";

export const standardizeHotbar = new Action(
  "idle",
  (bb) => {
    bb.ctx.logger?.info("BT> ORG: standardizing hotbar");
    bb.organizationState.hotbarLayoutOk = false;
  },
  (bb) => {
    bb.organizationState.hotbarLayoutOk = true;
    return bb.organizationState.hotbarLayoutOk;
  }
);

export const dropGarbage = new Action(
  "idle",
  (bb) => {
    bb.ctx.logger?.info("BT> ORG: dropping garbage items");
    bb.organizationState.hasGarbage = false;
    return;  // mark complete immediately — idle skill handles drops
  },
  () => true
);
```

- [ ] **Step 4: Create utility actions**

```typescript
// src/bt/actions/utility.ts
import { Action } from "../nodes/action.js";
import type { Blackboard } from "../types.js";

export const waitTicks = (ticks: number) => {
  let elapsed = 0;
  return new Action(
    "idle",
    () => { elapsed = 0; },
    () => { elapsed++; return elapsed >= ticks; }
  );
};
```

- [ ] **Step 5: Verify type check**

Run: `npm run typecheck`

---

### Task B7: BehaviorTree Class + Blackboard

**Files:**
- Create: `src/bt/behavior-tree.ts`

- [ ] **Step 1: Create BehaviorTree class**

```typescript
// src/bt/behavior-tree.ts
import type { BTNode, Blackboard } from "./types.js";
import { NodeStatus } from "./types.js";

export class BehaviorTree {
  private root: BTNode;
  private blackboard: Blackboard;

  constructor(root: BTNode, blackboard: Blackboard) {
    this.root = root;
    this.blackboard = blackboard;
  }

  tick(): string | null {
    this.root.tick(this.blackboard);
    return this.blackboard.lastSkill;
  }

  getBlackboard(): Blackboard {
    return this.blackboard;
  }

  reset(): void {
    this.root.reset();
    this.blackboard.lastSkill = null;
  }
}
```

- [ ] **Step 2: Verify type check**

Run: `npm run typecheck`

---

## Phase C — BT Subsystems

### Task C1: Survival Subtree

**Files:**
- Create: `src/bt/survival.ts`

- [ ] **Step 1: Create survival subtree**

```typescript
// src/bt/survival.ts
import { InterruptibleSelector } from "./nodes/interruptible.js";
import { Sequence } from "./nodes/sequence.js";
import { Condition } from "./nodes/condition.js";
import { isHealthLow, isStarving, shouldEatNow, hasFood, hasNoFood } from "./conditions/health.js";
import { hostilesInRange } from "./conditions/environment.js";
import { hasWeapon } from "./conditions/inventory.js";
import { eatFood, fleeToSafety, digHideHole } from "./actions/survival.js";
import { executeCombat } from "./actions/skill.js";

export const survivalSubtree = new InterruptibleSelector([
  // HP critically low + has food → eat NOW
  new Sequence([isHealthLow(0.3), hasFood, eatFood]),
  // HP critically low + NO food → flee + hide
  new Sequence([isHealthLow(0.3), hasNoFood, fleeToSafety, digHideHole]),
  // Starving → eat anything
  new Sequence([isStarving, eatFood]),
  // Should eat (hunger low)
  new Sequence([shouldEatNow, hasFood, eatFood]),
  // Hostile within 2 blocks → immediate combat
  new Sequence([hostilesInRange(2), hasWeapon, executeCombat]),
  // Hostile within 2 blocks, no weapon → flee
  new Sequence([hostilesInRange(2), new Condition(() => true), fleeToSafety, digHideHole]),
]);
```

- [ ] **Step 2: Verify type check**

Run: `npm run typecheck`

---

### Task C2: Safehouse Subtree

**Files:**
- Create: `src/bt/safehouse.ts`

- [ ] **Step 1: Create safehouse subtree**

```typescript
// src/bt/safehouse.ts
import { InterruptibleSelector } from "./nodes/interruptible.js";
import { Sequence } from "./nodes/sequence.js";
import { Condition } from "./nodes/condition.js";
import { Blackboard } from "./types.js";
import { buildSafehouse, placeWorkbench, placeFurnace, placeTorches } from "./actions/safehouse.js";
import { placeChest } from "./actions/storage.js";
import type { BTNode } from "./types.js";

export const safehouseSubtree = new InterruptibleSelector([
  // No safehouse? Build it
  new Sequence([
    new Condition((bb) => !bb.safehouseState.built),
    buildSafehouse,
  ]),
  // Missing workbench
  new Sequence([
    new Condition((bb) => !bb.safehouseState.hasWorkbench),
    placeWorkbench,
  ]),
  // Missing furnace
  new Sequence([
    new Condition((bb) => !bb.safehouseState.hasFurnace),
    placeFurnace,
  ]),
  // Missing torches
  new Sequence([
    new Condition((bb) => !bb.safehouseState.hasTorches),
    placeTorches,
  ]),
  // Missing chests (< 2)
  new Sequence([
    new Condition((bb) => bb.safehouseState.chestCount < 2),
    placeChest,
  ]),
]);
```

- [ ] **Step 2: Verify type check**

Run: `npm run typecheck`

---

### Task C3: Threat Response Subtree

**Files:**
- Create: `src/bt/threat.ts`

- [ ] **Step 1: Create threat response subtree**

```typescript
// src/bt/threat.ts
import { InterruptibleSelector } from "./nodes/interruptible.js";
import { Sequence } from "./nodes/sequence.js";
import { Condition } from "./nodes/condition.js";
import { hostilesInRange } from "./conditions/environment.js";
import { hasWeapon } from "./conditions/inventory.js";
import { executeCombat } from "./actions/skill.js";
import { fleeToSafety } from "./actions/survival.js";

export const threatSubtree = new InterruptibleSelector([
  // Hostile within 16 AND have weapon → fight
  new Sequence([hostilesInRange(16), hasWeapon, executeCombat]),
  // Hostile within 16 AND no weapon → hide
  new Sequence([hostilesInRange(16), new Condition(() => true), fleeToSafety]),
]);
```

- [ ] **Step 2: Verify type check**

Run: `npm run typecheck`

---

### Task C4: Maintenance Subtree

**Files:**
- Create: `src/bt/maintenance.ts`

- [ ] **Step 1: Create maintenance subtree**

```typescript
// src/bt/maintenance.ts
import { Selector } from "./nodes/selector.js";
import { Sequence } from "./nodes/sequence.js";
import { Condition } from "./nodes/condition.js";
import { isInventoryFull, needsRestock } from "./conditions/inventory.js";
import { isNight } from "./conditions/environment.js";
import { toolDurabilityLow, armorDurabilityLow } from "./conditions/durability.js";
import { hasGarbageInInventory } from "./conditions/organization.js";
import { depositItems, sortChests } from "./actions/storage.js";
import { cookRawMeat } from "./actions/food.js";
import { executeCrafting } from "./actions/skill.js";
import { dropGarbage } from "./actions/organization.js";
import { buildSafehouse } from "./actions/safehouse.js";
import type { Blackboard } from "./types.js";

export const maintenanceSubtree = new Selector([
  // Inventory full → deposit + sort
  new Sequence([isInventoryFull, depositItems, sortChests]),
  // Has raw meat → cook it
  new Sequence([new Condition((bb) => bb.ctx.inventory.countItem("raw_beef")
    + bb.ctx.inventory.countItem("raw_porkchop")
    + bb.ctx.inventory.countItem("raw_chicken")
    + bb.ctx.inventory.countItem("raw_mutton") > 0), cookRawMeat]),
  // Tool durability low → craft replacement
  new Sequence([toolDurabilityLow, executeCrafting]),
  // Armor durability low → craft replacement
  new Sequence([armorDurabilityLow, executeCrafting]),
  // Inventory has garbage → drop it
  new Sequence([hasGarbageInInventory, dropGarbage]),
  // Nighttime + exposed → reinforce safehouse
  new Sequence([isNight, buildSafehouse]),
]);
```

- [ ] **Step 2: Verify type check**

Run: `npm run typecheck`

---

## Phase D — Phase Subtrees

### Task D1: SPAWN + STONE Phases

**Files:**
- Create: `src/bt/phases/spawn.ts`
- Create: `src/bt/phases/stone.ts`

- [ ] **Step 1: Create SPAWN phase subtree**

```typescript
// src/bt/phases/spawn.ts
import { Sequence } from "../nodes/sequence.js";
import { Selector } from "../nodes/selector.js";
import { hasWood } from "../conditions/inventory.js";
import { executeGathering, executeCrafting } from "../actions/skill.js";
import { buildSafehouse } from "../actions/safehouse.js";
import { placeChest } from "../actions/storage.js";
import { PhaseType } from "../types.js";
import type { Blackboard } from "../types.js";

export const spawnPhaseSubtree = new Sequence([
  // Gather wood until we have 4+
  new Selector([
    new Sequence([hasWood(4), executeCrafting]),
    executeGathering,
  ]),
  // Build initial safehouse
  buildSafehouse,
  // Place 2 chests
  placeChest,
]);
```

- [ ] **Step 2: Create STONE phase subtree**

```typescript
// src/bt/phases/stone.ts
import { Sequence } from "../nodes/sequence.js";
import { Selector } from "../nodes/selector.js";
import { hasStone } from "../conditions/inventory.js";
import { executeGathering, executeBuilding } from "../actions/skill.js";
import { placeWorkbench, placeFurnace } from "../actions/safehouse.js";
import { placeChest } from "../actions/storage.js";

export const stonePhaseSubtree = new Sequence([
  // Place workbench + furnace
  placeWorkbench,
  placeFurnace,
  // Mine stone
  new Selector([
    new Sequence([hasStone(8), executeBuilding]),
    executeGathering,
  ]),
  // More chests
  placeChest,
]);
```

- [ ] **Step 3: Verify type check**

Run: `npm run typecheck`

---

### Task D2: IRON + DIAMOND Phases

**Files:**
- Create: `src/bt/phases/iron.ts`
- Create: `src/bt/phases/diamond.ts`

- [ ] **Step 1: Create IRON phase subtree**

```typescript
// src/bt/phases/iron.ts
import { Sequence } from "../nodes/sequence.js";
import { Selector } from "../nodes/selector.js";
import { hasIron } from "../conditions/inventory.js";
import { executeGathering } from "../actions/skill.js";

export const ironPhaseSubtree = new Sequence([
  // Mine iron ores → smelt
  new Selector([
    new Sequence([hasIron(3), executeGathering]),
    executeGathering,
  ]),
]);
```

- [ ] **Step 2: Create DIAMOND phase subtree**

```typescript
// src/bt/phases/diamond.ts
import { Sequence } from "../nodes/sequence.js";
import { Selector } from "../nodes/selector.js";
import { hasDiamond } from "../conditions/inventory.js";
import { executeGathering } from "../actions/skill.js";

export const diamondPhaseSubtree = new Sequence([
  new Selector([
    new Sequence([hasDiamond(1), executeGathering]),
    executeGathering,
  ]),
]);
```

- [ ] **Step 3: Verify type check**

Run: `npm run typecheck`

---

### Task D3: NETHER_ENTRY + NETHER Phases

**Files:**
- Create: `src/bt/phases/nether_entry.ts`
- Create: `src/bt/phases/nether.ts`

- [ ] **Step 1: Create NETHER_ENTRY phase subtree**

```typescript
// src/bt/phases/nether_entry.ts
import { Sequence } from "../nodes/sequence.js";
import { Condition } from "../nodes/condition.js";
import { hasItem } from "../conditions/inventory.js";
import { executeBuilding } from "../actions/skill.js";
import type { Blackboard } from "../types.js";

export const netherEntrySubtree = new Sequence([
  // Ensure obsidian + flint_and_steel
  new Condition((bb) => bb.ctx.inventory.countItem("obsidian") >= 10),
  new Condition((bb) => bb.ctx.inventory.hasItem("flint_and_steel")),
  // Build nether portal
  executeBuilding,
]);
```

- [ ] **Step 2: Create NETHER phase subtree**

```typescript
// src/bt/phases/nether.ts
import { Sequence } from "../nodes/sequence.js";
import { hasItem } from "../conditions/inventory.js";
import { executeCombat, executeGathering } from "../actions/skill.js";

export const netherPhaseSubtree = new Sequence([
  // Kill blazes for blaze rods
  executeCombat,
  // Kill endermen for ender pearls
  executeCombat,
  // Stash items
  executeGathering,
]);
```

- [ ] **Step 3: Verify type check**

Run: `npm run typecheck`

---

### Task D4: END_PREP + STRONGHOLD + END Phases

**Files:**
- Create: `src/bt/phases/end_prep.ts`
- Create: `src/bt/phases/stronghold.ts`
- Create: `src/bt/phases/end.ts`

- [ ] **Step 1: Create END_PREP phase subtree**

```typescript
// src/bt/phases/end_prep.ts
import { Sequence } from "../nodes/sequence.js";
import { hasItem } from "../conditions/inventory.js";
import { executeCrafting } from "../actions/skill.js";

export const endPrepSubtree = new Sequence([
  // Craft ender eyes
  executeCrafting,
  // Locate stronghold
  executeCrafting,
]);
```

- [ ] **Step 2: Create STRONGHOLD phase subtree**

```typescript
// src/bt/phases/stronghold.ts
import { Sequence } from "../nodes/sequence.js";
import type { Blackboard } from "../types.js";

// Stronghold uses the StrongholdSkill which handles everything internally
import { Action } from "../nodes/action.js";

const executeStronghold = new Action(
  "stronghold",
  (bb) => { bb.ctx.logger?.info("BT> STRONGHOLD: searching stronghold"); }
);

export const strongholdSubtree = new Sequence([
  executeStronghold,
]);
```

- [ ] **Step 3: Create END phase subtree**

```typescript
// src/bt/phases/end.ts
import { Sequence } from "../nodes/sequence.js";
import { Action } from "../nodes/action.js";

const executeDragonHunt = new Action(
  "dragon_hunt",
  (bb) => { bb.ctx.logger?.info("BT> END: hunting dragon"); }
);

export const endPhaseSubtree = new Sequence([
  executeDragonHunt,
]);
```

- [ ] **Step 4: Verify type check**

Run: `npm run typecheck`

---

## Phase E — Integration

### Task E1: Root Tree Assembly + Phase Determination

**Files:**
- Create: `src/bt/tree.ts`

- [ ] **Step 1: Create root tree with phase determination**

```typescript
// src/bt/tree.ts
import { InterruptibleSelector } from "./nodes/interruptible.js";
import { Selector } from "./nodes/selector.js";
import { Sequence } from "./nodes/sequence.js";
import { survivalSubtree } from "./survival.js";
import { safehouseSubtree } from "./safehouse.js";
import { threatSubtree } from "./threat.js";
import { maintenanceSubtree } from "./maintenance.js";
import { spawnPhaseSubtree } from "./phases/spawn.js";
import { stonePhaseSubtree } from "./phases/stone.js";
import { ironPhaseSubtree } from "./phases/iron.js";
import { diamondPhaseSubtree } from "./phases/diamond.js";
import { netherEntrySubtree } from "./phases/nether_entry.js";
import { netherPhaseSubtree } from "./phases/nether.js";
import { endPrepSubtree } from "./phases/end_prep.js";
import { strongholdSubtree } from "./phases/stronghold.js";
import { endPhaseSubtree } from "./phases/end.js";
import { isPhase } from "./conditions/phase.js";
import { executeIdle } from "./actions/skill.js";
import { PhaseType } from "./types.js";
import type { BTNode, Blackboard } from "./types.js";

const phaseProgress: BTNode = new Selector([
  new Sequence([isPhase(PhaseType.SPAWN), spawnPhaseSubtree]),
  new Sequence([isPhase(PhaseType.STONE), stonePhaseSubtree]),
  new Sequence([isPhase(PhaseType.IRON), ironPhaseSubtree]),
  new Sequence([isPhase(PhaseType.DIAMOND), diamondPhaseSubtree]),
  new Sequence([isPhase(PhaseType.NETHER_ENTRY), netherEntrySubtree]),
  new Sequence([isPhase(PhaseType.NETHER), netherPhaseSubtree]),
  new Sequence([isPhase(PhaseType.END_PREP), endPrepSubtree]),
  new Sequence([isPhase(PhaseType.STRONGHOLD), strongholdSubtree]),
  new Sequence([isPhase(PhaseType.END), endPhaseSubtree]),
]);

export const rootTree = new InterruptibleSelector([
  // 1. SURVIVAL (life or death)
  survivalSubtree,
  // 2. SAFEHOUSE (always ensure safety)
  safehouseSubtree,
  // 3. THREAT_RESPONSE
  threatSubtree,
  // 4. PHASE_PROGRESS
  phaseProgress,
  // 5. MAINTENANCE
  maintenanceSubtree,
  // 6. IDLE (fallback)
  executeIdle,
]);

export function determinePhase(bb: Blackboard): PhaseType {
  const inv = bb.ctx.inventory;

  // END phase: boss defeated
  if (bb.dimension === 2) return PhaseType.END;

  // STRONGHOLD / END_PREP: have ender eyes
  if (inv.countItem("ender_eye") >= 12) {
    return PhaseType.STRONGHOLD;
  }
  if (inv.countItem("blaze_rod") >= 6 && inv.countItem("ender_pearl") >= 12) {
    return PhaseType.END_PREP;
  }

  // NETHER: in nether or have obsidian + flint
  if (bb.dimension === 1) return PhaseType.NETHER;
  if (inv.countItem("obsidian") >= 10 && inv.hasItem("flint_and_steel")) {
    return PhaseType.NETHER_ENTRY;
  }

  // DIAMOND: have diamond
  if (inv.hasItem("diamond") || inv.hasItem("diamond_pickaxe")) {
    return PhaseType.DIAMOND;
  }

  // IRON: have iron ingot or iron tools
  if (inv.countItem("iron_ingot") >= 3 || inv.hasItem("iron_pickaxe")
    || inv.hasItem("iron_chestplate")) {
    return PhaseType.IRON;
  }

  // STONE: have stone pickaxe + cobblestone
  if (inv.hasItem("stone_pickaxe") && inv.countItem("cobblestone") >= 8) {
    return PhaseType.STONE;
  }

  return PhaseType.SPAWN;
}
```

- [ ] **Step 2: Verify type check**

Run: `npm run typecheck`

---

### Task E2: Bot Tick Loop — Replace Planner with BehaviorTree

**Files:**
- Modify: `src/bot.ts`

- [ ] **Step 1: Add BT imports and fields to Bot**

```typescript
import { BehaviorTree } from "./bt/behavior-tree.js";
import { rootTree, determinePhase } from "./bt/tree.js";
import { PhaseType, type Blackboard, type SafehouseState, type StockpileState, type OrganizationState } from "./bt/types.js";
```

Add fields:
```typescript
private tree: BehaviorTree | null = null;
private hp: number = 20;
private daytime: boolean = true;
private blackboardInitialized: boolean = false;
```

- [ ] **Step 2: Initialize behavior tree in start()**

After `setupEventHandlers()`, add:

```typescript
// Phase determination based on inventory
const phase = determinePhase(this.getBlackboard());
logger.info(`BT: determined initial phase = ${PhaseType[phase]}`);

const bb = this.getBlackboard();
bb.currentPhase = phase;
this.tree = new BehaviorTree(rootTree, bb);
this.blackboardInitialized = true;
```

- [ ] **Step 3: Replace Planner evaluation in tick loop**

Replace the planner block (~every 100 ticks) with:
```typescript
if (this.tree && this.blackboardInitialized) {
  this.updateBlackboard();

  const nextSkill = this.tree.tick();
  if (nextSkill && nextSkill !== this.skills.getCurrentSkillName()) {
    this.skills.setCurrent(nextSkill, ctx);
  }
}
```

- [ ] **Step 4: Add blackboard update and getter methods**

```typescript
private getBlackboard(): Blackboard {
  return {
    ctx: this.getSkillContext(),
    currentPhase: PhaseType.SPAWN,
    phaseData: {},
    safehouseState: { built: false, position: null, hasWorkbench: false, hasFurnace: false, hasTorches: false, chestCount: 0 },
    stockpileState: { trackedChests: [], lastDepositTime: 0, stockpileMet: false },
    organizationState: { hotbarLayoutOk: true, hasGarbage: false, lastSortTime: 0 },
    hp: this.hp,
    daytime: this.daytime,
    dimension: this.world?.getDimension() ?? 0,
    lastSkill: this.skills?.getCurrentSkillName() ?? null,
  };
}

private updateBlackboard(): void {
  if (!this.tree) return;
  const bb = this.tree.getBlackboard();
  bb.hp = this.hp;
  bb.daytime = this.daytime;
  bb.dimension = this.world.getDimension();
  bb.lastSkill = this.skills.getCurrentSkillName();
  // Re-determine phase on major inventory changes
  bb.currentPhase = determinePhase(bb);
}
```

- [ ] **Step 5: Track HP from update_attributes**

In `setupEventHandlers()`, find the `update_attributes` handler and extract HP:

```typescript
this.events.on("update_attributes", (attrs: any) => {
  if (attrs.health !== undefined) {
    this.hp = attrs.health;
  }
  this.hunger.updateAttributes(attrs);
});
```

- [ ] **Step 6: Track daytime from set_time**

Add a handler for time packets:

```typescript
// In setupEventHandlers or Connection event mapping
this.connection.client?.on("set_time", (packet: any) => {
  const time = packet?.time ?? 0;
  this.daytime = (time % 24000) < 13000;
});
```

- [ ] **Step 7: On player death, reset tree**

In the `player_death` handler:
```typescript
this.tree?.reset();
```

- [ ] **Step 8: Verify type check**

Run: `npm run typecheck`

---

### Task E3: SkillManager — Simplify (Remove priority interrupts)

**Files:**
- Modify: `src/skills/skill-manager.ts`

- [ ] **Step 1: Remove requestWithPriority**

Remove the `requestWithPriority` method. The BehaviorTree handles all priority decisions.

- [ ] **Step 2: Keep only setCurrent and tick**

Simplified SkillManager:
```typescript
export class SkillManager {
  private skills: Map<string, Skill> = new Map();
  private current: Skill | null = null;
  private metrics: MetricsCollector | null = null;

  setMetrics(metrics: MetricsCollector): void { this.metrics = metrics; }

  register(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  setCurrent(name: string, ctx: SkillContext): void {
    const skill = this.skills.get(name);
    if (!skill) {
      ctx.logger?.warn(`Skill "${name}" not registered`);
      return;
    }
    if (this.current) {
      void this.current.exit(ctx);
    }
    this.current = skill;
    void skill.enter(ctx);
    this.metrics?.recordSkillTransition(name);
  }

  async tick(ctx: SkillContext): Promise<void> {
    if (!this.current) return;
    try {
      const next = await this.current.tick(ctx);
      if (next && next !== this.current.name && this.skills.has(next)) {
        this.setCurrent(next, ctx);
      }
    } catch (err) {
      ctx.logger?.error({ err }, `Skill "${this.current.name}" crashed`);
      this.setCurrent("idle", ctx);
    }
  }

  getCurrentSkillName(): string | null {
    return this.current?.name ?? null;
  }
}
```

- [ ] **Step 2: Verify type check**

Run: `npm run typecheck`

---

### Task E4: SkillContext — Add hp + daytime

**Files:**
- Modify: `src/skills/skill.ts`

- [ ] **Step 1: Add new fields to SkillContext**

```typescript
export interface SkillContext {
  world: WorldState;
  movement: Movement;
  inventory: Inventory;
  events: EventBus<BotEvents>;
  logger: Logger;
  hunger: HungerTracker;
  metrics?: MetricsCollector;
  circuitBreaker?: PathfindingCircuitBreaker;
  hp: number;
  daytime: boolean;
}
```

- [ ] **Step 2: Update getSkillContext() in bot.ts**

Add the new fields when constructing SkillContext:
```typescript
return {
  world: this.world,
  movement: this.movement,
  inventory: this.inventory,
  events: this.events,
  logger: this.logger,
  hunger: this.hunger,
  metrics: this.metrics,
  circuitBreaker: this.circuitBreaker,
  hp: this.hp,
  daytime: this.daytime,
};
```

- [ ] **Step 3: Verify type check**

Run: `npm run typecheck`

---

### Task E5: Remove Planner Files

**Files:**
- Delete: `src/planner/planner.ts`
- Delete: `src/planner/goals.ts`
- Modify: `src/bot.ts` (remove Planner import)

- [ ] **Step 1: Remove Planner import and field from Bot**

Remove:
```typescript
import { Planner } from "./planner/planner.js";
```
Remove the `planner: Planner` field and its initialization.

- [ ] **Step 2: Delete planner files**

```bash
rm src/planner/planner.ts src/planner/goals.ts
```

- [ ] **Step 3: Verify type check and cleanup**

Run: `npm run typecheck`
Expected: No errors related to Planner

---

## Phase F — Verification

### Task F1: Full Type Check

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: Clean pass, 0 errors.

- [ ] **Step 2: Fix any errors**

Iterate until clean.

---

### Task F2: Unit Tests for Core BT Nodes

**Files:**
- Create: `tests/bt/nodes.test.ts`
- Create: `tests/bt/conditions.test.ts`

- [ ] **Step 1: Test Selector node**

Create `tests/bt/nodes.test.ts`:
```typescript
import { describe, it } from "node:test";
import assert from "node:assert";
import { Selector } from "../../src/bt/nodes/selector.js";
import { Sequence } from "../../src/bt/nodes/sequence.js";
import { Condition } from "../../src/bt/nodes/condition.js";
import { Action } from "../../src/bt/nodes/action.js";
import { NodeStatus } from "../../src/bt/types.js";
import type { Blackboard } from "../../src/bt/types.js";

function mockBlackboard(overrides: Partial<Blackboard> = {}): Blackboard {
  return {
    ctx: {} as any,
    currentPhase: 0 as any,
    phaseData: {},
    safehouseState: { built: false, position: null, hasWorkbench: false, hasFurnace: false, hasTorches: false, chestCount: 0 },
    stockpileState: { trackedChests: [], lastDepositTime: 0, stockpileMet: false },
    organizationState: { hotbarLayoutOk: true, hasGarbage: false, lastSortTime: 0 },
    hp: 20,
    daytime: true,
    dimension: 0,
    lastSkill: null,
    ...overrides,
  };
}

describe("Selector", () => {
  it("returns SUCCESS on first child success", () => {
    const sel = new Selector([
      new Condition(() => true),
      new Condition(() => false),
    ]);
    assert.strictEqual(sel.tick(mockBlackboard()), NodeStatus.SUCCESS);
  });

  it("skips running children if earlier child succeeds", () => {
    const sel = new Selector([
      new Condition(() => true),
      new Action("test"),
    ]);
    assert.strictEqual(sel.tick(mockBlackboard()), NodeStatus.SUCCESS);
  });

  it("returns FAILURE if all children fail", () => {
    const sel = new Selector([
      new Condition(() => false),
      new Condition(() => false),
    ]);
    assert.strictEqual(sel.tick(mockBlackboard()), NodeStatus.FAILURE);
  });
});

describe("Sequence", () => {
  it("returns SUCCESS when all children succeed", () => {
    const seq = new Sequence([
      new Condition(() => true),
      new Condition(() => true),
    ]);
    assert.strictEqual(seq.tick(mockBlackboard()), NodeStatus.SUCCESS);
  });

  it("returns RUNNING for running action", () => {
    const seq = new Sequence([
      new Action("test"),
    ]);
    const bb = mockBlackboard();
    assert.strictEqual(seq.tick(bb), NodeStatus.RUNNING);
    assert.strictEqual(bb.lastSkill, "test");
  });

  it("returns FAILURE if any child fails", () => {
    const seq = new Sequence([
      new Condition(() => true),
      new Condition(() => false),
    ]);
    assert.strictEqual(seq.tick(mockBlackboard()), NodeStatus.FAILURE);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx tsx --test tests/bt/nodes.test.ts`
Expected: All pass

---

### Task F3: Real Server Smoke Test

- [ ] **Step 1: Start bot against test server**

Run: `./minebot --host <server-ip> --port <port> --email <email> --offline`

- [ ] **Step 2: Verify behavior tree starts correctly**

Expected: Bot logs "BT: determined initial phase = SPAWN" and begins gathering wood.

- [ ] **Step 3: Monitor for 2+ minutes**

Expected: Bot alternates between gathering, crafting, and building safehouse. No crashes, no planner errors.

- [ ] **Step 4: Induce combat to test interrupt**

Expected: When hostile mob approaches, bot switches to combat then resumes phase work.

- [ ] **Step 5: Verify phase advancement**

Expected: After gathering 4+ wood + safehouse + 2 chests, phase advances to STONE.

---

### Task F4: Commit and Cleanup

- [ ] **Step 1: Run final type check**

Run: `npm run typecheck`

- [ ] **Step 2: Commit all changes**

```bash
git add src/bt/ src/movement/pathfinding.ts src/movement/pathfinding-types.ts src/movement/movement.ts src/world/world-state.ts src/world/types.ts src/connection/connection.ts src/inventory/inventory.ts src/bot.ts src/skills/skill-manager.ts src/skills/skill.ts src/skills/*.ts tests/bt/
git rm src/planner/planner.ts src/planner/goals.ts
git commit -m "feat: replace Planner with Behavior Tree decision engine + enhanced pathfinding"
```
