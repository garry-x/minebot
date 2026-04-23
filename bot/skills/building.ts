// bot/skills/building.ts

import type { Skill, SkillContext } from './index';
import { GoalBlock } from 'mineflayer-pathfinder/lib/goals';
import { Vec3 } from 'vec3';

export function createPlaceBlockSkill(): Skill {
  return {
    name: 'placeBlock',
    description: 'Place a block at a specific position',
    cooldown: 1000,
    async execute({ bot }) {
      const botAny = bot as any;
      const blockName = botAny._placeBlockName as string;
      const targetPos = botAny._placeBlockPos;
      if (!blockName || !targetPos) return;

      const block = botAny.inventory.findInventoryItem(blockName, null);
      if (!block) return;

      const targetBlock = botAny.blockAt(targetPos);
      if (targetBlock) {
        await botAny.placeBlock(targetBlock, null);
      }
    },
  };
}

export function createBuildStructureSkill(): Skill {
  return {
    name: 'buildStructure',
    description: 'Build a hollow rectangular shell at offset from bot',
    cooldown: 10000,
    async execute({ bot }) {
      const botAny = bot as any;
      const params = botAny._buildParams as {
        material: string;
        width?: number;
        length?: number;
        height?: number;
        offsetX?: number;
        offsetZ?: number;
        offsetY?: number;
      } | undefined;
      if (!params) return;

      const {
        material,
        width = 5,
        length = 5,
        height = 4,
        offsetX = 0,
        offsetZ = 0,
        offsetY = 0,
      } = params;

      const pos = botAny.entity.position;

      for (let x = 0; x < width; x++) {
        for (let z = 0; z < length; z++) {
          for (let y = 0; y < height; y++) {
            // Only build edges (hollow shell)
            const isEdge = x === 0 || x === width - 1 || z === 0 || z === length - 1 || y === 0 || y === height - 1;
            if (!isEdge) continue;

            // Skip door opening
            if (y === 1 && z >= Math.floor(length / 2) && z <= Math.floor(length / 2) + 1) continue;

            const bx = Math.floor(pos.x) + offsetX + x;
            const by = Math.floor(pos.y) + offsetY + y;
            const bz = Math.floor(pos.z) + offsetZ + z;

            // Ensure block is in inventory
            const invBlock = botAny.inventory.findInventoryItem(material, null);
            if (!invBlock) continue;

            const block = botAny.blockAt(new Vec3(bx, by, bz));
            if (block) {
              await botAny.placeBlock(block, null);
            }
          }
        }
      }
    },
  };
}

export function createCraftItemSkill(): Skill {
  return {
    name: 'craftItem',
    description: 'Craft an item using a nearby crafting table',
    cooldown: 5000,
    async execute({ bot }) {
      const botAny = bot as any;
      const itemName = botAny._craftItemName as string;
      if (!itemName) return;

      // Find or place crafting table
      let table = botAny.findBlock({
        matching: (b: any) => b.name === 'crafting_table',
        maxDistance: 16,
      });

      if (!table) {
        const woodenPlanks = botAny.inventory.findInventoryItem('oak_planks', null);
        if (woodenPlanks) {
          // Place crafting table at bot feet
          const pos = botAny.entity.position;
          const footBlock = botAny.blockAt(new Vec3(Math.floor(pos.x), Math.floor(pos.y) - 1, Math.floor(pos.z)));
          if (footBlock) {
            await botAny.placeBlock(footBlock, null);
            table = botAny.findBlock({
              matching: (b: any) => b.name === 'crafting_table',
              maxDistance: 16,
            });
          }
        }
      }

      if (!table) return;

      // Get recipes
      const recipes = botAny.recipesFor(itemName, null, 1, table);
      if (recipes.length === 0) return;

      await botAny.craft(recipes[0], 1);
    },
  };
}
