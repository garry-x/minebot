import { Connection } from "./connection/connection.js";
import { WorldState } from "./world/world-state.js";
import { Movement } from "./movement/movement.js";
import { Inventory } from "./inventory/inventory.js";
import { SkillManager } from "./skills/skill-manager.js";
import { IdleSkill } from "./skills/idle.js";
import { GatheringSkill } from "./skills/gathering.js";
import { CombatSkill } from "./skills/combat.js";
import { CraftingSkill, storeRecipes } from "./skills/crafting.js";
import { BuildingSkill } from "./skills/building.js";
import { StrongholdSkill } from "./skills/stronghold.js";
import { EnderDragonHuntSkill } from "./skills/dragon-hunt.js";
import { HungerTracker } from "./player/hunger.js";
import { EventBus, BotEvents } from "./events/event-bus.js";
import { BehaviorTree } from "./bt/behavior-tree.js";
import { rootTree, determinePhase } from "./bt/tree.js";
import { PhaseType, type Blackboard, type SafehouseState, type StockpileState, type OrganizationState } from "./bt/types.js";
import { createLogger, getLogger } from "./utils/logger.js";
import { MetricsCollector } from "./telemetry/metrics.js";
import { Dashboard } from "./telemetry/dashboard.js";
import { PathfindingCircuitBreaker } from "./movement/circuit-breaker.js";
import type { SkillContext } from "./skills/skill.js";

export interface BotConfig {
  host: string;
  port: number;
  email: string;
  password?: string;
  username?: string;
  viewDistance?: number;
  tickInterval?: number;
  debug?: boolean;
  offline?: boolean;
  diagnose?: boolean;
  tracePackets?: boolean;
}

export class Bot {
  private config: BotConfig;
  private events = new EventBus<BotEvents>();
  private connection!: Connection;
  private world!: WorldState;
  private movement!: Movement;
  private inventory!: Inventory;
  private skills!: SkillManager;
  private hunger = new HungerTracker();
  private tree: BehaviorTree | null = null;
  private hp: number = 20;
  private daytime: boolean = true;
  private _startGameBlockHashes: boolean = false;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private metrics = new MetricsCollector();
  private dashboard!: Dashboard;
  private circuitBreaker = new PathfindingCircuitBreaker();
  private startTime: number = 0;

  constructor(config: BotConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    this.startTime = Date.now();
    const logger = createLogger({
      level: this.config.debug ? "debug" : "info",
      pretty: true,
    });

    logger.info("Minebot starting...");

    const diag = this.config.diagnose ? (label: string) => {
      logger.info(`[DIAG] ${label} (${Date.now() - diagStart}ms)`);
    } : () => {};
    let diagStart = Date.now();

    // 1. Connect (bedrock-protocol handles auth internally)
    this.connection = new Connection(
      {
        host: this.config.host,
        port: this.config.port,
        username: this.config.username ?? "Minebot",
        email: this.config.email,
        viewDistance: this.config.viewDistance,
        offline: this.config.offline,
        tracePackets: this.config.tracePackets,
      },
      this.events
    );
    this.connection.setMetrics(this.metrics);
    diag("Connection created");

    // 3. Initialize modules
    this.world = new WorldState("bedrock_1.21");
    this.movement = new Movement(this.connection);
    this.inventory = new Inventory();

    // 4. Register skills
    this.skills = new SkillManager();
    this.skills.setMetrics(this.metrics);
    this.skills.register(new IdleSkill());
    this.skills.register(new GatheringSkill());
    this.skills.register(new CombatSkill());
    this.skills.register(new CraftingSkill());
    this.skills.register(new BuildingSkill());
    this.skills.register(new StrongholdSkill());
    this.skills.register(new EnderDragonHuntSkill());

    // 5. Wire up event handlers (chunks, entities, etc. — stubs for Phase 1)
    this.setupEventHandlers();

    this.events.once("spawned", () => {
      const ctx = this.getSkillContext();
      const bb: Blackboard = {
        ctx,
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
      bb.currentPhase = determinePhase(bb);
      logger.info(`BT: determined initial phase = ${PhaseType[bb.currentPhase]}`);
      this.tree = new BehaviorTree(rootTree, bb);
    });

    // 6. Connect to server
    this.connection.connect();

    // 7. Wait for spawn, then start tick loop
    this.events.on("spawned", (packet) => {
      diag("Spawned");
      logger.info({ pos: { x: packet.x, y: packet.y, z: packet.z } }, "Spawned, starting tick loop");
      this.world.updatePlayerPosition({ x: packet.x, y: packet.y, z: packet.z });
      this.movement.updateServerPosition(packet.x, packet.y, packet.z);

      if (!this.isRunning) {
        getLogger().info("Respawned, resuming tick loop");
        this.isRunning = true;
      }

      // Store block_network_ids_are_hashes for later use with item_registry
      this._startGameBlockHashes = packet.block_network_ids_are_hashes ?? false;

      // handleStartGame is deferred to item_registry event (post-1.21.60)

      this.dashboard = new Dashboard(this.metrics, this.world, this.skills, this.hunger);

      if (this.tickTimer) return;

      const ctx = this.getSkillContext();
      this.skills.setCurrent("idle", ctx);

      const DASHBOARD_INTERVAL_MS = 5000;
      const PLANNER_INTERVAL_TICKS = 100;
      const TICK_THROTTLE_THRESHOLD_MS = 100;
      const tickInterval = this.config.tickInterval ?? 50;
      let plannerTick = 0;
      let lastDashboardPrint = 0;
      let throttleWarned = false;

      this.tickTimer = setInterval(() => {
        if (!this.isRunning) return;

        const tickStart = Date.now();
        const avgTick = this.metrics.getAvgTickDurationMs();

        if (avgTick > TICK_THROTTLE_THRESHOLD_MS && !throttleWarned) {
          getLogger().warn({ avgTickMs: avgTick }, "Tick throttling — high latency detected");
          throttleWarned = true;
        } else if (avgTick <= TICK_THROTTLE_THRESHOLD_MS && throttleWarned) {
          getLogger().info({ avgTickMs: avgTick }, "Tick latency normalized");
          throttleWarned = false;
        }

        plannerTick++;
        if (plannerTick % PLANNER_INTERVAL_TICKS === 0) {
          if (this.tree) {
            const bb = this.tree.getBlackboard();
            bb.hp = this.hp;
            bb.daytime = this.daytime;
            bb.dimension = this.world.getDimension();
            bb.lastSkill = this.skills.getCurrentSkillName();
            bb.currentPhase = determinePhase(bb);

            const nextSkill = this.tree.tick();
            if (nextSkill && nextSkill !== this.skills.getCurrentSkillName()) {
              this.skills.setCurrent(nextSkill, ctx);
            }
          }
        }

        this.skills.tick(ctx).catch((err) => {
          logger.error({ err }, "Tick error");
        });

        this.movement.flush();

        const movePos = this.movement.getPosition();
        const worldPos = this.world.getPlayerPosition();
        if (Math.abs(movePos.x - worldPos.x) > 0.01 ||
            Math.abs(movePos.y - worldPos.y) > 0.01 ||
            Math.abs(movePos.z - worldPos.z) > 0.01) {
          this.world.updatePlayerPosition(movePos);
        }

        this.metrics.recordTick(Date.now() - tickStart);

        const now = Date.now();
        if (now - lastDashboardPrint >= DASHBOARD_INTERVAL_MS) {
          this.metrics.updateSystemStats(
            this.world.getEntities().length,
            this.world.getColumns().size
          );
          this.dashboard.print();
          lastDashboardPrint = now;
        }
      }, tickInterval);

      logger.info(`Tick loop started (${tickInterval}ms)`);
    });

    // Handle disconnect
    this.events.on("disconnect", ({ reason }) => {
      logger.warn({ reason }, "Disconnected, stopping");
      this.stop();
    });

    // Handle errors
    this.events.on("error", ({ message, error }) => {
      logger.error({ err: error }, `Bot error: ${message}`);
    });
  }

  private setupEventHandlers(): void {
    // Track player position
    this.events.on("player_position", (pos) => {
      this.world.updatePlayerPosition(pos);
      this.movement.updateServerPosition(pos.x, pos.y, pos.z);
    });

    this.events.on("player_death", ({ message }) => {
      getLogger().warn({ message }, "Bot died, pausing tick loop");
      this.isRunning = false;
      this.tree?.reset();
      this.skills.setCurrent("idle", this.getSkillContext());
      this.world.clearEntities();
    });

    this.events.on("health_change", ({ health }) => {
      this.hp = Math.max(0, Math.min(20, health));
    });

    this.events.on("time_change", ({ time }) => {
      this.daytime = (time % 24000) < 13000;
    });

    this.events.on("chunk_loaded", ({ x, z, payload, subChunkCount, dimension }) => {
      try {
        let column = this.world.getColumn(x, z);
        if (!column) {
          column = this.world.createColumn(x, z);
          this.world.addColumn(x, z, column);
        }
        if (subChunkCount === -1) {
          return;
        }
        if (subChunkCount === -2) {
          (column as any).networkDecodeNoCache(payload, -2);
          const manager = this.connection.getSubchunkManager();
          if (manager) {
            manager.onLevelChunk(x, z, dimension ?? this.world.getDimension(), column);
          }
          return;
        }
        (column as any).networkDecodeNoCache(payload, subChunkCount);
      } catch (err: any) {
        getLogger().error({ err, chunkX: x, chunkZ: z, subChunkCount }, "Failed to load chunk");
      }
    });

    this.events.on("entity_spawn", (data) => {
      this.world.addEntity({
        id: data.uniqueId,
        runtimeId: data.runtimeId,
        type: data.type,
        position: { x: data.x, y: data.y, z: data.z },
        velocity: data.velocity,
        isHostile: data.isHostile,
      });
    });

    this.events.on("entity_despawn", (data) => {
      getLogger().debug({ uniqueId: String(data.uniqueId) }, "Entity despawn");
      this.world.removeEntity(data.uniqueId);
    });

    let entityMoveCount = 0;
    this.events.on("entity_move", (data) => {
      entityMoveCount++;
      if (entityMoveCount <= 3) {
        getLogger().info({ runtimeId: String(data.runtimeId), x: data.x, y: data.y, z: data.z }, "entity_move");
      }
      this.world.updateEntityPosition(data.runtimeId, { x: data.x, y: data.y, z: data.z });
    });

    this.events.on("inventory_change", (data) => {
      if (data.slot >= 36) {
        const armorSlot = data.slot - 36;
        if (data.item === null) {
          this.inventory.setArmor(armorSlot, null);
        } else {
          const itemName = this.world.getItemName(data.item.id);
          const durability = this.computeDurability(itemName, data.item.damage);
          this.inventory.setArmor(armorSlot, {
            slot: armorSlot,
            itemId: data.item.id,
            count: data.item.count,
            metadata: data.item.metadata,
            name: itemName,
            durability,
            maxDurability: durability < 1 ? this.getMaxDurability(itemName) : undefined,
          });
        }
        return;
      }
      if (data.item === null) {
        this.inventory.setSlot(data.slot, null);
      } else {
        const itemName = this.world.getItemName(data.item.id);
        const durability = this.computeDurability(itemName, data.item.damage);
        this.inventory.setSlot(data.slot, {
          slot: data.slot,
          itemId: data.item.id,
          count: data.item.count,
          metadata: data.item.metadata,
          name: itemName,
          durability,
          maxDurability: durability < 1 ? this.getMaxDurability(itemName) : undefined,
        });
      }
    });

    this.events.on("hunger_change", ({ hunger, saturation, exhaustion }) => {
      this.hunger.hunger = hunger;
      this.hunger.saturation = saturation;
      this.hunger.exhaustion = exhaustion;
      getLogger().debug({ hunger, saturation, exhaustion }, "Hunger update");
    });

    this.events.on("crafting_data", ({ recipes }) => {
      storeRecipes(recipes);
      getLogger().debug({ count: recipes.length }, "Recipes stored");
    });

    this.events.on("dimension_change", ({ dimension, x, y, z }) => {
      this.world.setDimension(dimension);
      this.world.updatePlayerPosition({ x, y, z });
      this.movement.updateServerPosition(x, y, z);
      getLogger().info({ dimension }, "Dimension changed");
    });

    this.events.on("boss_event", ({ entityId, eventType, progress }) => {
      getLogger().info({ entityId: String(entityId), eventType, progress }, "Boss event");
    });

    // item_registry event (Bedrock 1.21.60+): itemstates come here instead of start_game
    this.events.on("item_registry", ({ itemstates }) => {
      getLogger().info({ count: itemstates.length }, "item_registry received, calling handleStartGame");
      this.world.handleStartGame({
        itemstates,
        block_network_ids_are_hashes: this._startGameBlockHashes,
      });
      const reg = this.world.registry as any;
      const blockCount = reg.blocksByRuntimeId ? Object.keys(reg.blocksByRuntimeId).length : 0;
      getLogger().info({ blockCount, blockHashes: this._startGameBlockHashes }, "blocksByRuntimeId populated from item_registry");
    });

    this.events.on("portal_event", ({ eventType }) => {
      if (eventType === 2) {
        getLogger().info("End portal activated!");
      } else if (eventType === 7) {
        getLogger().info("Boss defeated!");
      }
    });
  }

  private getSkillContext(): SkillContext {
    return {
      world: this.world,
      movement: this.movement,
      inventory: this.inventory,
      events: this.events,
      logger: getLogger(),
      hunger: this.hunger,
      metrics: this.metrics,
      circuitBreaker: this.circuitBreaker,
      hp: this.hp,
      daytime: this.daytime,
    };
  }

  private computeDurability(itemName: string | undefined, damage: number | undefined): number {
    if (!damage || damage <= 0) return 1;
    if (!itemName) return 1;
    const max = this.getMaxDurability(itemName);
    if (max <= 0) return 1;
    return Math.max(0, 1 - (damage / max));
  }

  private getMaxDurability(itemName: string | undefined): number {
    if (!itemName) return 0;
    try {
      const regItem = (this.world as any).registry?.itemsByName?.[itemName];
      if (regItem?.maxDurability) return regItem.maxDurability;
    } catch { /* registry might not have item */ }
    return 0;
  }

  getHungerTracker(): HungerTracker {
    return this.hunger;
  }

  getUptime(): string {
    if (!this.startTime) return "0s";
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    return m > 0 ? `${m}m${s}s` : `${s}s`;
  }

  getPhase(): string {
    return this.tree?.getBlackboard().currentPhase ?? "SPAWN";
  }

  getInventorySummary(): string {
    const items = this.inventory.getAllItems();
    const used = Array.from(items.values()).filter(s => s !== null).length;
    return `${used}/${items.size}`;
  }

  getToolDurability(): Array<{name: string; pct: number}> {
    const results: Array<{name: string; pct: number}> = [];
    const items = this.inventory.getAllItems();
    const priority = ["sword", "pickaxe", "axe", "shovel", "hoe"];
    for (const [slot, item] of items) {
      if (!item || !item.name) continue;
      const name = item.name || "";
      const isTool = ["sword", "pickaxe", "axe", "shovel", "hoe"].some(t => name.includes(t));
      if (!isTool) continue;
      const dur = this.inventory.getDurability(slot);
      if (dur === undefined || dur === null) continue;
      results.push({ name, pct: dur });
    }
    results.sort((a, b) => {
      const aP = priority.findIndex(p => a.name.includes(p));
      const bP = priority.findIndex(p => b.name.includes(p));
      if (aP !== bP) return aP - bP;
      return b.pct - a.pct;
    });
    return results.slice(0, 3);
  }

  getPathfindingStatus(): string {
    const progress = this.movement.getPathProgress?.();
    if (!progress || progress.total === 0) return "idle";
    const breakdown = (this.movement as any).getPathBreakdown?.() || {};
    const parts: string[] = [];
    for (const [type, count] of Object.entries(breakdown)) {
      parts.push(`${type}×${count}`);
    }
    return `${progress.total} nodes ${parts.join(" ")}`;
  }

  getSubchunkStatus(): string {
    const mgr = (this.connection as any).getSubchunkManager?.();
    if (!mgr) return "N/A";
    const stats = mgr.getStats?.() || { received: 0, requested: 0, pending: 0 };
    return `${stats.received}/${stats.requested || stats.received}`;
  }

  getMobSummary(): {hostile: string; passive: string; neutral: string} {
    const pos = this.world.getPlayerPosition();
    const nearby = this.world.getNearbyEntities(pos, 32);
    const hostile: Map<string, number> = new Map();
    const passive: Map<string, number> = new Map();
    const neutral: Map<string, number> = new Map();
    const HOSTILE_SET = new Set(["zombie","husk","drowned","zombie_villager","skeleton","stray","wither_skeleton","spider","cave_spider","creeper","witch","enderman","slime","blaze","ghast","magma_cube","silverfish","endermite","guardian","elder_guardian","phantom","pillager","vindicator","evoker","ravager","vex","hoglin","zoglin","piglin_brute","warden"]);
    const PASSIVE_SET = new Set(["cow","sheep","pig","chicken","rabbit","horse","donkey","mule","fox","wolf","cat","parrot","turtle","squid","bee","goat","axolotl","frog","cod","salmon","tropical_fish","pufferfish","mooshroom","ocelot","panda","polar_bear","villager","wandering_trader","trader_llama","llama","bat","allay","armadillo","sniffer","camel"]);
    for (const entity of nearby) {
      const name = entity.name?.replace("minecraft:", "") || "unknown";
      if (HOSTILE_SET.has(name)) { hostile.set(name, (hostile.get(name) || 0) + 1); }
      else if (PASSIVE_SET.has(name)) { passive.set(name, (passive.get(name) || 0) + 1); }
      else { neutral.set(name, (neutral.get(name) || 0) + 1); }
    }
    const fmt = (m: Map<string, number>) => {
      const total = [...m.values()].reduce((a,b)=>a+b,0);
      const detail = [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>`${k}×${v}`).join(" ");
      return detail ? `${total} (${detail})` : "0";
    };
    return { hostile: fmt(hostile), passive: fmt(passive), neutral: fmt(neutral) };
  }

  getEnvironmentInfo(): {biome: string; lightLevel: number; groundBlock: string; nearbyResources: string; nearestWater: number; nearestLava: number} {
    const pos = this.world.getPlayerPosition();
    const ground = this.world.getBlock({ x: pos.x, y: pos.y - 1, z: pos.z });
    const groundName = ground?.name?.replace("minecraft:", "") || "air";
    
    let nearestWater = -1;
    let nearestLava = -1;
    for (let r = 1; r <= 32; r++) {
      for (const dx of [-r, r]) {
        for (let dz = -r; dz <= r; dz++) {
          if (nearestWater < 0 && this.world.isWaterBlock?.({ x: pos.x + dx, y: pos.y, z: pos.z + dz })) nearestWater = r;
          const b = this.world.getBlock({ x: pos.x + dx, y: pos.y, z: pos.z + dz });
          if (nearestLava < 0 && b?.name?.includes("lava")) nearestLava = r;
        }
      }
      for (const dz of [-r, r]) {
        for (let dx = -r; dx <= r; dx++) {
          if (nearestWater < 0 && this.world.isWaterBlock?.({ x: pos.x + dx, y: pos.y, z: pos.z + dz })) nearestWater = r;
          const b = this.world.getBlock({ x: pos.x + dx, y: pos.y, z: pos.z + dz });
          if (nearestLava < 0 && b?.name?.includes("lava")) nearestLava = r;
        }
      }
      if (nearestWater > 0 && nearestLava > 0) break;
    }
    
    const ores = this.world.findOres?.(pos, 16) || [];
    const oreCount: Map<string, number> = new Map();
    for (const o of ores) {
      const n = o.name?.replace("minecraft:", "") || "unknown";
      oreCount.set(n, (oreCount.get(n) || 0) + 1);
    }
    const nearby = [...oreCount.entries()].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>`${k}×${v}`).join(" ");
    
    return {
      biome: "unknown",
      lightLevel: 0,
      groundBlock: groundName,
      nearbyResources: nearby || "none",
      nearestWater,
      nearestLava,
    };
  }

  getSafehouseState(): string {
    const bb = this.tree?.getBlackboard();
    const sh = bb?.safehouseState;
    if (!sh) return "no safehouse";
    const bench = sh.hasWorkbench ? "✓" : "✗";
    const furnace = sh.hasFurnace ? "✓" : "✗";
    const chests = sh.chestCount ?? 0;
    return `WBench:${bench} Furn:${furnace} Box×${chests}`;
  }

  getStatus(): object {
    const mobs = this.getMobSummary();
    const env = this.getEnvironmentInfo();
    const tools = this.getToolDurability();
    const dimMap = ["Overworld", "Nether", "End"];
    const armorSlot = this.inventory.getArmor?.(1); // chestplate
    const armorMat = armorSlot?.name?.split("_")[1] || "none";
    return {
      host: this.config.host,
      port: this.config.port,
      uptime: this.getUptime(),
      avgTickMs: this.metrics?.getAvgTickDurationMs?.() ?? 0,
      hp: this.hp,
      maxHp: 20,
      hunger: Math.round((this.hunger as any).getHungerRatio?.() * 20 ?? 20),
      armorMaterial: armorMat,
      pos: this.world.getPlayerPosition(),
      phase: this.getPhase(),
      dimension: dimMap[this.world.getDimension()] || "Unknown",
      daytime: this.daytime ? "day" : "night",
      skill: this.skills.getCurrentSkillName?.() || "idle",
      inventorySlots: parseInt(this.getInventorySummary().split("/")[0]) || 0,
      toolDurability: tools,
      ...env,
      pathfinding: this.getPathfindingStatus(),
      chunkCount: (this.world as any).world?.columns?.size ?? 0,
      subchunkCount: this.getSubchunkStatus(),
      hostileMobs: mobs.hostile,
      passiveMobs: mobs.passive,
      neutralMobs: mobs.neutral,
      safehouse: this.getSafehouseState(),
    };
  }

  goto(x: number, y: number, z: number): boolean {
    const { Pathfinder } = require("../movement/pathfinding.js");
    const { TraversalContext } = require("../movement/pathfinding-types.js");
    const ctx: any = new TraversalContext(this.world);
    ctx.inventory = this.inventory;
    const pf = new Pathfinder(ctx, 10000, undefined, this.circuitBreaker);
    const start = this.world.getPlayerPosition();
    const path = pf.findPath(start, { x, y, z });
    if (path.length === 0) return false;
    this.movement.initPath(path);
    return true;
  }

  say(message: string): void {
    this.connection.queue("text", { message, type: "chat" });
  }

  serverCommand(command: string): void {
    this.connection.queue("command_request", {
      command: `/${command}`,
      origin: { type: "player", uuid: "", request_id: "" },
    });
  }

  addConsoleLog(source: string, message: string): void {
    (this as any)._console?.log(source, message);
  }

  setConsole(c: any): void {
    (this as any)._console = c;
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
