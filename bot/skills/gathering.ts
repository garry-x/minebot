// bot/skills/gathering.ts

import type { Skill, SkillContext } from './index';
import type { Vec3 } from 'vec3';
import { GoalNear, GoalBlock } from 'mineflayer-pathfinder/lib/goals';

export function createGatherResourcesSkill(): Skill {
  return {
    name: 'gatherResources',
    description: 'Gather specified blocks or items from nearby area',
    cooldown: 5000,
    async execute({ bot }) {
      const botAny = bot as any;
      const targetNames = botAny._gatherTargets as string[];
      const radius = botAny._gatherRadius as number || 30;

      if (!targetNames?.length) return;

      // Scan for blocks within radius
      const blocks = findBlocks(botAny, targetNames, radius);
      if (blocks.length === 0) return;

      // Visit each block
      for (const blockPos of blocks) {
        if (!isBlockSafe(botAny, blockPos)) continue;

        botAny.pathfinder.setGoal(new GoalBlock(blockPos.x, blockPos.y, blockPos.z), true);
        await waitForPathComplete(botAny, 15000);

        // Mine the block
        const block = botAny.blockAt(blockPos);
        if (block && block.name !== 'air') {
          await botAny.dig(block);
          // Wait for block to become air
          await waitForCondition(() => {
            const b = botAny.blockAt(blockPos);
            return !b || b.name === 'air';
          }, 5000, 200);
        }
      }
    },
  };
}

export function createPickupNearbyItemsSkill(): Skill {
  return {
    name: 'pickupNearbyItems',
    description: 'Pick up all items within 8 block radius',
    cooldown: 3000,
    async execute({ bot }) {
      const botAny = bot as any;
      const items = botEntitiesWhere(botAny, (e: any) => e.type === 'object' && e.name === 'item');
      for (const item of items) {
        botAny.pathfinder.setGoal(item.entity, 1);
        await waitForPathComplete(botAny, 10000);
      }
    },
  };
}

export function createMineBlockSkill(): Skill {
  return {
    name: 'mineBlock',
    description: 'Mine a specific block type at the nearest location',
    cooldown: 3000,
    async execute({ bot }) {
      const botAny = bot as any;
      const blockType = botAny._mineBlockType as string;
      if (!blockType) return;

      const block = getNearestBlock(botAny, blockType, 32);
      if (!block) return;

      botAny.pathfinder.setGoal(new GoalBlock(block.position.x, block.position.y, block.position.z), true);
      await waitForPathComplete(botAny, 10000);

      const b = botAny.blockAt(block.position);
      if (b && b.name !== 'air') {
        await botAny.dig(b);
      }
    },
  };
}

// --- Helpers ---

function findBlocks(bot: any, blockNames: string[], maxDistance: number): Vec3[] {
  const results: Vec3[] = [];

  for (const name of blockNames) {
    const block = bot.findBlock({
      matching: (b: any) => {
        // Handle ore variants
        if (name.includes('_ore')) {
          return b.name === name || b.name === name.replace('_ore', '');
        }
        return b.name === name;
      },
      maxDistance,
      minDistance: 1,
    });
    if (block) {
      results.push(block.position);
    }
  }
  return results;
}

function isBlockSafe(bot: any, pos: Vec3): boolean {
  const block = bot.blockAt(pos);
  if (!block) return true;
  const dangerous = ['lava', 'lava_stationary', 'fire', 'cactus', 'magma_block'];
  return !dangerous.includes(block.name);
}

function waitForCondition(
  condition: () => boolean,
  timeout: number,
  interval: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (condition()) { resolve(); return; }
      if (Date.now() - start > timeout) { reject(new Error('Timeout')); return; }
      setTimeout(check, interval);
    };
    check();
  });
}

function waitForPathComplete(bot: any, timeout: number): Promise<void> {
  return new Promise((resolve) => {
    bot.once('pathfinder_goal_reached', () => resolve());
    setTimeout(resolve, timeout);
  });
}

function botEntitiesWhere(bot: any, predicate: (e: any) => boolean): any[] {
  return bot.entities
    ? Object.values(bot.entities).filter((e: any) => predicate(e))
    : [];
}

function getNearestBlock(bot: any, blockType: string, maxDistance: number): any {
  return bot.findBlock({
    matching: (b: any) => b.name === blockType,
    maxDistance,
    minDistance: 1,
  });
}
