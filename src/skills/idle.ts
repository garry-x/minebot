import { Skill, SkillContext } from "./skill.js";
import { vec3 } from "../utils/vec3.js";

const WANDER_INTERVAL = 60;
const HOSTILE_SCAN_RADIUS = 30;

export class IdleSkill extends Skill {
  private wanderTimer = 0;

  constructor() {
    super("idle", 0);
  }

  async enter(ctx: SkillContext): Promise<void> {
    ctx.logger.info("Entering IDLE state");
    this.wanderTimer = 0;
  }

  async tick(ctx: SkillContext): Promise<string | null> {
    const pos = ctx.world.getPlayerPosition();
    const hostiles = ctx.world.getNearbyEntities(pos, HOSTILE_SCAN_RADIUS)
      .filter((e) => e.isHostile);
    if (hostiles.length > 0) {
      ctx.logger.warn({ count: hostiles.length }, "Hostile mobs detected, switching to combat");
      return "combat";
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

  async exit(ctx: SkillContext): Promise<void> {
    ctx.logger.info("Exiting IDLE state");
  }
}
