// bot/engine/modes/unstuck.ts

import { BaseMode } from './base';
import { GoalBlock } from 'mineflayer-pathfinder/lib/goals';

export class UnstuckMode extends BaseMode {
  get name() { return 'unstuck'; }
  get priority() { return 1; }
  get description() { return 'Detect if bot has been stuck (no movement for 20s) and call moveAway.'; }

  private lastX = 0;
  private lastZ = 0;
  private noMoveFrames = 0;

  onUpdate(bot: any, delta: number): boolean {
    const pos = bot.entity.position;

    if (Math.abs(pos.x - this.lastX) > 0.1 || Math.abs(pos.z - this.lastZ) > 0.1) {
      this.noMoveFrames = 0;
      this.lastX = pos.x;
      this.lastZ = pos.z;
      return false;
    }

    this.noMoveFrames += delta / 1000;

    if (this.noMoveFrames >= 20) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 5 + Math.random() * 5;
      const goal = new GoalBlock(
        Math.floor(pos.x + Math.cos(angle) * dist),
        Math.floor(pos.y),
        Math.floor(pos.z + Math.sin(angle) * dist),
      );
      bot.pathfinder.setGoal(goal, true);
      return true;
    }

    return false;
  }
}
