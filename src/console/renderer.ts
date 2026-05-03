import type { EventEntry } from "./buffer.js";
import { C, hpColor, hungerColor, durabilityColor, tickColor, ratioColor, sourceColor } from "./colors.js";

export interface StatusSnapshot {
  host: string;
  port: number;
  uptime: string;
  avgTickMs: number;
  hp: number;
  maxHp: number;
  hunger: number;
  armorMaterial: string;
  pos: { x: number; y: number; z: number };
  phase: string;
  dimension: string;
  daytime: boolean;
  skill: string;
  inventorySlots: number;
  toolDurability: { name: string; pct: number }[];
  biome: string;
  lightLevel: number;
  groundBlock: string;
  nearbyResources: string;
  nearestWater: number;
  nearestLava: number;
  pathfinding: { nodeCount: number; moveTypes: string };
  chunkCount: number;
  subchunkCount: number;
  expectedChunks: number;
  expectedSubchunks: number;
  hostileMobs: string;
  passiveMobs: string;
  neutralMobs: string;
  safehouse: { hasBench: boolean; hasFurnace: boolean; hasChests: number; built: boolean };
}

export interface DataProvider {
  getStatus(): StatusSnapshot;
  getInventorySummary(): string;
  getEventLog(): EventEntry[];
}

export class Renderer {
  private interval: ReturnType<typeof setInterval> | null = null;
  private width = 80;
  private height = 24;

  constructor(
    private data: DataProvider,
    private refreshMs: number = 1000
  ) {}

  start(): void {
    process.stdout.write("\x1b[?1049h\x1b[?25l");
    this.render();
    this.interval = setInterval(() => this.render(), this.refreshMs);
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    process.stdout.write("\x1b[?25h\x1b[?1049l");
  }

  private render(): void {
    this.width = process.stdout.columns ?? 80;
    this.height = process.stdout.rows ?? 24;
    const s = this.data.getStatus();
    const inv = this.data.getInventorySummary();
    const logs = this.data.getEventLog();

    const logLines = Math.max(3, this.height - 8);
    const recentLogs = logs.slice(-logLines);

    const out: string[] = [
      "\x1b[2J\x1b[H",
      this.statusBar(s),
      "",
      this.healthLine(s),
      this.invLine(s, inv),
      this.envLine(s),
      this.pathLine(s),
      this.mobLine(s),
      ...this.eventLines(recentLogs, logLines),
      this.cmdLine(),
    ];

    process.stdout.write(out.join("\n"));
  }

  private pad(s: string, w: number): string {
    const plain = s.replace(/\x1b\[[0-9;]*m/g, "");
    const padding = Math.max(0, w - plain.length);
    return s + " ".repeat(padding);
  }

  private statusBar(s: StatusSnapshot): string {
    const left = `${C.GREEN}${C.BOLD}Minebot${C.RESET} | ${s.host}:${s.port} | Up:${s.uptime}`;
    const right = `Tick:${tickColor(s.avgTickMs)}${s.avgTickMs.toFixed(1)}ms${C.RESET}`;
    const plainLeft = left.replace(/\x1b\[[0-9;]*m/g, "");
    const plainRight = right.replace(/\x1b\[[0-9;]*m/g, "");
    const midSpace = Math.max(1, this.width - plainLeft.length - plainRight.length);
    return `\x1b[1m${left}${" ".repeat(midSpace)}${right}\x1b[0m`;
  }

  private healthLine(s: StatusSnapshot): string {
    const hpStr = `HP:${hpColor(s.hp, s.maxHp)}${s.hp}/${s.maxHp}${C.RESET}`;
    const hungerStr = `Hunger:${hungerColor(s.hunger)}${s.hunger}${C.RESET}`;
    const armorStr = `Armor:${C.YELLOW}${s.armorMaterial}${C.RESET}`;
    const posStr = `Pos:(${Math.round(s.pos.x)},${Math.round(s.pos.y)},${Math.round(s.pos.z)})`;
    const phaseStr = `Phase:${C.CYAN}${s.phase}${C.RESET}`;
    const dimStr = `Dim:${s.dimension}`;
    const dayStr = `Time:${s.daytime ? C.YELLOW + "Day" : C.BLUE + "Night"}${C.RESET}`;
    const skillStr = `Skill:${C.YELLOW}${s.skill}${C.RESET}`;
    const line = `${hpStr}  ${hungerStr}  ${armorStr}  ${posStr}  ${phaseStr}  ${dimStr}  ${dayStr}  ${skillStr}`;
    return this.pad(line, this.width);
  }

  private invLine(s: StatusSnapshot, invSummary: string): string {
    const slotsStr = `Inv: ${s.inventorySlots}/36 slots`;
    const tools = s.toolDurability
      .map(t => `${t.name}(${durabilityColor(t.pct)}${Math.round(t.pct * 100)}%${C.RESET})`)
      .join(" ");
    const line = `${slotsStr} | ${invSummary || "Tools:"} ${tools}`;
    return this.pad(line, this.width);
  }

  private envLine(s: StatusSnapshot): string {
    const biome = `Biome:${C.GREEN}${s.biome}${C.RESET}`;
    const ground = `Ground:${s.groundBlock}`;
    const light = `Light:${s.lightLevel}`;
    const nearby = `Nearby:${s.nearbyResources || "none"}`;
    const water = `Water:${s.nearestWater < 0 ? "--" : s.nearestWater + "m"}`;
    const lava = `Lava:${s.nearestLava < 0 ? "--" : s.nearestLava + "m"}`;
    const line = `${biome}  ${ground}  ${light}  ${nearby}  ${water}  ${lava}`;
    return this.pad(line, this.width);
  }

  private pathLine(s: StatusSnapshot): string {
    const chunkRatio = s.expectedChunks > 0 ? s.chunkCount / s.expectedChunks : 1;
    const subRatio = s.expectedSubchunks > 0 ? s.subchunkCount / s.expectedSubchunks : 1;
    const pathStr = `Path: ${s.pathfinding.nodeCount > 0 ? s.pathfinding.nodeCount + " nodes " + s.pathfinding.moveTypes : "idle"}`;
    const chunkStr = `Chunks: ${ratioColor(chunkRatio)}${s.chunkCount}/${s.expectedChunks}${C.RESET}`;
    const subStr = `Subchunks: ${ratioColor(subRatio)}${s.subchunkCount}/${s.expectedSubchunks}${C.RESET}`;
    const line = `${pathStr}  ${chunkStr}  ${subStr}`;
    return this.pad(line, this.width);
  }

  private mobLine(s: StatusSnapshot): string {
    const hostileStr = `${s.hostileMobs ? C.RED + C.BOLD : C.DIM}H:${s.hostileMobs || "0"}${C.RESET}`;
    const passiveStr = `P:${s.passiveMobs || "0"}`;
    const neutralStr = `N:${s.neutralMobs || "0"}`;
    const bench = s.safehouse.hasBench ? `${C.GREEN}BENCH${C.RESET}` : `${C.DIM}BENCH${C.RESET}`;
    const furnace = s.safehouse.hasFurnace ? `${C.GREEN}FURN${C.RESET}` : `${C.DIM}FURN${C.RESET}`;
    const chests = `Box:${s.safehouse.hasChests}`;
    const built = s.safehouse.built ? `${C.GREEN}Safehouse${C.RESET}` : `${C.DIM}Safehouse${C.RESET}`;
    const line = `Mobs: ${hostileStr}  ${passiveStr}  ${neutralStr} | ${bench}  ${furnace}  ${chests}  ${built}`;
    return this.pad(line, this.width);
  }

  private eventLines(entries: EventEntry[], maxLines: number): string[] {
    const lines: string[] = [];
    for (let i = 0; i < maxLines; i++) {
      if (i < entries.length) {
        const idx = entries.length <= maxLines ? i : entries.length - maxLines + i;
        const e = entries[idx];
        const ts = `${C.DIM}${e.timestamp}${C.RESET}`;
        const src = `${sourceColor(e.source)}${e.source}${C.RESET}`;
        const line = `${ts} ${src}: ${e.message}`;
        lines.push(this.pad(line, this.width));
      } else {
        lines.push(this.pad("", this.width));
      }
    }
    return lines;
  }

  private cmdLine(): string {
    const prompt = "/status ";
    const fill = " ".repeat(Math.max(0, this.width - prompt.length - 1));
    return `\x1b[7m ${prompt}${fill}\x1b[0m`;
  }
}
