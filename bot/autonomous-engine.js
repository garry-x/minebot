const Vec3 = require('vec3');
const logger = require('./logger');
const GoalSystem = require('./goal-system');

class AutonomousEngine {
  constructor(bot, pathfinder, behaviors) {
    this.bot = bot;
    this.pathfinder = pathfinder;
    this.behaviors = behaviors;
    this.lastDamageTime = 0;
    this.state = {
      priority: 'survival',
      currentAction: 'idle',
      decisionReason: '',
      threatLevel: 'low',
      healthStatus: 'safe',
      combatCooldownUntil: 0,
      isOverwhelmed: false,
      threatScore: 0
    };
  }

  assessState() {
    const health = this.bot.health || 20;
    const food = this.bot.food || 20;
    const inventory = this.bot.inventory.items();
    
    const hostileMobs = ['zombie', 'skeleton', 'spider', 'creeper', 'enderman', 'piglin', 'hoglin', 'zombified_piglin', 'drowned', 'witch', 'ravager', 'vex', 'pillager', 'blaze', 'ghast', 'magma_cube', 'slime', 'wither_skeleton', 'husk', 'stray', 'polar_bear'];
    const dangerousMobs = ['creeper', 'blaze', 'ghast', 'ravager', 'wither_skeleton'];
    
    let nearbyHostiles = 0;
    let nearbyHostilesEngageable = 0;
    let threatScore = 0;
    let nearestHostileDist = 999;
    
    for (const entity of Object.values(this.bot.entities || {})) {
      if (!entity.position || !entity.type) continue;
      if (entity.type !== 'hostile' && entity.type !== 'mob') continue;
      if (!entity.name) continue;
      
      const isHostile = hostileMobs.includes(entity.name) || 
                       entity.name.includes('zombie') || 
                       entity.name.includes('skeleton') || 
                       entity.name.includes('creeper') ||
                       entity.name.includes('spider');
      
      if (isHostile) {
        const dist = this.bot.entity.position.distanceTo(entity.position);
        if (dist < nearestHostileDist) {
          nearestHostileDist = dist;
        }
        
        let mobThreat = 1;
        if (dangerousMobs.some(m => entity.name.includes(m))) mobThreat = 2;
        if (dist <= 16) {
          nearbyHostiles++;
          if (dist >= 4 && dist <= 16) {
            nearbyHostilesEngageable++;
          }
          threatScore += mobThreat * (1 / (dist / 8 + 0.5));
        }
      }
    }
    
    const isOverwhelmed = nearbyHostiles >= 3 || threatScore > 12;
    
    return {
      health,
      food,
      inventoryCount: inventory.length,
      isDaytime: this.bot.time.timeOfDay < parseInt(process.env.MINECRAFT_DAYTIME_THRESHOLD || '13000'),
      nearbyEntities: this.bot.entities.length,
      nearbyHostiles,
      nearbyHostilesEngageable,
      threatScore: Math.round(threatScore * 10) / 10,
      isOverwhelmed,
      nearestHostileDist,
      damageRecent: Date.now() - this.lastDamageTime < 10000
    };
  }
  
  calculatePriority(assessment) {
    if (assessment.health < 8 || (assessment.health < 12 && assessment.damageRecent)) return 'emergency';
    if (assessment.isOverwhelmed || assessment.threatScore > 15) return 'survival';
    if (assessment.food < 6) return 'food';
    if (assessment.health < 12) return 'heal';
    if (assessment.food < 12) return 'gather_food';
    if (assessment.nearbyHostilesEngageable > 0) {
      if (this.state.combatCooldownUntil > Date.now()) {
        return 'goal_progress';
      }
      return 'combat';
    }
    return 'goal_progress';
  }

  decideAction(priority, goalState, assessment = {}) {
    switch (priority) {
      case 'emergency':
        return { action: 'heal_immediate', target: null };
      case 'survival':
        return { 
          action: 'retreat', 
          target: { isOverwhelmed: assessment.isOverwhelmed, threatScore: assessment.threatScore },
          reason: `生存模式: 威胁得分 ${assessment.threatScore}`
        };
      case 'food':
        return { action: 'gather', target: GoalSystem.resourceCategories.food.slice(0, 5) };
      case 'heal':
        return { action: 'find_shelter', target: null };
      case 'gather_food':
        return { action: 'gather', target: GoalSystem.resourceCategories.food.slice(0, 3) };
      case 'combat':
        return { action: 'combat', target: { retreatHealth: assessment.threatScore > 8 ? 10 : 6 } };
      case 'goal_progress':
        return this.decideGoalAction(goalState);
      default:
        return { action: 'explore', target: null };
    }
  }

  decideGoalAction(goalState) {
    if (!goalState || !goalState.goalId) {
      return { action: 'gather', target: ['oak_log', 'cobblestone', 'dirt'] };
    }

    const goal = GoalSystem.getGoal(goalState.goalId);
    const inventory = this.bot.inventory.items();
    const categoryCount = GoalSystem.countItemsByCategory(inventory);
    
    for (const task of goalState.subTasks || []) {
      if (task.completed) continue;
      
      if (task.targetCategory) {
        const current = categoryCount[task.targetCategory] || 0;
        if (current < task.required) {
          const items = GoalSystem.getAllItemsInCategory(task.targetCategory);
          return { 
            action: 'gather', 
            target: items,
            reason: `完成目标: ${task.name} (${current}/${task.required})`
          };
        }
      } else if (task.target && task.type !== 'build') {
        const item = inventory.find(i => i.name === task.target);
        if (!item || item.count < task.required) {
          return { 
            action: 'gather', 
            target: [task.target],
            reason: `完成目标: ${task.name}`
          };
        }
      } else if (task.type === 'build') {
        return {
          action: 'build',
          target: task,
          reason: `完成目标: ${task.name}`
        };
      } else if (task.type === 'craft') {
        return {
          action: 'craft',
          target: task.target,
          reason: `制作: ${task.name}`
        };
      }
    }
    
    return { 
      action: 'gather', 
      target: ['oak_log', 'cobblestone', 'dirt'],
      reason: '继续收集基础资源'
    };
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
            await this.pathfinder.moveTo(safePos, { timeout: 30000 });
          } catch (moveError) {
            logger.debug(`[AutonomousEngine] Could not find shelter: ${moveError.message}`);
          }
          break;
        case 'combat':
          const retreatHealth = action.target?.retreatHealth || 6;
          const combatResult = await this.behaviors.combatMode({ 
            aggressive: false, 
            retreatHealth: retreatHealth,
            isOverwhelmed: action.target?.isOverwhelmed || false
          });
          this.state.decisionReason = `Combat: ${combatResult.action} ${combatResult.target || ''}`;
          this.state.combatCooldownUntil = Date.now() + 5000;
          break;
        case 'retreat':
          this.state.threatLevel = 'high';
          await this.behaviors.findSafeRetreat();
          break;
        case 'craft':
          await this.behaviors.craftItem(action.target);
          break;
        case 'build':
          if (action.target.id === 'build_shelter') {
            await this.behaviors.buildHouse({ style: 'basic', material: 'cobblestone' });
          } else {
            await this.behaviors.autoBuild({ blockType: 'cobblestone', width: 3, length: 3, height: 3 });
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
    const action = this.decideAction(priority, goalState, assessment);
    
    this.state.priority = priority;
    this.state.isOverwhelmed = assessment.isOverwhelmed || false;
    this.state.threatScore = assessment.threatScore || 0;
    this.state.decisionReason = action.reason || `Health: ${assessment.health}, Food: ${assessment.food}, Threat: ${assessment.threatScore}`;
    this.state.threatLevel = assessment.threatScore > 15 ? 'critical' : 
                             assessment.threatScore > 8 ? 'high' :
                             assessment.nearbyEntities > 3 ? 'medium' : 'low';
    this.state.healthStatus = assessment.health > 15 ? 'safe' : 
                              assessment.health > 10 ? 'warning' : 'critical';
    
    await this.executeAction(action);
    
    if (action.action === 'gather' || action.action === 'explore' || action.action === 'build') {
      this.state.combatCooldownUntil = 0;
    }
    
    let updatedGoalState = goalState;
    if (goalState && goalState.goalId) {
      const inventory = this.bot.inventory.items();
      updatedGoalState = GoalSystem.updateGoalProgress(goalState, inventory);
    }
    
    return {
      state: this.state,
      assessment,
      action,
      goalState: updatedGoalState
    };
  }
}

module.exports = AutonomousEngine;
