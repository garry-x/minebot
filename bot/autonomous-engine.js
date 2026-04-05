const Vec3 = require('vec3');
const logger = require('./logger');

class AutonomousEngine {
  constructor(bot, pathfinder, behaviors) {
    this.bot = bot;
    this.pathfinder = pathfinder;
    this.behaviors = behaviors;
    this.state = {
      priority: 'survival',
      currentAction: 'idle',
      decisionReason: '',
      threatLevel: 'low',
      healthStatus: 'safe'
    };
  }

  assessState() {
    const health = this.bot.health || 20;
    const food = this.bot.food || 20;
    const inventory = this.bot.inventory.items();
    
    return {
      health,
      food,
      inventoryCount: inventory.length,
      isDaytime: this.bot.time.timeOfDay < 13000,
      nearbyEntities: this.bot.entities.length
    };
  }

  calculatePriority(assessment) {
    if (assessment.health < 8) return 'emergency';
    if (assessment.food < 6) return 'food';
    if (assessment.health < 12) return 'heal';
    if (assessment.food < 12) return 'gather_food';
    return 'goal_progress';
  }

  decideAction(priority, goalState) {
    switch (priority) {
      case 'emergency':
        return { action: 'heal_immediate', target: null };
      case 'food':
        return { action: 'gather', target: ['wheat', 'carrot', 'potato'] };
      case 'heal':
        return { action: 'find_shelter', target: null };
      case 'gather_food':
        return { action: 'gather', target: ['wheat', 'carrot'] };
      case 'goal_progress':
        return this.decideGoalAction(goalState);
      default:
        return { action: 'explore', target: null };
    }
  }

  decideGoalAction(goalState) {
    if (!goalState || !goalState.currentGoal) {
      return { action: 'gather', target: ['oak_log', 'cobblestone'] };
    }
    return { action: 'gather', target: ['oak_log', 'cobblestone'] };
  }

  async executeAction(action) {
    this.state.currentAction = action.action;
    
    try {
      switch (action.action) {
        case 'gather':
          await this.behaviors.gatherResources({
            targetBlocks: action.target,
            radius: 30
          });
          break;
        case 'heal_immediate':
          const foodItems = this.bot.inventory.items().filter(i => 
            ['apple', 'bread', 'cooked_beef'].includes(i.name)
          );
          if (foodItems.length > 0) {
            await this.bot.equip(foodItems[0], 'hand');
            await this.bot.consume();
          }
          break;
        case 'find_shelter':
          const safePos = new Vec3(
            this.bot.entity.position.x + 10,
            this.bot.entity.position.y,
            this.bot.entity.position.z + 10
          );
          try {
            await this.pathfinder.moveTo(safePos, { timeout: 15000 });
          } catch (moveError) {
            logger.debug(`[AutonomousEngine] Could not find shelter: ${moveError.message}`);
          }
          break;
      }
    } catch (error) {
      logger.debug(`[AutonomousEngine] Action '${action.action}' failed: ${error.message}`);
      // Don't throw - let the autonomous loop continue with the next cycle
    }
  }

  async runCycle(goalState) {
    const assessment = this.assessState();
    const priority = this.calculatePriority(assessment);
    const action = this.decideAction(priority, goalState);
    
    this.state.priority = priority;
    this.state.decisionReason = `Health: ${assessment.health}, Food: ${assessment.food}`;
    this.state.threatLevel = assessment.nearbyEntities > 3 ? 'medium' : 'low';
    this.state.healthStatus = assessment.health > 15 ? 'safe' : 
                              assessment.health > 10 ? 'warning' : 'critical';
    
    await this.executeAction(action);
    
    return {
      state: this.state,
      assessment,
      action
    };
  }
}

module.exports = AutonomousEngine;
