const Vec3 = require('vec3');

class Pathfinder {
  constructor(bot) {
    this.bot = bot;
    console.log('[Pathfinder] Using simple pathfinder (no mineflayer-pathfinder)');
  }
  
  async moveTo(target, options = {}) {
    const { 
      range = 1, 
      timeout = 30000, 
      useSprint = true,
      useJump = true,
      useParkour = true
    } = options;
  
    console.log(`[Pathfinder] Moving to ${target.x}, ${target.y}, ${target.z}`);
    
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const checkArrival = () => {
        const pos = this.bot.entity.position;
        const dist = pos.distanceTo(new Vec3(target.x, target.y, target.z));
        return dist <= range;
      };
      
      // Try to move towards target using basic movement
      const tryMove = async () => {
        if (checkArrival()) {
          console.log('[Pathfinder] Reached target');
          resolve();
          return;
        }
        
        if (Date.now() - startTime > timeout) {
          console.log('[Pathfinder] Timeout reached');
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
          }
          
          // Check if we've moved closer
          const oldDist = pos.distanceTo(new Vec3(target.x, target.y, target.z));
          await new Promise(resolve => setTimeout(resolve, 500));
          
          const newDist = this.bot.entity.position.distanceTo(new Vec3(target.x, target.y, target.z));
          
          // If we haven't made progress, try jumping or adjusting
          if (newDist >= oldDist && this.bot.onGround) {
            this.bot.setControlState('jump', true);
            setTimeout(() => this.bot.setControlState('jump', false), 200);
          }
          
          // Continue checking
          setTimeout(tryMove, 200);
          
        } catch (err) {
          console.error('[Pathfinder] Error during movement:', err);
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
    
    console.log(`[Pathfinder] Following entity: ${entity.name}`);
    
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
            console.log('[Pathfinder] Caught up to entity');
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
    console.log('[Pathfinder] Movement stopped');
  }

  isMoving() {
    return this.bot.controlState.forward || 
           this.bot.controlState.sprint || 
           this.bot.controlState.jump;
  }

  setMovementPermissions(allowSprint, allowJump, allowParkour) {
    // Not applicable for simple pathfinder
    console.log('[Pathfinder] setMovementPermissions not applicable');
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
      console.warn('Cannot set velocity: bot is not in creative mode');
    }
  }
}

module.exports = Pathfinder;
