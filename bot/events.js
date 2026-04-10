const logger = require('./logger');
const BotState = require('../config/models/BotState');

module.exports = function(bot, evolutionManager = null) {
  let lastHealth = bot.health;
  let lastFood = bot.food;
  let lastPosition = { x: bot.entity?.position?.x, y: bot.entity?.position?.y, z: bot.entity?.position?.z };
  
  const getBotId = () => {
    const wrapper = bot.__wrapper;
    return wrapper?.botId || 'unknown';
  };
  
  const recordStateChange = async (stateType, oldValue, newValue, context = {}) => {
    if (!evolutionManager) {
      return;
    }
    
    try {
      await evolutionManager.recordExperience({
        bot_id: getBotId(),
        type: 'state',
        context: {
          ...context,
          state_type: stateType,
          old_value: oldValue,
          new_value: newValue,
          timestamp: new Date().toISOString()
        },
        action: 'state_change',
        outcome: {
          success: true,
          state_changed: stateType,
          value_changed: newValue !== oldValue
        }
      });
    } catch (err) {
      logger.error(`[Events] Failed to record state change: ${err.message}`);
    }
  };
  
  return {
    // Event listeners for game events
    setupListeners: function() {
      // Listen for experience orb collection
      bot.on('experience', (orb) => {
        if (!orb) return;
        const xp = (orb && typeof orb === 'object' && orb.experience !== undefined) ? orb.experience : (typeof orb === 'string' ? orb : 'N/A');
        logger.trace(`Collected experience orb: ${xp} XP`);
      });
      
      // Listen for item pickup
      bot.on('itemPickup', (item) => {
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
          logger.error(`[Events] Error processing item pickup: ${err.message}`);
        }
      });
      
      // Listen for block break
      bot.on('blockBreak', (block) => {
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
          logger.error(`[Events] Error processing block break: ${err.message}`);
        }
      });
      
      // Listen for block place
      bot.on('blockPlace', (block) => {
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
              facing: block.face || null
            }
          ).catch(err => logger.error(`[Events] Failed to save block place event: ${err.message}`));
        } catch (err) {
          logger.error(`[Events] Error processing block place: ${err.message}`);
        }
      });
      
      // Listen for entity hurt (when bot takes damage)
      bot.on('hurt', (entity) => {
        logger.trace(`Bot took damage! Health: ${bot.health}`);
        try {
          const attacker = entity ? entity.name || entity.type : 'unknown';
          BotState.addEvent(
            getBotId(),
            'damage_taken',
            `Took damage from ${attacker}, health: ${bot.health.toFixed(1)}`,
            {
              health: bot.health,
              attacker: attacker,
              attacker_type: entity ? (entity.type || 'unknown') : 'unknown'
            }
          ).catch(err => logger.error(`[Events] Failed to save damage event: ${err.message}`));
        } catch (err) {
          logger.error(`[Events] Error processing damage: ${err.message}`);
        }
      });
      
      // Listen for entity heal
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
          logger.error(`[Events] Error processing heal: ${err.message}`);
        }
      });

      // Listen for eating (consuming food)
      bot.on('consume', (item) => {
        logger.trace(`Bot consumed: ${item.name}`);
        try {
          BotState.addEvent(
            getBotId(),
            'eating',
            `Ate ${item.name}`,
            {
              item: item.name,
              food_value: item.food || null,
              saturation: item.saturation || null
            }
          ).catch(err => logger.error(`[Events] Failed to save eating event: ${err.message}`));
        } catch (err) {
          logger.error(`[Events] Error processing eating: ${err.message}`);
        }
      });
      
      // Listen for sleeping
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
          logger.error(`[Events] Error processing sleep: ${err.message}`);
        }
      });
      
      // Listen for waking up
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
          logger.error(`[Events] Error processing wake: ${err.message}`);
        }
      });
      
      // Listen for respawn (after death)
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
          logger.error(`[Events] Error processing respawn: ${err.message}`);
        }
      });
      
      // Monitor health changes using 'health' event
      bot.on('health', async () => {
        if (bot.health !== lastHealth) {
          const change = bot.health - lastHealth;
          const isDamage = change < 0;
          logger.trace(`[State] Health changed: ${lastHealth.toFixed(1)} → ${bot.health.toFixed(1)} (${change > 0 ? '+' : ''}${change.toFixed(1)})`);
          
          // Save health change event to database
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
            logger.error(`[Events] Error processing health change: ${err.message}`);
          }
          
          await recordStateChange('health', lastHealth, bot.health, {
            cause: change < 0 ? 'damage' : 'heal',
            is_critical: bot.health < 5
          });
          
          lastHealth = bot.health;
        }
      });
      
      // Monitor food changes using foodChange event
      bot.on('foodChange', async (food) => {
        logger.trace(`[Food] foodChange event: ${food}, lastFood: ${lastFood}`);
        if (food !== lastFood) {
          const change = food - lastFood;
          const isEating = change > 0;
          logger.trace(`[State] Food changed: ${lastFood} → ${food} (${change > 0 ? '+' : ''}${change})`);
          
          // Save food change event to database
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
            logger.error(`[Events] Error processing food change: ${err.message}`);
          }
          
          await recordStateChange('food', lastFood, food, {
            cause: change < 0 ? 'consumption' : 'eating',
            is_low: food < 5
          });
          
          lastFood = food;
        }
      });
      

      
      // Monitor position changes
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
            
            // Save movement event to database
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
              logger.error(`[Events] Error processing movement: ${err.message}`);
            }
            
            lastPosition = { x: newPos.x, y: newPos.y, z: newPos.z };
          }
        }
      });
    }
  };
};