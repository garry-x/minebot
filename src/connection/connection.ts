import { createClient, Client } from "bedrock-protocol";
import { createRequire } from "node:module";
import { EventBus, BotEvents } from "../events/event-bus.js";
import { getLogger } from "../utils/logger.js";
import type { MetricsCollector } from "../telemetry/metrics.js";
import { ReconnectPolicy } from "./reconnect-policy.js";
import { SubchunkRequestManager } from "./subchunk-manager.js";
import { MobCategory } from "../world/types.js";

const require = createRequire(import.meta.url);
const { Authflow, Titles } = require("prismarine-auth");

const MOB_CATEGORIES: Record<string, MobCategory> = {
  // --- HOSTILE (27 types) ---
  "minecraft:zombie": MobCategory.HOSTILE,
  "minecraft:husk": MobCategory.HOSTILE,
  "minecraft:drowned": MobCategory.HOSTILE,
  "minecraft:zombie_villager": MobCategory.HOSTILE,
  "minecraft:skeleton": MobCategory.HOSTILE,
  "minecraft:stray": MobCategory.HOSTILE,
  "minecraft:wither_skeleton": MobCategory.HOSTILE,
  "minecraft:creeper": MobCategory.HOSTILE,
  "minecraft:witch": MobCategory.HOSTILE,
  "minecraft:spider": MobCategory.HOSTILE,
  "minecraft:cave_spider": MobCategory.HOSTILE,
  "minecraft:slime": MobCategory.HOSTILE,
  "minecraft:silverfish": MobCategory.HOSTILE,
  "minecraft:endermite": MobCategory.HOSTILE,
  "minecraft:blaze": MobCategory.HOSTILE,
  "minecraft:ghast": MobCategory.HOSTILE,
  "minecraft:magma_cube": MobCategory.HOSTILE,
  "minecraft:guardian": MobCategory.HOSTILE,
  "minecraft:elder_guardian": MobCategory.HOSTILE,
  "minecraft:phantom": MobCategory.HOSTILE,
  "minecraft:pillager": MobCategory.HOSTILE,
  "minecraft:vindicator": MobCategory.HOSTILE,
  "minecraft:evoker": MobCategory.HOSTILE,
  "minecraft:vex": MobCategory.HOSTILE,
  "minecraft:ravager": MobCategory.HOSTILE,
  "minecraft:hoglin": MobCategory.HOSTILE,
  "minecraft:zoglin": MobCategory.HOSTILE,
  "minecraft:piglin_brute": MobCategory.HOSTILE,
  "minecraft:warden": MobCategory.HOSTILE,
  "minecraft:breeze": MobCategory.HOSTILE,
  "minecraft:bogged": MobCategory.HOSTILE,
  // --- NEUTRAL (hostile when provoked) ---
  "minecraft:enderman": MobCategory.NEUTRAL,
  "minecraft:zombified_piglin": MobCategory.NEUTRAL,
  "minecraft:piglin": MobCategory.NEUTRAL,
  "minecraft:wolf": MobCategory.NEUTRAL,
  "minecraft:dolphin": MobCategory.NEUTRAL,
  "minecraft:polar_bear": MobCategory.NEUTRAL,
  "minecraft:llama": MobCategory.NEUTRAL,
  "minecraft:trader_llama": MobCategory.NEUTRAL,
  "minecraft:bee": MobCategory.NEUTRAL,
  "minecraft:goat": MobCategory.NEUTRAL,
  "minecraft:panda": MobCategory.NEUTRAL,
  "minecraft:fox": MobCategory.NEUTRAL,
  // --- FRIENDLY (NPCs, utility mobs, never hostile) ---
  "minecraft:villager": MobCategory.FRIENDLY,
  "minecraft:villager_v2": MobCategory.FRIENDLY,
  "minecraft:wandering_trader": MobCategory.FRIENDLY,
  "minecraft:snow_golem": MobCategory.FRIENDLY,
  // --- PASSIVE (ambient/utility, no combat value) ---
  "minecraft:cow": MobCategory.PASSIVE,
  "minecraft:sheep": MobCategory.PASSIVE,
  "minecraft:pig": MobCategory.PASSIVE,
  "minecraft:chicken": MobCategory.PASSIVE,
  "minecraft:rabbit": MobCategory.PASSIVE,
  "minecraft:horse": MobCategory.PASSIVE,
  "minecraft:donkey": MobCategory.PASSIVE,
  "minecraft:mule": MobCategory.PASSIVE,
  "minecraft:cat": MobCategory.PASSIVE,
  "minecraft:parrot": MobCategory.PASSIVE,
  "minecraft:turtle": MobCategory.PASSIVE,
  "minecraft:squid": MobCategory.PASSIVE,
  "minecraft:axolotl": MobCategory.PASSIVE,
  "minecraft:frog": MobCategory.PASSIVE,
  "minecraft:cod": MobCategory.PASSIVE,
  "minecraft:salmon": MobCategory.PASSIVE,
  "minecraft:tropical_fish": MobCategory.PASSIVE,
  "minecraft:pufferfish": MobCategory.PASSIVE,
  "minecraft:mooshroom": MobCategory.PASSIVE,
  "minecraft:ocelot": MobCategory.PASSIVE,
  "minecraft:bat": MobCategory.PASSIVE,
  "minecraft:allay": MobCategory.PASSIVE,
  "minecraft:armadillo": MobCategory.PASSIVE,
  "minecraft:sniffer": MobCategory.PASSIVE,
  "minecraft:camel": MobCategory.PASSIVE,
  "minecraft:glow_squid": MobCategory.PASSIVE,
  "minecraft:tadpole": MobCategory.PASSIVE,
  // duplicates in NEUTRAL above, kept there: wolf, polar_bear, llama, trader_llama, bee, goat, panda, fox
};

const PLAYER_TYPES = new Set(["minecraft:player", "player"]);

function classifyMob(type: string): { category: MobCategory; isHostile: boolean; isFriendly: boolean; isPlayer: boolean } {
  if (PLAYER_TYPES.has(type)) {
    return { category: MobCategory.PLAYER, isHostile: false, isFriendly: true, isPlayer: true };
  }
  const cat = MOB_CATEGORIES[type] ?? MobCategory.PASSIVE;
  return {
    category: cat,
    isHostile: cat === MobCategory.HOSTILE,
    isFriendly: cat === MobCategory.FRIENDLY,
    isPlayer: false,
  };
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
  private subchunkManager: SubchunkRequestManager | null = null;

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
    this.subchunkManager = new SubchunkRequestManager(this.client);
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
      const hasItemRegistry = !!packet.itemstates;
      logger.info({ hasItemRegistry, pkKeys: Object.keys(packet).slice(0, 10) }, "start_game packet");
      this.events.emit("spawned", {
        x: packet.player_position?.x ?? 0,
        y: packet.player_position?.y ?? 0,
        z: packet.player_position?.z ?? 0,
        yaw: packet.rotation?.x ?? 0,
        pitch: packet.rotation?.y ?? 0,
        itemstates: packet.itemstates,
        block_network_ids_are_hashes: packet.block_network_ids_are_hashes ?? false,
      });
    });

    this.client.on("item_registry", (packet: any) => {
      trace("item_registry", packet.itemstates?.length);
      if (packet.itemstates) {
        logger.info({ count: packet.itemstates.length }, "item_registry packet with itemstates");
        this.events.emit("item_registry", {
          itemstates: packet.itemstates,
        });
      }
    });

    this.client.on("subchunk", (packet: any) => {
      trace("subchunk", { origin: packet.origin, entries: packet.entries?.length ?? 0 });
      this.metrics?.recordPacket("in", "subchunk");
      this.subchunkManager?.onSubchunk(packet);
    });

    this.client.on("update_subchunk_blocks", (packet: any) => {
      trace("update_subchunk_blocks", { x: packet.x, z: packet.z, blocks: packet.blocks?.length ?? 0 });
      this.metrics?.recordPacket("in", "update_subchunk_blocks");
      this.subchunkManager?.onUpdateSubchunkBlocks(packet);
    });

    this.client.on("level_chunk", (packet: any) => {
      trace("level_chunk");
      this.metrics?.recordPacket("in", "level_chunk");
      this.events.emit("chunk_loaded", {
        x: packet.x,
        z: packet.z,
        payload: packet.payload,
        subChunkCount: packet.sub_chunk_count ?? 0,
        dimension: packet.dimension ?? 0,
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
      const cls = classifyMob(packet.entity_type);
      this.events.emit("entity_spawn", {
        uniqueId: packet.unique_id,
        runtimeId: packet.runtime_id,
        type: packet.entity_type,
        x: packet.position?.x ?? 0,
        y: packet.position?.y ?? 0,
        z: packet.position?.z ?? 0,
        velocity: { x: packet.velocity?.x ?? 0, y: packet.velocity?.y ?? 0, z: packet.velocity?.z ?? 0 },
        isHostile: cls.isHostile,
        isPlayer: cls.isPlayer,
        isFriendly: cls.isFriendly,
        category: cls.category,
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

    this.client.on("set_time", (packet: any) => {
      trace("set_time");
      this.metrics?.recordPacket("in", "set_time");
      this.events.emit("time_change", { time: packet.time ?? 0 });
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
      this.subchunkManager?.destroy();
      this.subchunkManager = null;
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

  getSubchunkManager(): SubchunkRequestManager | null {
    return this.subchunkManager;
  }
}
