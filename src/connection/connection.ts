import { createClient, Client } from "bedrock-protocol";
import { EventBus, BotEvents } from "../events/event-bus.js";
import { getLogger } from "../utils/logger.js";

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
  chain: string[];
  token: string;
  offline?: boolean;
  viewDistance?: number;
}

export class Connection {
  private client: Client | null = null;
  private opts: ConnectionOptions;
  private events: EventBus<BotEvents>;
  private disconnectEmitted = false;

  constructor(options: ConnectionOptions, events: EventBus<BotEvents>) {
    this.opts = options;
    this.events = events;
  }

  connect(): void {
    if (this.client) {
      getLogger().warn("Already connected, disconnecting first");
      this.disconnect();
    }

    const logger = getLogger();
    logger.info(
      { host: this.opts.host, port: this.opts.port },
      "Connecting to server..."
    );

    const { chain, token } = this.opts;
    const authflow = {
      getMinecraftBedrockToken: async () => ({ chain, token }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clientOpts: any = {
      host: this.opts.host,
      port: this.opts.port,
      username: this.opts.username,
      offline: this.opts.offline ?? false,
      authflow,
      profilesFolder: "./.minebot-cache",
      viewDistance: this.opts.viewDistance ?? 10,
    };

    this.client = createClient(clientOpts);
    this.disconnectEmitted = false;

    this.client.on("join", () => {
      logger.info("Joined server");
    });

    this.client.on("start_game", (packet: any) => {
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
      this.events.emit("chunk_loaded", {
        x: packet.x,
        z: packet.z,
        payload: packet.payload,
        subChunkCount: packet.sub_chunk_count ?? 0,
      });
    });

    this.client.on("move_player", (packet: any) => {
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
      if (packet.runtime_entity_id !== this.client?.entityId) return;
      const attrs: Array<{ name: string; current: number; max: number }> =
        packet.attributes ?? [];
      for (const attr of attrs) {
        if (attr.name === "minecraft:health") {
          this.events.emit("health_change", {
            health: attr.current,
            maxHealth: attr.max,
          });
          break;
        }
      }
    });

    this.client.on("disconnect", (packet: any) => {
      const reason = packet?.message ?? "Unknown reason";
      logger.warn({ reason }, "Disconnected by server");
      if (!this.disconnectEmitted) {
        this.disconnectEmitted = true;
        this.events.emit("disconnect", { reason });
      }
    });

    this.client.on("close", () => {
      logger.info("Connection closed");
      if (!this.disconnectEmitted) {
        this.disconnectEmitted = true;
        this.events.emit("disconnect", { reason: "Connection closed" });
      }
    });

    this.client.on("error", (err: Error) => {
      logger.error({ err }, "Connection error");
      this.events.emit("error", { message: err.message, error: err });
    });

    // Entity tracking
    this.client.on("add_entity", (packet: any) => {
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
      this.events.emit("entity_despawn", { uniqueId: packet.entity_id_self });
    });

    this.client.on("move_entity", (packet: any) => {
      this.events.emit("entity_move", {
        runtimeId: packet.runtime_entity_id,
        x: packet.position?.x ?? 0,
        y: packet.position?.y ?? 0,
        z: packet.position?.z ?? 0,
        yaw: packet.rotation?.yaw ?? 0,
        pitch: packet.rotation?.pitch ?? 0,
      });
    });
  }

  write(name: string, params: Record<string, unknown>): void {
    if (!this.client) {
      getLogger().warn("Write called before client connected");
      return;
    }
    this.client.write(name, params);
  }

  queue(name: string, params: Record<string, unknown>): void {
    if (!this.client) {
      getLogger().warn("Queue called before client connected");
      return;
    }
    this.client.queue(name, params);
  }

  disconnect(): void {
    if (this.client) {
      if (!this.disconnectEmitted) {
        this.disconnectEmitted = true;
        this.events.emit("disconnect", { reason: "Bot disconnected" });
      }
      this.client.removeAllListeners();
      this.client.close();
      this.client = null;
    }
  }

  isConnected(): boolean {
    return this.client !== null;
  }

  getEntityId(): bigint | undefined {
    return this.client?.entityId as bigint | undefined;
  }
}
