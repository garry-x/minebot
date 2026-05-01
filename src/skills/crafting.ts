import { Skill, SkillContext } from "./skill.js";
import { Pathfinder } from "../movement/pathfinding.js";
import { Vec3, vec3, distance } from "../utils/vec3.js";
import type { WorldState } from "../world/world-state.js";

const WORKBENCH_SCAN_RADIUS = 32;

enum CraftingState {
  COLLECT,
  RECIPE,
  PATH,
  CRAFT,
  VERIFY,
}

const CRAFT_PRIORITIES = [
  { name: "minecraft:wooden_pickaxe", count: 1 },
  { name: "minecraft:crafting_table", count: 1 },
  { name: "minecraft:stone_pickaxe", count: 1 },
  { name: "minecraft:iron_pickaxe", count: 1 },
  { name: "minecraft:diamond_pickaxe", count: 1 },
];

let rawRecipes: any[] = [];
const recipeMap = new Map<string, any>();

export function storeRecipes(recipes: any[]): void {
  rawRecipes = recipes;
}

function ensureRecipeMap(world: WorldState): void {
  if (recipeMap.size > 0 || rawRecipes.length === 0) return;

  for (const recipe of rawRecipes) {
    const outputs = recipe.output || recipe.result || [];
    const output = outputs[0];
    if (!output || output.network_id == null) continue;

    const name = world.getItemName(output.network_id);
    if (name) {
      recipeMap.set(name, recipe);
    }
  }
}

export class CraftingSkill extends Skill {
  private state = CraftingState.COLLECT;
  private currentRecipe: any = null;
  private targetWorkbench: Vec3 | null = null;
  private path: { x: number; y: number; z: number }[] = [];
  private pathIndex = 0;
  private craftTimer = 0;
  private needsWorkbench = false;
  private targetItemName = "";

  constructor() {
    super("crafting", 8);
  }

  async enter(ctx: SkillContext): Promise<void> {
    ctx.logger.info("Entering CRAFTING state");
    this.state = CraftingState.COLLECT;
    this.currentRecipe = null;
    this.targetWorkbench = null;
    this.path = [];
    this.craftTimer = 0;
    this.needsWorkbench = false;
    this.targetItemName = "";
  }

  async tick(ctx: SkillContext): Promise<string | null> {
    const pos = ctx.world.getPlayerPosition();

    switch (this.state) {
      case CraftingState.COLLECT: {
        for (const priority of CRAFT_PRIORITIES) {
          const have = ctx.inventory.countItem(priority.name);
          if (have < priority.count) {
            this.targetItemName = priority.name;
            this.state = CraftingState.RECIPE;
            ctx.logger.info(
              `Need to craft: ${priority.name} (have ${have}, need ${priority.count})`
            );
            break;
          }
        }
        if (this.state === CraftingState.COLLECT) {
          ctx.logger.debug("Nothing to craft, returning to idle");
          return "idle";
        }
        break;
      }

      case CraftingState.RECIPE: {
        ensureRecipeMap(ctx.world);

        const recipe = recipeMap.get(this.targetItemName);
        if (!recipe) {
          ctx.logger.warn(`No recipe found for: ${this.targetItemName}`);
          return "gathering";
        }

        this.currentRecipe = recipe;

        const ingredients = recipe.ingredients || recipe.input || [];
        let hasAll = true;
        for (const ing of ingredients) {
          if (!ing || ing.network_id == null || ing.network_id === -1) continue;
          const needed = ing.count ?? 1;
          const name = ctx.world.getItemName(ing.network_id);
          if (!name) continue;
          const have = ctx.inventory.countItem(name);
          if (have < needed) {
            hasAll = false;
            ctx.logger.debug(
              `Missing ingredient: ${name} (need ${needed}, have ${have})`
            );
            break;
          }
        }

        if (!hasAll) {
          ctx.logger.info("Missing ingredients, transitioning to gathering");
          return "gathering";
        }

        const totalInputs = ingredients.length;
        const shapeW = recipe.width ?? 0;
        const shapeH = recipe.height ?? 0;
        this.needsWorkbench = shapeW > 2 || shapeH > 2 || totalInputs > 4;

        ctx.logger.info(
          { needsWorkbench: this.needsWorkbench },
          "Recipe found, have all ingredients"
        );
        this.state = CraftingState.PATH;
        break;
      }

      case CraftingState.PATH: {
        if (!this.needsWorkbench) {
          ctx.logger.info("Simple recipe (2x2 inventory craft), skipping to craft");
          this.state = CraftingState.CRAFT;
          break;
        }

        const workbenches = ctx.world.findBlocks(
          (block: any) => block.name === "minecraft:crafting_table",
          pos,
          WORKBENCH_SCAN_RADIUS
        );

        if (workbenches.length > 0) {
          this.targetWorkbench = workbenches.reduce((a, b) =>
            distance(pos, a) < distance(pos, b) ? a : b
          );
          ctx.logger.info(
            { pos: this.targetWorkbench },
            "Crafting table found, pathing to it"
          );

          const start = vec3(
            Math.floor(pos.x),
            Math.floor(pos.y),
            Math.floor(pos.z)
          );
          const end = vec3(
            Math.floor(this.targetWorkbench.x),
            Math.floor(this.targetWorkbench.y),
            Math.floor(this.targetWorkbench.z)
          );

          const pf = new Pathfinder((p) => !ctx.world.isBlockSolid(p));
          const result = pf.findPath(start, end);

          if (result.length > 0) {
            this.path = result.map((n) => ({ x: n.x, y: n.y, z: n.z }));
            this.pathIndex = 0;
            this.state = CraftingState.CRAFT;
          } else {
            ctx.logger.warn("No path to crafting table");
            return "idle";
          }
        } else {
          ctx.logger.info("No crafting table found — crafting one first");
          this.targetItemName = "minecraft:crafting_table";
          this.needsWorkbench = false;
          this.state = CraftingState.RECIPE;
        }
        break;
      }

      case CraftingState.CRAFT: {
        if (
          this.needsWorkbench &&
          this.targetWorkbench &&
          this.pathIndex < this.path.length
        ) {
          const waypoint = this.path[this.pathIndex];
          ctx.movement.lookAt(
            vec3(waypoint.x, waypoint.y + 1.6, waypoint.z)
          );
          ctx.movement.setPosition(
            waypoint.x + 0.5,
            waypoint.y,
            waypoint.z + 0.5
          );

          const wpDist = distance(
            pos,
            vec3(waypoint.x, waypoint.y, waypoint.z)
          );
          if (wpDist < 1.5) {
            this.pathIndex++;
          }
          break;
        }

        if (this.craftTimer === 0) {
          const recipe = this.currentRecipe;
          const windowId = this.needsWorkbench
            ? "crafting_table"
            : "inventory";
          const recipeId = recipe.recipe_id ?? recipe.uuid ?? "";

          ctx.logger.info(
            { item: this.targetItemName, window: windowId },
            "Crafting..."
          );

          ctx.movement.craftRecipe(windowId, recipeId);
          this.craftTimer = 1;
        }

        this.craftTimer++;
        if (this.craftTimer > 10) {
          this.craftTimer = 0;
          this.state = CraftingState.VERIFY;
        }
        break;
      }

      case CraftingState.VERIFY: {
        const have = ctx.inventory.countItem(this.targetItemName);
        if (have > 0) {
          ctx.logger.info(
            { item: this.targetItemName, count: have },
            "Crafted successfully!"
          );
          this.state = CraftingState.COLLECT;
        } else {
          ctx.logger.warn(
            `Crafting ${this.targetItemName} may have failed, returning to idle`
          );
          return "idle";
        }
        break;
      }
    }

    return null;
  }

  async exit(ctx: SkillContext): Promise<void> {
    ctx.logger.info("Exiting CRAFTING state");
  }
}
