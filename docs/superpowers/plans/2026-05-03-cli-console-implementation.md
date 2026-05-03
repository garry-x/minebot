# CLI Console Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-line `\r` dashboard with a full-screen ANSI console featuring htop-style status panels, color-coded data, interactive command input, and environment display.

**Architecture:** 4 new files in `src/console/` — `buffer.ts` (RingBuffer), `colors.ts` (ANSI color helpers), `renderer.ts` (full-screen refresh at 1Hz), `commander.ts` (readline stdin input). `Console` class in `console.ts` integrates both. Bot replaces `Dashboard` with `Console`, adds public getter methods, logs events through `console.log()`.

**Tech Stack:** TypeScript (strict), ANSI escape codes (no external deps), Node.js built-in `readline`

---

### Task 1: RingBuffer

**Files:**
- Create: `src/console/buffer.ts`

- [ ] **Step 1: Write file**

```typescript
export interface EventEntry {
  timestamp: string;   // "HH:MM:SS"
  source: string;      // "BT" | "GATHER" | "COMBAT" | "CRAFT" | "SYS"
  message: string;
}

export class RingBuffer<T> {
  private buffer: T[];
  private head = 0;
  private _count = 0;

  constructor(private capacity: number) {
    this.buffer = new Array<T>(capacity);
  }

  push(item: T): void {
    this.buffer[this.head % this.capacity] = item;
    this.head++;
    this._count++;
  }

  toArray(): T[] {
    const actual = Math.min(this._count, this.capacity);
    if (this.head <= this.capacity) {
      return this.buffer.slice(0, this.head) as T[];
    }
    const start = this.head % this.capacity;
    return [...this.buffer.slice(start), ...this.buffer.slice(0, start)] as T[];
  }

  get length(): number {
    return Math.min(this._count, this.capacity);
  }

  clear(): void {
    this.head = 0;
    this._count = 0;
    this.buffer = new Array<T>(this.capacity);
  }
}
```

- [ ] **Step 2: Verify compiles**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/console/buffer.ts
git commit -m "feat(console): add RingBuffer for event log"
```

---

### Task 2: ANSI Color Utilities

**Files:**
- Create: `src/console/colors.ts`

- [ ] **Step 1: Write file**

```typescript
export const C = {
  RESET:     "\x1b[0m",
  BOLD:      "\x1b[1m",
  DIM:       "\x1b[2m",
  RED:       "\x1b[31m",
  GREEN:     "\x1b[32m",
  YELLOW:    "\x1b[33m",
  BLUE:      "\x1b[34m",
  MAGENTA:   "\x1b[35m",
  CYAN:      "\x1b[36m",
} as const;

export function hpColor(hp: number, max: number): string {
  if (max <= 0) return C.WHITE;
  const r = hp / max;
  if (r > 0.7) return C.GREEN + C.BOLD;
  if (r > 0.3) return C.YELLOW;
  return C.RED + C.BOLD;
}

export function hungerColor(level: number): string {
  if (level > 15) return C.GREEN;
  if (level > 5) return C.YELLOW;
  return C.RED + C.BOLD;
}

export function durabilityColor(pct: number): string {
  if (pct > 0.5) return C.GREEN;
  if (pct > 0.25) return C.YELLOW;
  return C.RED;
}

export function tickColor(ms: number): string {
  if (ms < 20) return C.GREEN;
  if (ms < 50) return C.YELLOW;
  return C.RED;
}

export function ratioColor(ratio: number): string {
  if (ratio >= 1) return C.GREEN;
  if (ratio > 0.8) return C.YELLOW;
  return C.RED;
}

export function sourceColor(s: string): string {
  switch (s) {
    case "BT":     return C.CYAN;
    case "GATHER": return C.GREEN;
    case "COMBAT": return C.RED;
    case "CRAFT":  return C.YELLOW;
    case "SYS":    return C.BLUE;
    default:       return C.RESET;
  }
}
```

- [ ] **Step 2: Verify compiles**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/console/colors.ts
git commit -m "feat(console): add ANSI color utilities"
```

---

### Task 3: Renderer

**Files:**
- Create: `src/console/renderer.ts`

- [ ] **Step 1: Write file**

```typescript
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
    const midSpace = Math.max(1, this.width - (left.replace(/\x1b\[[0-9;]*m/g, "").length + right.replace(/\x1b\[[0-9;]*m/g, "").length));
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
        const e = entries[entries.length - maxLines + i];
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
```

- [ ] **Step 2: Verify compiles**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/console/renderer.ts
git commit -m "feat(console): add full-screen ANSI Renderer"
```

---

### Task 4: Commander

**Files:**
- Create: `src/console/commander.ts`

- [ ] **Step 1: Write file**

```typescript
import * as readline from "node:readline";

export type CommandHandler = (args: string[]) => string | void;

export interface CommanderCallbacks {
  onStop: () => void;
  onStatus: () => string;
  onPhase: (args: string[]) => string;
  onInv: () => string;
  onSkill: (args: string[]) => string;
  onGoto: (args: string[]) => string;
  onSay: (args: string[]) => string;
  onHealth: () => string;
  onCmd: (args: string[]) => string;
}

export class Commander {
  private rl: readline.Interface | null = null;

  constructor(private callbacks: CommanderCallbacks) {}

  start(): void {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "/",
      historySize: 100,
      removeHistoryDuplicates: true,
    });

    process.stdin.setRawMode?.(false);

    this.rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        this.rl!.prompt();
        return;
      }
      const parts = trimmed.split(/\s+/);
      const cmd = parts[0].toLowerCase();
      const args = parts.slice(1);

      let result: string | void = undefined;
      switch (cmd) {
        case "stop":   this.callbacks.onStop(); break;
        case "status": result = this.callbacks.onStatus(); break;
        case "phase":  result = this.callbacks.onPhase(args); break;
        case "inv":    result = this.callbacks.onInv(); break;
        case "skill":  result = this.callbacks.onSkill(args); break;
        case "goto":   result = this.callbacks.onGoto(args); break;
        case "say":    result = this.callbacks.onSay(args); break;
        case "health": result = this.callbacks.onHealth(); break;
        case "cmd":    result = this.callbacks.onCmd(args); break;
        case "help":
          result = [
            "Commands:",
            "  /stop           Stop bot and exit",
            "  /status         Print full status",
            "  /phase [set X]  Show/set current phase",
            "  /inv            Show inventory",
            "  /skill [set X]  Show/set current skill",
            "  /goto <x> <y> <z>  Path to coordinates",
            "  /say <msg...>   Send chat message",
            "  /health         Show HP/hunger/armor",
            "  /cmd <raw...>   Send server command",
            "  /help           This help",
          ].join("\n");
          break;
        default:
          result = `Unknown command: ${cmd}. Type /help for commands.`;
      }
      if (result) process.stdout.write("\x1b[K" + result + "\n");
    });

    this.rl.on("close", () => {
      process.stdout.write("Console closed. Exiting...\n");
      process.exit(2);
    });
  }

  stop(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }
}
```

- [ ] **Step 2: Verify compiles**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/console/commander.ts
git commit -m "feat(console): add readline Commander with 10 commands"
```

---

### Task 5: Bot Public Methods + BotState

**Files:**
- Modify: `src/bot.ts`

- [ ] **Step 1: Write file**

```typescript
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
      onPhase: (args) => {
        this.bot.setPhaseOverride?.(args[0]);
        return args[0] ? `Phase override: ${args[0]}` : `Current phase: ${this.makeSnapshot().phase}`;
      },
      onInv: () => this.bot.getInventorySummary(),
      onSkill: (args) => {
        this.bot.setSkillOverride?.(args[0]);
        return args[0] ? `Skill override: ${args[0]}` : `Current skill: ${this.makeSnapshot().skill}`;
      },
      onGoto: (args) => {
        if (args.length < 3) return "Usage: /goto <x> <y> <z>";
        const x = Number(args[0]), y = Number(args[1]), z = Number(args[2]);
        if (isNaN(x) || isNaN(y) || isNaN(z)) return "Invalid coordinates";
        this.bot.gotoTarget?.(x, y, z);
        return `Pathing to (${x}, ${y}, ${z})...`;
      },
      onSay: (args) => {
        const msg = args.join(" ");
        if (!msg) return "Usage: /say <message>";
        this.bot.sendChat?.(msg);
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
        this.bot.sendCommand?.(raw);
        this.log("SYS", `Command sent: ${raw}`);
        return `Sent: /${raw}`;
      },
    };

    this.commander = new Commander(callbacks);
  }

  log(source: string, message: string): void {
    const now = new Date();
    const ts = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
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
    const bs = this.bot.getBotState!();
    const pos = this.bot.getPlayerPosition!();
    const toolNames: string[] = [];
    const toolDurabilities: { name: string; pct: number }[] = [];
    const tools = this.bot.getToolDurabilities!();
    for (const t of tools) {
      toolDurabilities.push({ name: t.name, pct: t.pct });
    }

    return {
      host: bs.host,
      port: bs.port,
      uptime: bs.uptime,
      avgTickMs: bs.avgTickMs,
      hp: bs.hp,
      maxHp: bs.maxHp,
      hunger: bs.hunger,
      armorMaterial: bs.armorMaterial,
      pos: { x: pos.x, y: pos.y, z: pos.z },
      phase: bs.phase,
      dimension: bs.dimension,
      daytime: bs.daytime,
      skill: bs.skill,
      inventorySlots: bs.inventorySlots,
      toolDurability: toolDurabilities,
      biome: bs.biome,
      lightLevel: bs.lightLevel,
      groundBlock: bs.groundBlock,
      nearbyResources: bs.nearbyResources,
      nearestWater: bs.nearestWater,
      nearestLava: bs.nearestLava,
      pathfinding: bs.pathfinding,
      chunkCount: bs.chunkCount,
      subchunkCount: bs.subchunkCount,
      expectedChunks: bs.expectedChunks,
      expectedSubchunks: bs.expectedSubchunks,
      hostileMobs: bs.hostileMobs,
      passiveMobs: bs.passiveMobs,
      neutralMobs: bs.neutralMobs,
      safehouse: bs.safehouse,
    };
  }
}
```

- [ ] **Step 2: Verify compiles**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/console/console.ts
git commit -m "feat(console): add Console integration class"
```

---

### Task 6: Console.ts + Bot Wiring

**Files:**
- Create: `src/console/console.ts`
- Modify: `src/bot.ts`

- [ ] **Step 1: AddBotState interface and Console to Bot class**

In `src/bot.ts`, add at line ~36 (after BotConfig):

```typescript
export interface BotState {
  host: string;
  port: number;
  uptime: string;
  avgTickMs: number;
  hp: number;
  maxHp: number;
  hunger: number;
  armorMaterial: string;
  phase: string;
  dimension: string;
  daytime: boolean;
  skill: string;
  inventorySlots: number;
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
```

- [ ] **Step 2: Replace Dashboard import with Console import**

Line 20: Change `import { Dashboard }` to `import { Console } from "./console/console.js"`

Line 54: Change `private dashboard!: Dashboard;` to `private console!: Console;`

- [ ] **Step 3: Replace dashboard creation with console creation**

Line 148: Replace `this.dashboard = new Dashboard(this.metrics, this.world, this.skills, this.hunger);` with:

```typescript
this.console = new Console(this);
this.console.start();
```

- [ ] **Step 4: Replace dashboard.print() calls in tick loop**

Lines 212-217: Replace the dashboard update/print block with:

```typescript
const now = Date.now();
if (now - lastDashboardPrint >= DASHBOARD_INTERVAL_MS) {
  this.metrics.updateSystemStats(
    this.world.getEntities().length,
    this.world.getColumns().size
  );
  lastDashboardPrint = now;
}
```

- [ ] **Step 5: Add console.stop() in stop() method**

At line ~427, before `this.isRunning = false`, add: `this.console?.stop();`

- [ ] **Step 6: Add log calls at key bot events**

In the `spawned` handler (after tick loop starts, line 221):
```typescript
this.console.log("SYS", "Bot spawned and running");
```

In the `player_death` handler (line 246):
```typescript
this.console.log("SYS", "Bot died, pausing");
```

In the BT tick section (after line 191, inside the `if (nextSkill)` check):
```typescript
this.console.log("BT", `starting ${nextSkill} (phase ${PhaseType[bb.currentPhase]})`);
```

- [ ] **Step 7: Add public getter methods**

Add these methods after `getHungerTracker()` (~line 423):

```typescript
private connectStartTime = Date.now();

getBotState(): BotState {
  const uptime = Math.floor((Date.now() - this.connectStartTime) / 1000);
  const hm = Math.floor(uptime / 60);
  const hs = uptime % 60;
  const uptimeStr = `${hm}m${hs}s`;

  const pos = this.world.getPlayerPosition();
  const entities = this.world.getEntities();
  const hostiles = entities.filter(e => {
    const name = e.name ?? "";
    return ["zombie","skeleton","spider","creeper","witch","drowned","husk","stray","cave_spider","slime","blaze","ghast","magma_cube","enderman","phantom","pillager","vindicator","evoker","ravager","vex","hoglin","zoglin","piglin_brute","warden","silverfish","endermite","guardian","elder_guardian","wither_skeleton"].some(t => name.includes(t));
  });
  const passives = entities.filter(e => {
    const name = e.name ?? "";
    return ["cow","pig","sheep","chicken","rabbit","horse","donkey","mule","llama","fox","wolf","cat","ocelot","parrot","bat","squid","salmon","cod","pufferfish","tropical_fish","turtle","dolphin","mooshroom","panda","polar_bear","bee","goat","axolotl","frog","tadpole","camel","sniffer","armadillo"].some(t => name.includes(t));
  });
  const neutrals = entities.filter(e => {
    const name = e.name ?? "";
    return ["iron_golem","snow_golem","bee","dolphin","panda","polar_bear","wolf","enderman","spider","cave_spider","piglin"].some(t => name.includes(t));
  });

  function countByType(list: any[]): string {
    const counts = new Map<string, number>();
    for (const e of list) {
      const name = e.name ?? "unknown";
      const short = name.replace("minecraft:", "");
      counts.set(short, (counts.get(short) ?? 0) + 1);
    }
    const parts: string[] = [];
    for (const [k, v] of counts) parts.push(`${k}×${v}`);
    return list.length > 0 ? `${list.length} (${parts.join(" ")})` : "0";
  }

  const toolDurabilities = this.getToolDurabilities();
  const groundBlock = this.getGroundBlockName();
  const envScan = this.getEnvironmentScan();

  return {
    host: this.config.host,
    port: this.config.port,
    uptime: uptimeStr,
    avgTickMs: this.metrics.getAvgTickDurationMs(),
    hp: this.hp,
    maxHp: 20,
    hunger: Math.round(this.hunger.getHungerRatio() * 20),
    armorMaterial: this.getArmorMaterialName(),
    phase: PhaseType[this.tree?.getBlackboard().currentPhase ?? PhaseType.SPAWN],
    dimension: ["Overworld","Nether","End"][this.world.getDimension()] ?? "Unknown",
    daytime: this.daytime,
    skill: this.skills.getCurrentSkillName() ?? "none",
    inventorySlots: this.inventory.getAllItems().size,
    biome: envScan.biome,
    lightLevel: envScan.lightLevel,
    groundBlock,
    nearbyResources: envScan.nearbyResources,
    nearestWater: envScan.nearestWater,
    nearestLava: envScan.nearestLava,
    pathfinding: this.getPathfindingStatus(),
    chunkCount: this.metrics.getMetrics().chunkCount,
    subchunkCount: this.connection?.getSubchunkManager?.()?.getSubchunkCount() ?? 0,
    expectedChunks: this.metrics.getMetrics().chunkCount,
    expectedSubchunks: this.connection?.getSubchunkManager?.()?.getSubchunkCount() ?? 0,
    hostileMobs: countByType(hostiles),
    passiveMobs: countByType(passives),
    neutralMobs: countByType(neutrals),
    safehouse: { hasBench: this.getSafehouseBench(), hasFurnace: this.getSafehouseFurnace(), hasChests: this.getSafehouseChestCount(), built: this.tree?.getBlackboard().safehouseState.built ?? false },
  };
}

getInventorySummary(): string {
  const items = this.inventory.getAllItems();
  if (items.size === 0) return "empty";
  const counts = new Map<string, number>();
  for (const [_, slot] of items) {
    const name = slot.name ?? "unknown";
    counts.set(name, (counts.get(name) ?? 0) + slot.count);
  }
  const parts: string[] = [];
  for (const [name, count] of counts) {
    parts.push(`${name}×${count}`);
  }
  return parts.join(" ");
}

getPlayerPosition(): { x: number; y: number; z: number } {
  return this.world.getPlayerPosition();
}

getToolDurabilities(): { name: string; pct: number }[] {
  const result: { name: string; pct: number }[] = [];
  for (const itemName of ["pickaxe","sword","axe","shovel"]) {
    const best = this.inventory.getBestDurability(itemName);
    if (best !== null) {
      result.push({ name: itemName, pct: best.durability ?? 1 });
    }
  }
  return result;
}

getPathfindingStatus(): { nodeCount: number; moveTypes: string } {
  const pathProgress = this.movement.getPathProgress();
  if (pathProgress.total === 0) return { nodeCount: 0, moveTypes: "" };
  return { nodeCount: pathProgress.total, moveTypes: `(${pathProgress.current}/${pathProgress.total})` };
}

setPhaseOverride?(phaseName: string): void {
  if (!phaseName || !this.tree) return;
  const upper = phaseName.toUpperCase();
  if (upper in PhaseType) {
    this.tree.getBlackboard().currentPhase = PhaseType[upper as keyof typeof PhaseType];
    this.console.log("SYS", `Phase manually set to ${upper}`);
  }
}

setSkillOverride?(skillName: string): void {
  if (!skillName) return;
  this.skills.setCurrent(skillName, this.getSkillContext());
  this.console.log("SYS", `Skill manually set to ${skillName}`);
}

gotoTarget?(x: number, y: number, z: number): void {
  const pathfinder = this._getPathfinder();
  const path = pathfinder.findPath(this.world.getPlayerPosition(), { x, y, z });
  if (path.length > 0) {
    this.movement.initPath(path);
    this.console.log("SYS", `Path found: ${path.length} nodes`);
  } else {
    this.console.log("SYS", "No path found");
  }
}

sendChat?(msg: string): void {
  this.connection?.queue("text", { message: msg, type: "chat" as any });
}

sendCommand?(cmd: string): void {
  this.connection?.queue("command_request", { command: cmd, origin: {} as any, internal: false, version: 0 });
}

private getArmorMaterialName(): string {
  for (let i = 0; i < 4; i++) {
    const slot = this.inventory.getArmor(i);
    if (slot?.name) {
      const mat = this.inventory.getArmorMaterial?.(i) ?? "";
      return mat || "none";
    }
  }
  return "none";
}

private getGroundBlockName(): string {
  const pos = this.world.getPlayerPosition();
  const block = this.world.getBlock({ x: Math.floor(pos.x), y: Math.floor(pos.y) - 1, z: Math.floor(pos.z) });
  return block?.name?.replace("minecraft:", "") ?? "air";
}

private getEnvironmentScan(): { biome: string; lightLevel: number; nearbyResources: string; nearestWater: number; nearestLava: number } {
  const pos = this.world.getPlayerPosition();
  const px = Math.floor(pos.x), py = Math.floor(pos.y), pz = Math.floor(pos.z);
  const scanR = 16;

  // Nearby resources (within 16 blocks, just sampling key types)
  const resourceSet = new Set(["coal_ore","iron_ore","copper_ore","diamond_ore","gold_ore","emerald_ore","lapis_ore","redstone_ore","oak_log","birch_log","spruce_log","jungle_log","acacia_log","dark_oak_log","mangrove_log","cherry_log"]);
  const resourceCounts = new Map<string, number>();
  let nearestWater = -1;
  let nearestLava = -1;
  let lightLevel = 0;

  for (let dx = -scanR; dx <= scanR; dx += 4) {
    for (let dy = -scanR; dy <= scanR; dy += 4) {
      for (let dz = -scanR; dz <= scanR; dz += 4) {
        const b = this.world.getBlock({ x: px + dx, y: py + dy, z: pz + dz });
        if (!b) continue;
        const name = b.name?.replace("minecraft:", "") ?? "";
        if (resourceSet.has(name)) {
          resourceCounts.set(name, (resourceCounts.get(name) ?? 0) + 1);
        }
        if (name.includes("water") && nearestWater < 0) {
          nearestWater = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
        }
        if (name.includes("lava") && nearestLava < 0) {
          nearestLava = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
        }
      }
    }
  }

  const resources: string[] = [];
  for (const [k, v] of resourceCounts) {
    if (v > 0) resources.push(`${k}×${v}`);
  }

  return {
    biome: "Plains",
    lightLevel,
    nearbyResources: resources.join(" ") || "none",
    nearestWater,
    nearestLava,
  };
}

private getSafehouseBench(): boolean { return this.tree?.getBlackboard().safehouseState.hasWorkbench ?? false; }
private getSafehouseFurnace(): boolean { return this.tree?.getBlackboard().safehouseState.hasFurnace ?? false; }
private getSafehouseChestCount(): number { return this.tree?.getBlackboard().safehouseState.chestCount ?? 0; }

private _getPathfinder() {
  const ctx = this.getSkillContext();
  return new (require("../movement/pathfinding.js").Pathfinder)({
    world: ctx.world,
    inventory: ctx.inventory,
    circuitBreaker: ctx.circuitBreaker,
  } as any, 10000);
}
```

- [ ] **Step 8: Verify compiles and add missing import**

Run: `npx tsc --noEmit`

If pathfinding import is an issue (dynamic require won't typecheck), change to static import:

At top of bot.ts, add: `import { Pathfinder } from "./movement/pathfinding.js";`
And change `_getPathfinder` to: `private _getPathfinder(): Pathfinder { return new Pathfinder({ ... }, 10000); }`

Fix any type errors. Expected: 0 errors.

- [ ] **Step 9: Commit**

```bash
git add src/bot.ts
git commit -m "feat(bot): replace Dashboard with Console, add public getter methods"
```

---

### Task 7: Index.ts Graceful Shutdown

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Update SIGINT handler**

Replace lines 46-55 with:

```typescript
let bot: Bot | null = null;

async function main(): Promise<void> {
  // ... existing code, but assign: bot = new Bot(...)
  // (The rest of main stays the same)

  process.on("SIGINT", () => {
    if (bot) {
      bot.stop();
    }
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    if (bot) {
      bot.stop();
    }
    process.exit(0);
  });

  try {
    bot = new Bot({ ... });
    await bot.start();
  } catch (err) {
    console.error("Failed to start bot:", err);
    process.exit(1);
  }
}
```

- [ ] **Step 2: Verify compiles**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat(index): graceful shutdown with console cleanup"
```

---

### Task 8: Delete Dashboard, Wire Logging

**Files:**
- Delete: `src/telemetry/dashboard.ts`
- Modify: `src/bot.ts` (remaining log calls)

- [ ] **Step 1: Delete dashboard.ts**

```bash
rm src/telemetry/dashboard.ts
```

- [ ] **Step 2: Add console.log() calls to skills**

In `src/bot.ts`, add log emission for skill transitions. In the BT tick section (inside `if (nextSkill && nextSkill !== this.skills.getCurrentSkillName())`):

```typescript
this.console.log("BT", `switching ${this.skills.getCurrentSkillName()} → ${nextSkill}`);
```

- [ ] **Step 3: Verify compiles and tests**

Run:
```
npx tsc --noEmit && npx tsx --test tests/**/*.test.ts
```
Expected: 0 type errors, all tests pass. Tests that reference Dashboard import will fail if any exist.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove Dashboard, wire Console event logging"
```

---

### Task 9: Verification

- [ ] **Step 1: Run full typecheck**

```
npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 2: Run all tests**

```
npx tsx --test tests/**/*.test.ts
```
Expected: all pass (47+)

- [ ] **Step 3: Commit any remaining changes**

```bash
git add -A && git commit -m "chore: final verification fixes" || echo "nothing to commit"
```
