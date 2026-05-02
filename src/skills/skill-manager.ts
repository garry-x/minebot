import type { Skill, SkillContext } from "./skill.js";
import { getLogger } from "../utils/logger.js";
import type { MetricsCollector } from "../telemetry/metrics.js";

export class SkillManager {
  private skills: Map<string, Skill> = new Map();
  private current: Skill | null = null;
  private metrics?: MetricsCollector;

  setMetrics(metrics: MetricsCollector): void {
    this.metrics = metrics;
  }

  register(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  setCurrent(name: string, ctx: SkillContext): void {
    const skill = this.skills.get(name);
    if (!skill) {
      ctx.logger?.warn(`Skill "${name}" not registered`);
      return;
    }
    if (this.current) {
      void this.current.exit(ctx);
    }
    this.current = skill;
    void skill.enter(ctx);
    this.metrics?.recordSkillTransition(name);
  }

  async tick(ctx: SkillContext): Promise<void> {
    if (!this.current) return;
    try {
      const next = await this.current.tick(ctx);
      if (next && next !== this.current.name && this.skills.has(next)) {
        this.setCurrent(next, ctx);
      }
    } catch (err) {
      getLogger().error({ err }, `Skill "${this.current.name}" crashed`);
      this.setCurrent("idle", ctx);
    }
  }

  getCurrentSkillName(): string | null {
    return this.current?.name ?? null;
  }

  getCurrentPriority(): number {
    return this.current?.priority ?? 0;
  }
}
