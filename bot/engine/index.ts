// bot/engine/index.ts

import type { Bot } from 'mineflayer';
import { GoalBlock } from 'mineflayer-pathfinder/lib/goals';
import { ModeController } from './mode-controller';
import { SkillRegistry } from '../skills/index';
import { CommandRegistry } from '../commands/index';
import { SelfPrompter } from '../self-prompter';
import { GoalManager } from '../goal-manager';
import { Logger } from '../logger';
import { SelfPreservationMode } from './modes/self-preservation';
import { UnstuckMode } from './modes/unstuck';
import { SelfDefenseMode } from './modes/self-defense';
import { HuntingMode } from './modes/hunting';
import { ItemCollectingMode } from './modes/item-collecting';
import { TorchPlacingMode } from './modes/torch-placing';
import { BuildingMode } from './modes/building';
import { IdleMode } from './modes/idle';
import { createGatherResourcesSkill } from '../skills/gathering';
import { createPickupNearbyItemsSkill } from '../skills/gathering';
import { createMineBlockSkill } from '../skills/gathering';
import { createAttackEntitySkill } from '../skills/combat';
import { createDefendSelfSkill } from '../skills/combat';
import { createFlyToSkill, createRetreatSkill, createMoveToSkill } from '../skills/movement';
import { createPlaceBlockSkill, createBuildStructureSkill, createCraftItemSkill } from '../skills/building';
import { createEatSkill, createPlaceTorchSkill, createFindSafeRetreatSkill } from '../skills/survival';
import { createScanEntitiesSkill, createCheckHealthSkill, createLookForItemSkill, createFindBlockSkill } from '../skills/world-utils';
import { actionCommands } from '../commands/action-commands';
import { queryCommands } from '../commands/query-commands';
import { controlCommands } from '../commands/control-commands';
import type { WorldState } from '../types';

export class Agent {
  private modeController: ModeController;
  private skillRegistry: SkillRegistry;
  private commandRegistry: CommandRegistry;
  private selfPrompter: SelfPrompter;
  private goalManager: GoalManager;
  private bot: Bot;
  private logger: Logger;
  private tickInterval: NodeJS.Timeout | null = null;
  private llmBrain: any;
  private enableLLM: boolean;

  constructor(bot: Bot, logger: Logger, enableLLM: boolean, llmBrain?: any) {
    this.bot = bot;
    this.logger = logger;
    this.enableLLM = enableLLM;
    this.llmBrain = llmBrain || null;

    // Initialize layers
    this.skillRegistry = new SkillRegistry();
    this.modeController = new ModeController(bot, logger);
    this.commandRegistry = new CommandRegistry();
    this.goalManager = new GoalManager(logger);
    this.selfPrompter = new SelfPrompter(bot, this.commandRegistry, this.goalManager, logger);

    // Register modes
    this.registerModes();

    // Register skills
    this.registerSkills();

    // Register commands
    this.registerCommands();
  }

  private registerModes(): void {
    this.modeController.registerAll([
      new SelfPreservationMode(),
      new UnstuckMode(),
      new SelfDefenseMode(),
      new HuntingMode(),
      new ItemCollectingMode(),
      new TorchPlacingMode(),
      new BuildingMode(),
      new IdleMode(),
    ]);
  }

  private registerSkills(): void {
    // Movement
    this.skillRegistry.register(createFlyToSkill());
    this.skillRegistry.register(createRetreatSkill());
    this.skillRegistry.register(createMoveToSkill());
    // Combat
    this.skillRegistry.register(createAttackEntitySkill());
    this.skillRegistry.register(createDefendSelfSkill());
    // Gathering
    this.skillRegistry.register(createGatherResourcesSkill());
    this.skillRegistry.register(createPickupNearbyItemsSkill());
    this.skillRegistry.register(createMineBlockSkill());
    // Building
    this.skillRegistry.register(createPlaceBlockSkill());
    this.skillRegistry.register(createBuildStructureSkill());
    this.skillRegistry.register(createCraftItemSkill());
    // Survival
    this.skillRegistry.register(createEatSkill());
    this.skillRegistry.register(createPlaceTorchSkill());
    this.skillRegistry.register(createFindSafeRetreatSkill());
    // World utils
    this.skillRegistry.register(createScanEntitiesSkill());
    this.skillRegistry.register(createCheckHealthSkill());
    this.skillRegistry.register(createLookForItemSkill());
    this.skillRegistry.register(createFindBlockSkill());
  }

  private registerCommands(): void {
    for (const cmd of [...actionCommands, ...queryCommands, ...controlCommands]) {
      this.commandRegistry.register(cmd);
    }
  }

  start(tickRate: number = 300): void {
    this.modeController.start(tickRate);
    this.tickInterval = setInterval(() => this.tick(tickRate), tickRate);
    this.logger.info('Agent started');
  }

  stop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.modeController.stop();
    this.selfPrompter.stop();
    this.logger.info('Agent stopped');
  }

  private tick(delta: number): void {
    this.selfPrompter.update(delta);
  }

  setGoal(name: string, description: string, commands?: string[]): void {
    this.goalManager.create('SELF_PROMPTER', { name, description, type: 'SELF_PROMPTER', commands });
    this.selfPrompter.start(description);
  }

  executeCommand(name: string, rawParams: string): Promise<string> {
    return this.commandRegistry.execute(name, rawParams, {
      bot: this.bot,
      world: this.generateWorldState(),
      skillRegistry: this.skillRegistry,
      modeController: this.modeController,
    });
  }

  getGoalManager(): GoalManager {
    return this.goalManager;
  }

  getModeController(): ModeController {
    return this.modeController;
  }

  getSelfPrompter(): SelfPrompter {
    return this.selfPrompter;
  }

  private generateWorldState(): WorldState {
    const bot: any = this.bot;
    const pos = bot.entity.position;
    const entities: any[] = Object.values(bot.entities || {});
    const nearby: any[] = entities
      .filter((e: any) => e.type === 'mob')
      .map((e: any) => ({
        type: e.name,
        distance: pos.distanceTo(e.position),
      }));

    return {
      time: {
        timeOfDay: bot.time?.timeOfDay ?? 0,
        isDaytime: (bot.time?.timeOfDay ?? 0) < 13000,
      },
      weather: bot.weather ?? 'clear',
      nearbyEntities: nearby,
      nearbyBlocks: this.getNearbyBlockTypes(),
      lightLevel: this.getLightLevel(),
    };
  }

  private getNearbyBlockTypes(): string[] {
    const pos = this.bot.entity.position;
    const blocks = new Set<string>();
    for (let dx = -4; dx <= 4; dx++) {
      for (let dy = -2; dy <= 3; dy++) {
        for (let dz = -4; dz <= 4; dz++) {
          const block = this.bot.blockAt(pos.offset(dx, dy, dz));
          if (block && block.name !== 'air') {
            blocks.add(block.name);
          }
        }
      }
    }
    return Array.from(blocks);
  }

  private getLightLevel(): number {
    const bot: any = this.bot;
    const pos = bot.entity.position;
    const block = bot.blockAt(pos);
    return block?.light?.blockLight ?? 0;
  }
}
