// bot/engine/modes/item-collecting.ts

import { BaseMode } from './base';
import { GoalBlock } from 'mineflayer-pathfinder/lib/goals';

export class ItemCollectingMode extends BaseMode {
  get name() { return 'item_collecting'; }
  get priority() { return 4; }
  get description() { return 'Collect nearby items when idle.'; }

  private lastCollect = 0;

  onUpdate(bot: any, delta: number): boolean {
    const now = Date.now();
    if (now - this.lastCollect < 2000) return true;

    const items = Object.values(bot.entities || [])
      .filter((e: any) => e.type === 'object' && e.name === 'item')
      .filter((e: any) => bot.entity.position.distanceTo(e.position) <= 8);

    if (items.length === 0) return false;

    const target = items[0] as any;
    bot.pathfinder.setGoal(new GoalBlock(target.position.x, target.position.y, target.position.z), true);
    this.lastCollect = now;
    return true;
  }
}
