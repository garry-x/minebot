// bot/engine/mode-controller.ts

import type { Bot } from 'mineflayer';
import { Logger } from '../logger';

export interface Mode {
  name: string;
  priority: number;  // lower = higher priority
  description: string;
  tickRate?: number;
  isEventDriven?: boolean;
  on?(bot: Bot): void;
  onUpdate?(bot: Bot, delta: number): boolean;  // true = stay active
  onEvent?(bot: Bot, event: { type: string; data?: Record<string, unknown> }): void;
  off?(bot: Bot): void;
}

export class ModeController {
  private modes = new Map<string, Mode>();
  private activeMode: Mode | null = null;
  private pausedMode: Mode | null = null;
  private tickInterval: NodeJS.Timeout | null = null;
  private lastTick = Date.now();
  private behaviorLog: string[] = [];
  private bot: Bot;
  private logger: Logger;

  constructor(bot: Bot, logger: Logger) {
    this.bot = bot;
    this.logger = logger;
  }

  register(mode: Mode): void {
    this.modes.set(mode.name, mode);
  }

  registerAll(modes: Mode[]): void {
    for (const mode of modes) {
      this.register(mode);
    }
  }

  start(tickRate: number = 300): void {
    this.tickInterval = setInterval(() => this.tick(tickRate), tickRate);
    this.logger.debug(`ModeController started with ${tickRate}ms tick`);
  }

  stop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    // Clean up active mode
    if (this.activeMode?.off) {
      this.activeMode.off(this.bot);
      this.activeMode = null;
    }
    // Clean up paused mode
    if (this.pausedMode?.off) {
      this.pausedMode.off(this.bot);
      this.pausedMode = null;
    }
    this.pausedMode = null;
  }

  pause(name: string): void {
    const mode = this.modes.get(name);
    if (mode && this.activeMode?.name === name) {
      if (mode.off) mode.off(this.bot);
      this.pausedMode = mode;
      this.activeMode = null;
      this.log(`Paused mode: ${name}`);
    }
  }

  unpause(): void {
    if (this.pausedMode) {
      if (this.pausedMode.on) this.pausedMode.on(this.bot);
      this.activeMode = this.pausedMode;
      this.pausedMode = null;
      this.log(`Unpaused mode: ${this.activeMode!.name}`);
    }
  }

  isOn(name: string): boolean {
    return this.modes.has(name);
  }

  setActiveMode(name: string): void {
    // Used by commands to directly activate a mode
    if (this.activeMode?.off) {
      this.activeMode.off(this.bot);
    }
    const mode = this.modes.get(name);
    if (mode) {
      if (mode.on) mode.on(this.bot);
      this.activeMode = mode;
      this.log(`Manual activation: ${name}`);
    }
  }

  flushBehaviorLog(): string {
    const log = this.behaviorLog.join('\n');
    this.behaviorLog = [];
    return log;
  }

  private log(message: string): void {
    this.behaviorLog.push(message);
    if (this.behaviorLog.length > 500) {
      this.behaviorLog = this.behaviorLog.slice(-200);
    }
  }

  private tick(delta: number): void {
    const now = Date.now();
    const timeSinceLast = now - this.lastTick;
    this.lastTick = now;

    // If idle (no active mode and no paused mode), un-pause all
    const isIdle = !this.activeMode && !this.pausedMode;
    if (isIdle) {
      this.unpause();  // Reset paused state
    }

    // Collect all active modes from this tick
    let newActive: Mode | null = null;

    // Sort modes by priority (lower number = higher priority)
    const sorted = Array.from(this.modes.values())
      .filter(m => !m.isEventDriven)
      .sort((a, b) => a.priority - b.priority);

    for (const mode of sorted) {
      if (mode.name === this.pausedMode?.name) continue;
      if (mode.name === newActive?.name) continue;

      const modeActive = this.activeMode?.name === mode.name;
      const interruptCurrent = mode.priority < (this.activeMode?.priority ?? Infinity);

      if (isIdle || interruptCurrent) {
        const result = mode.onUpdate?.(this.bot, timeSinceLast);
        if (result === true) {
          newActive = mode;
          break;
        }
      }
    }

    // Switch active mode if changed
    if (newActive && newActive !== this.activeMode) {
      if (this.activeMode?.off) {
        this.activeMode.off(this.bot);
      }
      if (newActive.on) {
        newActive.on(this.bot);
      }
      this.activeMode = newActive;
    }

    // Keep running current mode's onUpdate
    if (this.activeMode) {
      const keepGoing = this.activeMode.onUpdate?.(this.bot, timeSinceLast);
      if (keepGoing === false) {
        if (this.activeMode.off) this.activeMode.off(this.bot);
        this.activeMode = null;
      }
    }
  }

  emitEvent(event: { type: string; data?: Record<string, unknown> }): void {
    for (const mode of this.modes.values()) {
      if (mode.isEventDriven && mode.onEvent) {
        mode.onEvent(this.bot, event);
      }
    }
  }
}
