// bot/commands/query-commands.ts

import type { Command, CommandContext } from './index';

export const queryCommands: Command[] = [
  {
    name: 'status',
    prompt: '!status',
    description: 'Get current bot status (position, health, hunger, time, weather, active mode)',
    execute(_params, ctx) {
      const { bot } = ctx;
      const pos = bot.entity.position;
      const maxHealth = (bot as any).maxHealth || 20;
      const saturation = (bot as any).foodSaturation ?? 0;
      return Promise.resolve(`Status: pos=(${pos.x.toFixed(1)},${pos.y.toFixed(1)},${pos.z.toFixed(1)}) health=${bot.health}/${maxHealth} food=${bot.food}/${saturation} mode=idle`);
    },
  },
  {
    name: 'inventory',
    prompt: '!inventory',
    description: 'List all items in current inventory',
    execute(_params, ctx) {
      const { bot } = ctx;
      const counts: Record<string, number> = {};
      for (const slot of bot.inventory.slots) {
        if (slot) {
          counts[slot.name] = (counts[slot.name] || 0) + slot.count;
        }
      }
      return Promise.resolve(`Inventory: ${JSON.stringify(counts)}`);
    },
  },
  {
    name: 'entities',
    prompt: '!entities [radius]',
    description: 'List nearby entities',
    execute(_params, ctx) {
      const { bot } = ctx;
      const pos = bot.entity.position;
      const nearby: string[] = [];
      for (const [id, entity] of Object.entries(bot.entities || {})) {
        const e = entity as any;
        const dist = pos.distanceTo(e.position);
        if (dist <= 32) {
          nearby.push(`${e.name}@${Math.floor(dist)}m`);
        }
      }
      return Promise.resolve(`Entities: ${nearby.join(', ') || 'none'}`);
    },
  },
  {
    name: 'nearby',
    prompt: '!nearby [radius]',
    description: 'List nearby block types',
    execute(_params, ctx) {
      const { bot } = ctx;
      const pos = bot.entity.position;
      const blocks = new Set<string>();
      for (let dx = -4; dx <= 4; dx++) {
        for (let dy = -2; dy <= 3; dy++) {
          for (let dz = -4; dz <= 4; dz++) {
            const block = bot.blockAt(pos.offset(dx, dy, dz));
            if (block && block.name !== 'air') {
              blocks.add(block.name);
            }
          }
        }
      }
      return Promise.resolve(`Nearby blocks: ${Array.from(blocks).join(', ')}`);
    },
  },
];
