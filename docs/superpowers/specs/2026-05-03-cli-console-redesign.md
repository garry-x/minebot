# Minebot Console Redesign Specification

## Overview

Replace the single-line `\r`-overwrite dashboard with a full-screen htop-style console featuring rich status information and interactive command input.

## Architecture

```
src/console/
├── console.ts       # Console class — Renderer + Commander integration
├── renderer.ts      # Renderer — full-screen ANSI refresh at 1Hz
├── commander.ts     # Commander — readline stdin command parser
└── buffer.ts        # RingBuffer — bounded in-memory event log
```

`Bot` creates `Console` on start. `Console` owns `Renderer` and `Commander`, passing callbacks for commands. `Renderer` reads from `Bot` getter methods.

## Display Layout

```
┌─ Status Bar ───────────────────────────────────────────────────────────────────┐
│ Minebot 0.1.0 | Host: example.com:19132 | Up: 12m34s | Tick: 12.0ms avg       │
└────────────────────────────────────────────────────────────────────────────────┘

┌─ Panels ───────────────────────────────────────────────────────────────────────┐
│ HP:20/20  Hunger:20  Armor:Iron  Pos:(120,64,-45)  Phase:IRON  Day  Skill:COMBAT │
│ Inv: 28/36 slots | Tools: iron_pick(63%) iron_sword(72%) diamond_shovel(91%)     │
│ Path: 8 nodes JMP✕3 WALK✕5 | Chunks: 213/213 | Subchunks: 4560/4560             │
│ Mobs: H:5 P:2 N:1 | Workbench:✓  Furnace:✓  Chest×6  Safehouse:(-5,64,10)      │
└────────────────────────────────────────────────────────────────────────────────┘

┌─ Event Log ────────────────────────────────────────────────────────────────────┐
│ 16:42:01 | BT: starting gathering (phase IRON)                                 │
│ 16:42:03 | CRAFT: crafted iron_pickaxe                                         │
│ 16:42:05 | GATHER: ore found, pathing iron_ore                                  │
│ 16:42:08 | GATHER: mining progress 80%                                         │
│ 16:42:10 | COMBAT: hostile detected (zombie), engaging                         │
└────────────────────────────────────────────────────────────────────────────────┘

/status █
```

- **Status Bar** (1 line): connection info, uptime, tick metrics
- **Detail Panels** (4 lines): HP, hunger, armor, position, phase, dimension, daytime, skill, inventory slot count, tool durability, pathfinding status, chunk/subchunk counts, mob counts, safehouse state
- **Event Log** (5 lines): timestamped recent events, most recent at bottom
- **Command Prompt** (1 line): `/` prefix plus readline input with history

## Screen Layout

Total rows: 1+4+5+1 = 11 minimum. If terminal is smaller, scale down: event log shrinks first.

```
[1]  Status Bar
[2]  Health | Phase | Pos
[3]  Inventory | Tools
[4]  Pathfinding | Chunks
[5]  Mobs | Safehouse
[6]  Event Log ────
[7]  Event Log
[8]  Event Log
[9]  Event Log
[10] Event Log ────
[11] Cmd Prompt
```

## ANSI Color Scheme

```typescript
// Color utility helpers in src/console/colors.ts
const C = {
  RESET:     "\x1b[0m",
  BOLD:      "\x1b[1m",
  DIM:       "\x1b[2m",
  RED:       "\x1b[31m",
  GREEN:     "\x1b[32m",
  YELLOW:    "\x1b[33m",
  BLUE:      "\x1b[34m",
  MAGENTA:   "\x1b[35m",
  CYAN:      "\x1b[36m",
  WHITE:     "\x1b[37m",
  BG_RED:    "\x1b[41m",
  BG_GREEN:  "\x1b[42m",
  BG_BLUE:   "\x1b[44m",
} as const;

function pct(pct: number): string {
  if (pct > 50) return C.GREEN;
  if (pct > 25) return C.YELLOW;
  return C.RED;
}
function hpColor(hp: number, max: number): string {
  const ratio = hp / max;
  if (ratio > 0.7) return C.GREEN;
  if (ratio > 0.3) return C.YELLOW;
  return C.RED + C.BOLD;
}
function hungerColor(h: number): string {
  if (h > 15) return C.GREEN;
  if (h > 5) return C.YELLOW;
  return C.RED + C.BOLD;
}
```

### Element Color Mapping

| Element | Condition | Color |
|---------|-----------|-------|
| **HP** | >70% | `32` green |
| | 30-70% | `33` yellow |
| | <30% | `31;1` bold red |
| **Hunger** | >15 | `32` green |
| | 6-15 | `33` yellow |
| | ≤5 | `31;1` bold red |
| **Tool durability** | >50% | `32` green |
| | 25-50% | `33` yellow |
| | <25% | `31` red |
| **Hostile mobs** | 0 | dim white |
| | >0 | `31;1` bold red |
| **Daytime** | Day | `33` yellow |
| | Night | `34` blue |
| **Phase** | — | `36` cyan |
| **Skill** | — | `33` yellow |
| **Armor** | — | `33` yellow |
| **Event log timestamp** | — | `2` dim |
| **Event log source** | BT | `36` cyan |
| | GATHER | `32` green |
| | COMBAT | `31` red |
| | CRAFT | `33` yellow |
| | SYS | `34` blue |
| **Cmd prompt** | — | `7` inverse video |
| **Status bar host** | connected | `32` green bold |
| | reconnecting | `33` yellow bold |
| **Uptime** | — | `32` green |
| **Tick avg** | <20ms | `32` green |
| | 20-50ms | `33` yellow |
| | >50ms | `31` red |
| **Chunk ratio** | 100% | `32` green |
| | >80% | `33` yellow |
| | <80% | `31` red |

All colors resolve at render time each refresh cycle — no cached state on the renderer side.

## Renderer

### `src/console/renderer.ts`

```typescript
export class Renderer {
  private interval: ReturnType<typeof setInterval> | null = null;
  private lastLineCount = 0;

  constructor(
    private dataProvider: {
      getStatus(): StatusSnapshot;
      getInventorySummary(): string;
      getPathfindingStatus(): string;
      getSubchunkStatus(): string;
      getEventLog(): EventEntry[];
      getSafehouseState(): string;
    },
    private refreshMs = 1000
  ) {}

  start(): void {
    // Hide cursor, enter alternate buffer
    process.stdout.write("\x1b[?1049h\x1b[?25l");
    this.interval = setInterval(() => this.render(), this.refreshMs);
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
    // Show cursor, restore normal buffer
    process.stdout.write("\x1b[?25h\x1b[?1049l");
  }

  private render(): void {
    const s = this.dataProvider.getStatus();
    const inv = this.dataProvider.getInventorySummary();
    const path = this.dataProvider.getPathfindingStatus();
    const chunks = this.dataProvider.getSubchunkStatus();
    const logs = this.dataProvider.getEventLog();
    const safehouse = this.dataProvider.getSafehouseState();

    const height = process.stdout.rows || 24;
    const logLines = Math.max(3, height - 7); // 1 status + 4 detail + 1 prompt = 6 base

    // Build output with ANSI codes
    const lines = [
      `\x1b[2J\x1b[H`,  // Clear screen, home cursor
      this.renderStatusBar(s),
      "",  // blank separator
      this.renderDetailLine1(s),
      this.renderDetailLine2(s, inv),
      this.renderDetailLine3(path, chunks),
      this.renderDetailLine4(s, safehouse),
      "",
      ...this.renderEventLog(logs, logLines),
      "\x1b[7m" + " " + ("/status" + " ".repeat(Math.max(0, process.stdout.columns - ("/status".length + 1)))) + "\x1b[0m",
    ];

    this.lastLineCount = lines.length;
    process.stdout.write(lines.join("\n"));
  }

  private renderStatusBar(s: StatusSnapshot): string { /* ... */ }
  private renderDetailLine1(s: StatusSnapshot): string { /* ... */ }
  private renderDetailLine2(s: StatusSnapshot, inv: string): string { /* ... */ }
  private renderDetailLine3(path: string, chunks: string): string { /* ... */ }
  private renderDetailLine4(s: StatusSnapshot, safehouse: string): string { /* ... */ }
  private renderEventLog(entries: EventEntry[], maxLines: number): string[] { /* ... */ }
}
```

### ANSI Escape Codes Used

| Code | Purpose |
|------|---------|
| `\x1b[2J` | Clear entire screen |
| `\x1b[H` | Move cursor to home (0,0) |
| `\x1b[?25l` | Hide cursor |
| `\x1b[?25h` | Show cursor |
| `\x1b[?1049h` | Enable alternate screen buffer |
| `\x1b[?1049l` | Disable alternate screen buffer |
| `\x1b[7m` | Invert colors (for prompt line) |
| `\x1b[0m` | Reset all attributes |
| `\x1b[1m` | Bold |
| `\x1b[2m` | Dim |
| `\x1b[31m` | Red foreground |
| `\x1b[32m` | Green foreground |
| `\x1b[33m` | Yellow foreground |
| `\x1b[34m` | Blue foreground |
| `\x1b[35m` | Magenta foreground |
| `\x1b[36m` | Cyan foreground |
| `\x1b[41m` | Red background |
| `\x1b[42m` | Green background |
| `\x1b[44m` | Blue background |
| `\x1b[K` | Clear line from cursor to end |

No external library dependency (yargs already used for CLI args; readline is built-in).

## Commander

### `src/console/commander.ts`

```typescript
import * as readline from "node:readline";

export type CommandHandler = (args: string[]) => string | void;

export class Commander {
  private rl: readline.Interface | null = null;
  private commands = new Map<string, CommandHandler>();

  register(name: string, handler: CommandHandler): void {
    this.commands.set(name, handler);
  }

  start(): void {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "/",
      historySize: 100,
      removeHistoryDuplicates: true,
    });
    this.rl.prompt();

    this.rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        this.rl!.prompt();
        return;
      }
      const [cmd, ...args] = trimmed.split(/\s+/);
      const handler = this.commands.get(cmd);
      if (handler) {
        const result = handler(args);
        if (result) process.stdout.write(result + "\n");
      } else {
        process.stdout.write(`Unknown command: ${cmd}. Type /help for commands.\n`);
      }
      this.rl!.prompt();
    }).on("close", () => {
      process.stdout.write("Exiting...\n");
      process.exit(2);
    });

    // Suppress stdin echo of typed chars since renderer handles display
    process.stdin.setRawMode?.(false);
  }

  stop(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }
}
```

## Commands

| Command | Args | Handler |
|---------|------|---------|
| `/stop` | — | Calls `bot.stop()`, exits cleanly |
| `/status` | — | Prints full status snapshot to event log |
| `/phase` | `[set <name>]` | Read current phase or override |
| `/inv` | — | Prints full inventory list |
| `/skill` | `[set <name>]` | Read current skill or manual override |
| `/goto` | `<x> <y> <z>` | Path to coordinates |
| `/say` | `<msg...>` | Send chat message to server |
| `/health` | — | Print HP/hunger/armor breakdown |
| `/cmd` | `<raw...>` | Send raw command to server (e.g., `/cmd time set day`) |
| `/help` | — | List all commands |

## StatusSnapshot Type

```typescript
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
  daytime: string;
  skill: string;
  inventorySlots: number;
  toolDurability: { name: string; pct: number }[];
  pathfinding: { nodeCount: number; moveTypes: string };
  chunkCount: number;
  subchunkCount: number;
  hostileMobs: number;
  passiveMobs: number;
  neutralMobs: number;
  safehouse: { hasBench: boolean; hasFurnace: boolean; hasChests: number };
}
```

## EventEntry Type

```typescript
export interface EventEntry {
  timestamp: string; // "HH:MM:SS"
  source: string;     // "BT", "GATHER", "COMBAT", "CRAFT", "SYS"
  message: string;
}
```

## RingBuffer

### `src/console/buffer.ts`

Fixed-size circular buffer for event log (default 200 entries).

```typescript
export class RingBuffer<T> {
  private buffer: T[];
  private head = 0;
  private _size = 0; // number of entries pushed (may exceed capacity)
  
  constructor(private capacity: number) {
    this.buffer = new Array(capacity);
  }

  push(item: T): void {
    this.buffer[this.head % this.capacity] = item;
    this.head++;
    this._size++;
  }

  toArray(): T[] {
    if (this.head <= this.capacity) {
      return this.buffer.slice(0, this.head);
    }
    const start = this.head % this.capacity;
    return [...this.buffer.slice(start), ...this.buffer.slice(0, start)];
  }

  clear(): void {
    this.head = 0;
    this._size = 0;
    this.buffer = new Array(this.capacity);
  }
}
```

## Console Integration

### `src/console/console.ts`

```typescript
import { Renderer } from "./renderer.js";
import { Commander } from "./commander.js";
import { RingBuffer, EventEntry } from "./buffer.js";
import type { StatusSnapshot } from "./renderer.js";
import type { Bot } from "../bot.js";

export class Console {
  private renderer: Renderer;
  private commander: Commander;
  private eventLog = new RingBuffer<EventEntry>(200);

  constructor(private bot: Bot) {
    this.renderer = new Renderer({
      getStatus: () => this.makeSnapshot(),
      getInventorySummary: () => this.bot.getInventorySummary(),
      getPathfindingStatus: () => this.bot.getPathfindingStatus?.() ?? "",
      getSubchunkStatus: () => this.bot.getSubchunkStatus?.() ?? "",
      getEventLog: () => this.eventLog.toArray().slice(-20),
      getSafehouseState: () => this.bot.getSafehouseState?.() ?? "",
    });

    this.commander = new Commander();
    this.registerCommands();
  }

  private registerCommands(): void {
    this.commander.register("stop", () => { this.bot.stop(); process.exit(0); });
    this.commander.register("status", () => this.formatSnapshot(this.makeSnapshot()));
    this.commander.register("phase", (args) => { /* read or set phase */ });
    this.commander.register("inv", () => this.bot.getInventorySummary());
    this.commander.register("skill", (args) => { /* read or set skill */ });
    this.commander.register("goto", (args) => { /* path to coords */ });
    this.commander.register("say", (args) => { /* send chat */ });
    this.commander.register("health", () => {
      const s = this.makeSnapshot();
      return `HP:${s.hp}/${s.maxHp} Hunger:${s.hunger} Armor:${s.armorMaterial}`;
    });
    this.commander.register("cmd", (args) => { /* raw command */ });
    this.commander.register("help", () => {
      return "Commands: /stop /status /phase /inv /skill /goto /say /health /cmd /help";
    });
  }

  log(source: string, message: string): void {
    const now = new Date();
    this.eventLog.push({
      timestamp: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`,
      source,
      message,
    });
  }

  start(): void {
    this.renderer.start();
    this.commander.start();
  }

  stop(): void {
    this.renderer.stop();
    this.commander.stop();
  }

  private makeSnapshot(): StatusSnapshot { /* query bot for all fields */ }
  private formatSnapshot(s: StatusSnapshot): string { /* formatted text */ }
}
```

## Bot Public Method Additions

New public methods on `Bot`:

| Method | Returns | Purpose |
|--------|---------|---------|
| `getStatus()` | `StatusSnapshot` | All bot state for renderer |
| `getInventorySummary()` | `string` | Condensed inventory line |
| `getPathfindingStatus()` | `string` | Current path node count + move types |
| `getSubchunkStatus()` | `string` | "213/213" format chunk ratio |
| `getSafehouseState()` | `string` | Has bench/furnace/chest count/safehouse pos |
| `getRecentLogs(n?)` | `string[]` | Last N log messages |

## Bot Modifications

- Remove `Dashboard` import and usage — replaced by `Console`
- Create `Console` in `start()` after spawn, replacing `new Dashboard(...)`
- Call `this.console.log(source, msg)` for significant events (phase changes, skill transitions, crafting, combat, ore found)
- `stop()` calls `this.console.stop()`
- Expose `connection` subchunk manager and `movement` path progress for status queries

## Graceful Shutdown

On SIGINT/SIGTERM:
1. `console.stop()` — restores terminal
2. `bot.stop()` — disconnects
3. `process.exit(0)`

If console crashes (bad ANSI), fall back to plain `console.log` output.

## Files

| File | Action |
|------|--------|
| `src/console/console.ts` | Create |
| `src/console/renderer.ts` | Create |
| `src/console/commander.ts` | Create |
| `src/console/buffer.ts` | Create |
| `src/bot.ts` | Modify — replace Dashboard, add getter methods, add event logging |
| `src/index.ts` | Modify — graceful shutdown hook |
| `src/telemetry/dashboard.ts` | Delete (superseded) |
| `src/connection/connection.ts` | Expose subchunk manager getter if needed |
| `src/movement/movement.ts` | Expose path progress getter if needed |

## Acceptance Criteria

1. Full-screen ANSI display replaces single-line `\r` dashboard
2. Status bar shows host, uptime, tick avg
3. Detail panels show: HP/hunger/armor, phase/dimension/daytime/skill, inventory slot count + tool durability, pathfinding + chunk/subchunk stats, mob counts + safehouse state
4. Event log shows last N events with timestamps
5. All 10 commands work: `/stop /status /phase /inv /skill /goto /say /health /cmd /help`
6. `/goto x y z` paths bot to coordinates
7. Console restores terminal on exit (cursor visible, normal buffer)
8. SIGINT/SIGTERM triggers graceful shutdown
9. TypeScript compiles with `--noEmit` zero errors
10. Existing 47 tests continue to pass
