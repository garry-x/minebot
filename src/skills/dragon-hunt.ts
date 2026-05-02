import { Skill, SkillContext } from "./skill.js";
import { vec3, distance, floor } from "../utils/vec3.js";
import { Pathfinder } from "../movement/pathfinding.js";
import type { EntityInfo } from "../world/types.js";

enum DragonState {
  FIND_CRYSTALS,
  PATH_TO_CRYSTAL,
  DESTROY_CRYSTAL,
  ATTACK_DRAGON,
  WAIT,
}

export class EnderDragonHuntSkill extends Skill {
  private state = DragonState.FIND_CRYSTALS;
  private targetCrystal: EntityInfo | null = null;
  private dragonId: bigint | null = null;
  private attackCooldown = 0;
  private path: { x: number; y: number; z: number }[] = [];
  private pathIndex = 0;

  constructor() {
    super("dragon_hunt", 9);
  }

  async enter(ctx: SkillContext): Promise<void> {
    ctx.logger.info("Entering ENDER DRAGON HUNT");
    this.state = DragonState.FIND_CRYSTALS;
    this.targetCrystal = null;
    this.attackCooldown = 0;
    const entities = ctx.world.getEntities();
    const dragon = entities.find((e) => e.type === "ender_dragon");
    if (dragon) this.dragonId = dragon.runtimeId;
  }

  async tick(ctx: SkillContext): Promise<string | null> {
    const pos = ctx.world.getPlayerPosition();
    const movement = ctx.movement;

    if (this.attackCooldown > 0) {
      this.attackCooldown--;
    }

    if (!this.dragonId) {
      const entities = ctx.world.getEntities();
      const dragon = entities.find((e) => e.type === "ender_dragon");
      if (dragon) {
        this.dragonId = dragon.runtimeId;
        ctx.logger.info({ id: this.dragonId }, "Found dragon");
      }
    }

    switch (this.state) {
      case DragonState.FIND_CRYSTALS: {
        const crystals = ctx.world.getNearbyEntities(pos, 100)
          .filter((e) => e.type === "ender_crystal");
        if (crystals.length > 0) {
          this.targetCrystal = crystals.reduce((a, b) =>
            distance(pos, a.position) < distance(pos, b.position) ? a : b
          );
          ctx.logger.info({ pos: this.targetCrystal.position }, "Targeting crystal");
          this.state = DragonState.PATH_TO_CRYSTAL;
        } else {
          ctx.logger.info("All crystals destroyed, attacking dragon");
          this.state = DragonState.ATTACK_DRAGON;
        }
        break;
      }

      case DragonState.PATH_TO_CRYSTAL: {
        if (!this.targetCrystal) {
          this.state = DragonState.FIND_CRYSTALS;
          break;
        }
        const crystalPos = this.targetCrystal.position;
        const dist = distance(pos, crystalPos);
        if (dist <= 4 && this.attackCooldown <= 0) {
          this.state = DragonState.DESTROY_CRYSTAL;
          break;
        }
        const pf = new Pathfinder((p) => ctx.world.isBlockSolid(floor(p)) ? false : true);
        const result = pf.findPath(floor(pos), floor(crystalPos));
        if (result.length > 0) {
          this.path = result.map((n) => ({ x: n.x, y: n.y, z: n.z }));
          this.pathIndex = 0;
        }
        if (this.pathIndex < this.path.length) {
          const wp = this.path[this.pathIndex];
          movement.lookAt(vec3(wp.x, wp.y, wp.z));
          movement.setPosition(wp.x, wp.y, wp.z);
          if (distance(pos, wp) < 1.5) this.pathIndex++;
        }
        break;
      }

      case DragonState.DESTROY_CRYSTAL: {
        if (!this.targetCrystal) {
          this.state = DragonState.FIND_CRYSTALS;
          break;
        }
        movement.lookAt(this.targetCrystal.position);
        movement.attack(this.targetCrystal.runtimeId);
        movement.swingArm();
        ctx.logger.info("Destroying crystal");
        this.attackCooldown = 15;
        this.targetCrystal = null;
        this.state = DragonState.WAIT;
        break;
      }

      case DragonState.ATTACK_DRAGON: {
        if (!this.dragonId) {
          this.state = DragonState.FIND_CRYSTALS;
          break;
        }
        if (this.attackCooldown > 0) break;
        const entities = ctx.world.getEntities();
        const dragon = entities.find((e) => e.type === "ender_dragon");
        if (dragon) {
          movement.lookAt(dragon.position);
          movement.attack(this.dragonId);
          movement.swingArm();
          ctx.logger.info("Attacking dragon");
          this.attackCooldown = 10;
        } else {
          this.state = DragonState.FIND_CRYSTALS;
        }
        break;
      }

      case DragonState.WAIT: {
        if (this.attackCooldown <= 0) {
          this.state = DragonState.FIND_CRYSTALS;
        }
        break;
      }
    }

    return null;
  }

  async exit(ctx: SkillContext): Promise<void> {
    ctx.logger.info("Exiting ENDER DRAGON HUNT");
  }
}
