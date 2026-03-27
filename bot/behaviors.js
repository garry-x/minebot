const Vec3 = require('vec3');

module.exports = function(bot, pathfinder) {
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
          console.log(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
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

  return {
    // Building behaviors
    buildStructure: async function(options) {
      const { width, length, height, blockType, offsetX = 0, offsetY = 0, offsetZ = 0 } = options;
      
      console.log(`Building structure: ${width}x${length}x${height} with ${blockType}`);
      console.log(`At offset: ${offsetX}, ${offsetY}, ${offsetZ}`);
      
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
        
        console.log('Structure building completed');
        return true;
      } catch (error) {
        console.error('Error building structure:', error);
        throw new Error(`Building failed: ${error.message}`);
      }
    },
    
    // Resource gathering behaviors
    gatherResources: async function(options) {
      const { targetBlocks, radius = 20 } = options;
      
      console.log(`Gathering resources: ${JSON.stringify(targetBlocks)} within radius ${radius}`);
      
      try {
        // Find target blocks nearby
        const blockPositions = findBlocks(targetBlocks, radius);
        
        if (blockPositions.length === 0) {
          console.log('No target blocks found nearby');
          return false;
        }
        
        // Go to each block and break it
        for (const position of blockPositions) {
          console.log(`Moving to block at ${position.x}, ${position.y}, ${position.z}`);
          
          // Move to the block with retry logic
          await retryOperation(async () => {
            await pathfinder.moveTo(position);
            
            // Wait until we reach the block
            await waitForCondition(() => 
              bot.entity.position.distanceTo(position) < 1.5, 15000);
          });
          
          // Find the block at our position
          const block = bot.blockAt(position);
          if (!block || !block.name) {
            console.log('Block not found at position');
            continue;
          }
          
          // Dig the block with retry logic
          await retryOperation(async () => {
            await bot.dig(block);
            
            // Wait for the block to break
            await waitForCondition(() => 
              !bot.blockAt(position) || bot.blockAt(position).name === 'air', 10000);
          });
            
          console.log(`Collected ${block.name}`);
          
          // Small delay between blocks
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        console.log('Resource gathering completed');
        return true;
      } catch (error) {
        console.error('Error gathering resources:', error);
        throw new Error(`Gathering failed: ${error.message}`);
      }
    },
    
    // Flying behaviors (works in creative mode or with elytra)
    flyTo: async function(options) {
      const { x, y, z, speed = 1 } = options;
      
      console.log(`Flying to: ${x}, ${y}, ${z} at speed ${speed}`);
      
      try {
        // Check if we can fly (creative mode or elytra)
        const canFly = bot.creative || 
          (bot.inventory.armor && bot.inventory.armor.chest && 
           bot.inventory.armor.chest.name === 'elytra');
           
        if (!canFly) {
          console.log('Cannot fly: not in creative mode and no elytra');
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
        
        console.log('Flying completed');
        return true;
      } catch (error) {
        console.error('Error flying:', error);
        throw new Error(`Flying failed: ${error.message}`);
      }
    },
    
    // Additional utility behaviors
    lookAt: function(position) {
      // Make the bot look at a specific position
      if (typeof position === 'object' && position.x !== undefined) {
        bot.lookAt(position);
      } else {
        console.warn('Invalid position for lookAt:', position);
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
    
    // New: Automatic behavior without LLM
    automaticBehavior: async function(options = {}) {
      const { 
        mode = 'survival', // survival, building, gathering
        targetBlockType = 'oak_log',
        structureType = 'house',
        structureSize = { width: 5, length: 5, height: 3 },
        gatherRadius = 30
      } = options;
      
      console.log(`Starting automatic behavior in ${mode} mode`);
      
      try {
        switch (mode) {
          case 'building':
            // Auto-gather materials then build
            console.log('Auto-gathering materials for building...');
            await this.gatherResources({
              targetBlocks: ['oak_log', 'cobblestone'],
              radius: gatherRadius
            });
            
            console.log('Auto-building structure...');
            await this.buildStructure({
              width: structureSize.width,
              length: structureSize.length,
              height: structureSize.height,
              blockType: targetBlockType
            });
            break;
            
          case 'gathering':
            // Auto-gather specific resources
            console.log(`Auto-gathering ${targetBlockType}...`);
            await this.gatherResources({
              targetBlocks: [targetBlockType],
              radius: gatherRadius
            });
            break;
            
          case 'survival':
          default:
            // Basic survival: gather food, wood, and cobblestone
            console.log('Auto-gathering survival resources...');
            await this.gatherResources({
              targetBlocks: ['oak_log', 'cobblestone', 'wheat', 'carrot'],
              radius: gatherRadius
            });
            
            // Build a simple shelter
            console.log('Auto-building shelter...');
            await this.buildStructure({
              width: 5,
              length: 5,
              height: 3,
              blockType: 'oak_planks'
            });
            break;
        }
        
        console.log('Automatic behavior completed');
        return true;
      } catch (error) {
        console.error('Error in automatic behavior:', error);
        throw new Error(`Automatic behavior failed: ${error.message}`);
      }
    }
  };
};