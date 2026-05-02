import type { WorldState } from "../world/world-state.js";
import type { Movement } from "../movement/movement.js";
import type { Inventory } from "../inventory/inventory.js";
import type { EventBus, BotEvents } from "../events/event-bus.js";
import type { Logger } from "../utils/logger.js";
import type { HungerTracker } from "../player/hunger.js";
import type { MetricsCollector } from "../telemetry/metrics.js";
import type { PathfindingCircuitBreaker } from "../movement/circuit-breaker.js";

export interface SkillContext {
  world: WorldState;
  movement: Movement;
  inventory: Inventory;
  events: EventBus<BotEvents>;
  logger: Logger;
  hunger: HungerTracker;
  metrics?: MetricsCollector;
  circuitBreaker?: PathfindingCircuitBreaker;
}

export abstract class Skill {
  public readonly name: string;
  public readonly priority: number;

  constructor(name: string, priority = 0) {
    this.name = name;
    this.priority = priority;
  }

  abstract enter(ctx: SkillContext): Promise<void>;
  abstract tick(ctx: SkillContext): Promise<string | null>;
  abstract exit(ctx: SkillContext): Promise<void>;
}
