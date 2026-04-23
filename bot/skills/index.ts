// bot/skills/index.ts

import type { Bot } from 'mineflayer';
import type { WorldState, Inventory } from '../types';

export interface SkillContext {
  bot: Bot;
  world: WorldState;
  inventory: Inventory;
}

export interface Skill {
  name: string;
  description: string;
  cooldown?: number;
  canRun?(ctx: SkillContext): boolean;
  execute(ctx: SkillContext): Promise<void>;
}

export class SkillRegistry {
  private skills = new Map<string, Skill>();
  private cooldowns = new Map<string, number>();

  register(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  getAll(): Map<string, Skill> {
    return this.skills;
  }

  async execute(name: string, ctx: SkillContext): Promise<void> {
    const skill = this.skills.get(name);
    if (!skill) {
      throw new Error(`Unknown skill: ${name}`);
    }
    if (skill.canRun && !skill.canRun(ctx)) {
      throw new Error(`Skill ${name} precondition not met`);
    }
    if (!this.isReady(name)) {
      throw new Error(`Skill ${name} on cooldown`);
    }
    await skill.execute(ctx);
    if (skill.cooldown) {
      this.cooldowns.set(name, Date.now() + skill.cooldown);
    }
  }

  isReady(name: string): boolean {
    const cooldownEnd = this.cooldowns.get(name);
    if (!cooldownEnd) return true;
    return Date.now() >= cooldownEnd;
  }
}
