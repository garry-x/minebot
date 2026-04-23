// bot/engine/modes/self-defense.ts

import { BaseMode } from './base';
import { GoalBlock } from 'mineflayer-pathfinder/lib/goals';

export class SelfDefenseMode extends BaseMode {
  get name() { return 'self_defense'; }
  get priority() { return 2; }
  get description() { return 'Attack hostile entities within 8-block range with clear path.'; }

  private cooldown = 0;

  onUpdate(bot: any, delta: number): boolean {
    this.cooldown -= delta;
    if (this.cooldown > 0) return true;

    const hostiles = getNearbyHostiles(bot, 8);
    if (hostiles.length === 0) return false;

    // Attack nearest hostile
    const target = hostiles[0];
    if (target) {
      bot.pvp.attack(target);
      this.cooldown = 2000;
    }

    return true;
  }
}

function getNearbyHostiles(bot: any, range: number) {
  const pos = bot.entity.position;
  const hostiles = [
    'zombie', 'skeleton', 'spider', 'creeper', 'enderman',
    'witch', 'slime', 'phantom', 'drowned', 'pillager',
  ];
  return Object.values(bot.entities || [])
    .filter((e: any) => {
      if (e.type !== 'mob') return false;
      if (!hostiles.includes(e.name)) return false;
      const dist = pos.distanceTo(e.position);
      return dist <= range;
    })
    .sort((a: any, b: any) => a.position.distanceTo(pos) - b.position.distanceTo(pos));
}
