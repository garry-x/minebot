import { Skill, SkillContext } from "./skill.js";
import { Pathfinder } from "../movement/pathfinding.js";
import { TraversalContext } from "../movement/pathfinding-types.js";
import { Vec3, vec3, floor, distance } from "../utils/vec3.js";

interface BuildBlock {
  pos: Vec3;
  blockType: number;
}

interface BuildPlan {
  blocks: BuildBlock[];
  name: string;
}

const BUILD_REACH = 5;

enum BuildState {
  SELECTING,
  PATHING,
  PLACING,
}

export class BuildingSkill extends Skill {
  private state = BuildState.SELECTING;
  private plan: BuildPlan | null = null;
  private planIndex = 0;
  private path: Vec3[] = [];
  private pathIndex = 0;

  constructor() {
    super("building", 6);
  }

  async enter(ctx: SkillContext): Promise<void> {
    ctx.logger.info("Entering BUILDING state");
    this.state = BuildState.SELECTING;
    this.plan = null;
    this.planIndex = 0;
  }

  async tick(ctx: SkillContext): Promise<string | null> {
    const pos = ctx.world.getPlayerPosition();
    const movement = ctx.movement;
    const world = ctx.world;

    if (!this.plan) {
      ctx.logger.info("No build plan, returning to IDLE");
      return "idle";
    }

    switch (this.state) {
      case BuildState.SELECTING: {
        if (this.plan && this.plan.blocks.length > 0) {
          this.planIndex = 0;
          this.state = BuildState.PATHING;
          ctx.logger.info({ count: this.plan.blocks.length }, "Build plan ready");
        } else {
          return "idle";
        }
        break;
      }

      case BuildState.PATHING: {
        if (this.planIndex >= this.plan.blocks.length) {
          ctx.logger.info("Build complete");
          return "idle";
        }
        const target = this.plan.blocks[this.planIndex].pos;
        const dist = distance(pos, target);
        if (dist <= BUILD_REACH) {
          this.state = BuildState.PLACING;
          break;
        }
        const tctx: TraversalContext = {
          isBlockSolid: (p) => world.isBlockSolid(p),
          isWaterBlock: (p) => world.isWaterBlock(p),
          isWaterSurface: (p) => world.isWaterSurface(p),
          isClimbable: (p) => world.isClimbable(p),
          isMineable: (p) => world.isMineable(p),
          isDoor: (p) => world.isDoor(p),
        };
        const pf = new Pathfinder(tctx, 10000, (nodes, duration, failed) => {
          ctx.metrics?.recordPathfinding(nodes, duration, failed);
          ctx.circuitBreaker?.recordResult(failed);
        }, ctx.circuitBreaker);
        const result = pf.findPath(floor(pos), floor(target));
        if (result.length > 0) {
          this.path = result.map((n) => ({ x: n.x, y: n.y, z: n.z }));
          this.pathIndex = 0;
        }
        this.state = BuildState.PLACING;
        break;
      }

      case BuildState.PLACING: {
        if (this.planIndex >= this.plan.blocks.length) {
          return "idle";
        }
        const block = this.plan.blocks[this.planIndex];
        const dist = distance(pos, block.pos);

        if (dist <= BUILD_REACH) {
          movement.lookAt(block.pos);
          const against = vec3(block.pos.x, block.pos.y - 1, block.pos.z);
          const hotbarSlot = ctx.inventory.getSelectedSlot();
          movement.clickBlock(against, 1, hotbarSlot);
          ctx.logger.info({ pos: block.pos }, "Placed block");
          this.planIndex++;
        } else if (this.pathIndex < this.path.length) {
          const wp = this.path[this.pathIndex];
          movement.setPosition(wp.x, wp.y, wp.z);
          if (distance(pos, wp) < 1.5) this.pathIndex++;
        } else {
          this.planIndex++;
        }
        break;
      }
    }

    return null;
  }

  setPlan(plan: BuildPlan): void {
    this.plan = plan;
    this.planIndex = 0;
  }

  getCurrentPlan(): BuildPlan | null {
    return this.plan;
  }

  async exit(ctx: SkillContext): Promise<void> {
    ctx.logger.info("Exiting BUILDING state");
  }
}
