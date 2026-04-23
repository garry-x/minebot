// bot/skills/world-utils.ts

import type { Skill, SkillContext } from './index';

export function createScanEntitiesSkill(): Skill {
  return {
    name: 'scanEntities',
    description: 'Scan for entities within given radius',
    cooldown: 2000,
    async execute({ bot }) {
      const botAny = bot as any;
      // This is a query skill - populates bot._scanResult
      const radius = botAny._scanRadius as number || 16;
      const pos = botAny.entity.position;
      const entities: string[] = [];
      const hostiles = [
        'zombie', 'skeleton', 'spider', 'creeper', 'enderman',
        'witch', 'slime', 'phantom', 'drowned', 'pillager',
        'ravager', 'vex', 'husk', 'stray',
      ];
      for (const [id, entity] of Object.entries(botAny.entities || {})) {
        const e = entity as any;
        const dist = pos.distanceTo(e.position);
        if (dist <= radius) {
          entities.push(`${e.name}@${Math.floor(dist)}`);
        }
      }
      botAny._scanResult = { entities, hostiles: entities.filter(e => hostiles.some(h => e.startsWith(h))) };
    },
  };
}

export function createCheckHealthSkill(): Skill {
  return {
    name: 'checkHealth',
    description: 'Check current health and hunger status',
    cooldown: 1000,
    async execute({ bot }) {
      const botAny = bot as any;
      botAny._healthResult = {
        health: botAny.health,
        maxHealth: botAny.maxHealth,
        food: botAny.food,
        hunger: botAny.foodSaturation,
      };
    },
  };
}

export function createLookForItemSkill(): Skill {
  return {
    name: 'lookForItem',
    description: 'Look for a specific item in inventory',
    cooldown: 1000,
    async execute({ bot }) {
      const botAny = bot as any;
      const itemName = botAny._lookForItemName as string;
      if (!itemName) return;
      const item = botAny.inventory.findInventoryItem(itemName, null);
      botAny._itemResult = {
        found: !!item,
        count: item?.count || 0,
        slots: item ? [item.slot] : [],
      };
    },
  };
}

export function createFindBlockSkill(): Skill {
  return {
    name: 'findBlock',
    description: 'Find nearest block of given type',
    cooldown: 2000,
    async execute({ bot }) {
      const botAny = bot as any;
      const blockType = botAny._findBlockType as string;
      const radius = botAny._findBlockRadius as number || 32;
      if (!blockType) return;
      const block = botAny.findBlock({
        matching: (b: any) => b.name === blockType,
        maxDistance: radius,
        minDistance: 1,
      });
      botAny._blockResult = block
        ? { found: true, position: block.position, name: block.name }
        : { found: false };
    },
  };
}
