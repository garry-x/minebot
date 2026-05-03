import type { EventEntry } from "./buffer.js";
import { C, hpColor, hungerColor, durabilityColor, tickColor, ratioColor, sourceColor, BOX, stripAnsi, truncate } from "./colors.js";

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
  friendlyMobs: string;
  playerMobs: string;
  safehouse: { hasBench: boolean; hasFurnace: boolean; hasChests: number; built: boolean };
}

export interface DataProvider {
  getStatus(): StatusSnapshot;
  getInventorySummary(): string;
  getEventLog(): EventEntry[];
}

const EVENT_COUNT = 5;
const MIN_WIDTH = 60;
const MIN_HEIGHT = 20;

export class Renderer {
  private interval: ReturnType<typeof setInterval> | null = null;
  private width = 80;
  private height = 24;
  private prevLines: string[] = [];
  private needsFullRedraw = true;

  constructor(
    private data: DataProvider,
    private refreshMs: number = 1000
  ) {}

  start(): void {
    process.stdout.write("\x1b[?1049h\x1b[?25l");
    this.needsFullRedraw = true;
    this.render();
    this.interval = setInterval(() => this.render(), this.refreshMs);
    process.stdout.on("resize", this.onResize);
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    process.stdout.off("resize", this.onResize);
    process.stdout.write("\x1b[?25h\x1b[?1049l");
  }

  private onResize = (): void => {
    this.needsFullRedraw = true;
  };

  private render(): void {
    this.width = process.stdout.columns ?? 80;
    this.height = process.stdout.rows ?? 24;

    if (this.width < MIN_WIDTH || this.height < MIN_HEIGHT) {
      const msg = `Terminal too small (${this.width}x${this.height}). Need ${MIN_WIDTH}x${MIN_HEIGHT}.`;
      if (this.needsFullRedraw) {
        process.stdout.write(`\x1b[2J\x1b[H${msg}`);
      }
      return;
    }

    const s = this.data.getStatus();
    const inv = this.data.getInventorySummary();
    const logs = this.data.getEventLog();
    const recentLogs = logs.slice(-EVENT_COUNT);

    const newLines: string[] = [
      this.boxTop(),
      this.topBar(s),
      this.doubleSep(),
      this.sectionHeader("STATUS"),
      this.statusContent(s),
      this.sectionHeader("INVENTORY"),
      this.inventoryContent(s, inv),
      this.sectionHeader("WORLD \u00b7 PATH \u00b7 MOBS"),
      this.worldContent(s),
      this.pathMobContent(s),
      this.doubleSep(),
      this.sectionHeader("EVENTS"),
      ...this.eventContent(recentLogs),
      this.singleSep(),
      this.cmdContent(),
      this.boxBottom(),
    ];

    if (this.needsFullRedraw || this.prevLines.length !== newLines.length) {
      process.stdout.write("\x1b[2J\x1b[H");
      process.stdout.write(newLines.join("\n"));
      this.needsFullRedraw = false;
    } else {
      for (let i = 0; i < newLines.length; i++) {
        if (newLines[i] !== this.prevLines[i]) {
          process.stdout.write(`\x1b[${i + 1};0H${newLines[i]}\x1b[K`);
        }
      }
      process.stdout.write(`\x1b[${newLines.length + 1};0H`);
    }

    this.prevLines = newLines;
  }

  private boxTop(): string {
    return `${C.WHITE}${BOX.TL}${BOX.DH.repeat(this.width - 2)}${BOX.TR}${C.RESET}`;
  }

  private boxBottom(): string {
    return `${C.WHITE}${BOX.BL}${BOX.DH.repeat(this.width - 2)}${BOX.BR}${C.RESET}`;
  }

  private doubleSep(): string {
    return `${C.WHITE}${BOX.DL}${BOX.DH.repeat(this.width - 2)}${BOX.DR}${C.RESET}`;
  }

  private singleSep(): string {
    return `${C.WHITE}${BOX.SL}${BOX.H.repeat(this.width - 2)}${BOX.SR}${C.RESET}`;
  }

  private sectionHeader(label: string): string {
    const inner = ` \u25b6 ${label}`;
    const avail = this.width - 2;
    const text = `${C.CYAN}${C.BOLD}${inner}${C.RESET}`;
    const plainLen = stripAnsi(text).length;
    return `${C.WHITE}${BOX.DV}${text}${" ".repeat(avail - plainLen)}${BOX.DV}${C.RESET}`;
  }

  private boxLine(content: string): string {
    const inner = `  ${content}`;
    const avail = this.width - 2;
    const display = truncate(inner, avail);
    return `${C.WHITE}${BOX.DV}${display}${BOX.DV}${C.RESET}`;
  }

  private topBar(s: StatusSnapshot): string {
    const left = ` ${C.GREEN}${C.BOLD}Minebot${C.RESET} | ${s.host}:${s.port} | Up:${s.uptime}`;
    const right = `Tick:${tickColor(s.avgTickMs)}${s.avgTickMs.toFixed(1)}ms${C.RESET} `;
    const avail = this.width - 2;
    const plainLeft = stripAnsi(left);
    const plainRight = stripAnsi(right);
    const mid = Math.max(0, avail - plainLeft.length - plainRight.length);
    return `${C.WHITE}${BOX.DV}${left}${" ".repeat(mid)}${right}${BOX.DV}${C.RESET}`;
  }

  private statusContent(s: StatusSnapshot): string {
    const hpStr = `HP:${hpColor(s.hp, s.maxHp)}${s.hp}/${s.maxHp}${C.RESET}`;
    const hungerStr = `Hunger:${hungerColor(s.hunger)}${s.hunger}${C.RESET}`;
    const armorStr = `Armor:${C.YELLOW}${s.armorMaterial}${C.RESET}`;
    const posStr = `Pos:(${Math.round(s.pos.x)},${Math.round(s.pos.y)},${Math.round(s.pos.z)})`;
    const phaseStr = `Phase:${C.CYAN}${s.phase}${C.RESET}`;
    const dimStr = `Dim:${s.dimension}`;
    const dayStr = `Time:${s.daytime ? C.YELLOW + "Day" : C.BLUE + "Night"}${C.RESET}`;
    const skillStr = `Skill:${C.YELLOW}${s.skill}${C.RESET}`;
    return this.boxLine(`${hpStr}  ${hungerStr}  ${armorStr}  ${posStr}  ${phaseStr}  ${dimStr}  ${dayStr}  ${skillStr}`);
  }

  private inventoryContent(s: StatusSnapshot, invSummary: string): string {
    const slotsStr = `Inv: ${s.inventorySlots}/36 slots`;
    const tools = s.toolDurability
      .map(t => `${t.name}(${durabilityColor(t.pct)}${Math.round(t.pct * 100)}%${C.RESET})`)
      .join(" ");
    return this.boxLine(`${slotsStr} | ${invSummary || "Tools:"} ${tools}`);
  }

  private worldContent(s: StatusSnapshot): string {
    const biome = `Biome:${C.GREEN}${s.biome}${C.RESET}`;
    const ground = `Ground:${s.groundBlock}`;
    const light = `Light:${s.lightLevel}`;
    const nearby = `Nearby:${s.nearbyResources || "none"}`;
    const water = `Water:${s.nearestWater < 0 ? "--" : s.nearestWater + "m"}`;
    const lava = `Lava:${s.nearestLava < 0 ? "--" : s.nearestLava + "m"}`;
    return this.boxLine(`${biome}  ${ground}  ${light}  ${nearby}  ${water}  ${lava}`);
  }

  private pathMobContent(s: StatusSnapshot): string {
    const chunkRatio = s.expectedChunks > 0 ? s.chunkCount / s.expectedChunks : 1;
    const subRatio = s.expectedSubchunks > 0 ? s.subchunkCount / s.expectedSubchunks : 1;
    const pathStr = `Path: ${s.pathfinding.nodeCount > 0 ? s.pathfinding.nodeCount + " nodes " + s.pathfinding.moveTypes : "idle"}`;
    const chunkStr = `Chunks: ${ratioColor(chunkRatio)}${s.chunkCount}/${s.expectedChunks}${C.RESET}`;
    const subStr = `Sub: ${ratioColor(subRatio)}${s.subchunkCount}/${s.expectedSubchunks}${C.RESET}`;
    const hostileStr = `${s.hostileMobs ? C.RED + C.BOLD : C.DIM}H:${s.hostileMobs || "0"}${C.RESET}`;
    const passiveStr = `P:${s.passiveMobs || "0"}`;
    const neutralStr = `N:${s.neutralMobs || "0"}`;
    const friendlyStr = `F:${s.friendlyMobs || "0"}`;
    const playerStr = `${s.playerMobs ? C.GREEN : ""}R:${s.playerMobs || "0"}${C.RESET}`;
    const bench = s.safehouse.hasBench ? `${C.GREEN}Bench:\u2713${C.RESET}` : "Bench:\u2717";
    const furnace = s.safehouse.hasFurnace ? `${C.GREEN}Furnace:\u2713${C.RESET}` : "Furnace:\u2717";
    const chests = `Box\u00d7${s.safehouse.hasChests}`;
    const built = s.safehouse.built ? `${C.GREEN}Built\u2713${C.RESET}` : "";
    return this.boxLine(`${pathStr}  ${chunkStr}  ${subStr} | ${hostileStr} ${passiveStr} ${neutralStr} ${friendlyStr} ${playerStr} | ${bench} ${furnace} ${chests} ${built}`);
  }

  private eventContent(entries: EventEntry[]): string[] {
    const lines: string[] = [];
    for (let i = 0; i < EVENT_COUNT; i++) {
      if (i < entries.length) {
        const e = entries[i];
        const ts = `${C.DIM}${e.timestamp}${C.RESET}`;
        const src = `${sourceColor(e.source)}${e.source.padEnd(5)}${C.RESET}`;
        lines.push(this.boxLine(`${ts} ${src} ${e.message}`));
      } else {
        lines.push(this.boxLine(""));
      }
    }
    return lines;
  }

  private cmdContent(): string {
    const avail = this.width - 2;
    const prompt = " /status ";
    const fill = "_".repeat(Math.max(0, avail - prompt.length));
    return `${C.WHITE}${BOX.DV}\x1b[7m${prompt}${fill}\x1b[0m${C.WHITE}${BOX.DV}${C.RESET}`;
  }
}
