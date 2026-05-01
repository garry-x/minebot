import { createClient, Client, ClientOptions } from "bedrock-protocol";
import { EventBus, BotEvents } from "../events/event-bus.js";
import { getLogger } from "../utils/logger.js";

export interface ConnectionOptions {
  host: string;
  port: number;
  username: string;
  chain: string[];
  token: string;
  viewDistance?: number;
}

export class Connection {
  private client: Client | null = null;
  private opts: ConnectionOptions;
  private events: EventBus<BotEvents>;

  constructor(options: ConnectionOptions, events: EventBus<BotEvents>) {
    this.opts = options;
    this.events = events;
  }

  connect(): void {
    const logger = getLogger();
    logger.info(
      { host: this.opts.host, port: this.opts.port },
      "Connecting to server..."
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clientOpts = {
      host: this.opts.host,
      port: this.opts.port,
      username: this.opts.username,
      offline: false,
      profilesFolder: "./.minebot-cache",
      viewDistance: this.opts.viewDistance ?? 10,
    } as any;

    this.client = createClient(clientOpts as ClientOptions);

    this.client.on("connect", () => {
      logger.info("Connected to server");
    });

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
      this.events.emit("disconnect", { reason });
    });

    this.client.on("close", () => {
      logger.info("Connection closed");
      this.events.emit("disconnect", { reason: "Connection closed" });
    });

    this.client.on("error", (err: Error) => {
      logger.error({ err }, "Connection error");
      this.events.emit("error", { message: err.message, error: err });
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
