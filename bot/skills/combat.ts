// bot/skills/combat.ts

import type { Skill, SkillContext } from './index';
import type { Entity } from 'mineflayer';
import { GoalBlock } from 'mineflayer-pathfinder/lib/goals';

export function createAttackEntitySkill(): Skill {
  return {
    name: 'attackEntity',
    description: 'Attack a specific entity by name or type',
    cooldown: 5000,
    async execute({ bot }) {
      const targetName = (bot as any)._attackTarget as string;
      if (!targetName) return;

      const entities = Object.values((bot as any).entities || {}) as Entity[];
      const entity = entities.find((e: Entity) => {
        const entityAny = e as any;
        return e.type === 'mob' && (entityAny.username?.includes(targetName) || entityAny.name?.includes(targetName));
      });
      if (!entity) return;

      // Equip best weapon
      const slots = (bot as any).inventory.slots;
      let bestWeapon = -1;
      let bestAttack = 0;
      for (let i = 0; i < slots.length; i++) {
        const item = slots[i];
        if (item && ['stone_sword', 'iron_sword', 'diamond_sword', 'wooden_sword', 'golden_sword'].includes(item.name)) {
          const attackMap: Record<string, number> = {
            wooden_sword: 4, stone_sword: 5, iron_sword: 6, diamond_sword: 7, golden_sword: 4
          };
          const atk = attackMap[item.name] || 0;
          if (atk > bestAttack) {
            bestAttack = atk;
            bestWeapon = i;
          }
        }
      }
      if (bestWeapon >= 0) {
        await (bot as any).equip(slots[bestWeapon], 'hand');
      }

      await (bot as any).pvp.attack(entity);
    },
  };
}

export function createDefendSelfSkill(): Skill {
  return {
    name: 'defendSelf',
    description: 'Defend against all nearby hostile entities',
    cooldown: 3000,
    async execute({ bot }) {
      const botAny = bot as any;
      const hostiles = botEntitiesWhere(botAny, (e: any) =>
        e.type === 'mob' && HOSTILE_MOBS.includes(e.name)
      );
      if (hostiles.length === 0) return;

      for (const entity of hostiles) {
        if (botAny.health <= 5) break;
        await botAny.pvp.attack(entity);
        // Move away slightly between attacks
        const pos = botAny.entity.position;
        const retreat = new GoalBlock(
          pos.x + (Math.random() > 0.5 ? 3 : -3),
          pos.y,
          pos.z + (Math.random() > 0.5 ? 3 : -3),
        );
        botAny.pathfinder.setGoal(retreat, false);
        await new Promise(r => setTimeout(r, 1000));
      }
    },
  };
}

// Helper to find entities matching criteria
const HOSTILE_MOBS = [
  'zombie', 'skeleton', 'spider', 'creeper', 'enderman',
  'witch', 'slime', 'phantom', 'drowned', 'pillager',
  'ravager', 'vex', 'husk', 'stray',
];

function botEntitiesWhere(bot: any, predicate: (e: any) => boolean): any[] {
  return bot.entities
    ? Object.values(bot.entities).filter((e: any) => predicate(e))
    : [];
}
