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

  constructor(config: BotConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
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

    this.events.on("chunk_loaded", ({ x, z, payload, subChunkCount }) => {
      try {
        let column = this.world.getColumn(x, z);
        if (!column) {
          column = this.world.createColumn(x, z);
          this.world.addColumn(x, z, column);
        }
        if (subChunkCount === -1 || subChunkCount === -2) {
          return;
        }
        (column as any).networkDecodeNoCache(payload, subChunkCount);
      } catch (err: any) {
        process.stderr.write(`[CHUNK_ERR] chunk=(${x},${z}) subCount=${subChunkCount} msg=${err?.message ?? String(err)}\n`);
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
