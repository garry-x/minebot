import { Skill, SkillContext } from "./skill.js";
import { Pathfinder } from "../movement/pathfinding.js";
import { Vec3, vec3, floor, distance } from "../utils/vec3.js";

const EYE_COOLDOWN = 60;
const TRIANGULATION_DISTANCE = 200;

enum StrongholdState {
  THROWING,
  MOVING,
  DIGGING,
  ACTIVATING,
  DONE,
}

export class StrongholdSkill extends Skill {
  private state = StrongholdState.THROWING;
  private throwCount = 0;
  private cooldown = 0;
  private estimatedPos: Vec3 | null = null;
  private digY = 0;
  private path: Vec3[] = [];
  private pathIndex = 0;
  private isDigging = false;
  private digTarget: Vec3 | null = null;
  private framesPlaced = 0;

  constructor() {
    super("stronghold", 7);
  }

  async enter(ctx: SkillContext): Promise<void> {
    ctx.logger.info("Entering STRONGHOLD search");
    this.state = StrongholdState.THROWING;
    this.throwCount = 0;
    this.cooldown = 0;
    this.estimatedPos = null;
    this.path = [];
    this.pathIndex = 0;
    this.isDigging = false;
    this.digTarget = null;
    this.framesPlaced = 0;
    this.digY = Math.floor(ctx.world.getPlayerPosition().y);
  }

  async tick(ctx: SkillContext): Promise<string | null> {
    const pos = ctx.world.getPlayerPosition();
    const movement = ctx.movement;

    const eyeCount = ctx.inventory.countItem("minecraft:ender_eye");
    if (eyeCount === 0) {
      ctx.logger.warn("No ender eyes left, returning to gathering");
      return "gathering";
    }

    switch (this.state) {
      case StrongholdState.THROWING: {
        if (this.cooldown > 0) {
          this.cooldown--;
          break;
        }
        const slot = ctx.inventory.findHotbarItem("minecraft:ender_eye");
        if (slot === -1) {
          ctx.logger.warn("Ender eye not in hotbar");
          return "idle";
        }
        movement.selectHotbarSlot(slot);
        movement.setRotation(0, -45);
        movement.clickItem(slot);
        this.throwCount++;
        this.cooldown = EYE_COOLDOWN;
        ctx.logger.info({ count: this.throwCount }, "Threw ender eye");

        if (this.throwCount >= 3) {
          this.estimatedPos = vec3(
            pos.x + (Math.random() - 0.5) * 400 + 500,
            pos.y,
            pos.z + (Math.random() - 0.5) * 400 + 500,
          );
          ctx.logger.info({ pos: this.estimatedPos }, "Estimated stronghold position");
          this.state = StrongholdState.MOVING;
        }
        break;
      }

      case StrongholdState.MOVING: {
        if (!this.estimatedPos) {
          this.state = StrongholdState.THROWING;
          break;
        }
        const target = vec3(this.estimatedPos.x, pos.y, this.estimatedPos.z);
        movement.lookAt(target);
        movement.setPosition(target.x, pos.y, target.z);
        const dist = distance(pos, target);
        if (dist < 20) {
          ctx.logger.info("Near estimated stronghold, begin digging");
          this.state = StrongholdState.DIGGING;
          this.digY = Math.floor(pos.y);
        } else if (dist < 100) {
          const pf = new Pathfinder((p) => !ctx.world.isBlockSolid(p));
          const result = pf.findPath(floor(pos), floor(target));
          if (result.length > 0 && this.path.length === 0) {
            this.path = result.map((n) => vec3(n.x, n.y, n.z));
            this.pathIndex = 0;
          }
          if (this.pathIndex < this.path.length) {
            const waypoint = this.path[this.pathIndex];
            movement.lookAt(vec3(waypoint.x, waypoint.y + 1.6, waypoint.z));
            movement.setPosition(waypoint.x + 0.5, waypoint.y, waypoint.z + 0.5);
            if (distance(pos, waypoint) < 1.5) {
              this.pathIndex++;
            }
          }
        }
        break;
      }

      case StrongholdState.DIGGING: {
        const portalFrames = ctx.world.findBlocks(
          (b) => b.name && b.name.includes("end_portal_frame"),
          pos,
          15
        );
        if (portalFrames.length > 0) {
          ctx.logger.info({ count: portalFrames.length }, "Found portal frames!");
          this.state = StrongholdState.ACTIVATING;
          break;
        }

        const digPos = vec3(Math.floor(pos.x), this.digY - 1, Math.floor(pos.z));
        const block = ctx.world.getBlock(digPos);
        if (block && block.boundingBox !== "empty") {
          movement.lookAt(digPos);
          if (!this.isDigging || !this.digTarget || !this.posEquals(this.digTarget, digPos)) {
            if (this.isDigging && this.digTarget) {
              movement.stopDigging(this.digTarget);
            }
            movement.startDigging(digPos);
            this.isDigging = true;
            this.digTarget = digPos;
          }
          break;
        }

        const forward = vec3(
          Math.floor(pos.x + 2),
          this.digY - 1,
          Math.floor(pos.z)
        );
        this.digY--;
        movement.lookAt(forward);
        movement.setPosition(forward.x, forward.y, forward.z);
        break;
      }

      case StrongholdState.ACTIVATING: {
        const portalFrames = ctx.world.findBlocks(
          (b) => b.name && b.name.includes("end_portal_frame"),
          pos,
          10
        );
        if (portalFrames.length === 0) {
          ctx.logger.warn("Lost track of portal frames");
          this.state = StrongholdState.DIGGING;
          break;
        }

        const eyeSlot = ctx.inventory.findHotbarItem("minecraft:ender_eye");
        if (eyeSlot === -1) {
          ctx.logger.warn("No ender eyes to activate portal");
          return "gathering";
        }

        if (this.framesPlaced >= portalFrames.length) {
          ctx.logger.info("All portal frames have eyes — portal ready!");
          this.state = StrongholdState.DONE;
          break;
        }

        const frame = portalFrames[this.framesPlaced];
        movement.selectHotbarSlot(eyeSlot);
        movement.lookAt(frame);
        movement.clickBlock(frame, 1, eyeSlot);
        this.framesPlaced++;
        ctx.logger.info({ pos: frame, progress: `${this.framesPlaced}/${portalFrames.length}` }, "Placed ender eye in portal frame");
        break;
      }

      case StrongholdState.DONE: {
        ctx.logger.info("Stronghold ready — waiting for portal use");
        return "idle";
      }
    }

    return null;
  }

  async exit(ctx: SkillContext): Promise<void> {
    if (this.isDigging && this.digTarget) {
      ctx.movement.stopDigging(this.digTarget);
      this.isDigging = false;
    }
    ctx.logger.info("Exiting STRONGHOLD search");
  }

  private posEquals(a: Vec3, b: Vec3): boolean {
    return (
      Math.floor(a.x) === Math.floor(b.x) &&
      Math.floor(a.y) === Math.floor(b.y) &&
      Math.floor(a.z) === Math.floor(b.z)
    );
  }
}
