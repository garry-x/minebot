import { Renderer, type StatusSnapshot, type DataProvider } from "./renderer.js";
import { Commander, type CommanderCallbacks } from "./commander.js";
import { RingBuffer, type EventEntry } from "./buffer.js";
import type { Bot } from "../bot.js";

export class Console {
  private renderer: Renderer;
  private commander: Commander;
  private eventLog = new RingBuffer<EventEntry>(200);

  constructor(private bot: Bot) {
    const data: DataProvider = {
      getStatus: () => this.makeSnapshot(),
      getInventorySummary: () => this.bot.getInventorySummary(),
      getEventLog: () => this.eventLog.toArray(),
    };

    this.renderer = new Renderer(data);

    const callbacks: CommanderCallbacks = {
      onStop: () => {
        this.stop();
        this.bot.stop();
        process.exit(0);
      },
      onStatus: () => {
        const s = this.makeSnapshot();
        return `HP:${s.hp}/${s.maxHp} Hunger:${s.hunger} Armor:${s.armorMaterial} Phase:${s.phase} Skill:${s.skill} Pos:(${Math.round(s.pos.x)},${Math.round(s.pos.y)},${Math.round(s.pos.z)})`;
      },
      onPhase: () => `Current phase: ${this.makeSnapshot().phase}`,
      onInv: () => this.bot.getInventorySummary(),
      onSkill: () => `Current skill: ${this.makeSnapshot().skill}`,
      onGoto: (args) => {
        if (args.length < 3) return "Usage: /goto <x> <y> <z>";
        const x = Number(args[0]), y = Number(args[1]), z = Number(args[2]);
        if (isNaN(x) || isNaN(y) || isNaN(z)) return "Invalid coordinates";
        const ok = this.bot.goto(x, y, z);
        return ok ? `Pathing to (${x}, ${y}, ${z})...` : "No path found";
      },
      onSay: (args) => {
        const msg = args.join(" ");
        if (!msg) return "Usage: /say <message>";
        this.bot.say(msg);
        this.log("SYS", `Chat sent: ${msg}`);
        return `Sent: ${msg}`;
      },
      onHealth: () => {
        const s = this.makeSnapshot();
        const tools = s.toolDurability.map(t => `${t.name}: ${Math.round(t.pct * 100)}%`).join(", ");
        return `HP:${s.hp}/${s.maxHp} | Hunger:${s.hunger} | Armor:${s.armorMaterial} | Tools: ${tools}`;
      },
      onCmd: (args) => {
        const raw = args.join(" ");
        if (!raw) return "Usage: /cmd <command>";
        this.bot.serverCommand(raw);
        this.log("SYS", `Command sent: ${raw}`);
        return `Sent: /${raw}`;
      },
    };

    this.commander = new Commander(callbacks);
  }

  log(source: string, message: string): void {
    const now = new Date();
    const ts = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}:${String(now.getUTCSeconds()).padStart(2, "0")}`;
    this.eventLog.push({ timestamp: ts, source, message });
  }

  start(): void {
    this.renderer.start();
    this.commander.start();
  }

  stop(): void {
    this.renderer.stop();
    this.commander.stop();
  }

  private makeSnapshot(): StatusSnapshot {
    const raw = this.bot.getStatus() as any;
    return {
      host: raw.host ?? "",
      port: raw.port ?? 0,
      uptime: raw.uptime ?? "0s",
      avgTickMs: raw.avgTickMs ?? 0,
      hp: raw.hp ?? 20,
      maxHp: raw.maxHp ?? 20,
      hunger: raw.hunger ?? 20,
      armorMaterial: raw.armorMaterial ?? "none",
      pos: raw.pos ?? { x: 0, y: 0, z: 0 },
      phase: raw.phase ?? "SPAWN",
      dimension: raw.dimension ?? "Overworld",
      daytime: raw.daytime === "day" || raw.daytime === true,
      skill: raw.skill ?? "none",
      inventorySlots: raw.inventorySlots ?? 0,
      toolDurability: raw.toolDurability ?? [],
      biome: raw.biome ?? "Unknown",
      lightLevel: raw.lightLevel ?? 0,
      groundBlock: raw.groundBlock ?? "air",
      nearbyResources: raw.nearbyResources ?? "none",
      nearestWater: raw.nearestWater ?? -1,
      nearestLava: raw.nearestLava ?? -1,
      pathfinding: typeof raw.pathfinding === "object" ? raw.pathfinding : { nodeCount: 0, moveTypes: raw.pathfinding ?? "" },
      chunkCount: raw.chunkCount ?? 0,
      subchunkCount: raw.subchunkCount ?? 0,
      expectedChunks: raw.chunkCount ?? 0,
      expectedSubchunks: raw.subchunkCount ?? 0,
      hostileMobs: raw.hostileMobs ?? "0",
      passiveMobs: raw.passiveMobs ?? "0",
      neutralMobs: raw.neutralMobs ?? "0",
      friendlyMobs: raw.friendlyMobs ?? "0",
      playerMobs: raw.playerMobs ?? "0",
      safehouse: typeof raw.safehouse === "object" ? raw.safehouse : { hasBench: false, hasFurnace: false, hasChests: 0, built: false },
    };
  }
}
