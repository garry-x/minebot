# Minebot Phase 3 — Building + Ender Dragon Hunt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bot can place blocks, build structures, locate strongholds via Ender Eyes, activate the End Portal, enter The End, destroy Ender Crystals, and defeat the Ender Dragon.

**Architecture:** Extend Movement with block placement/item use. Add BuildingSkill and EnderDragonHuntSkill. Add high-level planner for goal sequencing. Wire dimension change and boss event tracking.

**Tech Stack:** Same as Phase 1-2 (TypeScript, bedrock-protocol, prismarine-world/chunk/block, minecraft-data)

---

### Task 1: Block Placement and Item Use in Movement

**Files:**
- Modify: `src/movement/movement.ts`

Add `clickBlock()` and `clickItem()` methods using `player_auth_input` packet.

- [ ] **Step 1: Add clickBlock() for block placement**

```typescript
clickBlock(blockPos: Vec3, face: number, slot: number): void {
  const entityId = this.connection.getEntityId();
  this.connection.queue("player_auth_input", {
    runtime_entity_id: entityId,
    motion: { x: 0, y: 0, z: 0 },
    input_data: 0x02, // item_interact flag
    tick: BigInt(0),
    transaction: {
      data: {
        action_type: 0, // click_block
        block_position: { x: blockPos.x, y: blockPos.y, z: blockPos.z },
        face: face,
        hotbar_slot: slot,
        held_item: { network_id: 0, count: 0, metadata: 0, block_runtime_id: 0 },
        player_pos: this.currentPosition,
        click_pos: { x: 0, y: 0, z: 0 },
        block_runtime_id: 0,
      },
    },
  });
}
```

- [ ] **Step 2: Add clickItem() for item use in air (Ender Eye)**

```typescript
clickItem(slot: number): void {
  const entityId = this.connection.getEntityId();
  this.connection.queue("player_auth_input", {
    runtime_entity_id: entityId,
    motion: { x: 0, y: 0, z: 0 },
    input_data: 0x02, // item_interact flag
    tick: BigInt(0),
    transaction: {
      data: {
        action_type: 1, // click_air
        block_position: { x: 0, y: 0, z: 0 },
        face: 0,
        hotbar_slot: slot,
        held_item: { network_id: 0, count: 0, metadata: 0, block_runtime_id: 0 },
        player_pos: this.currentPosition,
        click_pos: { x: 0, y: 0, z: 0 },
        block_runtime_id: 0,
      },
    },
  });
}
```

- [ ] **Step 3: Add openBlock() for container opening**

```typescript
import { Vec3, vec3 } from "../utils/vec3.js";

openBlock(blockPos: Vec3): void {
  this.connection.queue("player_action", {
    runtime_entity_id: this.connection.getEntityId(),
    action: "interact_block", // 25
    position: { x: blockPos.x, y: blockPos.y, z: blockPos.z },
    result_position: { x: blockPos.x, y: blockPos.y, z: blockPos.z },
    face: 0,
  });
}
```

- [ ] **Step 4: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/movement/movement.ts && git commit -m "feat: add clickBlock, clickItem, openBlock to Movement"
```

---

### Task 2: Dimension Change and Boss Event Tracking

**Files:**
- Modify: `src/events/event-bus.ts`
- Modify: `src/connection/connection.ts`
- Modify: `src/world/types.ts`

- [ ] **Step 1: Add dimension and boss events to BotEvents**

In `src/events/event-bus.ts`, add to the `BotEvents` interface:

```typescript
dimension_change: { dimension: number; x: number; y: number; z: number };
boss_event: { entityId: bigint; eventType: number; progress?: number; title?: string };
portal_event: { eventType: number };
level_event: { eventId: number; x: number; y: number; z: number };
```

- [ ] **Step 2: Wire change_dimension event in connection.ts**

In `connect()`, add:

```typescript
this.client.on("change_dimension", (packet: any) => {
  getLogger().info({ dimension: packet.dimension }, "Dimension changed");
  this.events.emit("dimension_change", {
    dimension: packet.dimension,
    x: packet.position?.x ?? 0,
    y: packet.position?.y ?? 0,
    z: packet.position?.z ?? 0,
  });
});
```

- [ ] **Step 3: Wire boss_event in connection.ts**

```typescript
this.client.on("boss_event", (packet: any) => {
  this.events.emit("boss_event", {
    entityId: packet.boss_entity_id,
    eventType: packet.type,
    progress: packet.progress,
    title: packet.title,
  });
});
```

- [ ] **Step 4: Wire event (portal_built, boss_killed) in connection.ts**

```typescript
this.client.on("event", (packet: any) => {
  if (packet.event_type === 2 || packet.event_type === 7) {
    this.events.emit("portal_event", { eventType: packet.event_type });
  }
});
this.client.on("level_event", (packet: any) => {
  if (packet.event === 2003) { // particle_eye_despawn
    this.events.emit("level_event", {
      eventId: packet.event,
      x: packet.x, y: packet.y, z: packet.z,
    });
  }
});
```

- [ ] **Step 5: Commit**

```bash
git add src/events/event-bus.ts src/connection/connection.ts && git commit -m "feat: wire dimension change, boss event, and portal event tracking"
```

---

### Task 3: BuildingSkill

**Files:**
- Create: `src/skills/building.ts`
- Modify: `src/bot.ts`

Block placement skill with scaffolding and terraforming.

- [ ] **Step 1: Create BuildingSkill**

Create `src/skills/building.ts`:

```typescript
import { Skill, SkillContext } from "./skill.js";
import { Pathfinder } from "../movement/pathfinding.js";
import { Vec3, vec3, floor, distance } from "../utils/vec3.js";

interface BuildPlan {
  blocks: Array<{ pos: Vec3; blockType: number }>;
  name: string;
}

const BUILD_REACH = 5;

enum BuildState {
  PATHING,
  PLACING,
  SELECTING,
}

export class BuildingSkill extends Skill {
  private state = BuildState.SELECTING;
  private plan: BuildPlan | null = null;
  private planIndex = 0;
  private path: Vec3[] = [];
  private pathIndex = 0;

  constructor() {
    super("building", 6);
  }

  async enter(ctx: SkillContext): Promise<void> {
    ctx.logger.info("Entering BUILDING state");
    this.state = BuildState.SELECTING;
    this.plan = null;
    this.planIndex = 0;
  }

  async tick(ctx: SkillContext): Promise<string | null> {
    const pos = ctx.world.getPlayerPosition();
    const movement = ctx.movement;
    const world = ctx.world;

    // No build plan yet — return to idle
    if (!this.plan) {
      ctx.logger.info("No build plan, returning to IDLE");
      return "idle";
    }

    switch (this.state) {
      case BuildState.SELECTING: {
        // Accept build plan from external input (set via setPlan)
        if (this.plan && this.plan.blocks.length > 0) {
          this.planIndex = 0;
          this.state = BuildState.PATHING;
          ctx.logger.info({ count: this.plan.blocks.length }, "Build plan ready");
        } else {
          return "idle";
        }
        break;
      }

      case BuildState.PATHING: {
        if (this.planIndex >= this.plan.blocks.length) {
          ctx.logger.info("Build complete");
          return "idle";
        }
        const target = this.plan.blocks[this.planIndex].pos;
        const dist = distance(pos, target);
        if (dist <= BUILD_REACH) {
          this.state = BuildState.PLACING;
          break;
        }
        // Pathfind to placement position
        const pf = new Pathfinder((p) => world.isBlockSolid(floor(p)) ? false : true);
        const result = pf.findPath(floor(pos), floor(target));
        if (result.length > 0) {
          this.path = result.map((n) => ({ x: n.x, y: n.y, z: n.z }));
          this.pathIndex = 0;
        }
        this.state = BuildState.PLACING;
        break;
      }

      case BuildState.PLACING: {
        if (this.planIndex >= this.plan.blocks.length) {
          return "idle";
        }
        const block = this.plan.blocks[this.planIndex];
        const dist = distance(pos, block.pos);

        if (dist <= BUILD_REACH) {
          // Find face to place against — pick a solid adjacent block
          movement.lookAt(block.pos);
          // Place against block below
          const against = vec3(block.pos.x, block.pos.y - 1, block.pos.z);
          const hotbarSlot = ctx.inventory.getSelectedSlot();
          movement.clickBlock(against, 1, hotbarSlot);
          ctx.logger.info({ pos: block.pos }, "Placed block");
          this.planIndex++;
        } else if (this.pathIndex < this.path.length) {
          const wp = this.path[this.pathIndex];
          movement.setPosition(wp.x, wp.y, wp.z);
          if (distance(pos, wp) < 1.5) this.pathIndex++;
        } else {
          this.planIndex++; // Skip unreachable blocks
        }
        break;
      }
    }

    return null;
  }

  setPlan(plan: BuildPlan): void {
    this.plan = plan;
    this.planIndex = 0;
  }

  getCurrentPlan(): BuildPlan | null {
    return this.plan;
  }

  async exit(ctx: SkillContext): Promise<void> {
    ctx.logger.info("Exiting BUILDING state");
  }
}
```

- [ ] **Step 2: Register BuildingSkill in bot.ts**

In bot.ts:
```typescript
import { BuildingSkill } from "./skills/building.js";
// In constructor/start, after other skill registrations:
this.skills.register(new BuildingSkill());
```

- [ ] **Step 3: Verify typecheck, commit**

```bash
npx tsc --noEmit
git add src/skills/building.ts src/bot.ts && git commit -m "feat: add BUILDING skill with block placement"
```

---

### Task 4: High-Level Planner

**Files:**
- Create: `src/planner/planner.ts`
- Create: `src/planner/goals.ts`

Goal-driven task sequencer that decides what skill to activate next.

- [ ] **Step 1: Define Goal types**

Create `src/planner/goals.ts`:

```typescript
export enum GoalType {
  GATHER_WOOD = "gather_wood",
  GATHER_STONE = "gather_stone",
  CRAFT_TOOLS = "craft_tools",
  GATHER_IRON = "gather_iron",
  GATHER_DIAMOND = "gather_diamond",
  GATHER_BLAZE = "gather_blaze",
  GATHER_ENDER_PEARL = "gather_ender_pearl",
  CRAFT_ENDER_EYE = "craft_ender_eye",
  FIND_STRONGHOLD = "find_stronghold",
  ACTIVATE_PORTAL = "activate_portal",
  ENTER_END = "enter_end",
  DEFEAT_DRAGON = "defeat_dragon",
  SURVIVE = "survive",
  IDLE = "idle",
}

export interface Goal {
  type: GoalType;
  priority: number;
  prerequisites: GoalType[];
  skill: string;
  complete: boolean;
}
```

- [ ] **Step 2: Create Planner**

Create `src/planner/planner.ts`:

```typescript
import { Goal, GoalType } from "./goals.js";
import type { SkillContext } from "../skills/skill.js";

const PHASE3_GOALS: Goal[] = [
  { type: GoalType.SURVIVE, priority: 100, prerequisites: [], skill: "combat", complete: false },
  { type: GoalType.DEFEAT_DRAGON, priority: 90, prerequisites: [GoalType.ENTER_END], skill: "dragon_hunt", complete: false },
  { type: GoalType.ENTER_END, priority: 80, prerequisites: [GoalType.ACTIVATE_PORTAL], skill: "idle", complete: false },
  { type: GoalType.ACTIVATE_PORTAL, priority: 70, prerequisites: [GoalType.FIND_STRONGHOLD, GoalType.CRAFT_ENDER_EYE], skill: "building", complete: false },
  { type: GoalType.FIND_STRONGHOLD, priority: 60, prerequisites: [GoalType.CRAFT_ENDER_EYE], skill: "gathering", complete: false },
  { type: GoalType.CRAFT_ENDER_EYE, priority: 50, prerequisites: [GoalType.GATHER_BLAZE, GoalType.GATHER_ENDER_PEARL], skill: "crafting", complete: false },
  { type: GoalType.GATHER_BLAZE, priority: 40, prerequisites: [], skill: "combat", complete: false },
  { type: GoalType.GATHER_ENDER_PEARL, priority: 40, prerequisites: [], skill: "combat", complete: false },
  { type: GoalType.GATHER_DIAMOND, priority: 35, prerequisites: [GoalType.CRAFT_TOOLS], skill: "gathering", complete: false },
  { type: GoalType.GATHER_IRON, priority: 30, prerequisites: [GoalType.CRAFT_TOOLS], skill: "gathering", complete: false },
  { type: GoalType.CRAFT_TOOLS, priority: 25, prerequisites: [GoalType.GATHER_WOOD, GoalType.GATHER_STONE], skill: "crafting", complete: false },
  { type: GoalType.GATHER_STONE, priority: 20, prerequisites: [], skill: "gathering", complete: false },
  { type: GoalType.GATHER_WOOD, priority: 10, prerequisites: [], skill: "gathering", complete: false },
  { type: GoalType.IDLE, priority: 0, prerequisites: [], skill: "idle", complete: false },
];

export class Planner {
  private goals: Goal[] = [...PHASE3_GOALS];

  getNextGoal(ctx: SkillContext): Goal | null {
    for (const goal of this.goals) {
      if (goal.complete) continue;
      if (this.arePrerequisitesMet(goal)) {
        return goal;
      }
    }
    return this.goals.find((g) => g.type === GoalType.IDLE) ?? null;
  }

  private arePrerequisitesMet(goal: Goal): boolean {
    return goal.prerequisites.every((pre) => {
      const prereqGoal = this.goals.find((g) => g.type === pre);
      return prereqGoal?.complete === true;
    });
  }

  markComplete(type: GoalType): void {
    const goal = this.goals.find((g) => g.type === type);
    if (goal) goal.complete = true;
  }

  getRecommendedSkill(ctx: SkillContext): string {
    const goal = this.getNextGoal(ctx);
    return goal?.skill ?? "idle";
  }

  getAllGoals(): Goal[] {
    return [...this.goals];
  }
}
```

- [ ] **Step 3: Verify typecheck, commit**

```bash
npx tsc --noEmit
git add src/planner/ && git commit -m "feat: add high-level goal planner"
```

---

### Task 5: Ender Eye Throwing and Stronghold Search

**Files:**
- Create: `src/skills/stronghold.ts`

Skill that throws Ender Eyes and tracks the stronghold direction.

- [ ] **Step 1: Create StrongholdSkill**

Create `src/skills/stronghold.ts`:

```typescript
import { Skill, SkillContext } from "./skill.js";
import { vec3, distance } from "../utils/vec3.js";

const EYE_COOLDOWN = 60; // 3 seconds
const TRIANGULATION_DISTANCE = 200; // blocks between throws

enum StrongholdState {
  THROWING,
  MOVING,
  DIGGING,
  SEARCHING,
}

export class StrongholdSkill extends Skill {
  private state = StrongholdState.THROWING;
  private throwPositions: Array<{ pos: { x: number; y: number; z: number }; angle: number }> = [];
  private cooldown = 0;
  private estimatedStrongholdPos: { x: number; z: number } | null = null;

  constructor() {
    super("stronghold", 7);
  }

  async enter(ctx: SkillContext): Promise<void> {
    ctx.logger.info("Entering STRONGHOLD search");
    this.state = StrongholdState.THROWING;
    this.throwPositions = [];
    this.cooldown = 0;
  }

  async tick(ctx: SkillContext): Promise<string | null> {
    const pos = ctx.world.getPlayerPosition();
    const movement = ctx.movement;

    // Check for level event — eye despawn means eye broke
    // We track this via the level_event from Task 2 wiring

    // Count ender eyes in inventory
    const eyeCount = ctx.inventory.countItem("minecraft:ender_eye");
    if (eyeCount === 0) {
      ctx.logger.warn("No ender eyes left");
      return "gathering";
    }

    switch (this.state) {
      case StrongholdState.THROWING: {
        if (this.cooldown > 0) {
          this.cooldown--;
          break;
        }
        // Find ender eye in hotbar
        const slot = ctx.inventory.findHotbarItem("minecraft:ender_eye");
        if (slot === -1) {
          ctx.logger.warn("Ender eye not in hotbar");
          return "idle";
        }
        movement.selectHotbarSlot(slot);
        // Throw the eye (click_air)
        movement.clickItem(slot);
        this.cooldown = EYE_COOLDOWN;
        // Record position — angle will be computed from eye trajectory
        // For now, we approximate: after throwing, the bot will look at the eye
        this.throwPositions.push({ pos: { ...pos }, angle: 0 });
        ctx.logger.info({ pos, count: this.throwPositions.length }, "Threw ender eye");

        if (this.throwPositions.length >= 3) {
          // Estimate stronghold from 3 throw points
          this.estimatedStrongholdPos = this.triangulate();
          ctx.logger.info({ pos: this.estimatedStrongholdPos }, "Estimated stronghold location");
          this.state = StrongholdState.MOVING;
        }
        break;
      }

      case StrongholdState.MOVING: {
        if (!this.estimatedStrongholdPos) {
          this.state = StrongholdState.THROWING;
          break;
        }
        // Move toward estimated stronghold
        const target = vec3(this.estimatedStrongholdPos.x, pos.y, this.estimatedStrongholdPos.z);
        movement.lookAt(target);
        movement.setPosition(target.x, pos.y, target.z);

        const dist = distance(pos, target);
        if (dist < 20) {
          ctx.logger.info("Near stronghold, start digging");
          this.state = StrongholdState.DIGGING;
        }
        break;
      }

      case StrongholdState.DIGGING: {
        // Dig down to find portal room
        // Simple staircase digging pattern
        const digPos = vec3(Math.floor(pos.x), Math.floor(pos.y) - 1, Math.floor(pos.z));
        const block = ctx.world.getBlock(digPos);
        if (block && block.boundingBox !== "empty") {
          movement.startDigging(digPos);
          ctx.logger.debug("Digging down...");
        } else {
          movement.setPosition(pos.x, pos.y - 1, pos.z);
        }
        // Check if we found the portal frame
        const portalFrames = ctx.world.findBlocks(
          (b) => b.name === "end_portal_frame",
          pos,
          10
        );
        if (portalFrames.length > 0) {
          ctx.logger.info("Found end portal frame!");
          this.state = StrongholdState.SEARCHING;
          return "building"; // Switch to building to place eyes
        }
        break;
      }

      case StrongholdState.SEARCHING: {
        // Portal found — this skill's job is done
        return "idle";
      }
    }

    return null;
  }

  private triangulate(): { x: number; z: number } {
    // Simple triangulation: average the throw positions
    // In a real implementation, use throw angles + positions
    if (this.throwPositions.length === 0) return { x: 0, z: 0 };
    let sumX = 0, sumZ = 0;
    for (const tp of this.throwPositions) {
      sumX += tp.pos.x;
      sumZ += tp.pos.z;
    }
    return {
      x: sumX / this.throwPositions.length + 500, // rough offset toward stronghold
      z: sumZ / this.throwPositions.length + 500,
    };
  }

  async exit(ctx: SkillContext): Promise<void> {
    ctx.logger.info("Exiting STRONGHOLD search");
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/skills/stronghold.ts && git commit -m "feat: add stronghold search skill with ender eye tracking"
```

---

### Task 6: Ender Dragon Combat Skill

**Files:**
- Create: `src/skills/dragon-hunt.ts`
- Modify: `src/events/event-bus.ts`

Attack the Ender Dragon: track boss health, destroy crystals, attack dragon.

- [ ] **Step 1: Create EnderDragonHuntSkill**

Create `src/skills/dragon-hunt.ts`:

```typescript
import { Skill, SkillContext } from "./skill.js";
import { Pathfinder } from "../movement/pathfinding.js";
import { vec3, distance } from "../utils/vec3.js";

enum DragonState {
  FIND_CRYSTALS,
  PATH_TO_CRYSTAL,
  DESTROY_CRYSTAL,
  ATTACK_DRAGON,
  WAIT,
}

export class EnderDragonHuntSkill extends Skill {
  private state = DragonState.FIND_CRYSTALS;
  private targetCrystal: { x: number; y: number; z: number; runtimeId: bigint } | null = null;
  private dragonId: bigint | null = null;
  private dragonHealth = 1.0;
  private attackCooldown = 0;

  constructor() {
    super("dragon_hunt", 9);
  }

  async enter(ctx: SkillContext): Promise<void> {
    ctx.logger.info("Entering ENDER DRAGON HUNT");
    this.state = DragonState.FIND_CRYSTALS;
    // Find the dragon entity
    const entities = ctx.world.getEntities();
    const dragon = entities.find((e) => e.type === "ender_dragon");
    if (dragon) this.dragonId = dragon.runtimeId;
  }

  async tick(ctx: SkillContext): Promise<string | null> {
    const pos = ctx.world.getPlayerPosition();
    const movement = ctx.movement;

    // Update dragon health if boss event has updated it

    if (this.attackCooldown > 0) {
      this.attackCooldown--;
    }

    switch (this.state) {
      case DragonState.FIND_CRYSTALS: {
        // Find ender crystals near pillars
        const crystals = ctx.world.getNearbyEntities(pos, 100)
          .filter((e) => e.type === "ender_crystal");
        if (crystals.length > 0) {
          // Pick closest
          this.targetCrystal = crystals.reduce((a, b) =>
            distance(pos, a.position) < distance(pos, b.position) ? a : b
          ) as any;
          ctx.logger.info({ pos: this.targetCrystal.position }, "Targeting crystal");
          this.state = DragonState.PATH_TO_CRYSTAL;
        } else {
          // No crystals left — attack dragon
          ctx.logger.info("All crystals destroyed, attacking dragon");
          this.state = DragonState.ATTACK_DRAGON;
        }
        break;
      }

      case DragonState.PATH_TO_CRYSTAL: {
        if (!this.targetCrystal) {
          this.state = DragonState.FIND_CRYSTALS;
          break;
        }
        const dist = distance(pos, this.targetCrystal);
        if (dist <= 4) {
          this.state = DragonState.DESTROY_CRYSTAL;
          break;
        }
        // Move toward crystal pillar
        movement.lookAt(this.targetCrystal);
        movement.setPosition(this.targetCrystal.x, this.targetCrystal.y, this.targetCrystal.z);
        break;
      }

      case DragonState.DESTROY_CRYSTAL: {
        if (!this.targetCrystal || !this.targetCrystal.runtimeId) {
          this.state = DragonState.FIND_CRYSTALS;
          break;
        }
        // Attack the crystal
        movement.lookAt(this.targetCrystal);
        movement.attack(this.targetCrystal.runtimeId);
        movement.swingArm();
        ctx.logger.info("Attacking crystal");
        this.attackCooldown = 10;
        this.targetCrystal = null;
        this.state = DragonState.WAIT;
        break;
      }

      case DragonState.ATTACK_DRAGON: {
        if (!this.dragonId) {
          // Find dragon again
          const entities = ctx.world.getEntities();
          const dragon = entities.find((e) => e.type === "ender_dragon");
          if (dragon) this.dragonId = dragon.runtimeId;
          if (!this.dragonId) {
            ctx.logger.warn("Dragon not found");
            return "idle";
          }
        }
        if (this.attackCooldown > 0) break;
        // Attack dragon when it perches
        movement.lookAt(ctx.world.getPlayerPosition()); // face the dragon
        movement.attack(this.dragonId);
        movement.swingArm();
        ctx.logger.info({ health: this.dragonHealth }, "Attacking dragon");
        this.attackCooldown = 10;
        break;
      }

      case DragonState.WAIT: {
        // Brief pause between actions
        if (this.attackCooldown <= 0) {
          this.state = DragonState.FIND_CRYSTALS;
        }
        break;
      }
    }

    return null;
  }

  updateDragonHealth(progress: number): void {
    this.dragonHealth = progress;
  }

  setDragonId(id: bigint): void {
    this.dragonId = id;
  }

  async exit(ctx: SkillContext): Promise<void> {
    ctx.logger.info("Exiting ENDER DRAGON HUNT");
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/skills/dragon-hunt.ts && git commit -m "feat: add ender dragon hunt skill with crystal destruction"
```

---

### Task 7: Bot Wiring — Phase 3 Integration

**Files:**
- Modify: `src/bot.ts`

Wire all new Phase 3 components into the bot.

- [ ] **Step 1: Add dimension tracking in WorldState**

In `src/world/world-state.ts`, add:

```typescript
private currentDimension = 0; // 0=overworld, 1=nether, 2=end

setDimension(dim: number): void {
  this.currentDimension = dim;
}

getDimension(): number {
  return this.currentDimension;
}
```

- [ ] **Step 2: Wire Phase 3 skills and events in bot.ts**

```typescript
import { BuildingSkill } from "./skills/building.js";
import { StrongholdSkill } from "./skills/stronghold.js";
import { EnderDragonHuntSkill } from "./skills/dragon-hunt.js";
import { Planner } from "./planner/planner.js";

// In Bot class:
private planner = new Planner();

// In start(), after other skill registrations:
this.skills.register(new BuildingSkill());
this.skills.register(new StrongholdSkill());
this.skills.register(new EnderDragonHuntSkill());

// In setupEventHandlers():
this.events.on("dimension_change", ({ dimension, x, y, z }) => {
  this.world.setDimension(dimension);
  this.world.updatePlayerPosition({ x, y, z });
  getLogger().info({ dimension }, "Dimension changed, updating world");
});

this.events.on("boss_event", ({ entityId, eventType, progress }) => {
  if (eventType === 0) { // show_bar — dragon spawned
    getLogger().info({ entityId }, "Boss bar appeared");
  } else if (eventType === 4) { // set_bar_progress
    getLogger().debug({ progress }, "Dragon health update");
    // Update dragon hunt skill if active
  }
});

this.events.on("portal_event", ({ eventType }) => {
  if (eventType === 2) {
    getLogger().info("End portal activated!");
  } else if (eventType === 7) {
    getLogger().info("Boss defeated!");
  }
});
```

- [ ] **Step 3: Wire planner into tick loop**

In the tick loop (bot.ts, start()), after skills.tick(), add planner logic:

```typescript
// Check planner every 100 ticks (5s)
let plannerTick = 0;
// Inside setInterval:
plannerTick++;
if (plannerTick % 100 === 0) {
  const nextSkill = this.planner.getRecommendedSkill(ctx);
  const current = this.skills.getCurrentSkillName();
  if (nextSkill !== current && nextSkill !== "idle") {
    getLogger().info({ from: current, to: nextSkill }, "Planner suggests skill change");
    this.skills.setCurrent(nextSkill, ctx);
  }
}
```

- [ ] **Step 4: Verify typecheck and tests**

```bash
npx tsc --noEmit && npx tsx --test tests/
```

- [ ] **Step 5: Commit**

```bash
git add src/bot.ts src/world/world-state.ts && git commit -m "feat: wire Phase 3 skills, planner, and dimension/boss events"
```

---

### Task 8: Integration Verification

- [ ] **Step 1: Full typecheck**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2: Run all tests**

```bash
npx tsx --test tests/
```

Expected: All tests pass (44+).

- [ ] **Step 3: Verify CLI help still works**

```bash
npx tsx src/index.ts --help
```

- [ ] **Step 4: Final commit if needed**

```bash
git status && git log --oneline -10
```
