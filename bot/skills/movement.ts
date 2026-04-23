// bot/skills/movement.ts

import type { Skill } from './index';
import { GoalNear, GoalBlock } from 'mineflayer-pathfinder/lib/goals';

export function createFlyToSkill(): Skill {
  return {
    name: 'flyTo',
    description: 'Fly to given coordinates with pathfinding',
    cooldown: 1000,
    async execute({ bot }) {
      const goal = (bot as any)._flyToGoal;
      if (!goal) return;

      (bot as any).pathfinder.setGoal(goal, true);
      await new Promise<void>((resolve) => {
        (bot as any).once('pathfinder_goal_reached', () => resolve());
        setTimeout(resolve, 30000);
      });
    },
  };
}

export function createRetreatSkill(): Skill {
  return {
    name: 'retreat',
    description: 'Move away from current position in opposite direction',
    cooldown: 2000,
    async execute({ bot }) {
      const pos = (bot as any).entity.position;
      const retreatGoal = new GoalBlock(
        pos.x - Math.floor(Math.random() * 15 + 10),
        pos.y,
        pos.z - Math.floor(Math.random() * 15 + 10),
      );
      (bot as any).pathfinder.setGoal(retreatGoal, true);
      await new Promise<void>((resolve) => {
        (bot as any).once('pathfinder_goal_reached', () => resolve());
        setTimeout(resolve, 15000);
      });
    },
  };
}

export function createMoveToSkill(): Skill {
  return {
    name: 'moveTo',
    description: 'Move to given coordinates with pathfinding',
    cooldown: 1000,
    async execute({ bot }) {
      const goal = (bot as any)._moveToGoal;
      if (!goal) return;
      (bot as any).pathfinder.setGoal(goal, true);
      await new Promise<void>((resolve) => {
        (bot as any).once('pathfinder_goal_reached', () => resolve());
        setTimeout(resolve, 30000);
      });
    },
  };
}
