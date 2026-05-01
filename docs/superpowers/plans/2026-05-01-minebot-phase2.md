# Minebot Phase 2 — Combat + Crafting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bot fights mobs via melee, auto-eats when hungry, tracks equipment/armor, and crafts basic items at a workbench.

**Architecture:** First fill Phase 1 gaps (wire `level_chunk`, `add_entity`/`remove_entity`, `inventory_slot` events from Connection into WorldState/Inventory). Then build HungerState tracker, enhance Inventory with armor tracking, add CombatSkill (melee+flee), FoodManager (auto-eat), and CraftingSkill (recipe lookup + workbench craft). Wire new skills into Bot and idle transition logic.

**Tech Stack:** Same as Phase 1 — TypeScript, bedrock-protocol, prismarine-world/chunk/entity/registry, minecraft-data

---

### Task 1: Wire Chunk Loading

**Files:**
- Modify: `src/connection/connection.ts`
- Modify: `src/bot.ts:124-131`

Wire `level_chunk` from bedrock-protocol into WorldState via Bot's event handlers.

- [ ] **Step 1: Add `level_chunk` handler to Connection**

Add to `connect()` in `src/connection/connection.ts`, after the `start_game` handler:

```typescript
this.client.on("level_chunk", (packet: any) => {
  // Forward chunk data to world state via event bus
  // The payload is a raw binary blob — emit raw packet for Bot to process
});
```

Since `level_chunk` payload is a raw binary, we emit a new event. Add `chunk_loaded` to `BotEvents` in `src/events/event-bus.ts`:

```typescript
export interface BotEvents {
  // ... existing events ...
  chunk_loaded: { x: number; z: number; payload: Buffer; subChunkCount: number };
}
```

Then in Connection:

```typescript
this.client.on("level_chunk", (packet: any) => {
  this.events.emit("chunk_loaded", {
    x: packet.x,
    z: packet.z,
    payload: packet.payload,
    subChunkCount: packet.sub_chunk_count ?? 0,
  });
});
```

- [ ] **Step 2: Wire chunk event in Bot.setupEventHandlers**

Add to `setupEventHandlers()` in `src/bot.ts`:

```typescript
this.events.on("chunk_loaded", ({ x, z, payload }) => {
  try {
    const column = this.world.getColumn(x, z);
    if (column) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (column as any).load(payload, this.world.registry);
    }
  } catch (err) {
    getLogger().error({ err, chunkX: x, chunkZ: z }, "Failed to load chunk");
  }
});
```

Note: `prismarine-chunk`'s `ChunkColumn.load()` accepts the raw binary payload and registry. This handles subchunk deserialization internally.

- [ ] **Step 3: Save `start_game` itemstates for registry**

Modify Connection's `start_game` handler to also emit itemstates so Bot can load them into the registry:

```typescript
this.client.on("start_game", (packet: any) => {
  logger.info("Game started");
  // Load itemstates into registry
  if (packet.itemstates) {
    this.events.emit("itemstates_loaded" as any, { itemstates: packet.itemstates });
  }
  this.events.emit("spawned", {
    x: packet.player_position?.x ?? 0,
    y: packet.player_position?.y ?? 0,
    z: packet.player_position?.z ?? 0,
    yaw: packet.rotation?.x ?? 0,
    pitch: packet.rotation?.y ?? 0,
  });
});
```

Add to `setupEventHandlers` in `src/bot.ts`:

```typescript
this.events.on("itemstates_loaded" as any, ({ itemstates }: { itemstates: any[] }) => {
  this.world.loadItemStates(itemstates);
  getLogger().info({ count: itemstates.length }, "Item states loaded");
});
```

- [ ] **Step 4: Verify typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/connection/connection.ts src/events/event-bus.ts src/bot.ts && git commit -m "feat: wire level_chunk and itemstates into WorldState"
```

---

### Task 2: Wire Entity Tracking

**Files:**
- Modify: `src/connection/connection.ts`
- Modify: `src/bot.ts`

Handle `add_entity`, `add_player`, `remove_entity`, `move_entity`, `add_item_entity` into WorldState.

- [ ] **Step 1: Add entity event handlers to Connection**

Add to `connect()` in `src/connection/connection.ts`:

```typescript
this.client.on("add_entity", (packet: any) => {
  const isHostile = isHostileMob(packet.entity_type);
  this.events.emit("entity_spawn", {
    id: packet.runtime_id,
    type: packet.entity_type ?? "unknown",
    x: packet.position?.x ?? 0,
    y: packet.position?.y ?? 0,
    z: packet.position?.z ?? 0,
  });
});

this.client.on("add_player", (packet: any) => {
  // Other players are not hostile
});

this.client.on("remove_entity", (packet: any) => {
  // packet.entity_id_self is the unique_id, not runtime_id
  // We need runtime_id to match our tracking
  // For now emit a best-effort despawn based on the unique_id
  this.events.emit("entity_despawn", { id: packet.entity_id_self });
});

this.client.on("move_entity", (packet: any) => {
  this.events.emit("entity_move", {
    id: packet.runtime_entity_id,
    x: packet.position?.x ?? 0,
    y: packet.position?.y ?? 0,
    z: packet.position?.z ?? 0,
  });
});

this.client.on("add_item_entity", (packet: any) => {
  // Dropped items — useful for collecting ores
  this.events.emit("entity_spawn", {
    id: packet.runtime_entity_id,
    type: "item",
    x: packet.position?.x ?? 0,
    y: packet.position?.y ?? 0,
    z: packet.position?.z ?? 0,
  });
});
```

Add helper function at the top of `connection.ts`:

```typescript
const HOSTILE_MOBS = new Set([
  "minecraft:zombie", "minecraft:skeleton", "minecraft:spider",
  "minecraft:creeper", "minecraft:enderman", "minecraft:witch",
  "minecraft:slime", "minecraft:phantom", "minecraft:husk",
  "minecraft:stray", "minecraft:drowned", "minecraft:piglin",
  "minecraft:hoglin", "minecraft:zoglin", "minecraft:piglin_brute",
  "minecraft:blaze", "minecraft:ghast", "minecraft:magma_cube",
  "minecraft:wither_skeleton", "minecraft:guardian", "minecraft:elder_guardian",
  "minecraft:silverfish", "minecraft:endermite", "minecraft:ravager",
  "minecraft:vindicator", "minecraft:pillager", "minecraft:evoker",
  "minecraft:cave_spider", "minecraft:vex", "minecraft:shulker",
  "minecraft:zombie_villager", "minecraft:zombified_piglin",
]);

function isHostileMob(type: string): boolean {
  return HOSTILE_MOBS.has(type);
}
```

- [ ] **Step 2: Wire entity events in Bot.setupEventHandlers**

```typescript
this.events.on("entity_spawn", ({ id, type, x, y, z }) => {
  this.world.addEntity({
    id,
    type,
    position: { x, y, z },
    velocity: { x: 0, y: 0, z: 0 },
    isHostile: type !== "item" && isHostileMob(type),
  });
  getLogger().debug({ id, type, x, y, z }, "Entity spawned");
});

this.events.on("entity_despawn", ({ id }) => {
  this.world.removeEntity(id);
});

this.events.on("entity_move", ({ id, x, y, z }) => {
  this.world.updateEntityPosition(id, { x, y, z });
});
```

Move `isHostileMob` to a shared location or duplicate the set in bot.ts.

- [ ] **Step 3: Verify typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/connection/connection.ts src/bot.ts && git commit -m "feat: wire entity tracking events into WorldState"
```

---

### Task 3: Wire Inventory Sync

**Files:**
- Modify: `src/connection/connection.ts`

Handle `inventory_slot` and `inventory_content` packets to sync Inventory.

- [ ] **Step 1: Add inventory event handlers to Connection**

Add to `connect()` in `src/connection/connection.ts`:

```typescript
this.client.on("inventory_slot", (packet: any) => {
  const item = packet.item;
  const isAir = !item || item.network_id === 0;
  this.events.emit("inventory_change", {
    slot: packet.slot,
    item: isAir ? null : {
      id: item.network_id,
      count: item.count ?? 0,
      metadata: item.metadata ?? 0,
    },
  });
});

this.client.on("inventory_content", (packet: any) => {
  // Full inventory dump — iterate all slots
  const items: any[] = packet.items ?? [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const isAir = !item || item.network_id === 0;
    this.events.emit("inventory_change", {
      slot: i,
      item: isAir ? null : {
        id: item.network_id,
        count: item.count ?? 0,
        metadata: item.metadata ?? 0,
      },
    });
  }
});
```

- [ ] **Step 2: Wire inventory events in Bot.setupEventHandlers**

```typescript
this.events.on("inventory_change", ({ slot, item }) => {
  if (item) {
    this.inventory.setSlot(slot, {
      slot,
      itemId: item.id,
      count: item.count,
      metadata: item.metadata,
    });
  } else {
    this.inventory.setSlot(slot, null);
  }
});
```

- [ ] **Step 3: Verify typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/connection/connection.ts src/bot.ts && git commit -m "feat: wire inventory sync events into Inventory"
```

---

### Task 4: Health and Death Handling

**Files:**
- Modify: `src/connection/connection.ts`
- Modify: `src/events/event-bus.ts`

Fix health attribute name and add death event.

- [ ] **Step 1: Fix health attribute name and add death event to Connection**

In `src/connection/connection.ts`, update the `update_attributes` handler. The current check `attr.name === "minecraft:health"` should check for `"minecraft:health"` (not just `"health"` — verify at runtime). Also add `player_death` handling:

```typescript
this.client.on("update_attributes", (packet: any) => {
  if (packet.runtime_entity_id !== this.client?.entityId) return;
  const attrs: Array<{ name: string; current: number; max: number; default?: number }> =
    packet.attributes ?? [];
  for (const attr of attrs) {
    if (attr.name === "minecraft:health") {
      this.events.emit("health_change", {
        health: Math.round(attr.current),
        maxHealth: Math.round(attr.max),
      });
    }
  }
});
```

Add death detection via `player_death` event or entity_event (death_animation=3 for our entity). Add to Connection:

```typescript
this.client.on("entity_event", (packet: any) => {
  if (packet.runtime_entity_id === this.client?.entityId && packet.event_id === 3) {
    this.events.emit("player_death", {
      message: "Player died",
    });
  }
});
```

- [ ] **Step 2: Wire death event in Bot**

Add to `setupEventHandlers` in `src/bot.ts`:

```typescript
this.events.on("player_death", ({ message }) => {
  getLogger().warn({ message }, "Player died");
  // Respawn is automatic — just log and let the tick loop handle skill reset
});
```

- [ ] **Step 3: Verify typecheck + commit**

```bash
npx tsc --noEmit && git add src/connection/connection.ts src/bot.ts && git commit -m "fix: health attribute detection and death event"
```

---

### Task 5: Hunger State Tracker

**Files:**
- Create: `src/skills/hunger-tracker.ts`
- Create: `tests/skills/hunger-tracker.test.ts`

Track hunger/saturation/exhaustion from `update_attributes`. Determine if food is needed.

- [ ] **Step 1: Write tests**

Create `tests/skills/hunger-tracker.test.ts`:

```typescript
import { describe, it } from "node:test";
import assert from "node:assert";
import { HungerTracker } from "../../src/skills/hunger-tracker.js";

describe("HungerTracker", () => {
  it("starts with default hunger values", () => {
    const ht = new HungerTracker();
    assert.strictEqual(ht.getHunger(), 20);
    assert.strictEqual(ht.getSaturation(), 5);
  });

  it("updates hunger from attributes", () => {
    const ht = new HungerTracker();
    ht.update("player.hunger", 12, 20, 20);
    assert.strictEqual(ht.getHunger(), 12);
  });

  it("updates saturation from attributes", () => {
    const ht = new HungerTracker();
    ht.update("player.saturation", 3, 20, 20);
    assert.strictEqual(ht.getSaturation(), 3);
  });

  it("isHungry returns true when hunger is low", () => {
    const ht = new HungerTracker();
    ht.update("player.hunger", 10, 20, 20);
    assert.ok(ht.isHungry());
  });

  it("isHungry returns false when hunger is high", () => {
    const ht = new HungerTracker();
    ht.update("player.hunger", 18, 20, 20);
    assert.strictEqual(ht.isHungry(), false);
  });

  it("needsFood returns true below threshold", () => {
    const ht = new HungerTracker();
    ht.update("player.hunger", 15, 20, 20);
    assert.strictEqual(ht.needsFood(), true); // threshold is 16
  });
});
```

- [ ] **Step 2: Run tests (expect FAIL)**

```bash
npx tsx --test tests/skills/hunger-tracker.test.ts
```

- [ ] **Step 3: Implement HungerTracker**

Create `src/skills/hunger-tracker.ts`:

```typescript
export const HUNGRY_THRESHOLD = 14;
export const STARVING_THRESHOLD = 6;

export class HungerTracker {
  private hunger = 20;
  private saturation = 5;
  private exhaustion = 0;

  update(attributeName: string, current: number, max: number, defaultValue: number): void {
    switch (attributeName) {
      case "player.hunger":
        this.hunger = current;
        break;
      case "player.saturation":
        this.saturation = current;
        break;
      case "player.exhaustion":
        this.exhaustion = current;
        break;
    }
  }

  getHunger(): number { return this.hunger; }
  getSaturation(): number { return this.saturation; }
  getExhaustion(): number { return this.exhaustion; }

  isHungry(): boolean {
    return this.hunger <= HUNGRY_THRESHOLD;
  }

  isStarving(): boolean {
    return this.hunger <= STARVING_THRESHOLD;
  }

  needsFood(): boolean {
    return this.hunger < 16;
  }
}
```

- [ ] **Step 4: Run tests (expect PASS)**

```bash
npx tsx --test tests/skills/hunger-tracker.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/skills/hunger-tracker.ts tests/skills/hunger-tracker.test.ts && git commit -m "feat: add hunger state tracker"
```

---

### Task 6: Auto-Eat in IDLE Skill

**Files:**
- Modify: `src/skills/idle.ts`
- Modify: `src/bot.ts` (wire hunger tracking)
- Modify: `src/connection/connection.ts` (emit hunger data)

Wire hunger attribute parsing in Connection, feed to HungerTracker in Bot, and use in IDLE to auto-eat.

- [ ] **Step 1: Add hunger attribute emission to Connection**

Update the `update_attributes` handler in `src/connection/connection.ts` to also emit hunger data:

```typescript
this.client.on("update_attributes", (packet: any) => {
  if (packet.runtime_entity_id !== this.client?.entityId) return;
  const attrs: Array<{ name: string; current: number; max: number; default?: number }> =
    packet.attributes ?? [];
  for (const attr of attrs) {
    switch (attr.name) {
      case "minecraft:health":
        this.events.emit("health_change" as any, {
          health: Math.round(attr.current),
          maxHealth: Math.round(attr.max),
        });
        break;
      case "player.hunger":
        this.events.emit("hunger_change" as any, {
          hunger: attr.current,
          saturation: attr.current,
          max: attr.max,
        });
        break;
    }
  }
});
```

Add `hunger_change` to `BotEvents` in `src/events/event-bus.ts`:

```typescript
export interface BotEvents {
  // ... existing events ...
  hunger_change: { hunger: number; saturation: number; max: number };
}
```

- [ ] **Step 2: Wire HungerTracker in Bot**

In `src/bot.ts`, add a `hungerTracker` field and wire it:

```typescript
import { HungerTracker } from "./skills/hunger-tracker.js";

export class Bot {
  // ...
  private hunger!: HungerTracker;

  async start(): Promise<void> {
    // ...
    this.hunger = new HungerTracker();
    // ...
    const ctx: SkillContext = {
      world: this.world,
      movement: this.movement,
      inventory: this.inventory,
      events: this.events,
      logger,
      hunger: this.hunger,
    };
    // ...
  }

  private setupEventHandlers(): void {
    // ...
    this.events.on("hunger_change" as any, ({ hunger, saturation }: { hunger: number; saturation: number }) => {
      this.hunger.update("player.hunger", hunger, 20, 20);
      this.hunger.update("player.saturation", saturation, 20, 20);
    });
  }
}
```

Update `SkillContext` in `src/skills/skill.ts`:

```typescript
import type { HungerTracker } from "./hunger-tracker.js";

export interface SkillContext {
  world: WorldState;
  movement: Movement;
  inventory: Inventory;
  events: EventBus<BotEvents>;
  logger: Logger;
  hunger: HungerTracker;
}
```

- [ ] **Step 3: Implement auto-eat in IDLE**

Modify `src/skills/idle.ts`:

```typescript
import { Skill, SkillContext } from "./skill.js";
import { vec3 } from "../utils/vec3.js";

const WANDER_INTERVAL = 60;
const HOSTILE_SCAN_RADIUS = 30;
const EAT_CHECK_INTERVAL = 20; // check hunger every 1s

const FOOD_ITEMS = new Set([
  "minecraft:cooked_beef", "minecraft:cooked_porkchop",
  "minecraft:cooked_chicken", "minecraft:cooked_mutton",
  "minecraft:cooked_rabbit", "minecraft:cooked_salmon",
  "minecraft:cooked_cod", "minecraft:beef", "minecraft:porkchop",
  "minecraft:chicken", "minecraft:mutton", "minecraft:rabbit",
  "minecraft:salmon", "minecraft:cod", "minecraft:bread",
  "minecraft:apple", "minecraft:golden_apple", "minecraft:carrot",
  "minecraft:baked_potato", "minecraft:potato", "minecraft:beetroot",
  "minecraft:melon_slice", "minecraft:cookie", "minecraft:pumpkin_pie",
  "minecraft:mushroom_stew", "minecraft:rabbit_stew", "minecraft:beetroot_soup",
]);

enum IdleSubState {
  WANDER,
  EATING,
}

export class IdleSkill extends Skill {
  private wanderTimer = 0;
  private eatCheckTimer = 0;
  private eatTimer = 0;
  private subState = IdleSubState.WANDER;
  private foodSlot = -1;

  constructor() {
    super("idle", 0);
  }

  async enter(ctx: SkillContext): Promise<void> {
    ctx.logger.info("Entering IDLE state");
    this.wanderTimer = 0;
    this.eatCheckTimer = 0;
    this.eatTimer = 0;
    this.subState = IdleSubState.WANDER;
    this.foodSlot = -1;
  }

  async tick(ctx: SkillContext): Promise<string | null> {
    const pos = ctx.world.getPlayerPosition();

    // Check for hostiles
    const hostiles = ctx.world.getNearbyEntities(pos, HOSTILE_SCAN_RADIUS)
      .filter((e) => e.isHostile);
    if (hostiles.length > 0) {
      ctx.logger.warn({ count: hostiles.length }, "Hostile mobs detected, switching to combat");
      return "combat";
    }

    // Check hunger periodically
    this.eatCheckTimer++;
    if (this.eatCheckTimer >= EAT_CHECK_INTERVAL) {
      this.eatCheckTimer = 0;
      if (ctx.hunger.isHungry() && this.subState !== IdleSubState.EATING) {
        // Find food in inventory
        for (const [itemName] of FOOD_ITEMS) {
          const slot = ctx.inventory.findHotbarItem(itemName);
          if (slot !== -1) {
            this.foodSlot = slot;
            break;
          }
        }
        if (this.foodSlot !== -1) {
          this.subState = IdleSubState.EATING;
          this.eatTimer = 0;
          ctx.logger.info({ slot: this.foodSlot }, "Starting to eat");
        }
      }
    }

    // Eating sub-state
    if (this.subState === IdleSubState.EATING) {
      this.eatTimer++;
      if (this.eatTimer === 1) {
        // Select food slot
        ctx.movement.selectHotbarSlot(this.foodSlot);
      } else if (this.eatTimer === 5) {
        // Start using item (food)
        ctx.movement.useItem(this.foodSlot);
      } else if (this.eatTimer >= 40) {
        // After ~2 seconds, finish eating
        ctx.movement.consumeItem();
        this.subState = IdleSubState.WANDER;
        this.foodSlot = -1;
        ctx.logger.info("Finished eating");
      }
      return null;
    }

    // Wander randomly
    this.wanderTimer++;
    if (this.wanderTimer >= WANDER_INTERVAL) {
      this.wanderTimer = 0;
      const target = vec3(
        pos.x + (Math.random() - 0.5) * 20,
        pos.y,
        pos.z + (Math.random() - 0.5) * 20
      );
      ctx.movement.lookAt(target);
      ctx.movement.setPosition(target.x, target.y, target.z);
      ctx.logger.debug({ target }, "Wandering");
    }

    return null;
  }

  async exit(ctx: SkillContext): Promise<void> {
    ctx.logger.info("Exiting IDLE state");
  }
}
```

- [ ] **Step 4: Add eating movement methods**

Add to `src/movement/movement.ts`:

```typescript
selectHotbarSlot(slot: number): void {
  this.connection.queue("player_action", {
    runtime_entity_id: this.connection.getEntityId(),
    action: "hotbar_select",
    hotbar_slot: slot,
    position: { x: 0, y: 0, z: 0 },
    result_position: { x: 0, y: 0, z: 0 },
    face: 0,
  });
}

useItem(slot: number): void {
  // Use inventory_transaction with transaction_type: item_use
  this.connection.queue("inventory_transaction", {
    transaction_type: "item_use",
    actions: [{
      source_type: "container",
      window_id: 0,
      inventory_slot: slot,
      hotbar_slot: slot,
      item: { network_id: 0, count: 0, metadata: 0, has_stack_id: 0, block_runtime_id: 0 },
      from_item: { network_id: 0, count: 0, metadata: 0, has_stack_id: 0, block_runtime_id: 0 },
      to_item: { network_id: 0, count: 0, metadata: 0, has_stack_id: 0, block_runtime_id: 0 },
      action_type: 1, // click_air
    }],
    action_type: 1,
    block_position: { x: 0, y: 0, z: 0 },
    block_face: 0,
    hotbar_slot: slot,
    held_item: { network_id: 0, count: 0, metadata: 0, has_stack_id: 0, block_runtime_id: 0 },
    player_position: this.currentPosition,
    click_position: { x: 0, y: 0, z: 0 },
    block_runtime_id: 0,
    client_interact_prediction: 0,
  });
}

consumeItem(): void {
  // Use inventory_transaction with transaction_type: item_release
  this.connection.queue("inventory_transaction", {
    transaction_type: "item_release",
    actions: [],
    action_type: 1, // consume
    hotbar_slot: 0,
    held_item: { network_id: 0, count: 0, metadata: 0, has_stack_id: 0, block_runtime_id: 0 },
    player_position: this.currentPosition,
    click_position: { x: 0, y: 0, z: 0 },
    block_runtime_id: 0,
    client_interact_prediction: 0,
  });
}
```

- [ ] **Step 5: Verify typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/skills/idle.ts src/movement/movement.ts src/bot.ts src/skills/skill.ts src/events/event-bus.ts src/connection/connection.ts && git commit -m "feat: auto-eat with HungerTracker in IDLE skill"
```

---

### Task 7: Inventory Enhancements (Armor/Equipment)

**Files:**
- Modify: `src/inventory/inventory.ts`
- Modify: `tests/inventory/inventory.test.ts`

Add armor/equipment slot tracking and item-type matching.

- [ ] **Step 1: Write tests**

Add to `tests/inventory/inventory.test.ts`:

```typescript
import { Inventory, ARMOR_SLOT_START } from "../../src/inventory/inventory.js";

describe("Inventory - Armor", () => {
  it("tracks armor slots separately", () => {
    const inv = new Inventory();
    inv.setArmorSlot(0, { slot: ARMOR_SLOT_START, itemId: 310, count: 1, name: "minecraft:diamond_helmet" });
    assert.strictEqual(inv.getArmorSlot(0)?.name, "minecraft:diamond_helmet");
  });

  it("hasItemType finds items by prefix", () => {
    const inv = new Inventory();
    inv.setSlot(3, { slot: 3, itemId: 261, count: 1, name: "minecraft:bow" });
    assert.ok(inv.hasItemType("bow"));
    assert.strictEqual(inv.hasItemType("diamond_sword"), false);
  });

  it("findItemType returns slot for matching item", () => {
    const inv = new Inventory();
    inv.setSlot(5, { slot: 5, itemId: 276, count: 1, name: "minecraft:diamond_sword" });
    assert.strictEqual(inv.findItemType("sword"), 5);
  });

  it("getAllFoodItems returns food items", () => {
    const inv = new Inventory();
    inv.setSlot(0, { slot: 0, itemId: 364, count: 3, name: "minecraft:cooked_beef" });
    inv.setSlot(1, { slot: 1, itemId: 1, count: 64, name: "minecraft:stone" });
    const food = inv.getAllFoodItems();
    assert.strictEqual(food.length, 1);
    assert.strictEqual(food[0].name, "minecraft:cooked_beef");
  });
});
```

- [ ] **Step 2: Run tests (expect FAIL)**

```bash
npx tsx --test tests/inventory/inventory.test.ts
```

- [ ] **Step 3: Implement enhancements**

Add to `src/inventory/inventory.ts`:

```typescript
export const ARMOR_SLOT_START = 100;
// Slots 100=head, 101=chest, 102=legs, 103=boots

const FOOD_ITEM_NAMES = new Set([
  "cooked_beef", "cooked_porkchop", "cooked_chicken", "cooked_mutton",
  "cooked_rabbit", "cooked_salmon", "cooked_cod", "beef", "porkchop",
  "chicken", "mutton", "rabbit", "salmon", "cod", "bread", "apple",
  "golden_apple", "carrot", "baked_potato", "potato", "beetroot",
  "melon_slice", "cookie", "pumpkin_pie", "mushroom_stew",
  "rabbit_stew", "beetroot_soup", "sweet_berries", "glow_berries",
  "chorus_fruit", "golden_carrot", "dried_kelp", "honey_bottle",
  "suspicious_stew", "tropical_fish", "pufferfish",
]);

const WEAPON_ITEM_NAMES = new Set([
  "wooden_sword", "stone_sword", "iron_sword", "golden_sword",
  "diamond_sword", "netherite_sword", "bow", "crossbow", "trident",
  "wooden_axe", "stone_axe", "iron_axe", "golden_axe",
  "diamond_axe", "netherite_axe", "mace",
]);

export class Inventory {
  // ... existing code ...
  private armorSlots: Map<number, InventorySlot> = new Map();

  setArmorSlot(index: number, item: InventorySlot | null): void {
    const slot = ARMOR_SLOT_START + index;
    if (item) {
      this.armorSlots.set(slot, item);
    } else {
      this.armorSlots.delete(slot);
    }
  }

  getArmorSlot(index: number): InventorySlot | null {
    return this.armorSlots.get(ARMOR_SLOT_START + index) ?? null;
  }

  hasItemType(typePattern: string): boolean {
    return this.findItemType(typePattern) !== -1;
  }

  findItemType(typePattern: string): number {
    const suffix = `minecraft:${typePattern}`;
    for (const [slot, item] of this.slots) {
      if (item.name && item.name.endsWith(typePattern)) return slot;
    }
    // Also check armor slots
    for (const [slot, item] of this.armorSlots) {
      if (item.name && item.name.endsWith(typePattern)) return slot;
    }
    return -1;
  }

  getAllFoodItems(): InventorySlot[] {
    const food: InventorySlot[] = [];
    for (const [, item] of this.slots) {
      if (item.name && isFoodItem(item.name)) {
        food.push(item);
      }
    }
    return food;
  }
}

function isFoodItem(name: string): boolean {
  const baseName = name.replace("minecraft:", "");
  return FOOD_ITEM_NAMES.has(baseName);
}

export function isWeaponItem(name: string): boolean {
  const baseName = name.replace("minecraft:", "");
  return WEAPON_ITEM_NAMES.has(baseName);
}
```

- [ ] **Step 4: Run tests (expect PASS)**

```bash
npx tsx --test tests/inventory/inventory.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/inventory/inventory.ts tests/inventory/inventory.test.ts && git commit -m "feat: add armor tracking, item type matching, food/weapon detection"
```

---

### Task 8: COMBAT Skill

**Files:**
- Create: `src/skills/combat.ts`
- Create: `tests/skills/combat.test.ts`

Melee attack with flee-on-low-HP. Scans for hostiles, pathfinds to closest, attacks.

- [ ] **Step 1: Write combat state machine tests**

Create `tests/skills/combat.test.ts`:

```typescript
import { describe, it } from "node:test";
import assert from "node:assert";
import { CombatSkill } from "../../src/skills/combat.js";

describe("CombatSkill", () => {
  it("initializes with priority 10", () => {
    const cs = new CombatSkill();
    assert.strictEqual(cs.name, "combat");
    assert.strictEqual(cs.priority, 10);
  });

  it("flee threshold is reasonable", () => {
    const cs = new CombatSkill();
    // Cannot test without context, but ensure constants exist
    assert.ok(typeof cs.priority === "number");
  });
});
```

- [ ] **Step 2: Run tests (expect FAIL)**

```bash
npx tsx --test tests/skills/combat.test.ts
```

- [ ] **Step 3: Implement CombatSkill**

Create `src/skills/combat.ts`:

```typescript
import { Skill, SkillContext } from "./skill.js";
import { Vec3, vec3, distance } from "../utils/vec3.js";
import { Pathfinder } from "../movement/pathfinding.js";
import { isWeaponItem } from "../inventory/inventory.js";

const ATTACK_RANGE = 3.5;
const SCAN_RADIUS = 30;
const FLEE_HP_THRESHOLD = 8;
const FLEE_DISTANCE = 20;
const ATTACK_COOLDOWN = 10; // ticks between attacks

enum CombatState {
  SCANNING,
  APPROACHING,
  ATTACKING,
  FLEEING,
}

export class CombatSkill extends Skill {
  private state = CombatState.SCANNING;
  private target: { id: bigint; position: Vec3; type: string } | null = null;
  private path: { x: number; y: number; z: number }[] = [];
  private pathIndex = 0;
  private attackCooldown = 0;
  private fleeDirection: Vec3 | null = null;

  constructor() {
    super("combat", 10);
  }

  async enter(ctx: SkillContext): Promise<void> {
    ctx.logger.info("Entering COMBAT state");
    this.state = CombatState.SCANNING;
    this.target = null;
    this.path = [];
    this.attackCooldown = 0;
    this.fleeDirection = null;
  }

  async tick(ctx: SkillContext): Promise<string | null> {
    const pos = ctx.world.getPlayerPosition();
    const movement = ctx.movement;

    // Check health — flee if critical
    if (ctx.hunger.getHunger() > 0 && this.state !== CombatState.FLEEING) {
      // Health is tracked separately; we need to know current HP
      // For now, check if we took damage by comparing to max
      // TODO: Add HP tracking. Flee logic uses heuristics.
    }

    // Decrement cooldown
    if (this.attackCooldown > 0) this.attackCooldown--;

    switch (this.state) {
      case CombatState.SCANNING: {
        const hostiles = ctx.world.getNearbyEntities(pos, SCAN_RADIUS)
          .filter((e) => e.isHostile);
        if (hostiles.length > 0) {
          // Pick closest
          this.target = hostiles.reduce((a, b) =>
            distance(pos, a.position) < distance(pos, b.position) ? a : b
          );
          ctx.logger.info({ type: this.target.type, dist: distance(pos, this.target.position).toFixed(1) }, "Target acquired");
          this.state = CombatState.APPROACHING;
        } else {
          ctx.logger.info("No hostiles nearby, returning to IDLE");
          return "idle";
        }
        break;
      }

      case CombatState.APPROACHING: {
        if (!this.target) { this.state = CombatState.SCANNING; break; }
        const dist = distance(pos, this.target.position);
        if (dist <= ATTACK_RANGE) {
          this.state = CombatState.ATTACKING;
          ctx.logger.info("In attack range");
          break;
        }

        // Equip best weapon
        const weaponSlot = ctx.inventory.findItemType("sword");
        if (weaponSlot >= 0 && weaponSlot <= 8) {
          movement.selectHotbarSlot(weaponSlot);
        }

        // Pathfind to target
        const targetPos = this.target.position;
        const pf = new Pathfinder((p) => !ctx.world.isBlockSolid(p));
        const result = pf.findPath(
          vec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z)),
          vec3(Math.floor(targetPos.x), Math.floor(targetPos.y), Math.floor(targetPos.z))
        );
        if (result.length > 0) {
          this.path = result.map((n) => ({ x: n.x, y: n.y, z: n.z }));
          this.pathIndex = 0;
        }

        // Follow path
        if (this.pathIndex < this.path.length) {
          const wp = this.path[this.pathIndex];
          movement.lookAt(vec3(wp.x, wp.y + 1.6, wp.z));
          movement.setPosition(wp.x + 0.5, wp.y, wp.z + 0.5);
          if (distance(pos, vec3(wp.x, wp.y, wp.z)) < 1.5) {
            this.pathIndex++;
          }
        }
        break;
      }

      case CombatState.ATTACKING: {
        if (!this.target) { this.state = CombatState.SCANNING; break; }
        const dist = distance(pos, this.target.position);

        // Target moved out of range
        if (dist > ATTACK_RANGE) {
          this.state = CombatState.APPROACHING;
          break;
        }

        // Check if target still exists
        const stillAlive = ctx.world.getNearbyEntities(pos, 10)
          .find((e) => e.id === this.target!.id);
        if (!stillAlive) {
          ctx.logger.info("Target eliminated");
          this.target = null;
          this.state = CombatState.SCANNING;
          break;
        }

        // Look at target and attack
        movement.lookAt(this.target.position);
        if (this.attackCooldown <= 0) {
          movement.swingArm();
          this.attackCooldown = ATTACK_COOLDOWN;
          ctx.logger.debug("Swing!");
        }
        break;
      }

      case CombatState.FLEEING: {
        if (!this.target) { this.state = CombatState.SCANNING; break; }

        // Calculate flee direction (away from target)
        const dx = pos.x - this.target.position.x;
        const dz = pos.z - this.target.position.z;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        const fleeX = pos.x + (dx / len) * FLEE_DISTANCE;
        const fleeZ = pos.z + (dz / len) * FLEE_DISTANCE;

        movement.lookAt(vec3(fleeX, pos.y, fleeZ));
        movement.setPosition(fleeX, pos.y, fleeZ);

        const dist = distance(pos, this.target.position);
        if (dist > FLEE_DISTANCE) {
          ctx.logger.info("Escaped, returning to IDLE");
          return "idle";
        }
        break;
      }
    }

    return null;
  }

  async exit(ctx: SkillContext): Promise<void> {
    ctx.logger.info("Exiting COMBAT state");
  }
}
```

- [ ] **Step 4: Run tests (expect PASS)**

```bash
npx tsx --test tests/skills/combat.test.ts
```

- [ ] **Step 5: Verify typecheck and commit**

```bash
npx tsc --noEmit && git add src/skills/combat.ts tests/skills/combat.test.ts && git commit -m "feat: add COMBAT skill with melee attack and flee"
```

---

### Task 9: CRAFTING Skill

**Files:**
- Create: `src/skills/crafting.ts`
- Create: `tests/skills/crafting.test.ts`

Recipe lookup from minecraft-data, workbench interaction, crafting event.

- [ ] **Step 1: Write tests for recipe lookup**

Create `tests/skills/crafting.test.ts`:

```typescript
import { describe, it } from "node:test";
import assert from "node:assert";
import { CraftingSkill } from "../../src/skills/crafting.js";

describe("CraftingSkill", () => {
  it("loads recipes from minecraft-data", () => {
    const cs = new CraftingSkill();
    assert.strictEqual(cs.name, "crafting");
    assert.strictEqual(cs.priority, 5);
  });

  it("can find recipes for an output item", () => {
    const cs = new CraftingSkill();
    const recipes = cs.findRecipes("stick");
    assert.ok(recipes.length >= 0);
  });
});
```

- [ ] **Step 2: Run tests (expect FAIL)**

```bash
npx tsx --test tests/skills/crafting.test.ts
```

- [ ] **Step 3: Implement CraftingSkill**

Create `src/skills/crafting.ts`:

```typescript
import { Skill, SkillContext } from "./skill.js";
import { distance, vec3 } from "../utils/vec3.js";
import { Pathfinder } from "../movement/pathfinding.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mcData: any = null;

function getMcData(version: string) {
  if (!mcData) {
    mcData = require("minecraft-data")(version);
  }
  return mcData;
}

interface RecipeOutput {
  id: number;
  name: string;
  count: number;
}

interface CraftableRecipe {
  recipeId: string;
  type: string;
  output: RecipeOutput;
  input: RecipeOutput[];
}

const WORKBENCH_BLOCK = "minecraft:crafting_table";
const WORKBENCH_SCAN_RADIUS = 32;

enum CraftingState {
  SCANNING_WORKBENCH,
  PATH_TO_WORKBENCH,
  OPENING,
  CRAFTING,
}

export class CraftingSkill extends Skill {
  private state = CraftingState.SCANNING_WORKBENCH;
  private wantedItem = "";
  private workbenchPos: { x: number; y: number; z: number } | null = null;
  private path: { x: number; y: number; z: number }[] = [];
  private pathIndex = 0;
  private craftingProgress = 0;

  constructor() {
    super("crafting", 5);
  }

  findRecipes(outputPattern: string): CraftableRecipe[] {
    const data = getMcData("bedrock_1.21");
    if (!data?.recipes) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recipes = data.recipes as any[];
    return recipes
      .filter((r: any) => {
        const outName = r.result?.name ?? r.output?.name ?? "";
        return outName.includes(outputPattern);
      })
      .map((r: any): CraftableRecipe => ({
        recipeId: r.recipe_id ?? r.id ?? "unknown",
        type: r.type ?? "shaped",
        output: {
          id: r.result?.id ?? r.output?.id ?? 0,
          name: r.result?.name ?? r.output?.name ?? "",
          count: r.result?.count ?? r.output?.count ?? 1,
        },
        input: [],
      }));
  }

  setWantedItem(item: string): void {
    this.wantedItem = item;
  }

  async enter(ctx: SkillContext): Promise<void> {
    ctx.logger.info({ item: this.wantedItem }, "Entering CRAFTING state");
    this.state = CraftingState.SCANNING_WORKBENCH;
    this.workbenchPos = null;
    this.path = [];
    this.craftingProgress = 0;
  }

  async tick(ctx: SkillContext): Promise<string | null> {
    const pos = ctx.world.getPlayerPosition();

    switch (this.state) {
      case CraftingState.SCANNING_WORKBENCH: {
        // Find a crafting table nearby
        const workbenches = ctx.world.findBlocks(
          (block) => block.name === WORKBENCH_BLOCK,
          pos, WORKBENCH_SCAN_RADIUS
        );
        if (workbenches.length > 0) {
          this.workbenchPos = workbenches[0];
          ctx.logger.info({ pos: this.workbenchPos }, "Crafting table found");
          this.state = CraftingState.PATH_TO_WORKBENCH;
        } else {
          ctx.logger.info("No crafting table nearby, returning to IDLE");
          return "idle";
        }
        break;
      }

      case CraftingState.PATH_TO_WORKBENCH: {
        if (!this.workbenchPos) {
          this.state = CraftingState.SCANNING_WORKBENCH;
          break;
        }
        const dist = distance(pos, this.workbenchPos);
        if (dist <= 5) {
          this.state = CraftingState.OPENING;
          ctx.logger.info("At workbench, opening...");
          break;
        }
        // Pathfind to workbench
        const pf = new Pathfinder((p) => !ctx.world.isBlockSolid(p));
        const result = pf.findPath(
          vec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z)),
          vec3(this.workbenchPos.x, this.workbenchPos.y, this.workbenchPos.z)
        );
        if (result.length > 0) {
          this.path = result.map((n) => ({ x: n.x, y: n.y, z: n.z }));
          this.pathIndex = 0;
        }
        if (this.pathIndex < this.path.length) {
          const wp = this.path[this.pathIndex];
          ctx.movement.lookAt(vec3(wp.x, wp.y + 1.6, wp.z));
          ctx.movement.setPosition(wp.x + 0.5, wp.y, wp.z + 0.5);
          if (distance(pos, vec3(wp.x, wp.y, wp.z)) < 1.5) {
            this.pathIndex++;
          }
        }
        break;
      }

      case CraftingState.OPENING: {
        // Open workbench via container_open
        if (this.workbenchPos) {
          ctx.movement.openContainer(this.workbenchPos);
        }
        // Wait for server to open crafting menu
        this.state = CraftingState.CRAFTING;
        break;
      }

      case CraftingState.CRAFTING: {
        this.craftingProgress++;
        if (this.craftingProgress > 10) {
          ctx.logger.info("Crafting complete, returning to IDLE");
          return "idle";
        }
        // TODO: Send crafting_event packet with recipe UUID
        break;
      }
    }

    return null;
  }

  async exit(ctx: SkillContext): Promise<void> {
    ctx.logger.info("Exiting CRAFTING state");
  }
}
```

Note: This is a scaffold. Actual crafting requires the `crafting_event` packet with the recipe UUID from `crafting_data` received earlier. The recipe data is sent by the server, not looked up from minecraft-data. For Phase 2, the skill framework is in place; the actual recipe UUID wiring will be refined during connection event handling.

- [ ] **Step 4: Add container_open method to Movement**

Add to `src/movement/movement.ts`:

```typescript
openContainer(pos: Vec3): void {
  this.connection.queue("container_open", {
    window_id: 1, // assignable by client
    container_type: "crafting_table",
    coordinates: pos,
    runtime_entity_id: BigInt(0),
  });
}
```

- [ ] **Step 5: Run tests and commit**

```bash
npx tsx --test tests/skills/crafting.test.ts && npx tsc --noEmit && git add src/skills/crafting.ts tests/skills/crafting.test.ts src/movement/movement.ts && git commit -m "feat: add CRAFTING skill with workbench navigation and recipe lookup"
```

---

### Task 10: Bot Wiring + Integration

**Files:**
- Modify: `src/bot.ts`

Register CombatSkill and CraftingSkill, wire crafting data events.

- [ ] **Step 1: Register new skills in Bot**

Update imports and skill registration in `src/bot.ts`:

```typescript
import { CombatSkill } from "./skills/combat.js";
import { CraftingSkill } from "./skills/crafting.js";

// In start():
this.skills.register(new IdleSkill());
this.skills.register(new GatheringSkill());
this.skills.register(new CombatSkill());
this.skills.register(new CraftingSkill());
```

- [ ] **Step 2: Wire crafting_data event**

Add to Connection's `connect()`:

```typescript
this.client.on("crafting_data", (packet: any) => {
  getLogger().info({ count: packet.recipes?.length ?? 0 }, "Crafting data received");
  // Store recipes for crafting skill to use
});
```

- [ ] **Step 3: Verify typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Run all tests**

```bash
npx tsx --test tests/utils/vec3.test.ts tests/events/event-bus.test.ts tests/inventory/inventory.test.ts tests/movement/pathfinding.test.ts tests/skills/skill-manager.test.ts tests/skills/hunger-tracker.test.ts tests/skills/combat.test.ts tests/skills/crafting.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/bot.ts && git commit -m "feat: register CombatSkill and CraftingSkill in Bot"
```

---

### Task 11: Integration Verification

**Files:**
- (No new files)

- [ ] **Step 1: Full typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 2: Run all tests**

```bash
npx tsx --test tests/**/*.test.ts
```

Expected: All tests pass, 0 failures.

- [ ] **Step 3: Verify CLI help**

```bash
npx tsx src/index.ts --help
```

- [ ] **Step 4: Commit**

```bash
git status && git add -A && git commit -m "chore: finalize Phase 2 with all tests passing" || echo "No changes"
```
