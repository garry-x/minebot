// bot/engine/modes/self-preservation.ts

import { BaseMode } from './base';
import { Vec3 } from 'vec3';
import { GoalBlock } from 'mineflayer-pathfinder/lib/goals';

export class SelfPreservationMode extends BaseMode {
  get name() { return 'self_preservation'; }
  get priority() { return 0; }
  get description() { return 'Respond to drowning, burning, lava, and critical health. Interrupts all actions.'; }

  onUpdate(bot: any, delta: number): boolean {
    const pos = bot.entity.position;
    const blockAtFeet = bot.blockAt(pos);
    const blockAtHead = bot.blockAt(new Vec3(pos.x, pos.y + 1, pos.z));

    // Drowning: no air above head
    if (blockAtHead?.name === 'water' || blockAtHead?.name === 'water_stationary') {
      const upGoal = new GoalBlock(pos.x, pos.y + 2, pos.z);
      bot.pathfinder.setGoal(upGoal, true);
      return true;
    }

    // Burning: on fire or in lava/fire
    if (bot.status?.onFire || blockAtFeet?.name === 'lava' || blockAtFeet?.name === 'lava_stationary' || blockAtFeet?.name === 'fire') {
      const water = bot.findBlock({ matching: (b: any) => b.name === 'water', maxDistance: 16 });
      if (water) {
        bot.pathfinder.setGoal(new GoalBlock(water.position.x, water.position.y, water.position.z), true);
      } else {
        bot.pathfinder.setGoal(new GoalBlock(pos.x + 10, pos.y, pos.z + 10), true);
      }
      return true;
    }

    // Critical health: eat or find shelter
    if (bot.health !== undefined && bot.health <= 5) {
      const food = ['apple', 'bread', 'cooked_beef', 'cooked_porkchop'].find(
        (name) => bot.inventory.findInventoryItem(name, null)
      );
      if (food) {
        bot.consume();
      } else {
        bot.pathfinder.setGoal(new GoalBlock(pos.x + 10, pos.y, pos.z + 10), true);
      }
      return true;
    }

    // Fall into void
    if (pos.y < -60) {
      bot.pathfinder.setGoal(new GoalBlock(pos.x, 64, pos.z), true);
      return true;
    }

    return false;
  }
}
