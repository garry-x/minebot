import { MetricsCollector } from "./metrics.js";
import type { WorldState } from "../world/world-state.js";
import type { SkillManager } from "../skills/skill-manager.js";
import type { HungerTracker } from "../player/hunger.js";

export class Dashboard {
  private metrics: MetricsCollector;
  private world: WorldState;
  private skills: SkillManager;
  private hunger: HungerTracker;

  constructor(metrics: MetricsCollector, world: WorldState, skills: SkillManager, hunger: HungerTracker) {
    this.metrics = metrics;
    this.world = world;
    this.skills = skills;
    this.hunger = hunger;
  }

  print(): void {
    const pos = this.world.getPlayerPosition();
    const skill = this.skills.getCurrentSkillName() ?? "none";
    const m = this.metrics.getMetrics();
    const avgTick = this.metrics.getAvgTickDurationMs().toFixed(1);
    const now = new Date().toLocaleTimeString("en-US", { hour12: false });
    
    // Format: [16:42:01] IDLE | pos:(120,64,-45) | HP:20/20 | Hunger:18 | Mobs:2 | Chunks:144 | Tick:12ms
    // For now, omit HP since we don't track it in WorldState yet (Phase 2 TODO)
    const line = `[${now}] ${skill.toUpperCase()} | pos:(${Math.round(pos.x)},${Math.round(pos.y)},${Math.round(pos.z)}) | Hunger:${Math.round(this.hunger.getHungerRatio() * 20)} | Mobs:${m.entityCount} | Chunks:${m.chunkCount} | Tick:${avgTick}ms`;
    
    // Clear line and print (use \r for inline update, or just console.log)
    process.stdout.write("\r" + line.padEnd(100));
  }
}
