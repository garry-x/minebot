const Vec3 = require('vec3');

const AutonomousEngine = require('./autonomous-engine');
const logger = require('./logger');

module.exports = function(bot, pathfinder, evolutionManager = null) {
  // Helper function to wait for a condition with retry logic
  const waitForCondition = async (conditionFn, timeout = 10000, retryInterval = 500) => {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (conditionFn()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }
    throw new Error(`Timeout waiting for condition after ${timeout}ms`);
  };

  // Helper function to retry an operation with exponential backoff
  const retryOperation = async (operationFn, maxRetries = 3, baseDelay = 1000) => {
    let lastError;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operationFn();
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
           logger.debug(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError;
  };

  // Helper function to find blocks nearby
   const findBlocks = (blockNames, maxDistance = 32) => {
     const positions = [];
     for (const blockName of blockNames) {
       // Using the correct method for finding blocks in mineflayer 4.x
       const block = bot.findBlock({
         point: bot.entity.position,
         matching: blockName,
         maxDistance: maxDistance
       });
       if (block) {
         positions.push(block.position);
       }
     }
     return positions;
   };
   
     // Helper to get the wrapper object (the this context)
     const getWrapper = () => {
       return bot.__wrapper || null;
     };

    const originalAutomaticBehavior = async function(options = {}) {
      const { 
        mode = 'survival',
        targetBlockType = 'oak_log',
        structureType = 'house',
        structureSize = { width: 5, length: 5, height: 3 },
        gatherRadius = 30
      } = options;
      
      const wrapper = getWrapper();
      if (wrapper) {
        wrapper.currentMode = mode;
        logger.debug(`[Behaviors] Setting currentMode to: ${mode}`);
      }
      
      logger.debug(`Starting automatic behavior in ${mode} mode`);
     
      try {
        switch (mode) {
          case 'building':
            logger.debug('Auto-gathering materials for building...');
            await this.gatherResources({
              targetBlocks: ['oak_log', 'cobblestone'],
              radius: gatherRadius
            });
            
            logger.debug('Auto-building structure...');
            await this.buildStructure({
              width: structureSize.width,
              length: structureSize.length,
              height: structureSize.height,
              blockType: targetBlockType
            });
            break;
            
          case 'gathering':
            logger.debug(`Auto-gathering ${targetBlockType}...`);
            await this.gatherResources({
              targetBlocks: [targetBlockType],
              radius: gatherRadius
            });
            break;
            
          case 'survival':
          default:
            logger.debug('Auto-gathering survival resources...');
            const gathered = await this.gatherResources({
              targetBlocks: ['oak_log', 'cobblestone', 'wheat', 'carrot'],
              radius: gatherRadius
            });
            
            if (!gathered) {
              logger.debug('No natural resources found nearby - bot can connect and move!');
            }
            
            logger.debug('Testing basic movement...');
            const pos = bot.entity.position;
            try {
              await pathfinder.moveTo(new Vec3(pos.x + 5, pos.y, pos.z + 5), { timeout: 15000 });
              logger.debug(`Moved to new position: ${bot.entity.position}`);
            } catch (moveError) {
              logger.debug(`[Behaviors] Movement test failed: ${moveError.message}. Continuing...`);
            }
            
            logger.debug('Automatic behavior completed');
            return true;
        }
        
        logger.debug('Automatic behavior completed');
        return true;
      } catch (error) {
        logger.error('Error in automatic behavior:', error);
        throw new Error(`Automatic behavior failed: ${error.message}`);
      }
    };

  return {
    // Building behaviors
    buildStructure: async function(options) {
      const { width, length, height, blockType, offsetX = 0, offsetY = 0, offsetZ = 0 } = options;
      
      logger.debug(`Building structure: ${width}x${length}x${height} with ${blockType}`);
      logger.debug(`At offset: ${offsetX}, ${offsetY}, ${offsetZ}`);
      
      try {
        // Build a simple prism structure
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            for (let z = 0; z < length; z++) {
              // Skip inner blocks for hollow structure (optional)
              const isEdge = (x === 0 || x === width - 1 || z === 0 || z === length - 1 || y === 0 || y === height - 1);
              if (!isEdge && width > 2 && length > 2 && height > 2) {
                continue; // Skip filling interior
              }
              
              const blockPos = {
                x: Math.floor(bot.entity.position.x) + offsetX + x,
                y: Math.floor(bot.entity.position.y) + offsetY + y,
                z: Math.floor(bot.entity.position.z) + offsetZ + z
              };
              
              // Wait until we have the block in inventory with retry logic
              await retryOperation(async () => {
                await waitForCondition(() => {
                  const item = bot.inventory.items().find(i => i.name === blockType && i.count > 0);
                  return item !== undefined;
                }, 15000); // Increased timeout for gathering materials
              });
              
              // Equip the block
              const item = bot.inventory.items().find(i => i.name === blockType && i.count > 0);
              await bot.equip(item, 'hand');
              
              // Place the block with retry logic
              await retryOperation(async () => {
                await bot.placeBlock(bot.blockAt(blockPos), new Vec3(0, 1, 0));
              });
              
              // Small delay to prevent overwhelming the server
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          }
        }
        
        logger.debug('Structure building completed');
        return true;
      } catch (error) {
        logger.error('Error building structure:', error);
        throw new Error(`Building failed: ${error.message}`);
      }
    },
    
    // Resource gathering behaviors
    gatherResources: async function(options) {
      const { targetBlocks, radius = 20 } = options;
      
      logger.debug(`Gathering resources: ${JSON.stringify(targetBlocks)} within radius ${radius}`);
      
      try {
        // Find target blocks nearby
        const blockPositions = findBlocks(targetBlocks, radius);
        
        if (blockPositions.length === 0) {
          logger.debug('No target blocks found nearby');
          if (evolutionManager) {
            await evolutionManager.recordExperience({
              bot_id: bot.__wrapper?.botId || 'unknown',
              type: 'resource',
              context: { targetBlocks, radius, position: bot.entity.position },
              action: 'search',
              outcome: { success: false, reason: 'no_blocks_found', blocksFound: 0 }
            });
          }
          return false;
        }
        
        logger.debug(`Found ${blockPositions.length} blocks to gather`);
        
        // Use evolution to determine optimal gathering strategy
        let optimalStrategy = { action: 'linear', order: blockPositions };
        if (evolutionManager) {
          try {
            const weights = evolutionManager.getWeights('resource');
            logger.debug(`[Evolution] Resource weights: ${JSON.stringify(weights)}`);
            
            const context = {
              targetBlocks,
              position: bot.entity.position,
              blockCount: blockPositions.length
            };
            optimalStrategy = evolutionManager.getOptimalAction('resource', context);
          } catch (e) {
            logger.debug(`[Evolution] Could not get optimal action: ${e.message}`);
          }
        }
        
        // Go to each block and break it
        let successCount = 0;
        let failCount = 0;
        const maxFailures = 3; // Stop after 3 consecutive failures
        
        const positionsToVisit = optimalStrategy.order || blockPositions;
        
        for (const position of positionsToVisit) {
          // Stop if we've had too many consecutive failures
          if (failCount >= maxFailures) {
            logger.debug(`[Behaviors] Stopping resource gathering after ${failCount} consecutive failures`);
            break;
          }
          
          logger.debug(`Moving to block at ${position.x}, ${position.y}, ${position.z}`);
          
          // Move to the block with individual error handling
          let reachedBlock = false;
          try {
            await retryOperation(async () => {
              await pathfinder.moveTo(position, { timeout: 20000 });
              
              // Wait until we reach the block
              await waitForCondition(() => 
                bot.entity.position.distanceTo(position) < 1.5, 10000);
            });
            reachedBlock = true;
          } catch (moveError) {
            logger.debug(`[Behaviors] Cannot reach block at ${position.x}, ${position.y}, ${position.z}: ${moveError.message}`);
            failCount++;
            if (evolutionManager) {
              await evolutionManager.recordExperience({
                bot_id: bot.__wrapper?.botId || 'unknown',
                type: 'path',
                context: { targetPosition: position, currentPosition: bot.entity.position },
                action: 'move_to',
                outcome: { success: false, reason: moveError.message }
              });
            }
            continue; // Skip to next block
          }
          
          if (!reachedBlock) {
            failCount++;
            continue;
          }
          
          // Find the block at our position
          const block = bot.blockAt(position);
          if (!block || !block.name) {
            logger.debug('Block not found at position');
            failCount++;
            continue;
          }
          
          // Dig the block with error handling
          try {
            await retryOperation(async () => {
              await bot.dig(block);
              
              // Wait for the block to break
              await waitForCondition(() => 
                !bot.blockAt(position) || bot.blockAt(position).name === 'air', 10000);
            });
            
            logger.debug(`Collected ${block.name}`);
            successCount++;
            failCount = 0; // Reset failure counter on success
            
            if (evolutionManager) {
              await evolutionManager.recordExperience({
                bot_id: bot.__wrapper?.botId || 'unknown',
                type: 'resource',
                context: { targetBlock: block.name, position: position },
                action: 'gather',
                outcome: { success: true, block: block.name, count: 1 }
              });
            }
          } catch (digError) {
            logger.debug(`[Behaviors] Failed to dig block: ${digError.message}`);
            failCount++;
            if (evolutionManager) {
              await evolutionManager.recordExperience({
                bot_id: bot.__wrapper?.botId || 'unknown',
                type: 'resource',
                context: { targetBlock: block.name, position: position },
                action: 'gather',
                outcome: { success: false, reason: digError.message }
              });
            }
          }
          
          // Small delay between blocks
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        const successRate = successCount / (successCount + failCount) || 0;
        logger.debug(`[Behaviors] Resource gathering completed. Success: ${successCount}, Failures: ${failCount}, Success Rate: ${successRate.toFixed(2)}`);
        
        if (evolutionManager) {
          await evolutionManager.recordExperience({
            bot_id: bot.__wrapper?.botId || 'unknown',
            type: 'resource',
            context: { targetBlocks, totalBlocks: blockPositions.length, positions: positionsToVisit },
            action: 'complete',
            outcome: { success: successCount > 0, totalCollected: successCount, successRate }
          });
        }
        
        logger.debug('Resource gathering completed');
        return true;
      } catch (error) {
        logger.error('Error gathering resources:', error);
        throw new Error(`Gathering failed: ${error.message}`);
      }
    },
    
    // Flying behaviors (works in creative mode or with elytra)
    flyTo: async function(options) {
      const { x, y, z, speed = 1 } = options;
      
      logger.debug(`Flying to: ${x}, ${y}, ${z} at speed ${speed}`);
      
      try {
        // Check if we can fly (creative mode or elytra)
        const canFly = bot.creative || 
          (bot.inventory.armor && bot.inventory.armor.chest && 
           bot.inventory.armor.chest.name === 'elytra');
           
        if (!canFly) {
          logger.debug('Cannot fly: not in creative mode and no elytra');
          // Fall back to regular movement
          await pathfinder.moveTo({ x, y, z });
          return true;
        }
        
        // For flying, we'll use a combination of lookAt and velocity control
        // In a more sophisticated implementation, we'd use packets or plugins
        // For now, we'll use pathfinder with adjusted settings
        
        // Temporarily increase speed for flying effect
        const originalSpeed = bot.settings ? bot.settings.physics.speed : undefined;
        if (bot.settings) {
          bot.settings.physics.speed *= speed;
        }
        
        // Move to target with retry logic
        await retryOperation(async () => {
          await pathfinder.moveTo({ x, y, z });
        });
        
        // Restore original speed
        if (bot.settings && originalSpeed !== undefined) {
          bot.settings.physics.speed = originalSpeed;
        }
        
        logger.debug('Flying completed');
        return true;
      } catch (error) {
        logger.error('Error flying:', error);
        throw new Error(`Flying failed: ${error.message}`);
      }
    },
    
    // Additional utility behaviors
    lookAt: function(position) {
      // Make the bot look at a specific position
      if (typeof position === 'object' && position.x !== undefined) {
        bot.lookAt(position);
      } else {
        logger.warn('Invalid position for lookAt:', position);
      }
    },
    
    jump: function() {
      // Make the bot jump
      bot.setControlState('jump', true);
      setTimeout(() => bot.setControlState('jump', false), 100);
    },
    
    sprint: function(state) {
      // Set sprinting state
      bot.setControlState('sprint', state !== false);
    },
    
    automaticBehavior: async function(options = {}) {
      const { 
        mode = 'autonomous',
        initialGoal = 'basic_survival',
        gatherRadius = 30
      } = options;
      
      const wrapper = getWrapper();
      if (wrapper) {
        wrapper.currentMode = mode;
        logger.debug(`[Behaviors] Setting currentMode to: ${mode}`);
      }
      
      logger.debug(`Starting ${mode} behavior with goal: ${initialGoal}`);
      
      try {
        if (mode === 'autonomous') {
          const engine = new AutonomousEngine(bot, pathfinder, this);
          
          let isRunning = true;
          wrapper.autonomousRunning = true;
          
          while (isRunning && wrapper.autonomousRunning) {
            try {
              const cycleResult = await engine.runCycle(wrapper.goalState || {});
              logger.debug(`[Autonomous] Cycle: ${cycleResult.state.currentAction}, Priority: ${cycleResult.state.priority}`);
              
              await new Promise(resolve => setTimeout(resolve, 5000));
            } catch (cycleError) {
              logger.error(`[Autonomous] Cycle error: ${cycleError.message}`);
              await new Promise(resolve => setTimeout(resolve, 10000));
            }
          }
          
          logger.debug('Autonomous behavior stopped');
          return true;
        } else {
          return await originalAutomaticBehavior.call(this, options);
        }
      } catch (error) {
        logger.error('Error in automatic behavior:', error);
        throw new Error(`Automatic behavior failed: ${error.message}`);
      }
    }
  };
};