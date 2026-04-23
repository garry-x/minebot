# Auto System Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the monolithic `bot/autonomous-engine.ts` and `bot/behaviors.ts` into a layered architecture (Reaction/Deliberation/Execution) inspired by the Mindcraft project.

**Architecture:** Three-layer architecture with mode-based reactive behaviors (tick-driven, priority-ordered), command-based LLM interface (!cmd format), and atomic skills library. Old files `autonomous-engine.ts`, `behaviors.ts`, and `goal-system.ts` are fully replaced.

**Tech Stack:** TypeScript (ES2020), mineflayer ^4.15.0, mineflayer-pathfinder ^1.7.0, ws, Express, SQLite3, vLLM (OpenAI-compatible LLM at `process.env.VLLM_URL`).

---

## File Inventory

### Files to CREATE:
| File | Responsibility |
|------|----------------|
| `bot/types.ts` | Shared types: `WorldState`, `Inventory`, `GameEvent`, assessment types |
| `bot/engine/index.ts` | `Agent` class — assembles all layers, main loop entry |
| `bot/engine/mode-controller.ts` | `ModeController` — priority tick loop, pause/interrupt |
| `bot/engine/modes/base.ts` | `Mode` interface + `BaseMode` abstract class |
| `bot/engine/modes/self-preservation.ts` | Emergency: low HP, drowning, burning |
| `bot/engine/modes/unstuck.ts` | Detect stuck position, call moveAway |
| `bot/engine/modes/self-defense.ts` | Attack hostile entities in range |
| `bot/engine/modes/hunting.ts` | Hunt nearby animals when idle |
| `bot/engine/modes/item-collecting.ts` | Collect nearby items when idle |
| `bot/engine/modes/torch-placing.ts` | Place torches where dark |
| `bot/engine/modes/building.ts` | Activate when build command received |
| `bot/engine/modes/idle.ts` | Default fallback, no-op |
| `bot/skills/index.ts` | `Skill` interface + `SkillRegistry` |
| `bot/skills/movement.ts` | flyTo, moveTo, retreat |
| `bot/skills/combat.ts` | attackEntity, defendSelf |
| `bot/skills/gathering.ts` | gatherResources, pickupNearbyItems, mineBlock |
| `bot/skills/building.ts` | placeBlock, buildStructure, craftItem |
| `bot/skills/survival.ts` | eat, placeTorch, findSafeRetreat |
| `bot/skills/world-utils.ts` | scanEntities, checkHealth, lookForItem, findBlock |
| `bot/commands/index.ts` | `Command` interface + `CommandRegistry` |
| `bot/commands/action-commands.ts` | !build, !craft, !attack, !goTo, !gather |
| `bot/commands/query-commands.ts` | !status, !inventory, !entities, !nearby |
| `bot/commands/control-commands.ts` | !startAuto, !stopAuto, !pause, !resume |
| `bot/self-prompter.ts` | `SelfPrompter` — autonomous LLM goal loop |
| `bot/goal-manager.ts` | `GoalManager` — goal tracking + context generation |

### Files to MODIFY:
| File | Changes |
|------|---------|
| `bot/index.ts` | Replace direct behavior calls with `Agent` integration, update WebSocket handlers to use CommandRegistry |
| `bot/pathfinder.ts` | Keep as-is, inject into skills/modes via Agent |
| `bot/ScreenshotModule.ts` | No changes |
| `bot/events.ts` | No changes |
| `bot/logger.ts` | No changes |

### Files to DELETE:
- `bot/autonomous-engine.ts`
- `bot/behaviors.ts`
- `bot/goal-system.ts`

---

## Task 1: Create `bot/types.ts` — Shared Types

**Files:**
- Create: `bot/types.ts`

### Step 1: Write the types

```typescript
// bot/types.ts

import type { Bot } from 'mineflayer';
import type { Vec3 } from 'vec3';

export interface BotRef {
  bot: Bot;
}

// World snapshot
export interface WorldState {
  time: {
    timeOfDay: number;  // 0-24000, <13000 = daytime
    isDaytime: boolean;
  };
  weather: string;
  nearbyEntities: NearbyEntity[];
  nearbyBlocks: string[];
  lightLevel: number;
}

export interface NearbyEntity {
  type: string;
  distance: number;
  name?: string;
  hostiles?: string[];  // entity types
}

// Inventory snapshot
export interface Inventory {
  items: InventoryItem[];
  counts: Record<string, number>;
  armor: {
    head?: string;
    chest?: string;
    legs?: string;
    feet?: string;
  };
}

export interface InventoryItem {
  name: string;
  count: number;
  slot: number;
}

// Assessment results
export interface AssessmentResult {
  health: number;
  maxHealth: number;
  food: number;
  hunger: number;
  experience: number;
  inventoryCount: Record<string, number>;
  nearbyHostiles: number;
  dangerousMobs: string[];
  threatScore: number;
  isOverwhelmed: boolean;
  isDaytime: boolean;
  damageRecent: boolean;
}

export type Priority =
  | 'emergency'
  | 'survival'
  | 'food'
  | 'heal'
  | 'gather_food'
  | 'combat'
  | 'goal_progress';

export type ActionType =
  | 'idle'
  | 'gather'
  | 'heal_immediate'
  | 'find_shelter'
  | 'combat'
  | 'retreat'
  | 'craft'
  | 'build'
  | 'explore';

export type ThreatLevel = 'low' | 'medium' | 'high' | 'critical';
export type HealthStatus = 'safe' | 'warning' | 'critical';

// LLM decision result
export interface LLMDecision {
  reason: string;
  primaryAction: ActionType;
  target: {
    type: 'block' | 'entity' | 'position' | 'item';
    value: string;
  };
  urgency: 'high' | 'medium' | 'low';
  strategy: string;
}

// Event types
export type GameEventType =
  | 'bot_death'
  | 'bot_hurt'
  | 'bot_respawn'
  | 'entity_spawn'
  | 'entity_die'
  | 'entity_attack'
  | 'item_pickup'
  | 'block_mined'
  | 'block_placed'
  | 'inventory_changed'
  | 'health_changed'
  | 'food_changed';

export interface GameEvent {
  type: GameEventType;
  timestamp: number;
  data?: Record<string, unknown>;
}

// Hostile mob definitions
export const HOSTILE_MOBS = [
  'zombie', 'skeleton', 'spider', 'creeper', 'enderman',
  'witch', 'slime', 'phantom', 'drowned', 'pillager',
  'ravager', 'vex', 'husk', 'stray', 'drowned',
] as const;

export const DANGEROUS_MOBS = [
  'creeper', 'blaze', 'ghast', 'ravager', 'wither_skeleton',
  'enderman', 'phantom', 'witch',
] as const;

// Mob strategy
export interface MobStrategy {
  retreatDist: number;
  action: 'aggressive' | 'keep_distance' | 'close_distance' | 'cautious';
}

export const MOB_STRATEGIES: Record<string, MobStrategy> = {
  creeper:       { retreatDist: 8,  action: 'keep_distance' },
  skeleton:      { retreatDist: 5,  action: 'close_distance' },
  zombie:        { retreatDist: 3,  action: 'aggressive' },
  enderman:      { retreatDist: 6,  action: 'cautious' },
  phantom:       { retreatDist: 10, action: 'keep_distance' },
  ravager:       { retreatDist: 10, action: 'keep_distance' },
  spider:        { retreatDist: 4,  action: 'aggressive' },
  witch:         { retreatDist: 6,  action: 'keep_distance' },
  slime:         { retreatDist: 4,  action: 'aggressive' },
  blaze:         { retreatDist: 8,  action: 'keep_distance' },
  husk:          { retreatDist: 3,  action: 'aggressive' },
  stray:         { retreatDist: 5,  action: 'close_distance' },
  drowned:       { retreatDist: 3,  action: 'aggressive' },
  pillager:      { retreatDist: 6,  action: 'keep_distance' },
  vex:           { retreatDist: 5,  action: 'aggressive' },
  wither_skeleton: { retreatDist: 5, action: 'aggressive' },
};
```

### Step 2: Verify TypeScript compiles

Run: `npx tsc --noEmit`

Expected: No errors related to `bot/types.ts`.

### Step 3: Commit

```bash
git add bot/types.ts
git commit -m "feat: add shared types for layered auto system"
```

---

## Task 2: Create `bot/skills/index.ts` — Skill Interface + Registry

**Files:**
- Create: `bot/skills/index.ts`

### Step 1: Write the skill interface and registry

```typescript
// bot/skills/index.ts

import type { Bot } from 'mineflayer';
import type { WorldState, Inventory } from '../types';

export interface SkillContext {
  bot: Bot;
  world: WorldState;
  inventory: Inventory;
}

export interface Skill {
  name: string;
  description: string;
  cooldown?: number;
  canRun?(ctx: SkillContext): boolean;
  execute(ctx: SkillContext): Promise<void>;
}

export class SkillRegistry {
  private skills = new Map<string, Skill>();
  private cooldowns = new Map<string, number>();

  register(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  getAll(): Map<string, Skill> {
    return this.skills;
  }

  async execute(name: string, ctx: SkillContext): Promise<void> {
    const skill = this.skills.get(name);
    if (!skill) {
      throw new Error(`Unknown skill: ${name}`);
    }
    if (skill.canRun && !skill.canRun(ctx)) {
      throw new Error(`Skill ${name} precondition not met`);
    }
    if (!this.isReady(name)) {
      throw new Error(`Skill ${name} on cooldown`);
    }
    await skill.execute(ctx);
    if (skill.cooldown) {
      this.cooldowns.set(name, Date.now() + skill.cooldown);
    }
  }

  isReady(name: string): boolean {
    const cooldownEnd = this.cooldowns.get(name);
    if (!cooldownEnd) return true;
    return Date.now() >= cooldownEnd;
  }
}
```

### Step 2: Verify TypeScript compiles

Run: `npx tsc --noEmit`

### Step 3: Commit

```bash
git add bot/skills/index.ts
git commit -m "feat: add skill interface and SkillRegistry"
```

---

## Task 3: Create `bot/skills/movement.ts` — Movement Skills

**Files:**
- Create: `bot/skills/movement.ts`

### Step 1: Write movement skills

```typescript
// bot/skills/movement.ts

import type { Skill } from './index';
import type { Goal } from 'mineflayer-pathfinder';
import { GoalFollow, GoalBlock } from 'mineflayer-pathfinder';

export function createFlyToSkill(): Skill {
  return {
    name: 'flyTo',
    description: 'Fly to given coordinates with pathfinding',
    cooldown: 1000,
    async execute({ bot, world }) {
      // Expected params passed via ctx or a custom field
      const goal = (bot as any)._flyToGoal as Goal;
      if (!goal) return;

      bot.pathfinder.setGoal(goal, true);
      await new Promise<void>((resolve) => {
        const checkGoal = () => {
          const g = bot.pathfinder.getGoal();
          if (!g) {
            bot.removeListener('pathfinder_goal_reached', checkGoal);
            resolve();
          }
        };
        bot.once('pathfinder_goal_reached', () => resolve());
        // Timeout after 30s
        setTimeout(() => {
          bot.removeListener('pathfinder_goal_reached', checkGoal);
          resolve();
        }, 30000);
      });
    },
  };
}

export function createRetreatSkill(): Skill {
  return {
    name: 'retreat',
    description: 'Move away from current position in opposite direction',
    cooldown: 2000,
    async execute({ bot }) {
      const pos = bot.entity.position;
      const retreatGoal = new GoalBlock(
        pos.x - Math.floor(Math.random() * 15 + 10),
        pos.y,
        pos.z - Math.floor(Math.random() * 15 + 10),
      );
      bot.pathfinder.setGoal(retreatGoal, true);
      await new Promise<void>((resolve) => {
        bot.once('pathfinder_goal_reached', () => resolve());
        setTimeout(resolve, 15000);
      });
    },
  };
}

export function createMoveToSkill(): Skill {
  return {
    name: 'moveTo',
    description: 'Move to given coordinates with pathfinding',
    cooldown: 1000,
    async execute({ bot }) {
      const goal = (bot as any)._moveToGoal as Goal;
      if (!goal) return;
      bot.pathfinder.setGoal(goal, true);
      await new Promise<void>((resolve) => {
        bot.once('pathfinder_goal_reached', () => resolve());
        setTimeout(resolve, 30000);
      });
    },
  };
}
```

### Step 2: Verify TypeScript compiles

Run: `npx tsc --noEmit`

### Step 3: Commit

```bash
git add bot/skills/movement.ts
git commit -m "feat: add movement skills (flyTo, retreat, moveTo)"
```

---

## Task 4: Create `bot/skills/combat.ts` — Combat Skills

**Files:**
- Create: `bot/skills/combat.ts`

### Step 1: Write combat skills

```typescript
// bot/skills/combat.ts

import type { Skill, SkillContext } from './index';
import type { Entity } from 'mineflayer';

export function createAttackEntitySkill(): Skill {
  return {
    name: 'attackEntity',
    description: 'Attack a specific entity by name or type',
    cooldown: 5000,
    async execute({ bot }) {
      const targetName = (bot as any)._attackTarget as string;
      if (!targetName) return;

      const entity = bot.nearestEntity((e: Entity) =>
        e.type === 'mob' && (e.username?.includes(targetName) || e.name?.includes(targetName))
      );
      if (!entity) return;

      // Equip best weapon
      const slots = bot.inventory.slots;
      let bestWeapon = -1;
      let bestAttack = 0;
      for (let i = 0; i < slots.length; i++) {
        const item = slots[i];
        if (item && ['stone_sword', 'iron_sword', 'diamond_sword', 'wooden_sword', 'golden_sword'].includes(item.name)) {
          const attackMap: Record<string, number> = {
            wooden_sword: 4, stone_sword: 5, iron_sword: 6, diamond_sword: 7, golden_sword: 4
          };
          const atk = attackMap[item.name] || 0;
          if (atk > bestAttack) {
            bestAttack = atk;
            bestWeapon = i;
          }
        }
      }
      if (bestWeapon >= 0) {
        await bot.equip(slots[bestWeapon], 'hand');
      }

      await bot.pvp.attack(entity);
    },
  };
}

export function createDefendSelfSkill(): Skill {
  return {
    name: 'defendSelf',
    description: 'Defend against all nearby hostile entities',
    cooldown: 3000,
    async execute({ bot }) {
      const hostiles = botEntitiesWhere(bot, (e) =>
        e.type === 'mob' && HOSTILE_MOBS.includes(e.name as any)
      );
      if (hostiles.length === 0) return;

      for (const entity of hostiles) {
        if (bot.health <= 5) break; // Stop if nearly dead
        await bot.pvp.attack(entity);
        // Move away slightly between attacks
        const pos = bot.entity.position;
        const retreat = new GoalBlock(
          pos.x + (Math.random() > 0.5 ? 3 : -3),
          pos.y,
          pos.z + (Math.random() > 0.5 ? 3 : -3),
        );
        bot.pathfinder.setGoal(retreat, false);
        await new Promise(r => setTimeout(r, 1000));
      }
    },
  };
}

// Helper to find entities matching criteria
const HOSTILE_MOBS = [
  'zombie', 'skeleton', 'spider', 'creeper', 'enderman',
  'witch', 'slime', 'phantom', 'drowned', 'pillager',
  'ravager', 'vex', 'husk', 'stray',
];

function botEntitiesWhere(bot: any, predicate: (e: any) => boolean): any[] {
  return bot.entities
    ? Object.values(bot.entities).filter((e: any) => predicate(e))
    : [];
}
```

### Step 2: Verify TypeScript compiles

Run: `npx tsc --noEmit`

### Step 3: Commit

```bash
git add bot/skills/combat.ts
git commit -m "feat: add combat skills (attackEntity, defendSelf)"
```

---

## Task 5: Create `bot/skills/gathering.ts` — Gathering Skills

**Files:**
- Create: `bot/skills/gathering.ts`

### Step 1: Write gathering skills

```typescript
// bot/skills/gathering.ts

import type { Skill, SkillContext } from './index';
import type { Vec3 } from 'vec3';
import { mcData } from 'mineflayer';

export function createGatherResourcesSkill(): Skill {
  return {
    name: 'gatherResources',
    description: 'Gather specified blocks or items from nearby area',
    cooldown: 5000,
    async execute({ bot }) {
      const targetNames = (bot as any)._gatherTargets as string[];
      const radius = (bot as any)._gatherRadius as number || 30;

      if (!targetNames?.length) return;

      // Scan for blocks within radius
      const blocks = findBlocks(bot, targetNames, radius);
      if (blocks.length === 0) return;

      // Visit each block
      for (const blockPos of blocks) {
        if (!isBlockSafe(bot, blockPos)) continue;

        bot.pathfinder.setGoal(new GoalBlock(blockPos.x, blockPos.y, blockPos.z), true);
        await waitForPathComplete(bot, 15000);

        // Mine the block
        const block = bot.blockAt(blockPos);
        if (block && block.name !== 'air') {
          await bot.dig(block);
          // Wait for block to become air
          await waitForCondition(() => {
            const b = bot.blockAt(blockPos);
            return !b || b.name === 'air';
          }, 5000, 200);
        }
      }
    },
  };
}

export function createPickupNearbyItemsSkill(): Skill {
  return {
    name: 'pickupNearbyItems',
    description: 'Pick up all items within 8 block radius',
    cooldown: 3000,
    async execute({ bot }) {
      const items = botEntitiesWhere(bot, (e) => e.type === 'object' && e.name === 'item');
      for (const item of items) {
        const pos = item.entity.position;
        bot.pathfinder.setGoal(new GoalFollow(item.entity, 1), true);
        await waitForPathComplete(bot, 10000);
      }
    },
  };
}

export function createMineBlockSkill(): Skill {
  return {
    name: 'mineBlock',
    description: 'Mine a specific block type at the nearest location',
    cooldown: 3000,
    async execute({ bot }) {
      const blockType = (bot as any)._mineBlockType as string;
      if (!blockType) return;

      const block = getNearestBlock(bot, blockType, 32);
      if (!block) return;

      bot.pathfinder.setGoal(new GoalBlock(block.position.x, block.position.y, block.position.z), true);
      await waitForPathComplete(bot, 10000);

      const b = bot.blockAt(block.position);
      if (b && b.name !== 'air') {
        await bot.dig(b);
      }
    },
  };
}

// --- Helpers ---

import { GoalBlock, GoalNear } from 'mineflayer-pathfinder';

function findBlocks(bot: any, blockNames: string[], maxDistance: number): Vec3[] {
  const results: Vec3[] = [];
  const pos = bot.entity.position;

  for (const name of blockNames) {
    // mineflayer-pathfinder provides bot.findBlock
    const block = bot.findBlock({
      matching: (b) => {
        // Handle ore variants
        if (name.includes('_ore')) {
          return b.name === name || b.name === name.replace('_ore', '');
        }
        return b.name === name;
      },
      maxDistance,
      minDistance: 1,
    });
    if (block) {
      results.push(block.position);
    }
  }
  return results;
}

function isBlockSafe(bot: any, pos: Vec3): boolean {
  const block = bot.blockAt(pos);
  if (!block) return true;
  const dangerous = ['lava', 'lava_stationary', 'fire', 'cactus', 'magma_block'];
  return !dangerous.includes(block.name);
}

function waitForCondition(
  condition: () => boolean,
  timeout: number,
  interval: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (condition()) { resolve(); return; }
      if (Date.now() - start > timeout) { reject(new Error('Timeout')); return; }
      setTimeout(check, interval);
    };
    check();
  });
}

function waitForPathComplete(bot: any, timeout: number): Promise<void> {
  return new Promise((resolve) => {
    bot.once('pathfinder_goal_reached', () => resolve());
    setTimeout(resolve, timeout);
  });
}

function botEntitiesWhere(bot: any, predicate: (e: any) => boolean): any[] {
  return bot.entities
    ? Object.values(bot.entities).filter((e: any) => predicate(e))
    : [];
}

function getNearestBlock(bot: any, blockType: string, maxDistance: number): any {
  return bot.findBlock({
    matching: (b) => b.name === blockType,
    maxDistance,
    minDistance: 1,
  });
}
```

### Step 2: Verify TypeScript compiles

Run: `npx tsc --noEmit`

### Step 3: Commit

```bash
git add bot/skills/gathering.ts
git commit -m "feat: add gathering skills (gatherResources, pickupNearbyItems, mineBlock)"
```

---

## Task 6: Create `bot/skills/building.ts` — Building Skills

**Files:**
- Create: `bot/skills/building.ts`

### Step 1: Write building skills

```typescript
// bot/skills/building.ts

import type { Skill, SkillContext } from './index';

export function createPlaceBlockSkill(): Skill {
  return {
    name: 'placeBlock',
    description: 'Place a block at a specific position',
    cooldown: 1000,
    async execute({ bot }) {
      const blockName = (bot as any)._placeBlockName as string;
      const targetPos = (bot as any)._placeBlockPos;
      if (!blockName || !targetPos) return;

      const block = bot.inventory.findInventoryItem(blockName, null);
      if (!block) return;

      const targetBlock = bot.blockAt(targetPos);
      if (targetBlock) {
        await bot.placeBlock(targetBlock, null);
      }
    },
  };
}

export function createBuildStructureSkill(): Skill {
  return {
    name: 'buildStructure',
    description: 'Build a hollow rectangular shell at offset from bot',
    cooldown: 10000,
    async execute({ bot }) {
      const params = (bot as any)._buildParams as {
        material: string;
        width?: number;
        length?: number;
        height?: number;
        offsetX?: number;
        offsetZ?: number;
        offsetY?: number;
      } | undefined;
      if (!params) return;

      const {
        material,
        width = 5,
        length = 5,
        height = 4,
        offsetX = 0,
        offsetZ = 0,
        offsetY = 0,
      } = params;

      const pos = bot.entity.position;

      for (let x = 0; x < width; x++) {
        for (let z = 0; z < length; z++) {
          for (let y = 0; y < height; y++) {
            // Only build edges (hollow shell)
            const isEdge = x === 0 || x === width - 1 || z === 0 || z === length - 1 || y === 0 || y === height - 1;
            if (!isEdge) continue;

            // Skip door opening
            if (y === 1 && z >= Math.floor(length / 2) && z <= Math.floor(length / 2) + 1) continue;

            const bx = Math.floor(pos.x) + offsetX + x;
            const by = Math.floor(pos.y) + offsetY + y;
            const bz = Math.floor(pos.z) + offsetZ + z;

            // Ensure block is in inventory
            const invBlock = bot.inventory.findInventoryItem(material, null);
            if (!invBlock) continue;

            const block = bot.blockAt(new (require('vec3'))(bx, by, bz));
            if (block) {
              await bot.placeBlock(block, null);
            }
          }
        }
      }
    },
  };
}

export function createCraftItemSkill(): Skill {
  return {
    name: 'craftItem',
    description: 'Craft an item using a nearby crafting table',
    cooldown: 5000,
    async execute({ bot }) {
      const itemName = (bot as any)._craftItemName as string;
      if (!itemName) return;

      // Find or place crafting table
      let table = bot.findBlock({
        matching: (b) => b.name === 'crafting_table',
        maxDistance: 16,
      });

      if (!table) {
        const woodenPlanks = bot.inventory.findInventoryItem('oak_planks', null);
        if (woodenPlanks) {
          // Place crafting table at bot feet
          const pos = bot.entity.position;
          const footBlock = bot.blockAt(new (require('vec3'))(Math.floor(pos.x), Math.floor(pos.y) - 1, Math.floor(pos.z)));
          if (footBlock) {
            await bot.placeBlock(footBlock, null);
            table = bot.findBlock({
              matching: (b) => b.name === 'crafting_table',
              maxDistance: 16,
            });
          }
        }
      }

      if (!table) return;

      // Get recipes
      const recipes = bot.recipesFor(itemName, null, 1, table);
      if (recipes.length === 0) return;

      await bot.craft(recipes[0], 1);
    },
  };
}
```

### Step 2: Verify TypeScript compiles

Run: `npx tsc --noEmit`

### Step 3: Commit

```bash
git add bot/skills/building.ts
git commit -m "feat: add building skills (placeBlock, buildStructure, craftItem)"
```

---

## Task 7: Create `bot/skills/survival.ts` — Survival Skills

**Files:**
- Create: `bot/skills/survival.ts`

### Step 1: Write survival skills

```typescript
// bot/skills/survival.ts

import type { Skill, SkillContext } from './index';

export function createEatSkill(): Skill {
  return {
    name: 'eat',
    description: 'Eat the best available food item from inventory',
    cooldown: 3000,
    async execute({ bot }) {
      const foodItems = [
        'cooked_beef', 'steak', 'cooked_porkchop', 'cooked_chicken',
        'bread', 'apple', 'cooked_mutton', 'cooked_rabbit',
      ];

      let bestFood = null;
      let bestHunger = 0;

      for (const name of foodItems) {
        const item = bot.inventory.findInventoryItem(name, null);
        if (item) {
          const hungerMap: Record<string, number> = {
            steak: 8, cooked_beef: 8, cooked_porkchop: 8, cooked_chicken: 6,
            bread: 5, apple: 4, cooked_mutton: 4, cooked_rabbit: 6,
          };
          if (hungerMap[name] > bestHunger) {
            bestHunger = hungerMap[name];
            bestFood = item;
          }
        }
      }

      if (bestFood) {
        await bot.consume();
      }
    },
  };
}

export function createPlaceTorchSkill(): Skill {
  return {
    name: 'placeTorch',
    description: 'Place a torch at current position if no light nearby',
    cooldown: 5000,
    async execute({ bot, world }) {
      if (world.lightLevel >= 7) return; // Don't place if already lit

      const torch = bot.inventory.findInventoryItem('torch', null);
      if (!torch) return;

      const pos = bot.entity.position;
      const footBlock = bot.blockAt(new (require('vec3'))(
        Math.floor(pos.x), Math.floor(pos.y) - 1, Math.floor(pos.z)
      ));
      if (footBlock) {
        await bot.placeBlock(footBlock, null);
      }
    },
  };
}

export function createFindSafeRetreatSkill(): Skill {
  return {
    name: 'findSafeRetreat',
    description: 'Find a safe retreat location (water > cave > tree > flee)',
    cooldown: 10000,
    async execute({ bot }) {
      const pos = bot.entity.position;

      // Priority 1: water nearby
      const water = bot.findBlock({
        matching: (b) => b.name === 'water' || b.name === 'water_stationary',
        maxDistance: 16,
      });
      if (water) {
        bot.pathfinder.setGoal(new GoalBlock(water.position.x, water.position.y, water.position.z), true);
        await waitForPathComplete(bot, 10000);
        return;
      }

      // Priority 2: cave / underground
      for (let y = Math.floor(pos.y); y > -64; y--) {
        const block = bot.blockAt(new (require('vec3'))(Math.floor(pos.x), y, Math.floor(pos.z)));
        if (block && block.name !== 'air' && !['stone', 'cobblestone', 'dirt', 'gravel'].includes(block.name)) {
          // Found cave entrance
          bot.pathfinder.setGoal(new GoalBlock(Math.floor(pos.x), y - 1, Math.floor(pos.z)), true);
          await waitForPathComplete(bot, 10000);
          return;
        }
      }

      // Priority 3: flee from hostiles
      const hostiles = getNearbyHostiles(bot);
      if (hostiles.length > 0) {
        const fleeGoal = new GoalBlock(
          Math.floor(pos.x) + (Math.random() > 0.5 ? 15 : -15),
          Math.floor(pos.y),
          Math.floor(pos.z) + (Math.random() > 0.5 ? 15 : -15),
        );
        bot.pathfinder.setGoal(fleeGoal, true);
        await waitForPathComplete(bot, 15000);
        return;
      }

      // Priority 4: random safe direction
      const randomGoal = new GoalBlock(
        Math.floor(pos.x) + Math.floor(Math.random() * 20 - 10),
        Math.floor(pos.y),
        Math.floor(pos.z) + Math.floor(Math.random() * 20 - 10),
      );
      bot.pathfinder.setGoal(randomGoal, true);
      await waitForPathComplete(bot, 15000);
    },
  };
}

// --- Helpers ---

import { GoalBlock } from 'mineflayer-pathfinder';

function waitForPathComplete(bot: any, timeout: number): Promise<void> {
  return new Promise((resolve) => {
    bot.once('pathfinder_goal_reached', () => resolve());
    setTimeout(resolve, timeout);
  });
}

function getNearbyHostiles(bot: any): any[] {
  const hostiles = [
    'zombie', 'skeleton', 'spider', 'creeper', 'enderman',
    'witch', 'slime', 'phantom', 'drowned', 'pillager',
    'ravager', 'vex', 'husk', 'stray',
  ];
  return Object.values(bot.entities || {}).filter((e: any) =>
    e.type === 'mob' && hostiles.includes(e.name)
  );
}
```

### Step 2: Verify TypeScript compiles

Run: `npx tsc --noEmit`

### Step 3: Commit

```bash
git add bot/skills/survival.ts
git commit -m "feat: add survival skills (eat, placeTorch, findSafeRetreat)"
```

---

## Task 8: Create `bot/skills/world-utils.ts` — World Utility Skills

**Files:**
- Create: `bot/skills/world-utils.ts`

### Step 1: Write world utility skills

```typescript
// bot/skills/world-utils.ts

import type { Skill, SkillContext } from './index';

export function createScanEntitiesSkill(): Skill {
  return {
    name: 'scanEntities',
    description: 'Scan for entities within given radius',
    cooldown: 2000,
    async execute({ bot }) {
      // This is a query skill - populates bot._scanResult
      const radius = (bot as any)._scanRadius as number || 16;
      const pos = bot.entity.position;
      const entities: string[] = [];
      const hostiles = [
        'zombie', 'skeleton', 'spider', 'creeper', 'enderman',
        'witch', 'slime', 'phantom', 'drowned', 'pillager',
        'ravager', 'vex', 'husk', 'stray',
      ];
      for (const [id, entity] of Object.entries(bot.entities || {})) {
        const e = entity as any;
        const dist = pos.distanceTo(e.position);
        if (dist <= radius) {
          entities.push(`${e.name}@${Math.floor(dist)}`);
        }
      }
      (bot as any)._scanResult = { entities, hostiles: entities.filter(e => hostiles.some(h => e.startsWith(h))) };
    },
  };
}

export function createCheckHealthSkill(): Skill {
  return {
    name: 'checkHealth',
    description: 'Check current health and hunger status',
    cooldown: 1000,
    async execute({ bot }) {
      (bot as any)._healthResult = {
        health: bot.health,
        maxHealth: bot.maxHealth,
        food: bot.food,
        hunger: bot.foodSaturation,
      };
    },
  };
}

export function createLookForItemSkill(): Skill {
  return {
    name: 'lookForItem',
    description: 'Look for a specific item in inventory',
    cooldown: 1000,
    async execute({ bot }) {
      const itemName = (bot as any)._lookForItemName as string;
      if (!itemName) return;
      const item = bot.inventory.findInventoryItem(itemName, null);
      (bot as any)._itemResult = {
        found: !!item,
        count: item?.count || 0,
        slots: item ? [item.slot] : [],
      };
    },
  };
}

export function createFindBlockSkill(): Skill {
  return {
    name: 'findBlock',
    description: 'Find nearest block of given type',
    cooldown: 2000,
    async execute({ bot }) {
      const blockType = (bot as any)._findBlockType as string;
      const radius = (bot as any)._findBlockRadius as number || 32;
      if (!blockType) return;
      const block = bot.findBlock({
        matching: (b) => b.name === blockType,
        maxDistance: radius,
        minDistance: 1,
      });
      (bot as any)._blockResult = block
        ? { found: true, position: block.position, name: block.name }
        : { found: false };
    },
  };
}
```

### Step 2: Verify TypeScript compiles

Run: `npx tsc --noEmit`

### Step 3: Commit

```bash
git add bot/skills/world-utils.ts
git commit -m "feat: add world utility skills (scanEntities, checkHealth, lookForItem, findBlock)"
```

---

## Task 9: Create `bot/engine/mode-controller.ts` — Mode Controller

**Files:**
- Create: `bot/engine/mode-controller.ts`

### Step 1: Write the mode controller

```typescript
// bot/engine/mode-controller.ts

import type { Bot } from 'mineflayer';
import { Logger } from '../logger';

export interface Mode {
  name: string;
  priority: number;  // lower = higher priority
  description: string;
  tickRate?: number;
  isEventDriven?: boolean;
  on?(bot: Bot): void;
  onUpdate?(bot: Bot, delta: number): boolean;  // true = stay active
  onEvent?(bot: Bot, event: { type: string; data?: Record<string, unknown> }): void;
  off?(bot: Bot): void;
}

export class ModeController {
  private modes: Map<string, Mode> = new Map();
  private activeMode: Mode | null = null;
  private pausedMode: Mode | null = null;
  private tickInterval: NodeJS.Timeout | null = null;
  private lastTick = Date.now();
  private behaviorLog: string[] = [];
  private bot: Bot;
  private logger: Logger;

  constructor(bot: Bot, logger: Logger) {
    this.bot = bot;
    this.logger = logger;
  }

  register(mode: Mode): void {
    this.modes.set(mode.name, mode);
  }

  registerAll(modes: Mode[]): void {
    for (const mode of modes) {
      this.register(mode);
    }
  }

  start(tickRate: number = 300): void {
    this.tickInterval = setInterval(() => this.tick(tickRate), tickRate);
    this.logger.debug(`ModeController started with ${tickRate}ms tick`);
  }

  stop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    // Clean up active mode
    if (this.activeMode?.off) {
      this.activeMode.off(this.bot);
      this.activeMode = null;
    }
    // Clean up paused mode
    if (this.pausedMode?.off) {
      this.pausedMode.off(this.bot);
      this.pausedMode = null;
    }
    this.pausedMode = null;
  }

  pause(name: string): void {
    const mode = this.modes.get(name);
    if (mode && this.activeMode?.name === name) {
      if (mode.off) mode.off(this.bot);
      this.pausedMode = mode;
      this.activeMode = null;
      this.log(`Paused mode: ${name}`);
    }
  }

  unpause(): void {
    if (this.pausedMode) {
      if (this.pausedMode.on) this.pausedMode.on(this.bot);
      this.activeMode = this.pausedMode;
      this.pausedMode = null;
      this.log(`Unpaused mode: ${this.activeMode!.name}`);
    }
  }

  isOn(name: string): boolean {
    return this.modes.has(name);
  }

  setActiveMode(name: string): void {
    // Used by commands to directly activate a mode
    if (this.activeMode?.off) {
      this.activeMode.off(this.bot);
    }
    const mode = this.modes.get(name);
    if (mode) {
      if (mode.on) mode.on(this.bot);
      this.activeMode = mode;
      this.log(`Manual activation: ${name}`);
    }
  }

  flushBehaviorLog(): string {
    const log = this.behaviorLog.join('\n');
    this.behaviorLog = [];
    return log;
  }

  private log(message: string): void {
    this.behaviorLog.push(message);
    if (this.behaviorLog.length > 500) {
      this.behaviorLog = this.behaviorLog.slice(-200);
    }
  }

  private tick(delta: number): void {
    const now = Date.now();
    const timeSinceLast = now - this.lastTick;
    this.lastTick = now;

    // If idle (no active mode and no paused mode), un-pause all
    const isIdle = !this.activeMode && !this.pausedMode;
    if (isIdle) {
      this.unpause();  // Reset paused state
    }

    // Collect all active modes from this tick
    let newActive: Mode | null = null;

    // Sort modes by priority (lower number = higher priority)
    const sorted = Array.from(this.modes.values())
      .filter(m => !m.isEventDriven)
      .sort((a, b) => a.priority - b.priority);

    for (const mode of sorted) {
      if (mode.name === this.pausedMode?.name) continue;
      if (mode.name === newActive?.name) continue;

      const modeActive = this.activeMode?.name === mode.name;
      const interruptCurrent = mode.priority < (this.activeMode?.priority ?? Infinity);

      if (isIdle || interruptCurrent) {
        const result = mode.onUpdate?.(this.bot, timeSinceLast);
        if (result === true) {
          newActive = mode;
          break;
        }
      }
    }

    // Switch active mode if changed
    if (newActive && newActive !== this.activeMode) {
      if (this.activeMode?.off) {
        this.activeMode.off(this.bot);
      }
      if (newActive.on) {
        newActive.on(this.bot);
      }
      this.activeMode = newActive;
    }

    // Keep running current mode's onUpdate
    if (this.activeMode) {
      const keepGoing = this.activeMode.onUpdate?.(this.bot, timeSinceLast);
      if (keepGoing === false) {
        if (this.activeMode.off) this.activeMode.off(this.bot);
        this.activeMode = null;
      }
    }
  }

  emitEvent(event: { type: string; data?: Record<string, unknown> }): void {
    for (const mode of this.modes.values()) {
      if (mode.isEventDriven && mode.onEvent) {
        mode.onEvent(this.bot, event);
      }
    }
  }
}
```

### Step 2: Verify TypeScript compiles

Run: `npx tsc --noEmit`

### Step 3: Commit

```bash
git add bot/engine/mode-controller.ts
git commit -m "feat: add ModeController for reactive mode system"
```

---

## Task 10: Create `bot/engine/modes/base.ts` + All Mode Implementations

**Files:**
- Create: `bot/engine/modes/base.ts`
- Create: `bot/engine/modes/self-preservation.ts`
- Create: `bot/engine/modes/unstuck.ts`
- Create: `bot/engine/modes/self-defense.ts`
- Create: `bot/engine/modes/hunting.ts`
- Create: `bot/engine/modes/item-collecting.ts`
- Create: `bot/engine/modes/torch-placing.ts`
- Create: `bot/engine/modes/building.ts`
- Create: `bot/engine/modes/idle.ts`

### Step 1: Write base.ts

```typescript
// bot/engine/modes/base.ts

import type { Mode } from '../mode-controller';

export abstract class BaseMode implements Mode {
  abstract get name(): string;
  abstract get priority(): number;
  abstract get description(): string;
  tickRate = 300;
  isEventDriven = false;

  on?(): void {}
  off?(): void {}
  abstract onUpdate(bot: any, delta: number): boolean;
}
```

### Step 2: Write self-preservation.ts

```typescript
// bot/engine/modes/self-preservation.ts

import { BaseMode } from './base';
import { Vec3 } from 'vec3';

export class SelfPreservationMode extends BaseMode {
  get name() { return 'self_preservation'; }
  get priority() { return 0; }
  get description() { return 'Respond to drowning, burning, lava, and critical health. Interrupts all actions.'; }

  onUpdate(bot: any, delta: number): boolean {
    const pos = bot.entity.position;
    const blockAtFeet = bot.blockAt(pos);
    const blockAtHead = bot.blockAt(new Vec3(pos.x, pos.y + 1, pos.z));

    // Drowning: no air above head
    if (blockAtHead?.name === 'water' || blockAtHead?.name === 'water_stationary') {
      // Swim up
      const upGoal = bot.pathfinder.goto(new GoalBlock(pos.x, pos.y + 2, pos.z));
      bot.pathfinder.setGoal(upGoal);
      return true;
    }

    // Burning: on fire or in lava/fire
    if (bot.status?.onFire || blockAtFeet?.name === 'lava' || blockAtFeet?.name === 'lava_stationary' || blockAtFeet?.name === 'fire') {
      // Find water or move to safe spot
      const water = bot.findBlock({ matching: (b) => b.name === 'water', maxDistance: 16 });
      if (water) {
        bot.pathfinder.setGoal(new GoalBlock(water.position.x, water.position.y, water.position.z), true);
      } else {
        bot.pathfinder.setGoal(new GoalBlock(pos.x + 10, pos.y, pos.z + 10), true);
      }
      return true;
    }

    // Critical health: eat or find shelter
    if (bot.health !== undefined && bot.health <= 5) {
      // Try to eat first
      const food = ['apple', 'bread', 'cooked_beef', 'cooked_porkchop'].find(
        (name) => bot.inventory.findInventoryItem(name, null)
      );
      if (food) {
        bot.consume();
      } else {
        // Find shelter
        bot.pathfinder.setGoal(new GoalBlock(pos.x + 10, pos.y, pos.z + 10), true);
      }
      return true;
    }

    // Fall into void
    if (pos.y < -60) {
      bot.pathfinder.setGoal(new GoalBlock(pos.x, 64, pos.z), true);
      return true;
    }

    return false;
  }
}

import { GoalBlock } from 'mineflayer-pathfinder';
```

### Step 3: Write unstuck.ts

```typescript
// bot/engine/modes/unstuck.ts

import { BaseMode } from './base';

export class UnstuckMode extends BaseMode {
  get name() { return 'unstuck'; }
  get priority() { return 1; }
  get description() { return 'Detect if bot has been stuck (no movement for 20s) and call moveAway.'; }

  private lastX = 0;
  private lastZ = 0;
  private noMoveFrames = 0;

  onUpdate(bot: any, delta: number): boolean {
    const pos = bot.entity.position;

    if (Math.abs(pos.x - this.lastX) > 0.1 || Math.abs(pos.z - this.lastZ) > 0.1) {
      this.noMoveFrames = 0;
      this.lastX = pos.x;
      this.lastZ = pos.z;
      return false;
    }

    this.noMoveFrames += delta / 1000;

    if (this.noMoveFrames >= 20) {
      // Move away in random direction
      const angle = Math.random() * Math.PI * 2;
      const dist = 5 + Math.random() * 5;
      const goal = new GoalBlock(
        Math.floor(pos.x + Math.cos(angle) * dist),
        Math.floor(pos.y),
        Math.floor(pos.z + Math.sin(angle) * dist),
      );
      bot.pathfinder.setGoal(goal, true);
      return true;
    }

    return false;
  }
}

import { GoalBlock } from 'mineflayer-pathfinder';
```

### Step 4: Write self-defense.ts

```typescript
// bot/engine/modes/self-defense.ts

import { BaseMode } from './base';

export class SelfDefenseMode extends BaseMode {
  get name() { return 'self_defense'; }
  get priority() { return 2; }
  get description() { return 'Attack hostile entities within 8-block range with clear path.'; }

  private cooldown = 0;

  onUpdate(bot: any, delta: number): boolean {
    this.cooldown -= delta;
    if (this.cooldown > 0) return true;

    const hostiles = getNearbyHostiles(bot, 8);
    if (hostiles.length === 0) return false;

    // Equip best weapon
    const weapon = bot.inventory.slots.find((s: any) =>
      s && ['/sword$/.test(s.name)]
    );
    // Attack nearest hostile
    const target = hostiles[0];
    if (target) {
      bot.pvp.attack(target);
      this.cooldown = 2000;
    }

    return true;
  }
}

function getNearbyHostiles(bot: any, range: number) {
  const pos = bot.entity.position;
  const hostiles = [
    'zombie', 'skeleton', 'spider', 'creeper', 'enderman',
    'witch', 'slime', 'phantom', 'drowned', 'pillager',
  ];
  return Object.values(bot.entities || [])
    .filter((e: any) => {
      if (e.type !== 'mob') return false;
      if (!hostiles.includes(e.name)) return false;
      const dist = pos.distanceTo(e.position);
      return dist <= range;
    })
    .sort((a: any, b: any) => a.position.distanceTo(pos) - b.position.distanceTo(pos));
}

import { GoalBlock } from 'mineflayer-pathfinder';
```

### Step 5: Write hunting.ts

```typescript
// bot/engine/modes/hunting.ts

import { BaseMode } from './base';

export class HuntingMode extends BaseMode {
  get name() { return 'hunting'; }
  get priority() { return 3; }
  get description() { return 'Hunt nearby huntable animals when idle.'; }

  private cooldown = 0;

  onUpdate(bot: any, delta: number): boolean {
    this.cooldown -= delta;
    if (this.cooldown > 0) return true;

    const huntable = ['cow', 'pig', 'chicken', 'sheep', 'rabbit'].filter((type) => {
      return Object.values(bot.entities || {}).some((e: any) =>
        e.type === 'mob' && e.name === type && bot.entity.position.distanceTo(e.position) <= 16
      );
    });

    if (huntable.length > 0) {
      const target = Object.values(bot.entities || {}).find((e: any) =>
        e.type === 'mob' && huntable.includes(e.name) && bot.entity.position.distanceTo(e.position) <= 16
      );
      if (target) {
        bot.pathfinder.setGoal(new GoalBlock(target.position.x, target.position.y, target.position.z), true);
        this.cooldown = 5000;
        return true;
      }
    }

    return false;
  }
}

import { GoalBlock } from 'mineflayer-pathfinder';
```

### Step 6: Write item-collecting.ts

```typescript
// bot/engine/modes/item-collecting.ts

import { BaseMode } from './base';

export class ItemCollectingMode extends BaseMode {
  get name() { return 'item_collecting'; }
  get priority() { return 4; }
  get description() { return 'Collect nearby items when idle.'; }

  private lastCollect = 0;

  onUpdate(bot: any, delta: number): boolean {
    const now = Date.now();
    if (now - this.lastCollect < 2000) return true; // 2s debounce

    const items = Object.values(bot.entities || [])
      .filter((e: any) => e.type === 'object' && e.name === 'item')
      .filter((e: any) => bot.entity.position.distanceTo(e.position) <= 8);

    if (items.length === 0) return false;

    const target = items[0];
    bot.pathfinder.setGoal(new GoalBlock(target.position.x, target.position.y, target.position.z), true);
    this.lastCollect = now;
    return true;
  }
}

import { GoalBlock } from 'mineflayer-pathfinder';
```

### Step 7: Write torch-placing.ts

```typescript
// bot/engine/modes/torch-placing.ts

import { BaseMode } from './base';

export class TorchPlacingMode extends BaseMode {
  get name() { return 'torch_placing'; }
  get priority() { return 5; }
  get description() { return 'Place torches when nearby light level is too low.'; }

  private lastPlace = 0;

  onUpdate(bot: any, delta: number): boolean {
    const now = Date.now();
    if (now - this.lastPlace < 5000) return true;

    // Check light level
    const blockAtFeet = bot.blockAt(bot.entity.position);
    const lightLevel = blockAtFeet?.light?.blockLight ?? 0;

    if (lightLevel >= 7) return false;

    // Place torch if we have torches
    const torch = bot.inventory.findInventoryItem('torch', null);
    if (!torch) return false;

    const pos = bot.entity.position;
    const footBlock = bot.blockAt(new (require('vec3').Vec3)(Math.floor(pos.x), Math.floor(pos.y) - 1, Math.floor(pos.z)));
    if (footBlock) {
      bot.placeBlock(footBlock, null);
      this.lastPlace = now;
    }

    return true;
  }
}
```

### Step 8: Write building.ts

```typescript
// bot/engine/modes/building.ts

import { BaseMode } from './base';

export class BuildingMode extends BaseMode {
  get name() { return 'building'; }
  get priority() { return 6; }
  get description() { return 'Build structures when activated by command.'; }
  isEventDriven = true;

  private building = false;
  private buildQueue: { material: string; width: number; length: number; height: number; offsetX: number; offsetZ: number; offsetY: number }[] = [];
  private currentBuild: typeof this.buildQueue[number] | null = null;

  onEvent(bot: any, event: { type: string; data?: Record<string, unknown> }): void {
    if (event.type === 'build_start' && event.data) {
      this.building = true;
      this.buildQueue.push(event.data as any);
      if (!this.currentBuild) {
        this.processNextBuild(bot);
      }
    }
  }

  private processNextBuild(bot: any): void {
    if (this.buildQueue.length === 0) {
      this.building = false;
      this.currentBuild = null;
      return;
    }
    this.currentBuild = this.buildQueue.shift()!;
    // Build is handled by the command that activated this mode
    // This mode just stays active while building
  }

  onUpdate(bot: any, delta: number): boolean {
    return this.building;
  }

  off(bot: any): void {
    this.building = false;
    this.buildQueue = [];
    this.currentBuild = null;
  }
}
```

### Step 9: Write idle.ts

```typescript
// bot/engine/modes/idle.ts

import { BaseMode } from './base';

export class IdleMode extends BaseMode {
  get name() { return 'idle'; }
  get priority() { return 7; }
  get description() { return 'Default fallback mode - no action.'; }

  onUpdate(bot: any, delta: number): boolean {
    return false;  // Always returns false - just a placeholder
  }
}
```

### Step 10: Verify TypeScript compiles

Run: `npx tsc --noEmit`

### Step 11: Commit

```bash
git add bot/engine/modes/ bot/engine/mode-controller.ts
git commit -m "feat: add all reactive modes and base mode class"
```

---

## Task 11: Create `bot/commands/index.ts` — Command Interface + Registry

**Files:**
- Create: `bot/commands/index.ts`

### Step 1: Write the command registry

```typescript
// bot/commands/index.ts

import type { Bot } from 'mineflayer';
import type { SkillRegistry } from '../skills/index';
import type { ModeController } from '../engine/mode-controller';
import type { WorldState } from '../types';

export interface Command {
  name: string;
  prompt: string;           // Full format for LLM: "!build a house"
  description: string;      // Description for LLM
  paramSchema?: Record<string, { type: string; description: string }>;
  execute(params: Record<string, string>, ctx: CommandContext): Promise<string | undefined>;
}

export interface CommandContext {
  bot: Bot;
  world: WorldState;
  skillRegistry: SkillRegistry;
  modeController: ModeController;
}

export class CommandRegistry {
  private commands = new Map<string, Command>();

  register(cmd: Command): void {
    this.commands.set(cmd.name, cmd);
  }

  getAllPromptText(): string {
    return Array.from(this.commands.values())
      .map(cmd => `${cmd.prompt} - ${cmd.description}`)
      .join('\n');
  }

  getByName(name: string): Command | undefined {
    return this.commands.get(name);
  }

  async execute(name: string, rawParams: string, ctx: CommandContext): Promise<string> {
    const cmd = this.commands.get(name);
    if (!cmd) {
      return `Unknown command: ${name}`;
    }
    try {
      const result = await cmd.execute({}, ctx);
      return result || 'Command executed successfully.';
    } catch (err) {
      return `Command error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  parseCommandMessage(message: string): { name: string; params: string } | null {
    const match = message.match(/!(\w+)(?:\(([^)]*)\))?/);
    if (!match) return null;
    return {
      name: match[1],
      params: match[2] || '',
    };
  }
}
```

### Step 2: Verify TypeScript compiles

Run: `npx tsc --noEmit`

### Step 3: Commit

```bash
git add bot/commands/index.ts
git commit -m "feat: add command interface and CommandRegistry"
```

---

## Task 12: Create `bot/commands/action-commands.ts` — Action Commands

**Files:**
- Create: `bot/commands/action-commands.ts`

### Step 1: Write action commands

```typescript
// bot/commands/action-commands.ts

import type { Command, CommandContext } from './index';

export const actionCommands: Command[] = [
  {
    name: 'build',
    prompt: '!build <material> <width> <length> <height>',
    description: 'Build a hollow rectangular shell with given dimensions',
    execute(params, ctx) {
      const { bot, modeController } = ctx;
      const material = params.material || 'cobblestone';
      const width = parseInt(params.width || '5', 10);
      const length = parseInt(params.length || '5', 10);
      const height = parseInt(params.height || '4', 10);

      // Set bot flag for building mode to read
      (bot as any)._buildParams = { material, width, length, height };
      modeController.setActiveMode('building');
      // Emit event for building mode
      modeController.emitEvent({ type: 'build_start', data: { material, width, length, height } });
      return `Starting build: ${material} ${width}x${length}x${height}`;
    },
  },
  {
    name: 'craft',
    prompt: '!craft <item_name> [quantity]',
    description: 'Craft an item using a nearby crafting table',
    execute(params, ctx) {
      const { bot } = ctx;
      (bot as any)._craftItemName = params.item_name || params['item-name'] || 'stick';
      return `Crafting: ${bot as any]._craftItemName}`;
    },
  },
  {
    name: 'attack',
    prompt: '!attack <entity_name>',
    description: 'Attack a specific entity by name',
    execute(params, ctx) {
      const { bot } = ctx;
      (bot as any)._attackTarget = params.entity_name || params.entity;
      return `Attacking: ${params.entity_name || params.entity}`;
    },
  },
  {
    name: 'goTo',
    prompt: '!goTo <x> <y> <z>',
    description: 'Move to given coordinates',
    execute(params, ctx) {
      const { bot } = ctx;
      const x = parseFloat(params.x || '0');
      const y = parseFloat(params.y || '0');
      const z = parseFloat(params.z || '0');
      (bot as any)._moveToGoal = new (require('mineflayer-pathfinder').GoalBlock)(Math.floor(x), Math.floor(y), Math.floor(z));
      return `Moving to: ${x}, ${y}, ${z}`;
    },
  },
  {
    name: 'gather',
    prompt: '!gather <block_type> [radius]',
    description: 'Gather specified blocks from nearby area',
    execute(params, ctx) {
      const { bot } = ctx;
      (bot as any)._gatherTargets = [params.block_type || params.type || 'cobblestone'];
      (bot as any)._gatherRadius = parseInt(params.radius || '30', 10);
      return `Gathering: ${params.block_type || params.type}`;
    },
  },
];
```

### Step 2: Verify TypeScript compiles

Run: `npx tsc --noEmit`

### Step 3: Commit

```bash
git add bot/commands/action-commands.ts
git commit -m "feat: add action commands (build, craft, attack, goTo, gather)"
```

---

## Task 13: Create `bot/commands/query-commands.ts` and `bot/commands/control-commands.ts`

**Files:**
- Create: `bot/commands/query-commands.ts`
- Create: `bot/commands/control-commands.ts`

### Step 1: Write query commands

```typescript
// bot/commands/query-commands.ts

import type { Command, CommandContext } from './index';

export const queryCommands: Command[] = [
  {
    name: 'status',
    prompt: '!status',
    description: 'Get current bot status (position, health, hunger, time, weather, active mode)',
    execute(_params, ctx) {
      const { bot } = ctx;
      const pos = bot.entity.position;
      return `Status: pos=(${pos.x.toFixed(1)},${pos.y.toFixed(1)},${pos.z.toFixed(1)}) health=${bot.health}/${bot.maxHealth} food=${bot.food}/${bot.foodSaturation} mode=idle`;
    },
  },
  {
    name: 'inventory',
    prompt: '!inventory',
    description: 'List all items in current inventory',
    execute(_params, ctx) {
      const { bot } = ctx;
      const counts: Record<string, number> = {};
      for (const slot of bot.inventory.slots) {
        if (slot) {
          counts[slot.name] = (counts[slot.name] || 0) + slot.count;
        }
      }
      return `Inventory: ${JSON.stringify(counts)}`;
    },
  },
  {
    name: 'entities',
    prompt: '!entities [radius]',
    description: 'List nearby entities',
    execute(_params, ctx) {
      const { bot } = ctx;
      const pos = bot.entity.position;
      const nearby: string[] = [];
      for (const [id, entity] of Object.entries(bot.entities || {})) {
        const e = entity as any;
        const dist = pos.distanceTo(e.position);
        if (dist <= 32) {
          nearby.push(`${e.name}@${Math.floor(dist)}m`);
        }
      }
      return `Entities: ${nearby.join(', ') || 'none'}`;
    },
  },
  {
    name: 'nearby',
    prompt: '!nearby [radius]',
    description: 'List nearby block types',
    execute(_params, ctx) {
      const { bot } = ctx;
      const pos = bot.entity.position;
      const blocks = new Set<string>();
      for (let dx = -4; dx <= 4; dx++) {
        for (let dy = -2; dy <= 3; dy++) {
          for (let dz = -4; dz <= 4; dz++) {
            const block = bot.blockAt(pos.offset(dx, dy, dz));
            if (block && block.name !== 'air') {
              blocks.add(block.name);
            }
          }
        }
      }
      return `Nearby blocks: ${Array.from(blocks).join(', ')}`;
    },
  },
];
```

### Step 2: Write control commands

```typescript
// bot/commands/control-commands.ts

import type { Command, CommandContext } from './index';

export const controlCommands: Command[] = [
  {
    name: 'startAuto',
    prompt: '!startAuto',
    description: 'Start the autonomous behavior system',
    execute(_params, ctx) {
      // This will be wired up by the Agent class
      return 'Auto behavior started.';
    },
  },
  {
    name: 'stopAuto',
    prompt: '!stopAuto',
    description: 'Stop the autonomous behavior system',
    execute(_params, ctx) {
      ctx.modeController.stop();
      return 'Auto behavior stopped.';
    },
  },
  {
    name: 'pause',
    prompt: '!pause',
    description: 'Pause current mode',
    execute(_params, ctx) {
      ctx.modeController.pause(ctx.modeController as any);
      return 'Current mode paused.';
    },
  },
  {
    name: 'resume',
    prompt: '!resume',
    description: 'Resume paused mode',
    execute(_params, ctx) {
      ctx.modeController.unpause();
      return 'Mode resumed.';
    },
  },
  {
    name: 'setMode',
    prompt: '!setMode <mode_name> <on|off>',
    description: 'Enable or disable a specific mode',
    execute(params, ctx) {
      // Mode enable/disable will be managed externally
      return `Mode ${params.mode_name} toggled.`;
    },
  },
];
```

### Step 3: Verify TypeScript compiles

Run: `npx tsc --noEmit`

### Step 4: Commit

```bash
git add bot/commands/query-commands.ts bot/commands/control-commands.ts
git commit -m "feat: add query and control commands"
```

---

## Task 14: Create `bot/self-prompter.ts` — Self-Prompter

**Files:**
- Create: `bot/self-prompter.ts`

### Step 1: Write the self-prompter

```typescript
// bot/self-prompter.ts

import type { Bot } from 'mineflayer';
import type { CommandRegistry } from './commands/index';
import type { GoalManager } from './goal-manager';
import { Logger } from './logger';

export enum SelfPrompterState { STOPPED = 0, ACTIVE = 1, PAUSED = 2 }

export class SelfPrompter {
  state: SelfPrompterState = SelfPrompterState.STOPPED;
  private loopActive = false;
  private interrupt = false;
  private prompt = '';
  private idleTime = 0;
  private cooldown = 2000;
  private maxFailedAttempts = 3;
  private bot: Bot;
  private commandRegistry: CommandRegistry;
  private goalManager: GoalManager;
  private logger: Logger;

  constructor(bot: Bot, commandRegistry: CommandRegistry, goalManager: GoalManager, logger: Logger) {
    this.bot = bot;
    this.commandRegistry = commandRegistry;
    this.goalManager = goalManager;
    this.logger = logger;
  }

  start(prompt: string): void {
    this.state = SelfPrompterState.ACTIVE;
    this.prompt = prompt;
    this.interrupt = false;
    this.startLoop();
  }

  stop(): void {
    this.state = SelfPrompterState.STOPPED;
    this.loopActive = false;
    this.interrupt = true;
    this.prompt = '';
  }

  pause(): void {
    this.state = SelfPrompterState.PAUSED;
    this.interrupt = true;
  }

  resume(): void {
    if (this.state === SelfPrompterState.PAUSED) {
      this.state = SelfPrompterState.ACTIVE;
      this.interrupt = false;
      this.startLoop();
    }
  }

  private async startLoop(): void {
    this.loopActive = true;
    let noCommandCount = 0;

    while (this.loopActive && !this.interrupt) {
      const promptText = `You are self-prompting with the goal: "${this.prompt}". Your next response MUST contain a command with this syntax: !commandName. Respond:`;

      // Get world context from goal manager
      const context = this.goalManager.toContextString();

      // Build the LLM prompt
      const llmPrompt = `${promptText}\n\nContext: ${context}\n\nAvailable commands:\n${this.commandRegistry.getAllPromptText()}\n\nResponse:`;

      // Call LLM (TODO: integrate with actual vLLM endpoint)
      const response = await this.callLLM(llmPrompt);

      // Check if response contains a command
      const cmdMatch = response.match(/!(\w+)(?:\(([^)]*)\))?/);
      if (!cmdMatch) {
        noCommandCount++;
        this.logger.warn(`Self-prompter: no command in response (${noCommandCount}/${this.maxFailedAttempts})`);
        if (noCommandCount >= this.maxFailedAttempts) {
          this.logger.warn('Self-prompter: max failed attempts reached, stopping.');
          this.state = SelfPrompterState.STOPPED;
          this.loopActive = false;
          break;
        }
      } else {
        noCommandCount = 0;
        const cmdName = cmdMatch[1];
        const rawParams = cmdMatch[2] || '';

        this.logger.info(`Self-prompter: executing !${cmdName} (${rawParams})`);
        const result = await this.commandRegistry.execute(cmdName, rawParams, {
          bot: this.bot,
          world: {} as any,  // Filled by Agent
          skillRegistry: {} as any,  // Filled by Agent
          modeController: {} as any,  // Filled by Agent
        });
        this.logger.debug(`Self-prompter: result = ${result}`);
      }

      // Wait before next prompt
      await new Promise(r => setTimeout(r, this.cooldown));
    }

    this.loopActive = false;
    this.interrupt = false;
  }

  private async callLLM(prompt: string): Promise<string> {
    // TODO: Replace with actual vLLM call
    // const response = await fetch(process.env.VLLM_URL + '/v1/completions', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({
    //     model: process.env.LLM_MODEL || 'Qwen/Qwen3.6-35B-A3B-FP8',
    //     prompt,
    //     max_tokens: 200,
    //     temperature: 0.7,
    //   }),
    // });
    // const data = await response.json();
    // return data.choices?.[0]?.text || '';

    // Placeholder: return empty string (will trigger fail count)
    return '';
  }

  update(delta: number): void {
    // Auto-restart when idle
    if (this.state === SelfPrompterState.ACTIVE && !this.loopActive && !this.interrupt) {
      // Check if bot is idle (no active mode action)
      this.idleTime += delta;
      if (this.idleTime >= this.cooldown) {
        this.idleTime = 0;
        this.startLoop();
      }
    }
  }
}
```

### Step 2: Verify TypeScript compiles

Run: `npx tsc --noEmit`

### Step 3: Commit

```bash
git add bot/self-prompter.ts
git commit -m "feat: add SelfPrompter for autonomous LLM goal loop"
```

---

## Task 15: Create `bot/goal-manager.ts` — Goal Manager

**Files:**
- Create: `bot/goal-manager.ts`

### Step 1: Write the goal manager

```typescript
// bot/goal-manager.ts

import { Logger } from './logger';

export type GoalState = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'FAILED';
export type GoalType = 'SELF_PROMPTER' | 'COMMAND' | 'MANUAL';

export interface Goal {
  id: string;
  name: string;
  description: string;
  state: GoalState;
  type: GoalType;
  createdAt: number;
  completedAt?: number;
  commands?: string[];
  result?: string;
}

export interface GoalParams {
  name: string;
  description: string;
  type: GoalType;
  commands?: string[];
}

export class GoalManager {
  private goals = new Map<string, Goal>();
  private activeGoals = new Set<string>();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  create(type: GoalType, params: GoalParams): Goal {
    const id = `goal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const goal: Goal = {
      id,
      name: params.name,
      description: params.description,
      state: type === 'SELF_PROMPTER' ? 'ACTIVE' : 'ACTIVE',
      type,
      createdAt: Date.now(),
      commands: params.commands,
    };
    this.goals.set(id, goal);
    this.activeGoals.add(id);
    this.logger.info(`Goal created: ${goal.name} (${id})`);
    return goal;
  }

  complete(id: string, result?: string): void {
    const goal = this.goals.get(id);
    if (goal) {
      goal.state = 'COMPLETED';
      goal.completedAt = Date.now();
      goal.result = result;
      this.activeGoals.delete(id);
      this.logger.info(`Goal completed: ${goal.name}`);
    }
  }

  fail(id: string, reason?: string): void {
    const goal = this.goals.get(id);
    if (goal) {
      goal.state = 'FAILED';
      goal.result = reason;
      this.activeGoals.delete(id);
      this.logger.info(`Goal failed: ${goal.name} (${reason})`);
    }
  }

  getActive(): Goal[] {
    return Array.from(this.activeGoals)
      .map(id => this.goals.get(id))
      .filter((g): g is Goal => !!g);
  }

  getHistory(): Goal[] {
    return Array.from(this.goals.values())
      .filter(g => g.state === 'COMPLETED' || g.state === 'FAILED')
      .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  }

  toContextString(): string {
    const active = this.getActive();
    const recentHistory = this.getHistory().slice(0, 5);

    let ctx = '';
    if (active.length > 0) {
      ctx += 'Active goals:\n';
      for (const g of active) {
        ctx += `  - ${g.name}: ${g.description}\n`;
      }
    }
    if (recentHistory.length > 0) {
      ctx += '\nRecent completed goals:\n';
      for (const g of recentHistory) {
        const status = g.state === 'COMPLETED' ? 'completed' : 'failed';
        const result = g.result ? ` (${g.result})` : '';
        ctx += `  - ${g.name}: ${status}${result}\n`;
      }
    }

    return ctx || 'No active or recent goals.';
  }
}
```

### Step 2: Verify TypeScript compiles

Run: `npx tsc --noEmit`

### Step 3: Commit

```bash
git add bot/goal-manager.ts
git commit -m "feat: add GoalManager for goal tracking and context generation"
```

---

## Task 16: Create `bot/engine/index.ts` — Agent (Layer Assembly)

**Files:**
- Create: `bot/engine/index.ts`

### Step 1: Write the Agent class

```typescript
// bot/engine/index.ts

import type { Bot } from 'mineflayer';
import type { WorldState, Inventory, AssessmentResult } from '../types';
import { ModeController } from './mode-controller';
import { SkillRegistry } from '../skills/index';
import { CommandRegistry } from '../commands/index';
import { SelfPrompter } from '../self-prompter';
import { GoalManager } from '../goal-manager';
import { Logger } from '../logger';
import { SelfPreservationMode } from './modes/self-preservation';
import { UnstuckMode } from './modes/unstuck';
import { SelfDefenseMode } from './modes/self-defense';
import { HuntingMode } from './modes/hunting';
import { ItemCollectingMode } from './modes/item-collecting';
import { TorchPlacingMode } from './modes/torch-placing';
import { BuildingMode } from './modes/building';
import { IdleMode } from './modes/idle';

export class Agent {
  private modeController: ModeController;
  private skillRegistry: SkillRegistry;
  private commandRegistry: CommandRegistry;
  private selfPrompter: SelfPrompter;
  private goalManager: GoalManager;
  private bot: Bot;
  private logger: Logger;
  private tickInterval: NodeJS.Timeout | null = null;
  private llmBrain: any;  // LLMBrain from ../llm/brain
  private enableLLM: boolean;

  constructor(bot: Bot, logger: Logger, enableLLM: boolean, llmBrain?: any) {
    this.bot = bot;
    this.logger = logger;
    this.enableLLM = enableLLM;
    this.llmBrain = llmBrain || null;

    // Initialize layers
    this.skillRegistry = new SkillRegistry();
    this.modeController = new ModeController(bot, logger);
    this.commandRegistry = new CommandRegistry();
    this.goalManager = new GoalManager(logger);
    this.selfPrompter = new SelfPrompter(bot, this.commandRegistry, this.goalManager, logger);

    // Register modes
    this.registerModes();

    // Register skills
    this.registerSkills();

    // Register commands
    this.registerCommands();

    // Build context for self-prompter
    this.selfPrompter['skillRegistry'] = this.skillRegistry;
    this.selfPrompter['modeController'] = this.modeController;
  }

  private registerModes(): void {
    this.modeController.registerAll([
      new SelfPreservationMode(),
      new UnstuckMode(),
      new SelfDefenseMode(),
      new HuntingMode(),
      new ItemCollectingMode(),
      new TorchPlacingMode(),
      new BuildingMode(),
      new IdleMode(),
    ]);
  }

  private registerSkills(): void {
    // Skills will be populated when their modules are imported
    // This is a placeholder - actual registration happens in skills modules
    this.logger.info('SkillRegistry initialized (skills registered via modules)');
  }

  private registerCommands(): void {
    // Commands will be registered when their modules are imported
    this.logger.info('CommandRegistry initialized (commands registered via modules)');
  }

  start(tickRate: number = 300): void {
    this.modeController.start(tickRate);
    this.tickInterval = setInterval(() => this.tick(tickRate), tickRate);
    this.logger.info('Agent started');
  }

  stop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.modeController.stop();
    this.selfPrompter.stop();
    this.logger.info('Agent stopped');
  }

  private tick(delta: number): void {
    // Update self-prompter
    this.selfPrompter.update(delta);

    // Generate world snapshot
    const worldState = this.generateWorldState();

    // If LLM enabled, try LLM decision first
    if (this.enableLLM && this.llmBrain) {
      try {
        const decision = this.llmBrain.decide(
          this.extractBotState(),
          this.getGoalContext()
        );
        if (decision) {
          this.executeLLMDecision(decision, worldState);
        }
      } catch (err) {
        this.logger.debug(`LLM decision failed: ${err}`);
      }
    }
  }

  private generateWorldState(): WorldState {
    const pos = this.bot.entity.position;
    const entities: any[] = Object.values(this.bot.entities || {});
    const nearby: any[] = entities
      .filter((e: any) => e.type === 'mob')
      .map((e: any) => ({
        type: e.name,
        distance: pos.distanceTo(e.position),
      }));

    return {
      time: {
        timeOfDay: this.bot.time?.timeOfDay ?? 0,
        isDaytime: (this.bot.time?.timeOfDay ?? 0) < 13000,
      },
      weather: this.bot.weather ?? 'clear',
      nearbyEntities: nearby,
      nearbyBlocks: this.getNearbyBlockTypes(),
      lightLevel: this.getLightLevel(),
    };
  }

  private extractBotState(): any {
    return {
      health: this.bot.health,
      maxHealth: this.bot.maxHealth,
      food: this.bot.food,
      position: this.bot.entity.position,
      inventory: this.getInventoryCounts(),
      time: this.bot.time?.timeOfDay,
      weather: this.bot.weather,
    };
  }

  private getGoalContext(): any {
    const activeGoals = this.goalManager.getActive();
    if (activeGoals.length === 0) return null;
    return {
      currentGoal: activeGoals[0].name,
      description: activeGoals[0].description,
      commands: activeGoals[0].commands,
    };
  }

  private executeLLMDecision(decision: any, world: WorldState): void {
    // Map LLM decision to command or mode activation
    const action = decision.primaryAction;
    switch (action) {
      case 'gather': {
        const target = decision.target?.value;
        if (target) {
          (this.bot as any)._gatherTargets = [target];
          (this.bot as any)._gatherRadius = 30;
        }
        break;
      }
      case 'combat': {
        // Activate self-defense mode
        this.modeController.setActiveMode('self_defense');
        break;
      }
      case 'build': {
        this.modeController.setActiveMode('building');
        break;
      }
      case 'craft': {
        const item = decision.target?.value;
        if (item) {
          (this.bot as any)._craftItemName = item;
        }
        break;
      }
      case 'explore': {
        // Random position exploration
        const pos = this.bot.entity.position;
        const goal = new (require('mineflayer-pathfinder').GoalBlock)(
          Math.floor(pos.x + (Math.random() - 0.5) * 32),
          Math.floor(pos.y),
          Math.floor(pos.z + (Math.random() - 0.5) * 32),
        );
        this.bot.pathfinder.setGoal(goal, true);
        break;
      }
      case 'retreat': {
        // Find safe retreat
        const pos = this.bot.entity.position;
        const goal = new (require('mineflayer-pathfinder').GoalBlock)(
          Math.floor(pos.x + 10),
          Math.floor(pos.y),
          Math.floor(pos.z + 10),
        );
        this.bot.pathfinder.setGoal(goal, true);
        break;
      }
      case 'heal': {
        // Eat best food
        this.bot.consume();
        break;
      }
    }
  }

  // --- World queries ---

  private getNearbyBlockTypes(): string[] {
    const pos = this.bot.entity.position;
    const blocks = new Set<string>();
    for (let dx = -4; dx <= 4; dx++) {
      for (let dy = -2; dy <= 3; dy++) {
        for (let dz = -4; dz <= 4; dz++) {
          const block = this.bot.blockAt(pos.offset(dx, dy, dz));
          if (block && block.name !== 'air') {
            blocks.add(block.name);
          }
        }
      }
    }
    return Array.from(blocks);
  }

  private getLightLevel(): number {
    const pos = this.bot.entity.position;
    const block = this.bot.blockAt(pos);
    return block?.light?.blockLight ?? 0;
  }

  private getInventoryCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const slot of this.bot.inventory.slots) {
      if (slot) {
        counts[slot.name] = (counts[slot.name] || 0) + slot.count;
      }
    }
    return counts;
  }

  // --- Public API for external use ---

  setGoal(name: string, description: string, commands?: string[]): void {
    this.goalManager.create('SELF_PROMPTER', { name, description, commands });
    this.selfPrompter.start(description);
  }

  executeCommand(name: string, rawParams: string): Promise<string> {
    return this.commandRegistry.execute(name, rawParams, {
      bot: this.bot,
      world: this.generateWorldState(),
      skillRegistry: this.skillRegistry,
      modeController: this.modeController,
    });
  }

  getGoalManager(): GoalManager {
    return this.goalManager;
  }

  getModeController(): ModeController {
    return this.modeController;
  }
}
```

### Step 2: Verify TypeScript compiles

Run: `npx tsc --noEmit`

### Step 3: Commit

```bash
git add bot/engine/index.ts
git commit -m "feat: add Agent class that assembles all layers"
```

---

## Task 17: Wire Everything Into `bot/index.ts`

**Files:**
- Modify: `bot/index.ts`

### Step 1: Read existing `bot/index.ts` and make changes

The key changes to `bot/index.ts`:

1. Import `Agent` from `./engine/index`
2. In `MinecraftBot.connect()`, after pathfinder is loaded:
   - Create `Agent` instance
   - If `startAutomatic`, call `agent.start()`
3. In `handleWebSocketMessage`:
   - `build` -> `agent.executeCommand('build', params)`
   - `gather` -> `agent.executeCommand('gather', params)`
   - `fly` -> `agent.executeCommand('goTo', params)`
   - New `command` type -> `agent.executeCommand(name, params)`
4. Keep `disconnect()` calling `agent.stop()`

Here's the diff for the key sections:

**After imports (add):**
```typescript
import { Agent } from './engine/index';
```

**In constructor (add):**
```typescript
private agent: Agent | null = null;
```

**In `connect()` (after pathfinder initialization, before autonomous start):**
```typescript
// Create Agent if autonomous mode
if (this.startAutomatic) {
  const logger = new Logger('agent');
  let llmBrain: any = null;
  if (this.enableLLM && process.env.USE_LLM === 'true') {
    const { LLMBrain } = require('../llm/brain');
    llmBrain = new LLMBrain();
  }
  this.agent = new Agent(this.bot, logger, this.enableLLM, llmBrain);
  this.agent.start(300);
}
```

**In `handleWebSocketMessage` (replace existing handler):**
```typescript
private handleWebSocketMessage(data: string): void {
  try {
    const msg: WebSocketMessage = JSON.parse(data);
    switch (msg.type) {
      case 'command': {
        const cmd = msg.data as CommandData;
        this.executeCommand(cmd);
        break;
      }
      case 'build': {
        if (this.agent) {
          const params = (msg.data as any).params || '{}';
          this.agent.executeCommand('build', params);
        }
        break;
      }
      case 'gather': {
        if (this.agent) {
          const params = (msg.data as any).params || '{}';
          this.agent.executeCommand('gather', params);
        }
        break;
      }
      case 'fly': {
        if (this.agent) {
          const flyData = msg.data as any;
          const { x, y, z } = flyData;
          this.agent.executeCommand('goTo', `${x},${y},${z}`);
        }
        break;
      }
      case 'status_update':
      case 'registration_ack':
      case 'bots_list':
        // Ignored (server messages)
        break;
    }
  } catch (err) {
    this.logger?.warn('Failed to parse WS message:', err);
  }
}
```

**In `disconnect()`:**
```typescript
if (this.agent) {
  this.agent.stop();
}
```

### Step 2: Update the `automaticBehavior` removal

The old `automaticBehavior` call in `connect()` should be removed. Replace with:
```typescript
// Old: this.behaviors.automaticBehavior({ mode: 'autonomous', initialGoal: 'basic_survival' });
// New: Agent handles autonomous behavior via mode system + self-prompter
if (this.startAutomatic) {
  const goalManager = this.agent!.getGoalManager();
  goalManager.create('MANUAL', {
    name: 'basic_survival',
    description: 'Survive and gather basic resources',
  });
  this.agent!.setGoal('basic_survival', 'Survive and gather basic resources');
}
```

### Step 3: Verify TypeScript compiles

Run: `npx tsc --noEmit`

### Step 4: Commit

```bash
git add bot/index.ts
git commit -m "refactor: wire Agent into MinecraftBot, replace behaviors with layered system"
```

---

## Task 18: Remove Old Files and Final Verification

**Files to DELETE:**
- `bot/autonomous-engine.ts`
- `bot/behaviors.ts`
- `bot/goal-system.ts`

### Step 1: Delete old files

```bash
git rm bot/autonomous-engine.ts bot/behaviors.ts bot/goal-system.ts
```

### Step 2: Run full TypeScript check

```bash
npx tsc --noEmit
```

Fix any type errors that arise (common issues: unused imports, missing type casts for `any` bot extensions).

### Step 3: Run build

```bash
npm run build
```

### Step 4: Final commit

```bash
git add -A
git commit -m "refactor: remove old autonomous-engine, behaviors, and goal-system modules"
```

---

## Testing Notes

The existing project has `jest` in `package.json` but no test files exist. For the new system:

1. **Unit test targets:**
   - `SkillRegistry` - test cooldown behavior, execute order
   - `ModeController` - test priority ordering, pause/unpause
   - `CommandRegistry` - test parsing, execute flow
   - `GoalManager` - test lifecycle transitions
   - `SelfPrompter` - test state transitions (mock LLM)

2. **Integration test targets:**
   - `Agent.start()` / `Agent.stop()` - verify all layers initialized and cleaned up
   - WebSocket message routing to commands

3. **Manual testing:**
   - Start bot with `USE_LLM=true` and verify auto behavior runs
   - Send `!attack zombie` via WebSocket and verify combat mode activates
   - Send `!build cobblestone 5 5 4` and verify building mode activates

---

## Execution Order Summary

| Phase | Tasks | Dependencies |
|-------|-------|-------------|
| 1. Foundation | Task 1 (types), Task 9 (mode-controller), Task 10 (modes), Task 2 (skill registry) | — |
| 2. Skills | Task 3-8 (skill modules) | Task 2 |
| 3. Commands | Task 11-13 (command system) | — |
| 4. Higher-level | Task 14 (self-prompter), Task 15 (goal-manager) | Tasks 2, 11 |
| 5. Assembly | Task 16 (Agent) | Tasks 1-15 |
| 6. Wiring | Task 17 (bot/index.ts) | Tasks 1-16 |
| 7. Cleanup | Task 18 (delete old files) | Tasks 1-17 |

Total: 18 tasks, estimated ~30-50 minutes with subagent-driven development.

---

## Implementation Notes

**Imports to use (NOT require()):**
- All skills files should use: `import { GoalBlock, GoalFollow } from 'mineflayer-pathfinder';`
- All files needing Vec3 should use: `import { Vec3 } from 'vec3';`
- Do NOT use `require()` — the project uses ES2020 modules.

**Self-Prompter LLM integration:**
- The placeholder `callLLM()` in Task 14 should be replaced with a call to the existing `LLMBrain` from `../llm/brain.ts`.
- Specifically: use `await this.llmBrain.decide(botState, goalStateData)` — the same pattern as the old `autonomous-engine.ts`.
- Pass the Agent's `llmBrain` reference to SelfPrompter in Task 16.

**Skill/Command registration in Agent:**
- Task 16's `registerSkills()` and `registerCommands()` are placeholders.
- In implementation, the Agent should import the skill factories from each module and call `skillRegistry.register()`.
- Example: `import { createFlyToSkill } from '../skills/movement.ts'; this.skillRegistry.register(createFlyToSkill());`
- Similarly for commands: import the command arrays and call `commandRegistry.register(cmd)`.

**Bot extension pattern:**
- Skills set custom data on the bot object (e.g., `bot._gatherTargets`, `bot._attackTarget`) because the command system communicates via bot state.
- This pattern matches the existing codebase (e.g., `bot.dig()` calls in behaviors.ts).
- Use `as any` casts for these extensions — the project's `tsconfig.json` has `strict: false`.

**WorldState generation:**
- The `generateWorldState()` method in Agent creates a lightweight snapshot.
- Modes and skills that need detailed entity/block data should query `bot.entities`, `bot.blockAt()`, `bot.findBlock()` directly rather than using the snapshot (more accurate, same cost).
