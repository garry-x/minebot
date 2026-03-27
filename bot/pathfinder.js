const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals: { GoalBlock, GoalNear, GoalFollow } } = require('mineflayer-pathfinder');
const Vec3 = require('vec3');

class Pathfinder {
  constructor(bot) {
    this.bot = bot;
    this.movements = new Movements(bot);
    this.bot.loadPlugin(pathfinder);
    
    // Enable jumping and sprinting by default
    this.movements.allowSprint = true;
    this.movements.allowJump = true;
    this.movements.allowParkour = true;
  }

  /**
   * Move to a specific position
   * @param {Object} target - Target position {x, y, z}
   * @param {Object} options - Movement options
   * @returns {Promise} - Resolves when movement completes or fails
   */
  async moveTo(target, options = {}) {
    const { 
      range = 1, 
      timeout = 30000, 
      useParkour = true,
      useSprint = true,
      useJump = true
    } = options;
    
    return new Promise((resolve, reject) => {
      // Configure movements
      this.movements.allowSprint = useSpark;
      this.movements.allowJump = useJump;
      this.movements.allowParkour = useParkour;
      
      // Set goal
      const goal = new GoalNear(target.x, target.y, target.z, range);
      
      // Start pathfinding
      this.bot.pathfinder.setGoal(goal, () => {
        // Clear any existing timeout
        if (this.timeoutId) {
          clearTimeout(this.timeoutId);
          this.timeoutId = null;
        }
        
        // Check if we've reached the goal
        if (this.bot.pathfinder.isMoving()) {
          // Still moving, wait a bit more
          this.timeoutId = setTimeout(() => {
            if (this.bot.pathfinder.isMoving()) {
              // Still moving after timeout, consider it stuck
              this.bot.pathfinder.stop();
              reject(new Error('Movement timeout - bot appears stuck'));
            } else {
              // Successfully reached goal
              resolve();
            }
          }, 5000); // Additional wait time
        } else {
          // Already at goal
          resolve();
        }
      });
      
      // Set timeout for the entire operation
      this.timeoutId = setTimeout(() => {
        if (this.bot.pathfinder.isMoving()) {
          this.bot.pathfinder.stop();
          reject(new Error('Movement timeout exceeded'));
        }
      }, timeout);
    });
  }

  /**
   * Move to a specific block
   * @param {Object} blockPosition - Block position {x, y, z}
   * @param {Object} options - Movement options
   * @returns {Promise} - Resolves when movement completes or fails
   */
  async moveToBlock(blockPosition, options = {}) {
    return this.moveTo(blockPosition, options);
  }

  /**
   * Follow an entity
   * @param {Object} entity - Entity to follow
   * @param {Object} options - Follow options
   * @returns {Promise} - Resolves when following starts
   */
  async follow(entity, options = {}) {
    const { 
      distance = 2, 
      timeout = 30000 
    } = options;
    
    return new Promise((resolve, reject) => {
      const goal = new GoalFollow(entity, distance);
      
      this.bot.pathfinder.setGoal(goal, () => {
        resolve();
      });
      
      // Set timeout
      this.timeoutId = setTimeout(() => {
        if (this.bot.pathfinder.isMoving()) {
          this.bot.pathfinder.stop();
          reject(new Error('Follow timeout exceeded'));
        }
      }, timeout);
    });
  }

  /**
   * Stop current movement
   */
  stop() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.bot.pathfinder.stop();
  }

  /**
   * Check if the bot is currently moving
   * @returns {boolean} - True if moving, false otherwise
   */
  isMoving() {
    return this.bot.pathfinder.isMoving();
  }

  /**
   * Set movement permissions
   * @param {boolean} allowSprint - Whether to allow sprinting
   * @param {boolean} allowJump - Whether to allow jumping
   * @param {boolean} allowParkour - Whether to allow parkour
   */
  setMovementPermissions(allowSprint, allowJump, allowParkour) {
    this.movements.allowSprint = allowSprint;
    this.movements.allowJump = allowJump;
    this.movements.allowParkour = allowParkour;
  }

  /**
   * Fly to a specific position (simplified implementation)
   * Note: True flying would require creative mode or special plugins
   * @param {Object} target - Target position {x, y, z}
   * @param {number} speed - Flying speed multiplier
   * @returns {Promise} - Resolves when flight completes
   */
  async flyTo(target, speed = 1) {
    // In survival mode, we simulate flying by moving normally
    // In creative mode, we could set the bot's velocity directly
    // For now, we'll just use regular movement
    return this.moveTo(target, { 
      timeout: 60000, // Longer timeout for flying
      useSprint: false, // Don't sprint while "flying"
      useParkour: false  // Don't use parkour while "flying"
    });
  }

  /**
   * Set bot velocity (for flying in creative mode)
   * @param {Object} velocity - Velocity vector {x, y, z}
   */
  setVelocity(velocity) {
    if (this.bot.creative) {
      this.bot.entity.setVelocity(velocity);
    } else {
      console.warn('Cannot set velocity: bot is not in creative mode');
    }
  }
}

module.exports = Pathfinder;