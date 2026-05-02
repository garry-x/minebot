# Behavior Tree Decision Engine — Design Spec

## Summary

Replace the current linear `Planner` (14-goal prerequisite chain in `src/planner/`) with a **Behavior Tree (BT)** that serves as the sole decision engine for the bot. The BT evaluates all five state dimensions (health/hunger/armor, inventory, environment, time-of-day, dimension) every tick and selects the skill to execute. All 7 existing skills remain unchanged — they handle tactical execution; the BT handles strategic decision-making.

---

## 1. Architecture Overview

```
Bot.tick (50ms loop)
  └→ BehaviorTree.tick(blackboard)
       ├→ Returns skill name (e.g. "gathering", "combat", "idle")
       ├→ SkillManager.setCurrent(skill, ctx)
       └→ SkillManager.tick(ctx)  // unchanged skill execution
```

**Files to remove:** `src/planner/planner.ts`, `src/planner/goals.ts`

**Files to add:** `src/bt/` directory (see §4)

**Files to modify:** `src/bot.ts` (tick loop simplified), `src/skills/skill-manager.ts` (remove priority intercepts)

---

## 2. Behavior Tree Root Structure

Priority from top to bottom. Higher nodes have absolute precedence.

```
Root (InterruptibleSelector — re-evaluates from top every tick)
│
├── 1. SURVIVAL (life-or-death, always first)
│   ├── hp < 30% AND has food → eat NOW
│   ├── hp < 30% AND no food → flee + dig hide
│   ├── hunger < 15 AND has food → eat NOW
│   ├── hunger == 0 → eat ANYTHING (extreme priority)
│   └── hostile within 2 blocks → immediate combat/flee
│
├── 2. SAFEHOUSE (safe environment, second)
│   ├── new phase AND no safehouse → buildSafehouse(phase)
│   ├── nighttime AND exposed → dig shelter / return to safehouse
│   ├── safehouse exists AND no torches → place torches
│   ├── safehouse exists AND missing workbench/furnace → place
│   ├── safehouse exists AND chest count < phase req → craft+place chest
│   └── Nether/End AND no foothold → buildFoothold
│
├── 3. THREAT_RESPONSE (non-emergency combat — preempts phase work)
│   ├── hostile within 16 blocks AND can fight → combat
│   ├── hostile within 16 blocks AND cannot fight → hide/avoid
│   └── hungry AND nearby passive animal → hunt for food
│
├── 4. PHASE_PROGRESS (only when alive, safe, and no threats)
│   ├── SPAWN: chop wood → craft chests → build safehouse
│   ├── STONE: place workbench+furnace → mine stone → stone pick+sword+axe → reinforce safehouse
│   ├── IRON: mine iron → smelt → iron pick+chestplate+sword → organize chests
│   ├── DIAMOND: mine diamond → diamond pick → collect obsidian → deep safehouse Y<12
│   ├── NETHER_ENTRY: build portal → ignite → full gear+chest check → enter
│   ├── NETHER: build nether foothold+chest → find fortress → kill blazes → kill endermen → stash
│   ├── END_PREP: craft ender eyes → return overworld → restock safehouse → locate stronghold
│   ├── STRONGHOLD: build entrance foothold+chest → navigate portal room → activate
│   └── END: full gear check → enter portal → destroy crystals → kill dragon
│
├── 5. MAINTENANCE (daily upkeep when safe + no phase work)
│   ├── inventory full → return to safehouse → deposit + sort
│   ├── hotbar layout incorrect → rearrange to standard
│   ├── tool durability < 25% → craft replacement → swap → stash old
│   ├── armor durability < 20% → craft replacement → swap → discard old
│   ├── any chest missing → craft chest + place in safehouse
│   ├── chest contents disorganized → sort by priority/category
│   ├── inventory contains garbage → drop low-priority items
│   ├── stockpile below minimum → gather missing + stash
│   └── daytime idle → sort chests, repair/expand safehouse
│
└── 6. IDLE (fallback: wander)
```

### InterruptibleSelector Semantics

The root uses an **InterruptibleSelector** (not standard Selector). Standard Selector "locks in" to a running child and skips higher-priority children on subsequent ticks. InterruptibleSelector re-evaluates from the first child every tick:

1. Tick child 1 (SURVIVAL). If SUCCESS → return; if FAILURE → continue; if RUNNING → return
2. Tick child 2 (SAFEHOUSE). Same pattern
3. Tick child 3 (THREAT_RESPONSE). Same pattern
4. ...

This means if the bot is mining (PHASE_PROGRESS RUNNING) and a creeper approaches within 16 blocks:
- Next tick: SURVIVAL FAILURE (not within 2 blocks), SAFEHOUSE FAILURE, THREAT_RESPONSE SUCCESS (creeper in range) → combat is engaged
- The InterruptibleSelector re-finds THREAT_RESPONSE as the active branch, preempting PHASE_PROGRESS
- When combat ends (THREAT_RESPONSE returns SUCCESS/FAILURE), PHASE_PROGRESS resumes on next tick

### Tick Flow Example

```
Tick 1:  SURVIVAL→FAIL, SAFEHOUSE→FAIL, THREAT→FAIL, PHASE_PROGRESS→RUNNING (mining)
Tick 2:  SURVIVAL→FAIL, SAFEHOUSE→FAIL, THREAT→RUNNING (zombie spotted!) → COMBAT
Tick 3:  ...combat...
Tick 10: SURVIVAL→FAIL, SAFEHOUSE→FAIL, THREAT→SUCCESS (zombie dead), PHASE_PROGRESS→RUNNING (resume mining)
```

---

## 3. Phases and Advancement

### Phase Table

| # | Phase | Goals | Stockpile (in chest) | Advance Condition | Skills |
|---|-------|-------|----------------------|-------------------|--------|
| 0 | **SPAWN** | Find trees, gather wood, craft chest, build mud safehouse | wood_log ×32, planks ×64, sticks ×32, crafting_table ×1, chest ×2 | Has 32 wood + safehouse + 2 chests | gathering, crafting, building |
| 1 | **STONE** | Place workbench+furnace, mine cobblestone, craft stone pick+sword+axe, craft 2 more chests, reinforce safehouse | cobblestone ×64, stone_pickaxe ×2, stone_sword ×2, stone_axe ×1, furnace ×2 | Has stone pickaxe ×2 + stone safehouse + 4 chests | gathering, crafting, building |
| 2 | **IRON** | Mine iron ore, smelt ingots, craft iron pick+chestplate+sword, craft more chests | iron_ingot ×20, iron_pickaxe ×2, iron_chestplate ×2, iron_sword ×2, coal ×32 | Has iron pickaxe + iron chestplate + stockpile met | gathering, crafting |
| 3 | **DIAMOND** | Mine diamond, craft diamond pick, collect obsidian, build deep safehouse Y<12 | diamond ×3, diamond_pickaxe ×2, obsidian ×20, golden_apple ×3 | Has diamond pickaxe + 20 obsidian + stockpile met | gathering, crafting, building |
| 4 | **NETHER_ENTRY** | Build nether portal (4×5 obsidian), ignite, enter | flint_and_steel ×2, obsidian ×4 (portal repair backup) | Current dimension = nether | building, crafting |
| 5 | **NETHER** | Build nether foothold, find fortress, kill blazes, kill endermen, stash rods and pearls in chest | blaze_rod ×12, ender_pearl ×24, cobblestone ×64 (foothold repair) | 6 blaze rods + 12 pearls in inventory (24 pearls stashed) | combat, gathering, building |
| 6 | **END_PREP** | Craft ender eyes, return overworld, restock safehouse, locate stronghold | ender_eye ×24, food ×32, iron_ingot ×20 (emergency backup) | 12 ender eyes in inventory + stronghold located | crafting, stronghold |
| 7 | **STRONGHOLD** | Build entrance foothold + chest, navigate portal room, activate | ender_eye ×4 (spares stashed at foothold), torches ×64 | Portal activated (event type=2) | stronghold, building |
| 8 | **END** | Full gear check, enter portal, destroy crystals, kill dragon | N/A (pre-stashed in overworld; take best gear only) | Boss defeated (event type=7) | dragon_hunt, combat |

### Phase Downgrade

| Trigger | New Phase |
|---------|-----------|
| Death (all items lost) | Re-evaluate: check remaining items → minimum matching phase |
| Inventory completely empty | SPAWN |
| Involuntary return from Nether | NETHER_ENTRY |

### Safehouse Requirements Per Phase

| Phase | Requirements |
|-------|-------------|
| SPAWN | 3×3 enclosed dirt hole, door/blocked entrance, 1+ torch, 2 chests |
| STONE | 5×5 enclosed stone/wood walls, 4+ torches, workbench, 2 furnaces, 4+ chests |
| IRON | Same as STONE + iron door replacement, 6+ chests organized (ores/metals, stone/tools, food, misc) |
| DIAMOND | New safehouse at Y<12, staircase connection, 4 chests, workbench, furnace |
| NETHER_ENTRY | Enclosed area around overworld portal, stone walls, torches, chest with backup supplies |
| NETHER | Fully enclosed cobblestone building, anti-ghast, multiple torches, chest with rods/pearls stash |
| END_PREP | Safehouse at stronghold entrance, chest with emergency backup gear |
| STRONGHOLD | Portal room entrances blocked off, torch lighting, chest with spare ender eyes |
| END | No safehouse (impossible in End) — stash emergency supplies in stronghold foothold chest |

### Stockpile Strategy

The bot maintains a **chest-based reserve** so that death does not reset all progress. Before advancing a phase, the stockpile minimum must be met (items counted in safehouse chests, not just inventory). After death, the bot returns to the safehouse, retrieves backup gear from chests, and resumes from the appropriate phase instead of starting over.

**Key rules:**

1. **Never carry all resources.** Always stash backup gear (spare pickaxe, spare sword, spare armor, spare food) in chests before leaving safehouse.
2. **Before entering Nether or End:** deposit ALL non-essential items into chests. Carry only combat gear, food, and dimensional items (ender eyes, flint & steel).
3. **Chest organization (IRON+ phases):**
   - Chest 1: building blocks (cobblestone, dirt, wood)
   - Chest 2: ores and ingots (iron, coal, diamond, gold)
   - Chest 3: tools and weapons (spare picks, swords, axes)
   - Chest 4: food (cooked meat, bread, golden apples)
   - Chest 5: dimensional items (ender pearls, blaze rods, obsidian)
   - Chest 6: miscellaneous (sticks, flint, string, feathers)
4. **Deposit trigger:** inventory slots > 80% full → return to nearest safehouse → deposit all non-hotbar items to correct chests.
5. **Restock trigger:** leave safehouse for phase tasks only when hotbar has: 1 pickaxe, 1 sword, 1 food stack (16+), 1 building block stack (64+), 1 torch stack (32+), 1 empty slot minimum.

### Item Organization & Priority System

The bot must actively organize items in hotbar, inventory, and chests based on **priority** and **category**. This prevents carrying garbage, ensures fast access to critical items, and keeps chests searchable.

#### Item Priority Tiers

Items are ranked S (critical) through E (disposable). When inventory is full, the lowest-tier items are dropped first.

| Tier | Type | Examples | Rule |
|------|------|----------|------|
| **S** | Combat/Progress | diamond_pickaxe, diamond_sword, ender_eyes, blaze_rods, golden_apple, totem_of_undying | Never drop. Always keep in hotbar/chest. |
| **A** | Tools/Weapons | iron_pickaxe, iron_sword, iron_axe, diamond, iron_ingot, obsidian, bow, arrows, flint_and_steel | Keep. Stash spares in chest. |
| **B** | Armor/Food | iron_chestplate, cooked_beef, bread, golden_carrot | Keep. Stash spares. |
| **C** | Building/Mining | cobblestone, dirt, coal, torches, sticks, planks, raw_iron, raw_copper | Keep stacks. Deposit excess. |
| **D** | Crafting Material | string, feathers, leather, flint, seeds, gravel, sand | Keep small stacks. Drop if full. |
| **E** | Garbage | rotten_flesh, poisonous_potato, spider_eye, dirt (excess), cobblestone (excess), seeds (excess) | Drop immediately when inventory > 80% full. |

#### Hotbar Standard Layout (9 slots, left to right)

The hotbar is always organized to this standard layout. Any deviation triggers a rearrange.

| Slot | Item | Priority | Reason |
|------|------|----------|--------|
| 1 | Sword (best available) | S | Immediate combat access |
| 2 | Pickaxe (best available) | S | Immediate mining access |
| 3 | Axe or shovel | A | Secondary tool |
| 4 | Food (best available, stack 16+) | B | Quick eating |
| 5 | Building blocks (cobblestone/dirt, stack 64) | C | Quick placement, bridging, pillaring |
| 6 | Torches (stack 32+) | C | Lighting, preventing mob spawns |
| 7 | Water bucket | B | Fall damage cancel, lava handling |
| 8 | Ender eyes / bow / situational | A | Depends on phase |
| 9 | Empty or utility | - | Block interaction space |

#### Inventory Sorting Rules (non-hotbar, 27 slots)

1. **Density sort:** higher-tier items closer to the top (lower slot numbers). Same tier → larger stacks first.
2. **Tool comparison:** when multiple picks/swords exist, equip the best one in hotbar. Move the second-best to chest. Drop worse ones if chest unavailable.
3. **Stack merging:** always merge partial stacks of the same item type.
4. **Drop-on-full:** when returning to safehouse isn't possible (e.g. in Nether), drop E-tier items immediately, then D-tier if still full.

#### Chest Organization Rules (per safehouse)

1. **Chest assignment by category (see §3 Chest Organization).** New items go to the correct category chest.
2. **Within each chest:** S-tier items in top slots, A-tier below, then B, C, D. Garbage never enters chests.
3. **Stack consolidation:** when depositing, always merge with existing partial stacks first.
4. **Restock extraction:** when leaving safehouse, pull items FROM chests to hotbar in reverse: first fill hotbar slot 9, then 8, 7, etc. ensuring the standard layout.

#### Organization Triggers (checked in Maintenance)

| Trigger | Action |
|---------|--------|
| Hotbar doesn't match standard layout | Rearrange hotbar slots |
| Inventory has E-tier items | Drop them |
| Inventory > 80% full | Return to safehouse → deposit by category → sort chests |
| Chest has items in wrong category | Move to correct chest |
| Chest has unmerged stacks | Merge stacks |
| Multiple tools of same type | Keep 2 best, drop/discard rest |
| After crafting new tool | Compare with equipped → keep best, stash/drop worse |

### Durability Management

Tools and armor degrade with use. The bot must track durability from incoming packets, proactively replace worn items, and stash spares.

#### Durability Data Source

Bedrock `inventory_slot` packets include NBT data with the item's current damage value. The bot extracts this into `InventorySlot.durability` (remaining uses, where 0 = broken). When a slot update arrives, the bot also records `maxDurability` via `minecraft-data` item registry lookup.

#### Replacement Thresholds

| Remaining % | Action for Hotbar Tools | Action for Armor |
|---|---|---|
| > 50% | Keep using | Keep wearing |
| 25–50% | Craft replacement, swap when ready | Craft replacement, wear when ready |
| 10–25% | Replace immediately if spare in chest/inventory | Replace immediately |
| < 10% | Retire to chest (emergency backup) or discard | Discard (broken armor has no value) |

For wood/stone tools (< 100 max durability), thresholds are doubled (e.g. "25–50%" becomes "50–100%") because they break much faster.

#### Pre-Critical-Phase Durability Check

Before entering **Nether** or **End**, the bot checks ALL equipped items:

| Check | Requirement | Action if Fail |
|---|---|---|
| Pickaxe durability | > 50% remaining | Craft new one, stash old |
| Sword durability | > 50% remaining | Craft new one, stash old |
| Armor durability (each piece) | > 40% remaining | Craft replacement piece |
| Backup pickaxe in inventory | Must have one | Craft one before leaving |
| Backup food in inventory | 32+ total | Gather/cook more |

This check is a **blocking gate** — the bot will NOT enter the portal until all durability requirements are met.

#### Durability Maintenance Rules

1. **Best tool first:** When multiple tools of same type exist, auto-equip the one with highest remaining durability. Stash the lower one.
2. **Tool rotation:** After extended mining (> 50 blocks mined), re-check pickaxe durability. If < 25%, swap to backup and queue crafting a new one.
3. **Broken tool handling:** If a tool breaks mid-use (slot suddenly empty), switch to backup in hotbar. If no backup, retreat to safehouse and craft.
4. **Armor durability:** Track armor durability the same way. Broken armor = no protection = high risk. Replace piece immediately.
5. **Golden tools special case:** Golden tools have very low max durability (33). Always discard them (E tier) — never keep or stash.

#### Data Flow

```
inventory_slot packet
  → extract item.damage (NBT)
  → compute durability_pct = 1 - (damage / maxDurability)
  → store on InventorySlot.durability
  → emit inventory_change with durability
  → BT conditions read InventorySlot.durability for decisions
```

---

## 4. File Structure

```
src/bt/
├── types.ts              # NodeStatus, Blackboard, PhaseType, BTNode interface
├── behavior-tree.ts      # BehaviorTree class (tick, reset, blackboard management)
├── nodes/
│   ├── selector.ts           # Standard Selector (first SUCCESS/RUNNING wins)
│   ├── interruptible.ts      # InterruptibleSelector (re-evaluates top-down every tick)
│   ├── sequence.ts           # Sequence composite node
│   ├── condition.ts          # Condition leaf (pure check, no side effects)
│   └── action.ts             # Action leaf (executes skill, returns RUNNING)
├── conditions/
│   ├── health.ts         # isHealthLow, isStarving, hasArmor, hasFood
│   ├── inventory.ts      # hasItem, isInventoryFull, hasPickaxe, hasWood, hasStone
│   ├── environment.ts    # isNight, hostilesInRange, isExposed, isInNether, isInEnd
│   ├── durability.ts     # toolDurabilityLow, armorDurabilityLow, hasBackupTool, needsPrePortalCheck
│   ├── stockpile.ts      # isStockpileMet, chestCountEnough, hasBackupGear, needsRestock
│   ├── organization.ts   # isHotbarOkay, hasGarbageInInventory, chestNeedsSort
│   └── phase.ts          # isPhase, hasReachedPhase, getPhaseAdvanceCondition
├── actions/
│   ├── skill.ts          # executeGathering, executeCombat, executeCrafting, executeBuilding
│   ├── survival.ts       # eatFood, fleeToSafety, digHideHole
│   ├── safehouse.ts      # buildSafehouse, placeWorkbench, placeFurnace, placeTorches, buildFoothold
│   ├── storage.ts        # placeChest, depositItems, restockFromChest, sortChests, countChestItems
│   ├── organization.ts   # standardizeHotbar, sortInventory, mergeStacks, dropGarbage, sortChestByCategory
│   └── utility.ts        # wait, dropItem
├── phases/
│   ├── spawn.ts          # SPAWN phase subtree
│   ├── stone.ts          # STONE phase subtree
│   ├── iron.ts           # IRON phase subtree
│   ├── diamond.ts        # DIAMOND phase subtree
│   ├── nether_entry.ts   # NETHER_ENTRY phase subtree
│   ├── nether.ts         # NETHER phase subtree
│   ├── end_prep.ts       # END_PREP phase subtree
│   ├── stronghold.ts     # STRONGHOLD phase subtree
│   └── end.ts            # END phase subtree
├── safehouse.ts          # SafehouseCheck subtree + safehouse state tracking
├── survival.ts           # SurvivalCheck subtree
├── threat.ts             # ThreatResponse subtree
├── maintenance.ts        # Maintenance subtree
└── tree.ts               # Root tree assembly, phase determination
```

**Files to modify:**

| File | Change |
|------|--------|
| `src/bot.ts` | Replace Planner with BehaviorTree; simplify tick loop; add day/night tracking; add hp tracking field |
| `src/skills/skill-manager.ts` | Remove `requestWithPriority()` and priority interrupt logic; keep `setCurrent()` + `tick()` |
| `src/skills/skill.ts` | Add `hp: number` and `daytime: boolean` to SkillContext |
| `src/connection/connection.ts` | Extract item damage/durability from `inventory_slot` NBT data; pass in `inventory_change` event |
| `src/world/types.ts` | Add `maxDurability: number` to `InventorySlot` |
| `src/inventory/inventory.ts` | Add `getDurability(slot)`, `getBestDurability(itemType)`, `findBrokenTool()` |

**Files to remove:**

| File | Reason |
|------|--------|
| `src/planner/planner.ts` | Replaced by BehaviorTree |
| `src/planner/goals.ts` | Replaced by PhaseType enum + phase definitions |

---

## 5. Core Data Types

```typescript
// src/bt/types.ts

enum NodeStatus { SUCCESS, FAILURE, RUNNING }

enum PhaseType {
  SPAWN, STONE, IRON, DIAMOND,
  NETHER_ENTRY, NETHER, END_PREP, STRONGHOLD, END
}

interface Blackboard {
  ctx: SkillContext;
  currentPhase: PhaseType;
  phaseData: Record<string, unknown>;  // per-phase scratch data
  safehouseState: {
    built: boolean;
    position: Vec3 | null;
    hasWorkbench: boolean;
    hasFurnace: boolean;
    hasTorches: boolean;
    chestCount: number;          // how many chests placed
  };
  stockpileState: {
    trackedChests: Vec3[];       // known chest positions
    lastDepositTime: number;     // timestamp of last deposit
    stockpileMet: boolean;       // current phase stockpile minimum met
  };
  organizationState: {
    hotbarLayoutOk: boolean;     // hotbar matches standard layout
    hasGarbage: boolean;         // inventory contains E-tier items
    lastSortTime: number;        // timestamp of last inventory sort
  };
}

interface BTNode {
  tick(bb: Blackboard): NodeStatus;
  reset(): void;
}
```

---

## 6. Bot Tick Loop (simplified)

```typescript
// bot.ts — key changes

// NEW fields:
private tree: BehaviorTree;
private hp: number = 20;       // tracked from update_attributes
private daytime: boolean = true; // tracked from time/light

// Tick loop replaces planner.getRecommendedSkill():
const nextSkill = this.tree.tick(this.getBlackboard());
if (nextSkill && nextSkill !== this.skills.getCurrentSkillName()) {
  this.skills.setCurrent(nextSkill, ctx);
}
this.skills.tick(ctx);
```

---

## 7. Day/Night Cycle Tracking

Day/night is determined from the `set_time` packet. When `time % 24000 < 13000`, it is daytime; otherwise night. Exposed (no blocks above head within 10 blocks) is checked via `WorldState.getBlock()`.

---

## 8. Combat Interruption / Task Resumption

When `ThreatResponse` or `Survival` triggers combat mid-phase-task:
- The BT `Sequence` in the phase task receives RUNNING → continues when combat action returns SUCCESS
- The combat/flee action itself returns RUNNING while active, SUCCESS when threat is gone or defeated
- No explicit "interrupt/resume" mechanism needed — the BT naturally handles this via node status propagation

### Combat Capability Check

`canFight` evaluates to true when ALL of:
- Has a weapon (any sword or axe) in hotbar
- HP > 50% (10/20)
- NOT in flee state

### Exposure Check (isExposed)

The bot is "exposed" when scanning the column above its head (y+1 to y+10) finds only air blocks — meaning no overhead cover. Used by night shelter logic.

---

## 9. Metrics / Dashboard

BehaviorTree emits events to the existing `MetricsCollector`:
- Phase transitions
- Survival triggers (health low, eating, fleeing)
- Safehouse builds
- Combat engagements

---

## 10. Acceptance Criteria

1. Bot connects to server and immediately prioritizes survival
2. Bot builds a safehouse with chests before pursuing any phase goal
3. Bot crafts and places chests, deposits excess items, and maintains stockpile minimums per phase
4. Bot organizes items by priority (S/A/B/C/D/E tiers), maintains standard hotbar layout, and drops garbage
5. Bot sorts chest contents by category and priority, merging partial stacks
6. Bot dynamically switches between combat/survival/mining/depositing/sorting based on real-time state
7. Bot advances through all 9 phases autonomously, meeting stockpile requirements before each advance
8. On death, bot returns to safehouse, retrieves backup gear from chests, and resumes at appropriate phase
9. Bot kills the Ender Dragon on target Minecraft Bedrock server
10. Existing 7 skills continue to function without regression
