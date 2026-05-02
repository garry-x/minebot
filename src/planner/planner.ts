import { Goal, GoalType } from "./goals.js";
import type { SkillContext } from "../skills/skill.js";

const PHASE3_GOALS: Goal[] = [
  { type: GoalType.SURVIVE, priority: 100, prerequisites: [], skill: "combat", complete: false },
  { type: GoalType.DEFEAT_DRAGON, priority: 90, prerequisites: [GoalType.ENTER_END], skill: "dragon_hunt", complete: false },
  { type: GoalType.ENTER_END, priority: 80, prerequisites: [GoalType.ACTIVATE_PORTAL], skill: "idle", complete: false },
  { type: GoalType.ACTIVATE_PORTAL, priority: 70, prerequisites: [GoalType.FIND_STRONGHOLD, GoalType.CRAFT_ENDER_EYE], skill: "building", complete: false },
  { type: GoalType.FIND_STRONGHOLD, priority: 60, prerequisites: [GoalType.CRAFT_ENDER_EYE], skill: "gathering", complete: false },
  { type: GoalType.CRAFT_ENDER_EYE, priority: 50, prerequisites: [GoalType.GATHER_BLAZE, GoalType.GATHER_ENDER_PEARL], skill: "crafting", complete: false },
  { type: GoalType.GATHER_BLAZE, priority: 40, prerequisites: [], skill: "combat", complete: false },
  { type: GoalType.GATHER_ENDER_PEARL, priority: 40, prerequisites: [], skill: "combat", complete: false },
  { type: GoalType.GATHER_DIAMOND, priority: 35, prerequisites: [GoalType.CRAFT_TOOLS], skill: "gathering", complete: false },
  { type: GoalType.GATHER_IRON, priority: 30, prerequisites: [GoalType.CRAFT_TOOLS], skill: "gathering", complete: false },
  { type: GoalType.CRAFT_TOOLS, priority: 25, prerequisites: [GoalType.GATHER_WOOD, GoalType.GATHER_STONE], skill: "crafting", complete: false },
  { type: GoalType.GATHER_STONE, priority: 20, prerequisites: [], skill: "gathering", complete: false },
  { type: GoalType.GATHER_WOOD, priority: 10, prerequisites: [], skill: "gathering", complete: false },
  { type: GoalType.IDLE, priority: 0, prerequisites: [], skill: "idle", complete: false },
];

export class Planner {
  private goals: Goal[] = PHASE3_GOALS.map((g) => ({ ...g }));

  getNextGoal(ctx: SkillContext): Goal | null {
    for (const goal of this.goals) {
      if (goal.complete) continue;
      if (this.arePrerequisitesMet(goal)) {
        return goal;
      }
    }
    return this.goals.find((g) => g.type === GoalType.IDLE) ?? null;
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
    const goal = this.getNextGoal(ctx);
    return goal?.skill ?? "idle";
  }

  getAllGoals(): Goal[] {
    return [...this.goals];
  }
}
