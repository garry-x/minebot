import { Skill, SkillContext } from "./skill.js";
import { Pathfinder } from "../movement/pathfinding.js";
import { Vec3, vec3, distance } from "../utils/vec3.js";
import type { EntityInfo } from "../world/types.js";

const SCAN_RADIUS = 32;
const ATTACK_RANGE = 2.5;
const ATTACK_COOLDOWN = 10;
const FLEE_DISTANCE = 15;
const FLEE_SAFE_RADIUS = 32;

enum CombatState {
  FIND,
  PATH,
  ATTACK,
  FLEE,
}

export class CombatSkill extends Skill {
  private state = CombatState.FIND;
  private targetEntity: EntityInfo | null = null;
  private path: { x: number; y: number; z: number }[] = [];
  private pathIndex = 0;
  private attackDelay = 0;
  private health = 20;
  private maxHealth = 20;
  private onHealthChange: ((payload: { health: number; maxHealth: number }) => void) | null = null;

  constructor() {
    super("combat", 10);
  }

  async enter(ctx: SkillContext): Promise<void> {
    ctx.logger.info("Entering COMBAT state");
    this.state = CombatState.FIND;
    this.targetEntity = null;
    this.path = [];
    this.attackDelay = 0;

    this.onHealthChange = (payload) => {
      this.health = payload.health;
      this.maxHealth = payload.maxHealth;
    };
    ctx.events.on("health_change", this.onHealthChange);
  }

  async tick(ctx: SkillContext): Promise<string | null> {
    const pos = ctx.world.getPlayerPosition();
    const movement = ctx.movement;
    const world = ctx.world;

    if (this.attackDelay > 0) {
      this.attackDelay--;
      return null;
    }

    switch (this.state) {
      case CombatState.FIND: {
        const hostiles = world.getNearbyEntities(pos, SCAN_RADIUS)
          .filter((e) => e.isHostile);

        if (hostiles.length > 0) {
          this.targetEntity = hostiles.reduce((a, b) =>
            distance(pos, a.position) < distance(pos, b.position) ? a : b
          );
          ctx.logger.info({ entity: this.targetEntity.type, pos: this.targetEntity.position }, "Hostile found, pathing to target");
          this.state = CombatState.PATH;
        } else {
          ctx.logger.debug("No hostiles in range, returning to idle");
          return "idle";
        }
        break;
      }

      case CombatState.PATH: {
        if (!this.targetEntity) {
          this.state = CombatState.FIND;
          break;
        }

        const targetPos = this.targetEntity.position;
        const distToTarget = distance(pos, targetPos);

        if (distToTarget <= ATTACK_RANGE) {
          this.state = CombatState.ATTACK;
          ctx.logger.info("In attack range of target");
          break;
        }

        const start = vec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z));
        const end = vec3(
          Math.floor(targetPos.x),
          Math.floor(targetPos.y),
          Math.floor(targetPos.z)
        );

        const pf = new Pathfinder((p) => !world.isBlockSolid(p), 10000, (nodes, duration, failed) => {
          ctx.metrics?.recordPathfinding(nodes, duration, failed);
          ctx.circuitBreaker?.recordResult(failed);
        }, ctx.circuitBreaker);
        const result = pf.findPath(start, end);

        if (result.length > 0) {
          this.path = result.map((n) => ({ x: n.x, y: n.y, z: n.z }));
          this.pathIndex = 0;
        }

        if (this.pathIndex < this.path.length) {
          const waypoint = this.path[this.pathIndex];
          movement.lookAt(vec3(waypoint.x, waypoint.y + 1.6, waypoint.z));
          movement.setPosition(waypoint.x + 0.5, waypoint.y, waypoint.z + 0.5);

          const wpDist = distance(pos, vec3(waypoint.x, waypoint.y, waypoint.z));
          if (wpDist < 1.5) {
            this.pathIndex++;
          }
        }
        break;
      }

      case CombatState.ATTACK: {
        if (!this.targetEntity) {
          this.state = CombatState.FIND;
          break;
        }

        if (this.health / this.maxHealth < 0.2) {
          ctx.logger.warn({ health: this.health }, "Low health, fleeing!");
          this.state = CombatState.FLEE;
          break;
        }

        const entityStillExists = world.getEntities().some(
          (e) => e.runtimeId === this.targetEntity!.runtimeId
        );

        if (!entityStillExists) {
          ctx.logger.info("Target eliminated");
          this.targetEntity = null;
          this.state = CombatState.FIND;
          break;
        }

        movement.lookAt(this.targetEntity.position);
        movement.attack(this.targetEntity.runtimeId);
        this.attackDelay = ATTACK_COOLDOWN;
        break;
      }

      case CombatState.FLEE: {
        const hostiles = world.getNearbyEntities(pos, FLEE_SAFE_RADIUS)
          .filter((e) => e.isHostile);

        if (hostiles.length === 0) {
          ctx.logger.info("Safe, returning to idle");
          this.targetEntity = null;
          return "idle";
        }

        const nearestHostile = hostiles.reduce((a, b) =>
          distance(pos, a.position) < distance(pos, b.position) ? a : b
        );

        const dx = pos.x - nearestHostile.position.x;
        const dy = pos.y - nearestHostile.position.y;
        const dz = pos.z - nearestHostile.position.z;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

        const fleeTarget = vec3(
          pos.x + (dx / len) * FLEE_DISTANCE,
          pos.y + (dy / len) * FLEE_DISTANCE,
          pos.z + (dz / len) * FLEE_DISTANCE
        );

        movement.startSprinting();

        const start = vec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z));
        const end = vec3(
          Math.floor(fleeTarget.x),
          Math.floor(fleeTarget.y),
          Math.floor(fleeTarget.z)
        );

        const pf = new Pathfinder((p) => !world.isBlockSolid(p), 10000, (nodes, duration, failed) => {
          ctx.metrics?.recordPathfinding(nodes, duration, failed);
          ctx.circuitBreaker?.recordResult(failed);
        }, ctx.circuitBreaker);
        const result = pf.findPath(start, end);

        if (result.length > 0) {
          movement.lookAt(vec3(result[0].x, result[0].y + 1.6, result[0].z));
          movement.setPosition(result[0].x + 0.5, result[0].y, result[0].z + 0.5);
        } else {
          movement.lookAt(fleeTarget);
          movement.setPosition(fleeTarget.x, fleeTarget.y, fleeTarget.z);
        }
        break;
      }
    }

    return null;
  }

  async exit(ctx: SkillContext): Promise<void> {
    if (this.onHealthChange) {
      ctx.events.off("health_change", this.onHealthChange);
      this.onHealthChange = null;
    }
    ctx.movement.stopSprinting();
    ctx.logger.info("Exiting COMBAT state");
  }
}
