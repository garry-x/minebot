import type { Bot, Block, Entity, Item } from 'mineflayer';
import logger from './logger';
import { BotState } from '../config/models/BotState';

interface BotWrapper {
  botId: string;
}

interface Position {
  x: number;
  y: number;
  z: number;
}

type DamageCause = 'entity_attack' | 'lava' | 'fire' | 'void' | 'drowning' | 'suffocation' | 'fall' | 'unknown';

interface DamageDetails {
  attacker?: string;
  attackerType?: string;
  block?: string;
  y?: number;
  fluid?: string;
  velocity?: number;
}

interface EventListeners {
  setupListeners: () => void;
}

export default function(bot: Bot): EventListeners {
  let lastHealth: number = bot.health;
  let lastFood: number = bot.food;
  let lastPosition: Position = {
    x: bot.entity?.position?.x ?? 0,
    y: bot.entity?.position?.y ?? 0,
    z: bot.entity?.position?.z ?? 0
  };

  const getBotId = (): string => {
    const wrapper = (bot as Bot & { __wrapper?: BotWrapper }).__wrapper;
    return wrapper?.botId || 'unknown';
  };

  return {
    setupListeners: function(): void {
      bot.on('experience', (orb: unknown) => {
        if (!orb) return;
        const xp = (orb && typeof orb === 'object' && 'experience' in orb)
          ? (orb as { experience: number }).experience
          : (typeof orb === 'string' ? orb : 'N/A');
        logger.trace(`Collected experience orb: ${xp} XP`);
      });

      bot.on('itemPickup', (item: Item) => {
        logger.trace(`Picked up item: ${item.name} x${item.count}`);
        try {
          BotState.addEvent(
            getBotId(),
            'item_pickup',
            `Picked up ${item.name} x${item.count}`,
            {
              item: item.name,
              count: item.count,
              metadata: item.metadata || null
            }
          ).catch(err => logger.error(`[Events] Failed to save item pickup event: ${err.message}`));
        } catch (err) {
          logger.error(`[Events] Error processing item pickup: ${(err as Error).message}`);
        }
      });

      bot.on('blockBreak', (block: Block) => {
        logger.trace(`Block broken: ${block.name} at (${block.position.x}, ${block.position.y}, ${block.position.z})`);
        try {
          BotState.addEvent(
            getBotId(),
            'block_break',
            `Broke ${block.name} at (${block.position.x.toFixed(1)}, ${block.position.y.toFixed(1)}, ${block.position.z.toFixed(1)})`,
            {
              block: block.name,
              position: {
                x: block.position.x,
                y: block.position.y,
                z: block.position.z
              },
              hardness: block.hardness || null
            }
          ).catch(err => logger.error(`[Events] Failed to save block break event: ${err.message}`));
        } catch (err) {
          logger.error(`[Events] Error processing block break: ${(err as Error).message}`);
        }
      });

      bot.on('blockPlace', (block: Block) => {
        logger.trace(`Block placed: ${block.name} at (${block.position.x}, ${block.position.y}, ${block.position.z})`);
        try {
          BotState.addEvent(
            getBotId(),
            'block_place',
            `Placed ${block.name} at (${block.position.x.toFixed(1)}, ${block.position.y.toFixed(1)}, ${block.position.z.toFixed(1)})`,
            {
              block: block.name,
              position: {
                x: block.position.x,
                y: block.position.y,
                z: block.position.z
              },
              facing: (block as Block & { face?: number }).face || null
            }
          ).catch(err => logger.error(`[Events] Failed to save block place event: ${err.message}`));
        } catch (err) {
          logger.error(`[Events] Error processing block place: ${(err as Error).message}`);
        }
      });

      bot.on('hurt', (entity: Entity) => {
        logger.trace(`Bot took damage! Health: ${bot.health}`);
        try {
          let damageCause: DamageCause = 'unknown';
          let damageDetails: DamageDetails = {};

          if (entity && entity.name && entity.type) {
            damageCause = 'entity_attack';
            damageDetails = {
              attacker: entity.name,
              attackerType: entity.type
            };
          } else {
            const pos = bot.entity?.position;
            if (pos) {
              try {
                const blockBelow = bot.blockAt(pos.offset(0, -1, 0));
                if (blockBelow) {
                  const blockName = blockBelow.name;
                  if (blockName.includes('lava') || blockName.includes('magma')) {
                    damageCause = 'lava';
                    damageDetails = { block: blockName };
                  } else if (blockName.includes('fire')) {
                    damageCause = 'fire';
                    damageDetails = { block: blockName };
                  } else if (blockName === 'air' && pos.y < 0) {
                    damageCause = 'void';
                    damageDetails = { y: pos.y };
                  }
                }

                const blockAt = bot.blockAt(pos);
                if (blockAt && blockAt.name.includes('water')) {
                  damageCause = 'drowning';
                  damageDetails = { fluid: 'water' };
                }

                if (blockAt && blockAt.name.includes('bed')) {
                  damageCause = 'suffocation';
                  damageDetails = { block: blockAt.name };
                }
              } catch (e) {
                logger.trace(`[Events] Error detecting damage cause: ${(e as Error).message}`);
              }
            }

            if (damageCause === 'unknown' && bot.velocity) {
              const vy = bot.velocity.y;
              if (vy < -3) {
                damageCause = 'fall';
                damageDetails = { velocity: vy };
              }
            }
          }

          const causeMessages: Record<DamageCause, (details: DamageDetails) => string> = {
            'entity_attack': (details) => `${details.attacker} 攻击`,
            'lava': () => '掉入岩浆',
            'fire': () => '火焰伤害',
            'void': () => '虚空掉落',
            'drowning': () => '水中窒息',
            'suffocation': () => '方块窒息',
            'fall': () => '摔落伤害',
            'unknown': () => '未知原因'
          };

          const message = causeMessages[damageCause](damageDetails);

          const eventData = {
            health: bot.health,
            cause: damageCause,
            ...damageDetails
          };

          BotState.addEvent(
            getBotId(),
            'damage_taken',
            `${message} (${bot.health.toFixed(1)}/20❤️)`,
            eventData
          ).catch(err => logger.error(`[Events] Failed to save damage event: ${err.message}`));
        } catch (err) {
          logger.error(`[Events] Error processing damage: ${(err as Error).message}`);
        }
      });

      bot.on('heal', () => {
        logger.trace(`Bot healed! Health: ${bot.health}`);
        try {
          BotState.addEvent(
            getBotId(),
            'heal',
            `Healed to ${bot.health.toFixed(1)} health`,
            {
              health: bot.health
            }
          ).catch(err => logger.error(`[Events] Failed to save heal event: ${err.message}`));
        } catch (err) {
          logger.error(`[Events] Error processing heal: ${(err as Error).message}`);
        }
      });

      bot.on('consume', (item: Item) => {
        logger.trace(`Bot consumed: ${item.name}`);
        try {
          BotState.addEvent(
            getBotId(),
            'eating',
            `Ate ${item.name}`,
            {
              item: item.name,
              food_value: (item as Item & { food?: number }).food || null,
              saturation: (item as Item & { saturation?: number }).saturation || null
            }
          ).catch(err => logger.error(`[Events] Failed to save eating event: ${err.message}`));
        } catch (err) {
          logger.error(`[Events] Error processing eating: ${(err as Error).message}`);
        }
      });

      bot.on('sleep', () => {
        logger.trace(`Bot went to sleep`);
        try {
          BotState.addEvent(
            getBotId(),
            'sleep',
            'Went to sleep',
            { timestamp: new Date().toISOString() }
          ).catch(err => logger.error(`[Events] Failed to save sleep event: ${err.message}`));
        } catch (err) {
          logger.error(`[Events] Error processing sleep: ${(err as Error).message}`);
        }
      });

      bot.on('wake', () => {
        logger.trace(`Bot woke up`);
        try {
          BotState.addEvent(
            getBotId(),
            'wake',
            'Woke up',
            { timestamp: new Date().toISOString() }
          ).catch(err => logger.error(`[Events] Failed to save wake event: ${err.message}`));
        } catch (err) {
          logger.error(`[Events] Error processing wake: ${(err as Error).message}`);
        }
      });

      bot.on('respawn', () => {
        logger.trace(`Bot respawned`);
        try {
          BotState.addEvent(
            getBotId(),
            'respawn',
            'Respawned after death',
            { timestamp: new Date().toISOString() }
          ).catch(err => logger.error(`[Events] Failed to save respawn event: ${err.message}`));
        } catch (err) {
          logger.error(`[Events] Error processing respawn: ${(err as Error).message}`);
        }
      });

      bot.on('health', async () => {
        if (bot.health !== lastHealth) {
          const change = bot.health - lastHealth;
          const isDamage = change < 0;
          logger.trace(`[State] Health changed: ${lastHealth.toFixed(1)} → ${bot.health.toFixed(1)} (${change > 0 ? '+' : ''}${change.toFixed(1)})`);

          try {
            const changeType = isDamage ? '受伤' : '治疗';
            const changeValue = Math.abs(change).toFixed(1);
            BotState.addEvent(
              getBotId(),
              'health_change',
              `${changeType} ${changeValue} (${bot.health.toFixed(1)}/${bot.health === 20 ? '❤️' : '💔'})`,
              {
                old_health: lastHealth,
                new_health: bot.health,
                change: change,
                cause: isDamage ? 'damage' : 'heal',
                is_critical: bot.health < 5
              }
            ).catch(err => logger.error(`[Events] Failed to save health change event: ${err.message}`));
          } catch (err) {
            logger.error(`[Events] Error processing health change: ${(err as Error).message}`);
          }

          lastHealth = bot.health;
        }
      });

      bot.on('foodChange', async (food: number) => {
        logger.trace(`[Food] foodChange event: ${food}, lastFood: ${lastFood}`);
        if (food !== lastFood) {
          const change = food - lastFood;
          const isEating = change > 0;
          logger.trace(`[State] Food changed: ${lastFood} → ${food} (${change > 0 ? '+' : ''}${change})`);

          try {
            const changeType = isEating ? '进食' : '饥饿';
            const changeValue = Math.abs(change);
            BotState.addEvent(
              getBotId(),
              'food_change',
              `${changeType} ${changeValue} (${food}/20)`,
              {
                old_food: lastFood,
                new_food: food,
                change: change,
                cause: isEating ? 'eating' : 'consumption',
                is_low: food < 5
              }
            ).catch(err => logger.error(`[Events] Failed to save food change event: ${err.message}`));
          } catch (err) {
            logger.error(`[Events] Error processing food change: ${(err as Error).message}`);
          }

          lastFood = food;
        }
      });

      bot.on('move', () => {
        const newPos = bot.entity?.position;
        if (newPos) {
          const dist = Math.sqrt(
            Math.pow(newPos.x - lastPosition.x, 2) +
            Math.pow(newPos.y - lastPosition.y, 2) +
            Math.pow(newPos.z - lastPosition.z, 2)
          );

          if (dist > 1) {
            logger.trace(`[State] Position changed: (${lastPosition.x.toFixed(1)}, ${lastPosition.y.toFixed(1)}, ${lastPosition.z.toFixed(1)}) → (${newPos.x.toFixed(1)}, ${newPos.y.toFixed(1)}, ${newPos.z.toFixed(1)}) [dist: ${dist.toFixed(1)}]`);

            try {
              BotState.addEvent(
                getBotId(),
                'movement',
                `Moved ${dist.toFixed(1)} blocks`,
                {
                  from: lastPosition,
                  to: { x: newPos.x, y: newPos.y, z: newPos.z },
                  distance: dist
                }
              ).catch(err => logger.error(`[Events] Failed to save movement event: ${err.message}`));
            } catch (err) {
              logger.error(`[Events] Error processing movement: ${(err as Error).message}`);
            }

            lastPosition = { x: newPos.x, y: newPos.y, z: newPos.z };
          }
        }
      });
    }
  };
};