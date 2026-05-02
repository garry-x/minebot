import { Goal, GoalType } from "./goals.js";
import type { SkillContext } from "../skills/skill.js";

const PHASE3_GOALS: Goal[] = [
  { type: GoalType.SURVIVE, priority: 100, prerequisites: [], skill: "idle", complete: false },
  { type: GoalType.DEFEAT_DRAGON, priority: 90, prerequisites: [GoalType.ENTER_END], skill: "dragon_hunt", complete: true },
  { type: GoalType.ENTER_END, priority: 80, prerequisites: [GoalType.ACTIVATE_PORTAL], skill: "idle", complete: true },
  { type: GoalType.ACTIVATE_PORTAL, priority: 70, prerequisites: [GoalType.FIND_STRONGHOLD, GoalType.CRAFT_ENDER_EYE], skill: "building", complete: true },
  { type: GoalType.FIND_STRONGHOLD, priority: 60, prerequisites: [GoalType.CRAFT_ENDER_EYE], skill: "gathering", complete: true },
  { type: GoalType.CRAFT_ENDER_EYE, priority: 50, prerequisites: [GoalType.GATHER_BLAZE, GoalType.GATHER_ENDER_PEARL], skill: "crafting", complete: true },
  { type: GoalType.GATHER_BLAZE, priority: 40, prerequisites: [], skill: "combat", complete: true },
  { type: GoalType.GATHER_ENDER_PEARL, priority: 40, prerequisites: [], skill: "combat", complete: true },
  { type: GoalType.GATHER_DIAMOND, priority: 35, prerequisites: [GoalType.CRAFT_TOOLS], skill: "gathering", complete: false },
  { type: GoalType.GATHER_IRON, priority: 30, prerequisites: [GoalType.CRAFT_TOOLS], skill: "gathering", complete: false },
  { type: GoalType.CRAFT_TOOLS, priority: 25, prerequisites: [GoalType.GATHER_WOOD, GoalType.GATHER_STONE], skill: "crafting", complete: false },
  { type: GoalType.GATHER_STONE, priority: 20, prerequisites: [], skill: "gathering", complete: false },
  { type: GoalType.GATHER_WOOD, priority: 10, prerequisites: [], skill: "gathering", complete: false },
  { type: GoalType.IDLE, priority: 0, prerequisites: [], skill: "idle", complete: false },
];

const WOOD_TYPES = ["minecraft:oak_log", "minecraft:spruce_log", "minecraft:birch_log", "minecraft:jungle_log", "minecraft:acacia_log", "minecraft:dark_oak_log", "minecraft:mangrove_log", "minecraft:cherry_log", "minecraft:oak_planks"];
const STONE_TYPES = ["minecraft:cobblestone", "minecraft:stone", "minecraft:andesite", "minecraft:diorite", "minecraft:granite", "minecraft:deepslate_cobbled"];
const IRON_ITEMS = ["minecraft:iron_ore", "minecraft:raw_iron", "minecraft:iron_ingot", "minecraft:deepslate_iron_ore"];
const DIAMOND_ITEMS = ["minecraft:diamond", "minecraft:diamond_ore", "minecraft:deepslate_diamond_ore"];
const PICKAXE_ITEMS = ["minecraft:wooden_pickaxe", "minecraft:stone_pickaxe", "minecraft:iron_pickaxe", "minecraft:diamond_pickaxe"];

function hasAny(ctx: SkillContext, items: string[], minCount = 1): boolean {
  for (const item of items) {
    if (ctx.inventory.countItem(item) >= minCount) return true;
  }
  return false;
}

function hasPickaxe(ctx: SkillContext): boolean {
  return hasAny(ctx, PICKAXE_ITEMS);
}

let gatherCooldownUntil = 0;

export function markGatherFailed(): void {
  gatherCooldownUntil = Date.now() + 15000;
}

export class Planner {
  private goals: Goal[] = PHASE3_GOALS.map((g) => ({ ...g }));

  getNextGoal(ctx: SkillContext): Goal | null {
    this.updateGoalCompletions(ctx);
    for (const goal of this.goals) {
      if (goal.complete) continue;
      if (this.arePrerequisitesMet(goal)) {
        return goal;
      }
    }
    return this.goals.find((g) => g.type === GoalType.IDLE) ?? null;
  }

  private updateGoalCompletions(ctx: SkillContext): void {
    const g = this.goals;
    const woodGoal = g.find(goal => goal.type === GoalType.GATHER_WOOD);
    if (woodGoal && !woodGoal.complete && hasAny(ctx, WOOD_TYPES, 4)) {
      woodGoal.complete = true;
    }
    const stoneGoal = g.find(goal => goal.type === GoalType.GATHER_STONE);
    if (stoneGoal && !stoneGoal.complete && hasAny(ctx, STONE_TYPES, 8)) {
      stoneGoal.complete = true;
    }
    const toolsGoal = g.find(goal => goal.type === GoalType.CRAFT_TOOLS);
    if (toolsGoal && !toolsGoal.complete && hasPickaxe(ctx)) {
      toolsGoal.complete = true;
    }
    const ironGoal = g.find(goal => goal.type === GoalType.GATHER_IRON);
    if (ironGoal && !ironGoal.complete && hasAny(ctx, IRON_ITEMS, 3)) {
      ironGoal.complete = true;
    }
    const diamondGoal = g.find(goal => goal.type === GoalType.GATHER_DIAMOND);
    if (diamondGoal && !diamondGoal.complete && hasAny(ctx, DIAMOND_ITEMS, 1)) {
      diamondGoal.complete = true;
    }
  }

  private arePrerequisitesMet(goal: Goal): boolean {
    return goal.prerequisites.every((pre) => {
      const prereqGoal = this.goals.find((g) => g.type === pre);
      return prereqGoal?.complete === true;
    });
  }

  markComplete(type: GoalType): void {
    const goal = this.goals.find((g) => g.type === type);
    if (goal) goal.complete = true;
  }

  getRecommendedSkill(ctx: SkillContext): string {
    this.updateGoalCompletions(ctx);
    for (const goal of this.goals) {
      if (goal.type === GoalType.SURVIVE) continue;
      if (goal.complete) continue;
      if (goal.skill === "gathering" && Date.now() < gatherCooldownUntil) continue;
      if (this.arePrerequisitesMet(goal)) {
        return goal.skill;
      }
    }
    return "idle";
  }

  getAllGoals(): Goal[] {
    return [...this.goals];
  }
}
