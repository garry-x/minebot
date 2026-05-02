import { createClient, Client } from "bedrock-protocol";
import { createRequire } from "node:module";
import { EventBus, BotEvents } from "../events/event-bus.js";
import { getLogger } from "../utils/logger.js";
import type { MetricsCollector } from "../telemetry/metrics.js";
import { ReconnectPolicy } from "./reconnect-policy.js";

const require = createRequire(import.meta.url);
const { Authflow, Titles } = require("prismarine-auth");

const HOSTILE_MOBS = new Set([
  "minecraft:zombie", "minecraft:husk", "minecraft:drowned", "minecraft:zombie_villager",
  "minecraft:skeleton", "minecraft:stray", "minecraft:wither_skeleton",
  "minecraft:spider", "minecraft:cave_spider",
  "minecraft:creeper",
  "minecraft:witch",
  "minecraft:enderman",
  "minecraft:slime",
  "minecraft:blaze", "minecraft:ghast", "minecraft:magma_cube",
  "minecraft:silverfish", "minecraft:endermite",
  "minecraft:guardian", "minecraft:elder_guardian",
  "minecraft:phantom",
  "minecraft:pillager", "minecraft:vindicator", "minecraft:evoker", "minecraft:ravager", "minecraft:vex",
  "minecraft:hoglin", "minecraft:zoglin", "minecraft:piglin_brute",
  "minecraft:warden",
]);

function isHostileMob(type: string): boolean {
  return HOSTILE_MOBS.has(type);
}

export interface ConnectionOptions {
  host: string;
  port: number;
  username: string;
  email?: string;
  viewDistance?: number;
  offline?: boolean;
  tracePackets?: boolean;
}

export class Connection {
  private client: Client | null = null;
  private opts: ConnectionOptions;
  private events: EventBus<BotEvents>;
  private disconnectEmitted = false;
  private metrics?: MetricsCollector;
  private reconnectPolicy = new ReconnectPolicy();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: ConnectionOptions, events: EventBus<BotEvents>) {
    this.opts = options;
    this.events = events;
  }

  setMetrics(metrics: MetricsCollector): void {
    this.metrics = metrics;
  }

  connect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.client) {
      this.metrics?.recordReconnect();
      getLogger().warn("Already connected, disconnecting first");
      this.disconnect();
    }

    const logger = getLogger();
    logger.info({ host: this.opts.host, port: this.opts.port }, "Connecting to server...");

    const clientOpts: any = {
      host: this.opts.host,
      port: this.opts.port,
      username: this.opts.username,
      offline: this.opts.offline ?? false,
      profilesFolder: "./.minebot-cache",
      viewDistance: this.opts.viewDistance ?? 8,
    };
    if (this.opts.offline !== true) {
      clientOpts.disableChunkCaching = true;
    }

    if (!this.opts.offline && this.opts.email) {
      clientOpts.username = this.opts.email;
      // Create a custom authflow that skips title auth to workaround
      // getTitleToken 403 errors (Xbox Live may block title auth for some regions/accounts)
      const authflow = new Authflow(this.opts.email, "./.minebot-cache", {
        flow: "live",
        authTitle: Titles.MinecraftNintendoSwitch,
        deviceType: "Nintendo",
      });
      // @ts-ignore - internal property to skip getTitleToken
      authflow.doTitleAuth = false;
      clientOpts.authflow = authflow;
    }

    this.client = createClient(clientOpts);
    this.disconnectEmitted = false;

    const trace = (name: string, params?: any) => {
      if (this.opts.tracePackets) {
        getLogger().trace({ packet: name, keys: params ? Object.keys(params) : undefined }, `RX ${name}`);
      }
    };

    this.client.on("join", () => {
      trace("join");
      this.reconnectPolicy.reset();
      this.metrics?.startConnection();
      logger.info("Joined server");
    });

    this.client.on("start_game", (packet: any) => {
      trace("start_game", packet);
      this.metrics?.recordPacket("in", "start_game");
      logger.info("Game started");
      this.events.emit("spawned", {
        x: packet.player_position?.x ?? 0,
        y: packet.player_position?.y ?? 0,
        z: packet.player_position?.z ?? 0,
        yaw: packet.rotation?.x ?? 0,
        pitch: packet.rotation?.y ?? 0,
        itemstates: packet.itemstates,
      });
    });

    this.client.on("level_chunk", (packet: any) => {
      trace("level_chunk");
      this.metrics?.recordPacket("in", "level_chunk");
      this.events.emit("chunk_loaded", {
        x: packet.x,
        z: packet.z,
        payload: packet.payload,
        subChunkCount: packet.sub_chunk_count ?? 0,
      });
    });

    this.client.on("move_player", (packet: any) => {
      trace("move_player");
      this.metrics?.recordPacket("in", "move_player");
      if (packet.runtime_id !== this.client?.entityId) return;
      this.events.emit("player_position", {
        x: packet.position?.x ?? 0,
        y: packet.position?.y ?? 0,
        z: packet.position?.z ?? 0,
        yaw: packet.yaw ?? 0,
        pitch: packet.pitch ?? 0,
      });
    });

    this.client.on("update_attributes", (packet: any) => {
      trace("update_attributes");
      this.metrics?.recordPacket("in", "update_attributes");
      if (packet.runtime_entity_id !== this.client?.entityId) return;
      const attrs: Record<string, number> = {};
      for (const attr of packet.attributes ?? []) {
        attrs[attr.name] = attr.current;
      }
      if (attrs["health"] !== undefined) {
        this.events.emit("health_change", { health: attrs["health"], maxHealth: 20 });
      }
      if (attrs["player.hunger"] !== undefined) {
        this.events.emit("hunger_change", {
          hunger: attrs["player.hunger"],
          saturation: attrs["player.saturation"] ?? 0,
          exhaustion: attrs["player.exhaustion"] ?? 0,
        });
      }
    });

    this.client.on("entity_event", (packet: any) => {
      trace("entity_event");
      this.metrics?.recordPacket("in", "entity_event");
      if (packet.event_id === 3 && packet.runtime_entity_id === this.getEntityId()) {
        this.events.emit("player_death", { message: "Player died" });
      }
    });

    this.client.on("disconnect", (packet: any) => {
      const reason = packet?.message ?? "Unknown reason";
      logger.warn({ reason }, "Disconnected by server");
      if (!this.disconnectEmitted) {
        this.disconnectEmitted = true;
        this.events.emit("disconnect", { reason });
      }
      const delay = this.reconnectPolicy.nextDelay();
      if (delay !== null) {
        getLogger().info({ delayMs: delay, attempt: this.reconnectPolicy.getAttempts() }, `Reconnecting in ${delay}ms...`);
        this.reconnectTimer = setTimeout(() => {
          this.connect();
        }, delay);
      } else {
        getLogger().error("Max reconnection attempts exceeded");
        this.events.emit("fatal_disconnect", { reason: "Max reconnection attempts exceeded" });
      }
    });

    this.client.on("close", () => {
      logger.info("Connection closed");
      if (!this.disconnectEmitted) {
        this.disconnectEmitted = true;
        this.events.emit("disconnect", { reason: "Connection closed" });
      }
      const delay = this.reconnectPolicy.nextDelay();
      if (delay !== null) {
        getLogger().info({ delayMs: delay, attempt: this.reconnectPolicy.getAttempts() }, `Reconnecting in ${delay}ms...`);
        this.reconnectTimer = setTimeout(() => {
          this.connect();
        }, delay);
      } else {
        getLogger().error("Max reconnection attempts exceeded");
        this.events.emit("fatal_disconnect", { reason: "Max reconnection attempts exceeded" });
      }
    });

    this.client.on("error", (err: Error) => {
      logger.error({ err }, "Connection error");
      this.events.emit("error", { message: err.message, error: err });
    });

    // Entity tracking
    this.client.on("add_entity", (packet: any) => {
      trace("add_entity");
      this.metrics?.recordPacket("in", "add_entity");
      const hostile = isHostileMob(packet.entity_type);
      this.events.emit("entity_spawn", {
        uniqueId: packet.unique_id,
        runtimeId: packet.runtime_id,
        type: packet.entity_type,
        x: packet.position?.x ?? 0,
        y: packet.position?.y ?? 0,
        z: packet.position?.z ?? 0,
        velocity: { x: packet.velocity?.x ?? 0, y: packet.velocity?.y ?? 0, z: packet.velocity?.z ?? 0 },
        isHostile: hostile,
      });
    });

    this.client.on("remove_entity", (packet: any) => {
      trace("remove_entity");
      this.metrics?.recordPacket("in", "remove_entity");
      this.events.emit("entity_despawn", { uniqueId: packet.entity_id_self });
    });

    this.client.on("move_entity", (packet: any) => {
      trace("move_entity");
      this.metrics?.recordPacket("in", "move_entity");
      this.events.emit("entity_move", {
        runtimeId: packet.runtime_entity_id,
        x: packet.position?.x ?? 0,
        y: packet.position?.y ?? 0,
        z: packet.position?.z ?? 0,
        yaw: packet.rotation?.yaw ?? 0,
        pitch: packet.rotation?.pitch ?? 0,
      });
    });

    // Crafting data
    this.client.on("crafting_data", (packet: any) => {
      trace("crafting_data");
      this.metrics?.recordPacket("in", "crafting_data");
      this.events.emit("crafting_data", { recipes: packet.recipes });
    });

    // Inventory sync (window_id 0 = player inventory, 120 = armor)
    this.client.on("inventory_slot", (packet: any) => {
      trace("inventory_slot");
      this.metrics?.recordPacket("in", "inventory_slot");
      const winId = packet.window_id ?? 0;
      if (winId !== 0 && winId !== 120) return;

      const slot = packet.slot;
      const item = packet.item;
      const isNull = !item || item.network_id === 0 || item.network_id === -1;

      this.events.emit("inventory_change", {
        slot: winId === 120 ? 36 + slot : slot,
        item: isNull ? null : {
          id: item.network_id ?? 0,
          count: item.count ?? 1,
          metadata: item.metadata ?? 0,
        },
      });
    });

    // Dimension change
    this.client.on("change_dimension", (packet: any) => {
      trace("change_dimension");
      this.metrics?.recordPacket("in", "change_dimension");
      getLogger().info({ dimension: packet.dimension }, "Dimension changed");
      this.events.emit("dimension_change", {
        dimension: packet.dimension,
        x: packet.position?.x ?? 0,
        y: packet.position?.y ?? 0,
        z: packet.position?.z ?? 0,
      });
    });

    // Boss event (wither, ender dragon)
    this.client.on("boss_event", (packet: any) => {
      trace("boss_event");
      this.metrics?.recordPacket("in", "boss_event");
      this.events.emit("boss_event", {
        entityId: packet.boss_entity_id,
        eventType: packet.type,
        progress: packet.progress,
        title: packet.title,
      });
    });

    // Portal events (nether/end portal appearing)
    this.client.on("event", (packet: any) => {
      trace("event");
      this.metrics?.recordPacket("in", "event");
      if (packet.event_type === 2 || packet.event_type === 7) {
        this.events.emit("portal_event", { eventType: packet.event_type });
      }
    });

    // Level event (eye of ender despawn)
    this.client.on("level_event", (packet: any) => {
      trace("level_event");
      this.metrics?.recordPacket("in", "level_event");
      if (packet.event === 2003) {
        this.events.emit("level_event", {
          eventId: packet.event,
          x: packet.position?.x ?? 0,
          y: packet.position?.y ?? 0,
          z: packet.position?.z ?? 0,
        });
      }
    });
  }

  write(name: string, params: Record<string, unknown>): void {
    if (!this.client) {
      getLogger().warn("Write called before client connected");
      return;
    }
    if (this.opts.tracePackets) {
      getLogger().trace({ packet: name }, `TX ${name}`);
    }
    this.metrics?.recordPacket("out", name);
    this.client.write(name, params);
  }

  queue(name: string, params: Record<string, unknown>): void {
    if (!this.client) {
      getLogger().warn("Queue called before client connected");
      return;
    }
    if (this.opts.tracePackets) {
      getLogger().trace({ packet: name }, `TX ${name}`);
    }
    this.metrics?.recordPacket("out", name);
    this.client.queue(name, params);
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const client = this.client;
    this.client = null;
    if (client) {
      if (!this.disconnectEmitted) {
        this.disconnectEmitted = true;
        this.events.emit("disconnect", { reason: "Bot disconnected" });
      }
      try {
        client.removeAllListeners();
        client.close();
      } catch {
        // ignore cleanup errors
      }
    }
  }

  isConnected(): boolean {
    return this.client !== null;
  }

  getEntityId(): bigint | undefined {
    return this.client?.entityId as bigint | undefined;
  }
}
