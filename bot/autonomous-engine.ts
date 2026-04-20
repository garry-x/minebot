import { Bot, Item, Entity } from 'mineflayer';
import { Vec3 } from 'vec3';
import * as loggerModule from './logger';
const logger = loggerModule;
import GoalSystem, { GoalStateData } from './goal-system';

// Import LLM Brain classes
import LLMBrain from '../llm/brain';
import type { BotState, GoalStateData as LLMGoalStateData } from '../llm/brain';
// Keep Strategy for fallback
import Strategy from '../llm/strategy';
import type { SuggestedAction } from '../llm/strategy';

// LLM Brain configuration
const USE_LLM = process.env.USE_LLM === 'true';
const VLLM_URL = process.env.VLLM_URL || 'http://localhost:8000';

// LLM Brain types
interface LLMDecision {
  reasoning: string;
  primary_action: ActionType;
  target: any;
  urgency: 'high' | 'medium' | 'low';
  strategy: string;
}

interface LLMContext {
  health: number;
  food: number;
  inventory: Array<{ name: string; count: number }>;
  nearbyHostiles: number;
  threatScore: number;
  isOverwhelmed: boolean;
  isDaytime: boolean;
  currentGoal?: string;
  goalProgress?: number;
  [key: string]: unknown;
}

interface InventoryItem {
  name: string;
  count: number;
}

interface Pathfinder {
  moveTo(target: Vec3 | { x: number; y: number; z: number }, options?: MoveOptions): Promise<void>;
}

interface MoveOptions {
  range?: number;
  timeout?: number;
}

interface Behaviors {
  gatherResources(options: GatherOptions): Promise<void>;
  combatMode(options: CombatOptions): Promise<CombatResult>;
  findSafeRetreat(): Promise<void>;
  craftItem(target: string): Promise<void>;
  buildHouse(options: BuildHouseOptions): Promise<void>;
  autoBuild(options: AutoBuildOptions): Promise<void>;
  explore(options?: { radius?: number; timeout?: number }): Promise<boolean>;
}

interface GatherOptions {
  targetBlocks: string[];
  radius: number;
}

interface CombatOptions {
  aggressive: boolean;
  retreatHealth: number;
  isOverwhelmed: boolean;
}

interface CombatResult {
  action: string;
  target?: string;
}

interface BuildHouseOptions {
  style: string;
  material: string;
}

interface AutoBuildOptions {
  blockType: string;
  width: number;
  length: number;
  height: number;
}

type Priority = 'emergency' | 'survival' | 'food' | 'heal' | 'gather_food' | 'combat' | 'goal_progress';
type ThreatLevel = 'low' | 'medium' | 'high' | 'critical';
type HealthStatus = 'safe' | 'warning' | 'critical';
type ActionType = 'idle' | 'gather' | 'heal_immediate' | 'find_shelter' | 'combat' | 'retreat' | 'craft' | 'build' | 'explore';

interface AutonomousState {
  priority: Priority;
  currentAction: ActionType;
  decisionReason: string;
  threatLevel: ThreatLevel;
  healthStatus: HealthStatus;
  combatCooldownUntil: number;
  isOverwhelmed: boolean;
  threatScore: number;
  llmReasoning?: string;
  llmTarget?: any;
  llmUrgency?: string;
  llmStrategy?: string;
}

interface AssessmentResult {
  health: number;
  food: number;
  inventoryCount: number;
  isDaytime: boolean;
  nearbyEntities: number;
  nearbyHostiles: number;
  nearbyHostilesEngageable: number;
  threatScore: number;
  isOverwhelmed: boolean;
  nearestHostileDist: number;
  damageRecent: boolean;
}

interface ActionDecision {
  action: ActionType;
  target: any;
  reason?: string;
  llmDetails?: {
    reasoning: string;
    target: any;
    urgency: string;
    strategy: string;
  };
}

interface GoalSubTask {
  id: string;
  name: string;
  targetCategory?: string;
  required?: number;
  target?: string;
  type?: string;
  completed?: boolean;
  progress?: number;
  optional?: boolean;
}

interface GoalState extends GoalStateData {}

const HOSTILE_MOBS = [
  'zombie', 'skeleton', 'spider', 'creeper', 'enderman', 'piglin', 'hoglin',
  'zombified_piglin', 'drowned', 'witch', 'ravager', 'vex', 'pillager', 'blaze',
  'ghast', 'magma_cube', 'slime', 'wither_skeleton', 'husk', 'stray', 'polar_bear'
];

const DANGEROUS_MOBS = ['creeper', 'blaze', 'ghast', 'ravager', 'wither_skeleton'];

class AutonomousEngine {
  private bot: Bot;
  private pathfinder: Pathfinder;
  private behaviors: Behaviors;
  private lastDamageTime: number;
  private state: AutonomousState;
  private llmBrain: LLMBrain | null;
  private llmAvailable: boolean;
  private lastDecisionFromLLM: boolean = false;

  constructor(bot: Bot, pathfinder: Pathfinder, behaviors: Behaviors, enableLLM = USE_LLM) {
    this.bot = bot;
    this.pathfinder = pathfinder;
    this.behaviors = behaviors;
    this.lastDamageTime = 0;
    this.llmBrain = null;
    this.llmAvailable = false;
    this.state = {
      priority: 'survival',
      currentAction: 'idle',
      decisionReason: '',
      threatLevel: 'low',
      healthStatus: 'safe',
      combatCooldownUntil: 0,
      isOverwhelmed: false,
      threatScore: 0,
      llmReasoning: undefined,
      llmTarget: undefined,
      llmUrgency: undefined,
      llmStrategy: undefined
    };

    if (enableLLM) {
      this.initializeLLMBrain();
    }
  }

  isUsingLLM(): boolean {
    return this.lastDecisionFromLLM;
  }

  getLLMBrainStats(): { hits: number; misses: number; hitRate: number } | null {
    if (this.llmBrain && typeof (this.llmBrain as any).getCacheStats === 'function') {
      return (this.llmBrain as any).getCacheStats();
    }
    return null;
  }

  private initializeLLMBrain(): void {
    try {
      this.llmBrain = new LLMBrain();
      this.llmAvailable = true;
      logger.debug(`[AutonomousEngine] LLM Brain initialized with VLLM_URL: ${VLLM_URL}`);
    } catch (error) {
      logger.debug(`[AutonomousEngine] Failed to initialize LLM Brain: ${(error as Error).message}`);
      this.llmBrain = null;
      this.llmAvailable = false;
    }
  }

  isLLMAvailable(): boolean {
    return this.llmAvailable && this.llmBrain !== null;
  }

  assessState(): AssessmentResult {
    const health = this.bot.health || 20;
    const food = this.bot.food || 20;
    const inventory = this.bot.inventory.items();

    let nearbyHostiles = 0;
    let nearbyHostilesEngageable = 0;
    let threatScore = 0;
    let nearestHostileDist = 999;

    const entities = this.bot.entities || {};
    for (const entity of Object.values(entities)) {
      if (!entity.position || !entity.type) continue;
      if (entity.type !== 'hostile' && entity.type !== 'mob') continue;
      if (!entity.name) continue;

      const isHostile = HOSTILE_MOBS.includes(entity.name) ||
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
        if (DANGEROUS_MOBS.some(m => entity.name.includes(m))) mobThreat = 2;
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
      nearbyEntities: Object.keys(entities).length,
      nearbyHostiles,
      nearbyHostilesEngageable,
      threatScore: Math.round(threatScore * 10) / 10,
      isOverwhelmed,
      nearestHostileDist,
      damageRecent: Date.now() - this.lastDamageTime < 10000
    };
  }

  calculatePriority(assessment: AssessmentResult): Priority {
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

  async decideAction(priority: Priority, goalState: GoalState | null, assessment: AssessmentResult = {} as AssessmentResult, usedLLM: boolean = false): Promise<ActionDecision & { usedLLMBrain?: boolean }> {
    logger.debug(`[AutonomousEngine] decideAction: isLLMAvailable=${this.isLLMAvailable()}, usedLLM=${usedLLM}, priority=${priority}`);
    if (this.isLLMAvailable() && !usedLLM) {
      logger.debug(`[AutonomousEngine] Attempting LLM decision...`);
      try {
        const llmDecision = await this.getLLMDecision(priority, goalState, assessment);
        if (llmDecision) {
          logger.debug(`[AutonomousEngine] LLM decision: ${llmDecision.primary_action} - ${llmDecision.reasoning}`);
          this.lastDecisionFromLLM = true;
          return {
            action: llmDecision.primary_action,
            target: llmDecision.target,
            reason: `[LLM] ${llmDecision.reasoning}`,
            usedLLMBrain: true,
            llmDetails: {
              reasoning: llmDecision.reasoning,
              target: llmDecision.target,
              urgency: llmDecision.urgency,
              strategy: llmDecision.strategy
            }
          };
        } else {
          this.lastDecisionFromLLM = false;
        }
        if (!llmDecision) {
          logger.debug(`[AutonomousEngine] LLM returned null decision`);
        }
      } catch (error) {
        logger.debug(`[AutonomousEngine] LLM decision failed, falling back to cerebellum: ${(error as Error).message}`);
      }
    } else {
      logger.debug(`[AutonomousEngine] Skipping LLM: isLLMAvailable=${this.isLLMAvailable()}, usedLLM=${usedLLM}`);
      this.lastDecisionFromLLM = false;
    }

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

  private async getLLMDecision(priority: Priority, goalState: GoalState | null, assessment: AssessmentResult): Promise<LLMDecision | null> {
    const nearbyThreats: string[] = [];
    const nearbyResources: string[] = [];
    const nearbyEntities: string[] = [];
    const nearbyBlocks: string[] = [];

    if (assessment.nearbyHostiles && assessment.nearbyHostiles > 0) {
      const entities = this.bot.entities || {};
      for (const entity of Object.values(entities)) {
        if (entity.type === 'hostile' || entity.type === 'mob') {
          nearbyThreats.push(entity.name || 'unknown');
        }
        if (entity.name && entity.type !== 'player') {
          nearbyEntities.push(entity.name);
        }
      }
    }

    const botState = LLMBrain.extractBotState(this.bot, nearbyThreats, nearbyResources, nearbyEntities, nearbyBlocks);

    let goalStateData: LLMGoalStateData;
    if (goalState?.goalId) {
      const goal = GoalSystem.getGoal(goalState.goalId);
      goalStateData = {
        goalId: goalState.goalId,
        goalName: goal?.name || goalState.goalId,
        goalDescription: goal?.description || '',
        progress: goalState.progress || 0,
        difficulty: goal?.difficulty,
        subTasks: goalState.subTasks?.map(st => ({
          id: st.id,
          name: st.name || '',
          completed: st.completed || false,
          progress: st.progress,
          targetCategory: st.targetCategory,
          target: st.target,
          required: st.required,
          type: st.type,
          optional: st.optional
        })),
        materials: goalState.materials,
        rewards: goal?.rewards
      };
    } else {
      goalStateData = {
        goalId: 'none',
        goalName: 'No active goal',
        goalDescription: 'Bot is operating without a specific goal',
        progress: 0,
        subTasks: []
      };
    }

    try {
      const result = await this.llmBrain!.decide(botState, goalStateData);

      if (!result) {
        return null;
      }

      return {
        reasoning: result.reasoning,
        primary_action: result.primary_action === 'heal' ? 'heal_immediate' : result.primary_action,
        target: result.target,
        urgency: result.urgency,
        strategy: result.strategy || 'vllm'
      };
    } catch (error) {
      logger.debug(`[AutonomousEngine] LLM query error: ${(error as Error).message}`);
      return null;
    }
  }

  decideGoalAction(goalState: GoalState | null): ActionDecision {
    if (!goalState || !goalState.goalId) {
      return { action: 'gather', target: ['oak_log', 'cobblestone', 'dirt'] };
    }

    const goal = GoalSystem.getGoal(goalState.goalId);
    const inventory: InventoryItem[] = this.bot.inventory.items()
      .filter(i => typeof i.name === 'string')
      .map(i => ({ name: i.name!, count: i.count }));
    const categoryCount = GoalSystem.countItemsByCategory(inventory);

    const subTasks = goalState.subTasks || [];
    for (const task of subTasks) {
      if (task.completed) continue;

      if (task.targetCategory) {
        const current = categoryCount[task.targetCategory] || 0;
        const required = typeof task.required === 'number' ? task.required : 0;
        if (current < required) {
          const items = GoalSystem.getAllItemsInCategory(task.targetCategory);
          return {
            action: 'gather',
            target: items,
            reason: `完成目标: ${task.name} (${current}/${task.required})`
          };
        }
      } else if (task.target && task.type !== 'build') {
        const item = inventory.find(i => i.name === task.target);
        const required = typeof task.required === 'number' ? task.required : 1;
        if (!item || item.count < required) {
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

  async executeAction(action: ActionDecision): Promise<void> {
    this.state.currentAction = action.action;

    try {
      switch (action.action) {
        case 'gather':
          await this.behaviors.gatherResources({
            targetBlocks: action.target,
            radius: 30
          });
          break;
        case 'heal_immediate': {
          const foodItems = this.bot.inventory.items().filter(i =>
            ['apple', 'bread', 'cooked_beef'].includes(i.name)
          );
          if (foodItems.length > 0) {
            await this.bot.equip(foodItems[0], 'hand');
            await this.bot.consume();
          }
          break;
        }
        case 'find_shelter': {
          const safePos = new Vec3(
            this.bot.entity.position.x + 10,
            this.bot.entity.position.y,
            this.bot.entity.position.z + 10
          );
          try {
            await this.pathfinder.moveTo(safePos, { timeout: 30000 });
          } catch (moveError) {
            logger.debug(`[AutonomousEngine] Could not find shelter: ${(moveError as Error).message}`);
          }
          break;
        }
        case 'combat': {
          const retreatHealth = action.target?.retreatHealth || 6;
          const combatResult = await this.behaviors.combatMode({
            aggressive: false,
            retreatHealth,
            isOverwhelmed: action.target?.isOverwhelmed || false
          });
          this.state.decisionReason = `Combat: ${combatResult.action} ${combatResult.target || ''}`;
          this.state.combatCooldownUntil = Date.now() + 5000;
          break;
        }
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
        case 'explore':
          await this.behaviors.explore({ radius: 32, timeout: 30000 });
          break;
      }
    } catch (error) {
      logger.debug(`[AutonomousEngine] Action '${action.action}' failed: ${(error as Error).message}`);
      // Don't throw - let the autonomous loop continue with the next cycle
    }
  }

  async runCycle(goalState: GoalState | null): Promise<{
    state: AutonomousState;
    assessment: AssessmentResult;
    action: ActionDecision;
    goalState: GoalState | null;
    usedLLM: boolean;
  }> {
    const assessment = this.assessState();
    const priority = this.calculatePriority(assessment);
    const actionDecision = await this.decideAction(priority, goalState, assessment);

    const usedLLM = actionDecision.usedLLMBrain === true;
    const action: ActionDecision = {
      action: actionDecision.action,
      target: actionDecision.target,
      reason: actionDecision.reason,
      llmDetails: actionDecision.llmDetails
    };

    this.state.priority = priority;
    this.state.isOverwhelmed = assessment.isOverwhelmed || false;
    this.state.threatScore = assessment.threatScore || 0;
    this.state.decisionReason = action.reason || `Health: ${assessment.health}, Food: ${assessment.food}, Threat: ${assessment.threatScore}`;
    this.state.threatLevel = assessment.threatScore > 15 ? 'critical' :
      assessment.threatScore > 8 ? 'high' :
        (assessment as any).nearbyEntities > 3 ? 'medium' : 'low';
    this.state.healthStatus = assessment.health > 15 ? 'safe' :
      assessment.health > 10 ? 'warning' : 'critical';

    if (usedLLM && (actionDecision as any).llmDetails) {
      const llmDetails = (actionDecision as any).llmDetails;
      this.state.llmReasoning = llmDetails.reasoning;
      this.state.llmTarget = llmDetails.target;
      this.state.llmUrgency = llmDetails.urgency;
      this.state.llmStrategy = llmDetails.strategy;
    } else if (!usedLLM) {
      this.state.llmReasoning = undefined;
      this.state.llmTarget = undefined;
      this.state.llmUrgency = undefined;
      this.state.llmStrategy = undefined;
    }

    await this.executeAction(action);

    if (action.action === 'gather' || action.action === 'explore' || action.action === 'build') {
      this.state.combatCooldownUntil = 0;
    }

    let updatedGoalState: GoalState | null = goalState;
    if (goalState && goalState.goalId) {
      const inventory: InventoryItem[] = this.bot.inventory.items()
        .filter(i => typeof i.name === 'string')
        .map(i => ({ name: i.name!, count: i.count }));
      updatedGoalState = GoalSystem.updateGoalProgress(goalState, inventory);
    }

    return {
      state: this.state,
      assessment,
      action,
      goalState: updatedGoalState,
      usedLLM
    };
  }
}

export default AutonomousEngine;