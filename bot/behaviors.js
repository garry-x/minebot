const Vec3 = require('vec3');

const AutonomousEngine = require('./autonomous-engine');
const logger = require('./logger');

const _getBlockValue = (blockName) => {
  const values = {
    diamond_ore: 1.0,
    emerald_ore: 1.0,
    gold_ore: 0.8,
    iron_ore: 0.6,
    coal_ore: 0.4,
    lapis_ore: 0.5,
    redstone_ore: 0.4,
    copper_ore: 0.3,
    diamond_block: 1.0,
    iron_block: 0.7,
    gold_block: 0.8,
    emerald_block: 1.0,
    chest: 0.5,
    furnace: 0.4,
    crafting_table: 0.3,
    cobblestone: 0.1,
    stone: 0.1,
    dirt: 0.05,
    grass_block: 0.05,
    oak_log: 0.15,
    coal_block: 0.4
  };
  return values[blockName] || 0.2;
};

const _isBlockSafe = (blockName) => {
  const safeBlocks = [
    'dirt', 'grass_block', 'stone', 'cobblestone', 'oak_log', 'coal_ore', 
    'iron_ore', 'gold_ore', 'diamond_ore', 'emerald_ore', 'chest', 
    'furnace', 'crafting_table'
  ];
  const dangerousBlocks = ['lava', 'water', 'cactus', 'fire', 'bedrock'];
  
  if (dangerousBlocks.some(b => blockName.includes(b))) return false;
  return safeBlocks.some(b => blockName.includes(b)) || true;
};

module.exports = function(bot, pathfinder, evolutionManager = null) {
  // Helper function to wait for a condition with retry logic
  const waitForCondition = async (conditionFn, timeout = parseInt(process.env.WAIT_FOR_CONDITION_TIMEOUT || '10000'), retryInterval = parseInt(process.env.WAIT_RETRY_INTERVAL || '500')) => {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (conditionFn()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }
    throw new Error(`Timeout waiting for condition after ${timeout}ms`);
  };

  const collectNearbyItems = async (botInstance, maxDistance = 3) => {
    const startTime = Date.now();
    const collectTimeout = 5000;
    
    while (Date.now() - startTime < collectTimeout) {
      const items = Object.values(botInstance.entities || {}).filter(e => 
        e && e.name === 'Item' && 
        e.position && botInstance.entity.position.distanceTo(e.position) <= maxDistance
      );
      
      if (items.length === 0) break;
      
      for (const item of items) {
        try {
          await botInstance.lookAt(item.position);
          await botInstance.moveAt(item.position);
          await new Promise(r => setTimeout(r, 100));
        } catch (e) {}
      }
      
      await new Promise(r => setTimeout(r, 200));
    }
  };
  
  const retryOperation = async (operationFn, maxRetries = parseInt(process.env.MAX_OPERATION_RETRIES || '3'), baseDelay = parseInt(process.env.BASE_RETRY_DELAY || '1000')) => {
    let lastError;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operationFn();
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt);
           logger.debug(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError;
  };

     // Helper function to find blocks nearby - scans a volume for all matching blocks
     const findBlocks = (blockNames, maxDistance = parseInt(process.env.MAX_BLOCK_FIND_DISTANCE || '32')) => {
      const positions = [];
      const pos = bot.entity.position;
      const scanRadius = Math.min(maxDistance, 16); // Limit scan to prevent performance issues
      
      // Scan a cube around the bot
      const startX = Math.floor(pos.x - scanRadius);
      const endX = Math.floor(pos.x + scanRadius);
      const startY = Math.max(0, Math.floor(pos.y - scanRadius));
      const endY = Math.min(256, Math.floor(pos.y + scanRadius));
      const startZ = Math.floor(pos.z - scanRadius);
      const endZ = Math.floor(pos.z + scanRadius);
      
      for (let x = startX; x <= endX; x++) {
        for (let y = startY; y <= endY; y++) {
          for (let z = startZ; z <= endZ; z++) {
            try {
              const block = bot.blockAt(new Vec3(x, y, z));
              if (block && block.name && blockNames.includes(block.name)) {
                // Check if this position is not already in our list (avoid duplicates)
                const alreadyFound = positions.some(p => 
                  p.x === block.position.x && p.y === block.position.y && p.z === block.position.z
                );
                if (!alreadyFound) {
                  positions.push(block.position);
                }
              }
            } catch (e) {
              // Ignore blockAt errors for out-of-bounds blocks
            }
          }
        }
      }
      
      // Sort by distance to find closest first
      positions.sort((a, b) => {
        const distA = pos.distanceTo(a);
        const distB = pos.distanceTo(b);
        return distA - distB;
      });
      
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
            
            const pos = bot.entity.position;
            if (pos.y > 70) {
              logger.debug(`Bot is at height ${pos.y}, descending to ground...`);
              const groundY = 63;
              try {
                await pathfinder.moveTo(new Vec3(pos.x, groundY, pos.z), { 
                  timeout: 15000,
                  useJump: false
                });
              } catch (e) {}
            }
            
            let maxCycles = 10;
            let currentCycle = 0;
            
            while (currentCycle < maxCycles) {
              currentCycle++;
              
              if (!bot.isAlive) {
                logger.debug('Bot is dead, stopping');
                break;
              }
              
              if (bot.health < 10) {
                logger.debug('Low health, seeking shelter');
                break;
              }
              
              logger.debug(`Survival cycle ${currentCycle}/${maxCycles}, health: ${bot.health}`);
              
              const gathered = await this.gatherResources({
                targetBlocks: ['coal_ore', 'oak_log', 'dirt', 'cobblestone', 'iron_ore'],
                radius: gatherRadius
              });
              
              if (gathered) {
                logger.debug(`Successfully gathered resources in cycle ${currentCycle}`);
                break;
              }
              
              logger.debug(`No resources found, exploring...`);
              const pos = bot.entity.position;
              
              const exploreX = pos.x + (Math.random() - 0.5) * 20;
              const exploreZ = pos.z + (Math.random() - 0.5) * 20;
              
              try {
                await pathfinder.moveTo(new Vec3(exploreX, pos.y, exploreZ), { 
                  timeout: 20000,
                  useJump: true
                });
                logger.debug(`Explored to: ${bot.entity.position.x.toFixed(1)}, ${bot.entity.position.z.toFixed(1)}`);
              } catch (moveError) {
                logger.debug(`Explore move failed: ${moveError.message}, trying different direction...`);
                
                const randomX = pos.x + (Math.random() - 0.5) * 30;
                const randomZ = pos.z + (Math.random() - 0.5) * 30;
                try {
                  await pathfinder.moveTo(new Vec3(randomX, pos.y, randomZ), { 
                    timeout: 15000,
                    useJump: true
                  });
                } catch (retryError) {
                  logger.debug(`Retry explore also failed: ${retryError.message}`);
                }
              }
              
              await new Promise(r => setTimeout(r, 500));
            }
            
            if (currentCycle >= maxCycles) {
              logger.debug('Reached max exploration cycles');
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
        // Check if we're in creative mode
        const isCreativeMode = bot.gameMode === 1 || bot.gameMode === 'creative';
        
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
              
              // In creative mode, skip inventory check since we have all blocks
              if (!isCreativeMode) {
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
              } else {
                // In creative mode, try to equip the block directly
                try {
                  // First check if we already have the block
                  let item = bot.inventory.items().find(i => i.name === blockType && i.count > 0);
                  if (!item) {
                    // In creative mode, we might need to give ourselves the block
                    // For now, we'll try to equip it anyway or use creative mode API
                    logger.debug(`In creative mode, attempting to use block: ${blockType}`);
                  }
                  if (item) {
                    await bot.equip(item, 'hand');
                  }
                } catch (equipError) {
                  logger.warn(`Could not equip block in creative mode: ${equipError.message}`);
                }
              }
              
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
            
            const blocksWithData = blockPositions.map(pos => {
              const block = bot.blockAt(pos);
              return {
                position: pos,
                name: block?.name || 'unknown',
                value: _getBlockValue(block?.name || 'unknown'),
                safe: _isBlockSafe(block?.name || 'unknown')
              };
            });
            
            const context = {
              targetBlocks: blocksWithData,
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
        const maxFailures = 3;
        const gatherStartTime = Date.now();
        
        const positionsToVisit = optimalStrategy.order || blockPositions;
        
        for (const position of positionsToVisit) {
          // Stop if we've had too many consecutive failures
          if (failCount >= maxFailures) {
            logger.debug(`[Behaviors] Stopping resource gathering after ${failCount} consecutive failures`);
            break;
          }
          
          logger.debug(`Moving to block at ${position.x}, ${position.y}, ${position.z}`);
          
          let reachedBlock = false;
          try {
            await pathfinder.moveTo(position, { timeout: 25000, range: 4 });
            reachedBlock = true;
          } catch (moveError) {
            const dist = bot.entity.position.distanceTo(new Vec3(position.x, position.y, position.z));
            if (dist < 5) {
              logger.debug(`Close enough (dist=${dist.toFixed(1)})`);
              reachedBlock = true;
            } else {
              logger.debug(`Cannot reach block: ${moveError.message}, dist=${dist.toFixed(1)}`);
              failCount++;
              continue;
            }
          }
          
          if (!reachedBlock) {
            failCount++;
            continue;
          }
          
          const block = bot.blockAt(position);
          if (!block || !block.name) {
            logger.debug('Block not found at position');
            failCount++;
            continue;
          }
          
          if (!bot.canDigBlock(block)) {
            logger.debug(`No optimal tool for ${block.name}, attempting anyway`);
          }
          
          try {
            await retryOperation(async () => {
              await bot.dig(block, true);
              
              await waitForCondition(() => 
                !bot.blockAt(position) || bot.blockAt(position).name === 'air', 10000);
              
              await collectNearbyItems(bot, 4);
              
              const items = bot.inventory.items();
              if (items.length > 0) {
                logger.debug(`Inventory now has ${items.length} items`);
              }
            });
            
            logger.debug(`Collected ${block.name}`);
            successCount++;
            failCount = 0;
            
            const gatherDuration = Date.now() - gatherStartTime;
            
            if (evolutionManager) {
              await evolutionManager.recordExperience({
                bot_id: bot.__wrapper?.botId || 'unknown',
                type: 'resource',
                context: { targetBlock: block.name, position: position, safe: _isBlockSafe(block.name) },
                action: 'gather',
                outcome: { success: true, block: block.name, count: 1, duration_ms: gatherDuration, resource_gained: 1 }
              });
            }
          } catch (digError) {
            logger.debug(`[Behaviors] Failed to dig block: ${digError.message}`);
            failCount++;
            const gatherDuration = Date.now() - gatherStartTime;
            if (evolutionManager) {
              await evolutionManager.recordExperience({
                bot_id: bot.__wrapper?.botId || 'unknown',
                type: 'resource',
                context: { targetBlock: block.name, position: position },
                action: 'gather',
                outcome: { success: false, reason: digError.message, duration_ms: gatherDuration }
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