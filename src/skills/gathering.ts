import { Skill, SkillContext } from "./skill.js";
import { Pathfinder } from "../movement/pathfinding.js";
import { Vec3, vec3, distance } from "../utils/vec3.js";

const SCAN_RADIUS = 32;
const MINE_REACH = 4;

enum GatheringState {
  SCANNING,
  PATHING,
  MINING,
  COLLECTING,
}

export class GatheringSkill extends Skill {
  private state = GatheringState.SCANNING;
  private targetOre: Vec3 | null = null;
  private path: { x: number; y: number; z: number }[] = [];
  private pathIndex = 0;
  private mineProgress = 0;
  private isDigging = false;

  constructor() {
    super("gathering", 5);
  }

  async enter(ctx: SkillContext): Promise<void> {
    ctx.logger.info("Entering GATHERING state");
    this.state = GatheringState.SCANNING;
    this.targetOre = null;
    this.path = [];
    this.isDigging = false;
  }

  async tick(ctx: SkillContext): Promise<string | null> {
    const pos = ctx.world.getPlayerPosition();
    const movement = ctx.movement;
    const world = ctx.world;

    if (ctx.inventory.isFull()) {
      ctx.logger.info("Inventory full, returning to IDLE");
      return "idle";
    }

    switch (this.state) {
      case GatheringState.SCANNING: {
        const ores = world.findOres(pos, SCAN_RADIUS);
        if (ores.length > 0) {
          this.targetOre = ores.reduce((a, b) =>
            distance(pos, a) < distance(pos, b) ? a : b
          );
          ctx.logger.info({ pos: this.targetOre }, "Ore found, pathing...");
          this.state = GatheringState.PATHING;
        } else {
          ctx.logger.debug("No ores in range");
          return "idle";
        }
        break;
      }

      case GatheringState.PATHING: {
        if (!this.targetOre) {
          this.state = GatheringState.SCANNING;
          break;
        }
        const start = vec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z));
        const end = vec3(
          Math.floor(this.targetOre.x),
          Math.floor(this.targetOre.y),
          Math.floor(this.targetOre.z)
        );

        const pf = new Pathfinder((p) => !world.isBlockSolid(p), 10000, (nodes, duration, failed) => {
          ctx.metrics?.recordPathfinding(nodes, duration, failed);
        });
        const result = pf.findPath(start, end);

        if (result.length > 0) {
          this.path = result.map((n) => ({ x: n.x, y: n.y, z: n.z }));
          this.pathIndex = 0;
          ctx.logger.info({ length: this.path.length }, "Path found");
          this.state = GatheringState.MINING;
        } else {
          ctx.logger.warn("No path to ore, skipping");
          this.targetOre = null;
          this.state = GatheringState.SCANNING;
        }
        break;
      }

      case GatheringState.MINING: {
        if (!this.targetOre) {
          this.state = GatheringState.SCANNING;
          break;
        }

        const distToOre = distance(pos, this.targetOre);

        if (distToOre <= MINE_REACH) {
          movement.lookAt(this.targetOre);
          if (!this.isDigging) {
            movement.startDigging(this.targetOre);
            this.isDigging = true;
            ctx.logger.info("Mining ore...");
          }
          this.mineProgress++;
          if (this.mineProgress > 40) {
            movement.stopDigging(this.targetOre);
            this.isDigging = false;
            this.mineProgress = 0;
            ctx.logger.info("Ore mined!");
            this.targetOre = null;
            this.state = GatheringState.COLLECTING;
          }
        } else if (this.pathIndex < this.path.length) {
          const waypoint = this.path[this.pathIndex];
          movement.lookAt(vec3(waypoint.x, waypoint.y + 1.6, waypoint.z));
          movement.setPosition(waypoint.x + 0.5, waypoint.y, waypoint.z + 0.5);

          const wpDist = distance(pos, vec3(waypoint.x, waypoint.y, waypoint.z));
          if (wpDist < 1.5) {
            this.pathIndex++;
          }
        } else {
          this.state = GatheringState.SCANNING;
        }
        break;
      }

      case GatheringState.COLLECTING: {
        ctx.logger.debug("Waiting for items to drop...");
        this.state = GatheringState.SCANNING;
        break;
      }
    }

    return null;
  }

  async exit(ctx: SkillContext): Promise<void> {
    if (this.isDigging && this.targetOre) {
      ctx.movement.stopDigging(this.targetOre);
      this.isDigging = false;
    }
    ctx.logger.info("Exiting GATHERING state");
  }
}
