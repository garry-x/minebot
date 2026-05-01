import { Skill, SkillContext } from "./skill.js";
import { vec3 } from "../utils/vec3.js";

const WANDER_INTERVAL = 60;
const HOSTILE_SCAN_RADIUS = 30;
const EAT_TIMEOUT = 30;

const FOOD_ITEMS = [
  "minecraft:cooked_beef", "minecraft:cooked_porkchop",
  "minecraft:golden_apple", "minecraft:golden_carrot",
  "minecraft:cooked_mutton", "minecraft:cooked_chicken",
  "minecraft:cooked_rabbit", "minecraft:cooked_cod",
  "minecraft:cooked_salmon", "minecraft:beef",
  "minecraft:porkchop", "minecraft:mutton",
  "minecraft:chicken", "minecraft:rabbit",
  "minecraft:bread", "minecraft:carrot",
  "minecraft:potato", "minecraft:baked_potato",
  "minecraft:apple", "minecraft:melon_slice",
  "minecraft:beetroot", "minecraft:sweet_berries",
  "minecraft:rotten_flesh",
];

type EatingState = "idle" | "selecting" | "eating" | "finishing";

export class IdleSkill extends Skill {
  private wanderTimer = 0;
  private eatingState: EatingState = "idle";
  private eatingTimer = 0;
  private foodSlot = -1;

  constructor() {
    super("idle", 0);
  }

  async enter(ctx: SkillContext): Promise<void> {
    ctx.logger.info("Entering IDLE state");
    this.wanderTimer = 0;
    this.eatingState = "idle";
    this.eatingTimer = 0;
    this.foodSlot = -1;
  }

  async tick(ctx: SkillContext): Promise<string | null> {
    const pos = ctx.world.getPlayerPosition();
    const hostiles = ctx.world.getNearbyEntities(pos, HOSTILE_SCAN_RADIUS)
      .filter((e) => e.isHostile);
    if (hostiles.length > 0) {
      ctx.logger.warn({ count: hostiles.length }, "Hostile mobs detected, switching to combat");
      return "combat";
    }

    if (ctx.hunger.shouldEat() && this.eatingState === "idle") {
      for (const food of FOOD_ITEMS) {
        const slot = ctx.inventory.findHotbarItem(food);
        if (slot !== -1) {
          this.foodSlot = slot;
          this.eatingState = "selecting";
          ctx.logger.info({ food, slot }, "Auto-eating");
          break;
        }
      }
    }

    if (this.eatingState !== "idle") {
      this.tickEating(ctx);
      return null;
    }

    this.wanderTimer++;
    if (this.wanderTimer >= WANDER_INTERVAL) {
      this.wanderTimer = 0;
      const pos = ctx.world.getPlayerPosition();
      const target = vec3(
        pos.x + (Math.random() - 0.5) * 20,
        pos.y,
        pos.z + (Math.random() - 0.5) * 20
      );
      ctx.movement.lookAt(target);
      ctx.movement.setPosition(target.x, target.y, target.z);
      ctx.logger.debug({ target }, "Wandering");
    }

    return null;
  }

  private tickEating(ctx: SkillContext): void {
    switch (this.eatingState) {
      case "selecting":
        ctx.movement.selectHotbarSlot(this.foodSlot);
        this.eatingState = "eating";
        this.eatingTimer = 0;
        break;
      case "eating":
        if (this.eatingTimer === 0) {
          ctx.movement.startEating(this.foodSlot);
        }
        this.eatingTimer++;
        if (this.eatingTimer >= EAT_TIMEOUT) {
          ctx.movement.stopEating(this.foodSlot);
          this.eatingState = "idle";
          this.foodSlot = -1;
        }
        break;
    }
  }

  async exit(ctx: SkillContext): Promise<void> {
    ctx.logger.info("Exiting IDLE state");
  }
}
