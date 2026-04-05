const logger = require('./logger');

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
      });
      
      // Listen for block break
      bot.on('blockBreak', (block) => {
        logger.trace(`Block broken: ${block.name} at (${block.position.x}, ${block.position.y}, ${block.position.z})`);
      });
      
      // Listen for block place
      bot.on('blockPlace', (block) => {
        logger.trace(`Block placed: ${block.name} at (${block.position.x}, ${block.position.y}, ${block.position.z})`);
      });
      
      // Listen for entity hurt (when bot takes damage)
      bot.on('hurt', () => {
        logger.trace(`Bot took damage! Health: ${bot.health}`);
      });
      
      // Listen for entity heal
      bot.on('heal', () => {
        logger.trace(`Bot healed! Health: ${bot.health}`);
      });
      
      // Listen for sleeping
      bot.on('sleep', () => {
        logger.trace(`Bot went to sleep`);
      });
      
      // Listen for waking up
      bot.on('wake', () => {
        logger.trace(`Bot woke up`);
      });
      
      // Listen for respawn (after death)
      bot.on('respawn', () => {
        logger.trace(`Bot respawned`);
      });
      
      // Monitor health changes using 'health' event
      bot.on('health', async () => {
        if (bot.health !== lastHealth) {
          const change = bot.health - lastHealth;
          logger.trace(`[State] Health changed: ${lastHealth.toFixed(1)} → ${bot.health.toFixed(1)} (${change > 0 ? '+' : ''}${change.toFixed(1)})`);
          
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
          logger.trace(`[State] Food changed: ${lastFood} → ${food} (${change > 0 ? '+' : ''}${change})`);
          
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
            lastPosition = { x: newPos.x, y: newPos.y, z: newPos.z };
          }
        }
      });
    }
  };
};