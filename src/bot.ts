import { AuthManager } from "./auth/auth-manager.js";
import { Connection } from "./connection/connection.js";
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
  offline?: boolean;
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
    const { chain, token } = await auth.authenticate();

    // 2. Connect
    this.connection = new Connection(
      {
        host: this.config.host,
        port: this.config.port,
        username: this.config.username ?? "Minebot",
        chain,
        token,
        viewDistance: this.config.viewDistance,
        offline: this.config.offline,
      },
      this.events
    );

    // 3. Initialize modules
    this.world = new WorldState("bedrock_1.21");
    this.movement = new Movement(this.connection);
    this.inventory = new Inventory();

    // 4. Register skills
    this.skills = new SkillManager();
    this.skills.register(new IdleSkill());
    this.skills.register(new GatheringSkill());

    // 5. Wire up event handlers (chunks, entities, etc. — stubs for Phase 1)
    this.setupEventHandlers();

    // 6. Connect to server
    this.connection.connect();

    // 7. Wait for spawn, then start tick loop
    this.events.once("spawned", (packet) => {
      logger.info({ pos: { x: packet.x, y: packet.y, z: packet.z } }, "Spawned, starting tick loop");
      this.world.updatePlayerPosition({ x: packet.x, y: packet.y, z: packet.z });

      if (packet.itemstates && packet.itemstates.length > 0) {
        this.world.loadItemStates(packet.itemstates);
        logger.info({ count: packet.itemstates.length }, "Item states loaded");
      }

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

    // Handle errors
    this.events.on("error", ({ message, error }) => {
      logger.error({ err: error }, `Bot error: ${message}`);
    });
  }

  private setupEventHandlers(): void {
    // Track player position
    this.events.on("player_position", (pos) => {
      this.world.updatePlayerPosition(pos);
    });

    this.events.on("chunk_loaded", ({ x, z, payload }) => {
      try {
        const column = this.world.getColumn(x, z);
        if (column) {
          (column as any).load(payload, this.world.registry);
        }
      } catch (err) {
        getLogger().error({ err, chunkX: x, chunkZ: z }, "Failed to load chunk");
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
      this.world.removeEntity(data.uniqueId);
    });

    this.events.on("entity_move", (data) => {
      this.world.updateEntityPosition(data.runtimeId, { x: data.x, y: data.y, z: data.z });
    });

    this.events.on("inventory_change", (data) => {
      if (data.item === null) {
        this.inventory.setSlot(data.slot, null);
      } else {
        this.inventory.setSlot(data.slot, {
          slot: data.slot,
          itemId: data.item.id,
          count: data.item.count,
          metadata: data.item.metadata,
        });
      }
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
