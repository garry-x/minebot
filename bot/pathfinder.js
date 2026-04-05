const Vec3 = require('vec3');
const logger = require('./logger');

class Pathfinder {
  constructor(bot) {
    this.bot = bot;
    logger.debug('[Pathfinder] Using simple pathfinder (no mineflayer-pathfinder)');
  }
  
  async moveTo(target, options = {}) {
    const { 
      range = 1, 
      timeout = 30000, // Increased from 10s to 30s to allow more time for movement
      useSprint = true,
      useJump = true,
      useParkour = true,
      maxRetries = 5 // Increased retries for better stuck recovery
    } = options;
  
    logger.debug(`[Pathfinder] Moving to ${target.x}, ${target.y}, ${target.z}`);
    
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let retryCount = 0;
      let lastDist = Infinity;
      let stuckCounter = 0;
      
      const checkArrival = () => {
        const pos = this.bot.entity.position;
        const dist = pos.distanceTo(new Vec3(target.x, target.y, target.z));
        return dist <= range;
      };
      
      // Try to move towards target using basic movement
      const tryMove = async () => {
        if (checkArrival()) {
          this.stop();
          logger.debug('[Pathfinder] Reached target');
          resolve();
          return;
        }
        
        if (Date.now() - startTime > timeout) {
          this.stop();
          logger.debug(`[Pathfinder] Timeout reached after ${timeout}ms`);
          reject(new Error('Movement timeout'));
          return;
        }
        
        try {
          // Get direction to target
          const pos = this.bot.entity.position;
          const dx = target.x - pos.x;
          const dz = target.z - pos.z;
          
          // Calculate yaw and pitch to face target
          const yaw = Math.atan2(dx, dz);
          const pitch = Math.atan2(target.y - pos.y, Math.sqrt(dx*dx + dz*dz));
          
          // Look at target
          this.bot.look(yaw + Math.PI, pitch);
          
          // Move forward
          this.bot.setControlState('forward', true);
          
          // Sprint if allowed
          if (useSprint) {
            this.bot.setControlState('sprint', true);
          }
          
          // Jump if allowed and bot is on ground
          if (useJump && this.bot.onGround) {
            this.bot.setControlState('jump', true);
            setTimeout(() => this.bot.setControlState('jump', false), 200);
          }
          
          // Check if we've moved closer
          const currentDist = pos.distanceTo(new Vec3(target.x, target.y, target.z));
          await new Promise(resolve => setTimeout(resolve, 500));
          
          const newDist = this.bot.entity.position.distanceTo(new Vec3(target.x, target.y, target.z));
          
          // Detect if we're stuck
          if (Math.abs(newDist - currentDist) < 0.1 && this.bot.onGround) {
            stuckCounter++;
            if (stuckCounter >= 3) {
              stuckCounter = 0;
              retryCount++;
              logger.debug(`[Pathfinder] Stuck, trying to adjust (retry ${retryCount}/${maxRetries})`);
              
              // Try jumping and moving sideways
              this.bot.setControlState('forward', false);
              this.bot.setControlState('jump', true);
              await new Promise(resolve => setTimeout(resolve, 300));
              this.bot.setControlState('jump', false);
              
              // Try moving left/right to get unstuck
              const direction = Math.random() > 0.5 ? 'left' : 'right';
              this.bot.setControlState(direction, true);
              await new Promise(resolve => setTimeout(resolve, 500));
              this.bot.setControlState(direction, false);
              
              if (retryCount >= maxRetries) {
                this.stop();
                reject(new Error(`Movement stuck after ${maxRetries} retries`));
                return;
              }
            }
          } else {
            stuckCounter = 0;
          }
          
          lastDist = newDist;
          
          // Continue checking
          setTimeout(tryMove, 200);
          
        } catch (err) {
          this.stop();
          logger.error('[Pathfinder] Error during movement:', err);
          reject(err);
        }
      };
      
      tryMove();
    });
  }

  async moveToBlock(blockPosition, options = {}) {
    return this.moveTo(blockPosition, options);
  }

  async follow(entity, options = {}) {
    const { 
      distance = 2, 
      timeout = 30000 
    } = options;
    
    logger.debug(`[Pathfinder] Following entity: ${entity.name}`);
    
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const tryFollow = async () => {
        if (Date.now() - startTime > timeout) {
          reject(new Error('Follow timeout'));
          return;
        }
        
        try {
          const pos = this.bot.entity.position;
          const entityPos = entity.position;
          const dist = pos.distanceTo(entityPos);
          
          if (dist <= distance) {
            logger.debug('[Pathfinder] Caught up to entity');
            resolve();
            return;
          }
          
          // Face the entity
          const dx = entityPos.x - pos.x;
          const dz = entityPos.z - pos.z;
          const yaw = Math.atan2(dx, dz);
          const pitch = Math.atan2(entityPos.y - pos.y, Math.sqrt(dx*dx + dz*dz));
          
          this.bot.look(yaw + Math.PI, pitch);
          this.bot.setControlState('forward', true);
          
          setTimeout(tryFollow, 300);
          
        } catch (err) {
          reject(err);
        }
      };
      
      tryFollow();
    });
  }

  stop() {
    this.bot.setControlState('forward', false);
    this.bot.setControlState('sprint', false);
    this.bot.setControlState('jump', false);
    logger.debug('[Pathfinder] Movement stopped');
  }

  isMoving() {
    return this.bot.controlState.forward || 
           this.bot.controlState.sprint || 
           this.bot.controlState.jump;
  }

  setMovementPermissions(allowSprint, allowJump, allowParkour) {
    // Not applicable for simple pathfinder
    logger.debug('[Pathfinder] setMovementPermissions not applicable');
  }

  async flyTo(target, speed = 1) {
    return this.moveTo(target, { 
      timeout: 60000,
      useSprint: false,
      useJump: false
    });
  }

  setVelocity(velocity) {
    if (this.bot.creative) {
      this.bot.entity.setVelocity(velocity);
    } else {
      logger.warn('Cannot set velocity: bot is not in creative mode');
    }
  }

  setEvolutionWeights(weights) {
    logger.debug('[Pathfinder] Evolution weights updated:', weights);
    this.evolutionWeights = weights;
  }
}

module.exports = Pathfinder;
