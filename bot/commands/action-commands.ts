// bot/commands/action-commands.ts

import type { Command, CommandContext } from './index';

export const actionCommands: Command[] = [
  {
    name: 'build',
    prompt: '!build <material> <width> <length> <height>',
    description: 'Build a hollow rectangular shell with given dimensions',
    execute(params, ctx) {
      const { bot, modeController } = ctx;
      const material = params.material || 'cobblestone';
      const width = parseInt(params.width || '5', 10);
      const length = parseInt(params.length || '5', 10);
      const height = parseInt(params.height || '4', 10);

      (bot as any)._buildParams = { material, width, length, height };
      modeController.setActiveMode('building');
      modeController.emitEvent({ type: 'build_start', data: { material, width, length, height } });
      return Promise.resolve(`Starting build: ${material} ${width}x${length}x${height}`);
    },
  },
  {
    name: 'craft',
    prompt: '!craft <item_name> [quantity]',
    description: 'Craft an item using a nearby crafting table',
    execute(params, ctx) {
      const { bot } = ctx;
      (bot as any)._craftItemName = params.item_name || params['item-name'] || 'stick';
      const itemName = (bot as any)._craftItemName;
      return Promise.resolve(`Crafting: ${itemName}`);
    },
  },
  {
    name: 'attack',
    prompt: '!attack <entity_name>',
    description: 'Attack a specific entity by name',
    execute(params, ctx) {
      const { bot } = ctx;
      (bot as any)._attackTarget = params.entity_name || params.entity;
      return Promise.resolve(`Attacking: ${params.entity_name || params.entity}`);
    },
  },
  {
    name: 'goTo',
    prompt: '!goTo <x> <y> <z>',
    description: 'Move to given coordinates',
    execute(params, ctx) {
      const { bot } = ctx;
      const x = parseFloat(params.x || '0');
      const y = parseFloat(params.y || '0');
      const z = parseFloat(params.z || '0');
      (bot as any)._moveToGoal = new (require('mineflayer-pathfinder').GoalBlock)(Math.floor(x), Math.floor(y), Math.floor(z));
      return Promise.resolve(`Moving to: ${x}, ${y}, ${z}`);
    },
  },
  {
    name: 'gather',
    prompt: '!gather <block_type> [radius]',
    description: 'Gather specified blocks from nearby area',
    execute(params, ctx) {
      const { bot } = ctx;
      (bot as any)._gatherTargets = [params.block_type || params.type || 'cobblestone'];
      (bot as any)._gatherRadius = parseInt(params.radius || '30', 10);
      return Promise.resolve(`Gathering: ${params.block_type || params.type}`);
    },
  },
];
