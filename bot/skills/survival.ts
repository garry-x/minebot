// bot/skills/survival.ts

import type { Skill, SkillContext } from './index';
import { GoalBlock } from 'mineflayer-pathfinder/lib/goals';
import { Vec3 } from 'vec3';

export function createEatSkill(): Skill {
  return {
    name: 'eat',
    description: 'Eat the best available food item from inventory',
    cooldown: 3000,
    async execute({ bot }) {
      const botAny = bot as any;
      const foodItems = [
        'cooked_beef', 'steak', 'cooked_porkchop', 'cooked_chicken',
        'bread', 'apple', 'cooked_mutton', 'cooked_rabbit',
      ];

      let bestFood = null;
      let bestHunger = 0;

      for (const name of foodItems) {
        const item = botAny.inventory.findInventoryItem(name, null);
        if (item) {
          const hungerMap: Record<string, number> = {
            steak: 8, cooked_beef: 8, cooked_porkchop: 8, cooked_chicken: 6,
            bread: 5, apple: 4, cooked_mutton: 4, cooked_rabbit: 6,
          };
          if (hungerMap[name] > bestHunger) {
            bestHunger = hungerMap[name];
            bestFood = item;
          }
        }
      }

      if (bestFood) {
        await botAny.consume();
      }
    },
  };
}

export function createPlaceTorchSkill(): Skill {
  return {
    name: 'placeTorch',
    description: 'Place a torch at current position if no light nearby',
    cooldown: 5000,
    async execute({ bot, world }) {
      const botAny = bot as any;
      if (world.lightLevel >= 7) return; // Don't place if already lit

      const torch = botAny.inventory.findInventoryItem('torch', null);
      if (!torch) return;

      const pos = botAny.entity.position;
      const footBlock = botAny.blockAt(new Vec3(
        Math.floor(pos.x), Math.floor(pos.y) - 1, Math.floor(pos.z)
      ));
      if (footBlock) {
        await botAny.placeBlock(footBlock, null);
      }
    },
  };
}

export function createFindSafeRetreatSkill(): Skill {
  return {
    name: 'findSafeRetreat',
    description: 'Find a safe retreat location (water > cave > tree > flee)',
    cooldown: 10000,
    async execute({ bot }) {
      const botAny = bot as any;
      const pos = botAny.entity.position;

      // Priority 1: water nearby
      const water = botAny.findBlock({
        matching: (b: any) => b.name === 'water' || b.name === 'water_stationary',
        maxDistance: 16,
      });
      if (water) {
        botAny.pathfinder.setGoal(new GoalBlock(water.position.x, water.position.y, water.position.z), true);
        await waitForPathComplete(botAny, 10000);
        return;
      }

      // Priority 2: cave / underground
      for (let y = Math.floor(pos.y); y > -64; y--) {
        const block = botAny.blockAt(new Vec3(Math.floor(pos.x), y, Math.floor(pos.z)));
        if (block && block.name !== 'air' && !['stone', 'cobblestone', 'dirt', 'gravel'].includes(block.name)) {
          // Found cave entrance
          botAny.pathfinder.setGoal(new GoalBlock(Math.floor(pos.x), y - 1, Math.floor(pos.z)), true);
          await waitForPathComplete(botAny, 10000);
          return;
        }
      }

      // Priority 3: flee from hostiles
      const hostiles = getNearbyHostiles(botAny);
      if (hostiles.length > 0) {
        const fleeGoal = new GoalBlock(
          Math.floor(pos.x) + (Math.random() > 0.5 ? 15 : -15),
          Math.floor(pos.y),
          Math.floor(pos.z) + (Math.random() > 0.5 ? 15 : -15),
        );
        botAny.pathfinder.setGoal(fleeGoal, true);
        await waitForPathComplete(botAny, 15000);
        return;
      }

      // Priority 4: random safe direction
      const randomGoal = new GoalBlock(
        Math.floor(pos.x) + Math.floor(Math.random() * 20 - 10),
        Math.floor(pos.y),
        Math.floor(pos.z) + Math.floor(Math.random() * 20 - 10),
      );
      botAny.pathfinder.setGoal(randomGoal, true);
      await waitForPathComplete(botAny, 15000);
    },
  };
}

// --- Helpers ---

function waitForPathComplete(bot: any, timeout: number): Promise<void> {
  return new Promise((resolve) => {
    bot.once('pathfinder_goal_reached', () => resolve());
    setTimeout(resolve, timeout);
  });
}

function getNearbyHostiles(bot: any): any[] {
  const hostiles = [
    'zombie', 'skeleton', 'spider', 'creeper', 'enderman',
    'witch', 'slime', 'phantom', 'drowned', 'pillager',
    'ravager', 'vex', 'husk', 'stray',
  ];
  return Object.values(bot.entities || {}).filter((e: any) =>
    e.type === 'mob' && hostiles.includes(e.name)
  );
}
