import type { Skill, SkillContext } from "./skill.js";
import { getLogger } from "../utils/logger.js";
import type { MetricsCollector } from "../telemetry/metrics.js";

export class SkillManager {
  private skills = new Map<string, Skill>();
  private current: Skill | null = null;
  private currentPriority = -Infinity;
  private metrics?: MetricsCollector;

  setMetrics(metrics: MetricsCollector): void {
    this.metrics = metrics;
  }

  register(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  unregister(name: string): void {
    if (this.current?.name === name) {
      getLogger().warn(`Cannot unregister active skill: ${name}`);
      return;
    }
    this.skills.delete(name);
  }

  setCurrent(name: string, ctx: SkillContext): void {
    const skill = this.skills.get(name);
    if (!skill) {
      getLogger().warn(`Skill not found: ${name}`);
      return;
    }
    this.transition(skill, ctx);
  }

  requestWithPriority(name: string, ctx: SkillContext): void {
    const skill = this.skills.get(name);
    if (!skill) {
      getLogger().warn(`Skill not found: ${name}`);
      return;
    }
    if (this.current && skill.priority <= this.currentPriority) {
      return;
    }
    this.transition(skill, ctx);
  }

  private async transition(next: Skill, ctx: SkillContext): Promise<void> {
    this.metrics?.recordSkillTransition(next.name);

    const previous = this.current;
    this.current = next;
    this.currentPriority = next.priority;

    const enterPromise = next.enter(ctx);

    if (previous && previous.name !== next.name) {
      const logger = getLogger();
      logger.info(`Skill transition: ${previous.name} -> ${next.name}`);
      try {
        await previous.exit(ctx);
      } catch (err) {
        logger.error({ err }, `Error exiting skill: ${previous.name}`);
      }
    }

    try {
      await enterPromise;
    } catch (err) {
      getLogger().error({ err }, `Error entering skill: ${next.name}`);
    }
  }

  async tick(ctx: SkillContext): Promise<void> {
    if (!this.current) return;
    try {
      const next = await this.current.tick(ctx);
      if (next && next !== this.current.name) {
        this.setCurrent(next, ctx);
      }
    } catch (err) {
      getLogger().error({ err }, `Error ticking skill: ${this.current.name}`);
      if (this.current.name !== "idle") {
        this.setCurrent("idle", ctx);
      }
    }
  }

  getCurrentSkillName(): string | null {
    return this.current?.name ?? null;
  }

  getCurrentPriority(): number {
    return this.currentPriority;
  }
}
