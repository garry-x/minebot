// bot/engine/modes/hunting.ts

import { BaseMode } from './base';
import { GoalBlock } from 'mineflayer-pathfinder/lib/goals';

export class HuntingMode extends BaseMode {
  get name() { return 'hunting'; }
  get priority() { return 3; }
  get description() { return 'Hunt nearby huntable animals when idle.'; }

  private cooldown = 0;

  onUpdate(bot: any, delta: number): boolean {
    this.cooldown -= delta;
    if (this.cooldown > 0) return true;

    const huntable = ['cow', 'pig', 'chicken', 'sheep', 'rabbit'].filter((type) => {
      return Object.values(bot.entities || {}).some((e: any) =>
        e.type === 'mob' && e.name === type && bot.entity.position.distanceTo(e.position) <= 16
      );
    });

    if (huntable.length > 0) {
      const target = Object.values(bot.entities || {}).find((e: any) =>
        e.type === 'mob' && huntable.includes(e.name) && bot.entity.position.distanceTo(e.position) <= 16
      );
      if (target) {
        const t = target as any;
        bot.pathfinder.setGoal(new GoalBlock(t.position.x, t.position.y, t.position.z), true);
        this.cooldown = 5000;
        return true;
      }
    }

    return false;
  }
}
