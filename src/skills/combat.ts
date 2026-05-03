import { Skill, SkillContext } from "./skill.js";
import { Pathfinder } from "../movement/pathfinding.js";
import { TraversalContext } from "../movement/pathfinding-types.js";
import { Vec3, vec3, distance } from "../utils/vec3.js";
import type { EntityInfo } from "../world/types.js";

const SCAN_RADIUS = 32;
const ATTACK_RANGE = 2.5;
const ATTACK_COOLDOWN = 10;
const FLEE_DISTANCE = 15;
const FLEE_SAFE_RADIUS = 32;
const CREEPER_SAFE_RANGE = 5;
const SKELETON_STRAFE_ANGLE = 30;
const PHANTOM_DETECT_RANGE = 50;
const WARDEN_AVOID_RANGE = 48;
const GHAST_DEFLECT_RANGE = 20;

enum CombatState {
  FIND,
  PATH,
  ATTACK,
  FLEE,
  STRAFE,
}

enum CombatStrategy {
  STANDARD,
  SIDESTEP,
  HIT_AND_RUN,
  RUSH,
  WARDEN_FLEE,
  LOOK_UP,
  DEFLECT,
  BREAK_CRYSTAL,
}

const STRATEGY_MAP: Record<string, CombatStrategy> = {
  "minecraft:skeleton": CombatStrategy.SIDESTEP,
  "minecraft:stray": CombatStrategy.SIDESTEP,
  "minecraft:wither_skeleton": CombatStrategy.SIDESTEP,
  "minecraft:creeper": CombatStrategy.HIT_AND_RUN,
  "minecraft:witch": CombatStrategy.RUSH,
  "minecraft:evoker": CombatStrategy.RUSH,
  "minecraft:phantom": CombatStrategy.LOOK_UP,
  "minecraft:ghast": CombatStrategy.DEFLECT,
  "minecraft:warden": CombatStrategy.WARDEN_FLEE,
  "minecraft:breeze": CombatStrategy.SIDESTEP,
  "minecraft:bogged": CombatStrategy.SIDESTEP,
  "minecraft:enderman": CombatStrategy.STANDARD,
  "minecraft:zombie": CombatStrategy.STANDARD,
  "minecraft:husk": CombatStrategy.STANDARD,
  "minecraft:drowned": CombatStrategy.STANDARD,
  "minecraft:zombie_villager": CombatStrategy.STANDARD,
  "minecraft:spider": CombatStrategy.STANDARD,
  "minecraft:cave_spider": CombatStrategy.STANDARD,
  "minecraft:slime": CombatStrategy.STANDARD,
  "minecraft:silverfish": CombatStrategy.STANDARD,
  "minecraft:endermite": CombatStrategy.STANDARD,
  "minecraft:blaze": CombatStrategy.SIDESTEP,
  "minecraft:magma_cube": CombatStrategy.STANDARD,
  "minecraft:guardian": CombatStrategy.STANDARD,
  "minecraft:elder_guardian": CombatStrategy.STANDARD,
  "minecraft:pillager": CombatStrategy.SIDESTEP,
  "minecraft:vindicator": CombatStrategy.STANDARD,
  "minecraft:vex": CombatStrategy.STANDARD,
  "minecraft:ravager": CombatStrategy.SIDESTEP,
  "minecraft:hoglin": CombatStrategy.STANDARD,
  "minecraft:zoglin": CombatStrategy.STANDARD,
  "minecraft:piglin_brute": CombatStrategy.STANDARD,
};

function getStrategy(type: string): CombatStrategy {
  return STRATEGY_MAP[type] ?? CombatStrategy.STANDARD;
}

class AttackTarget {
  entity: EntityInfo;
  strategy: CombatStrategy;
  strafeDir: number;
  strafeTimer: number;
  retreatTimer: number;
  lastHitTime: number;

  constructor(entity: EntityInfo) {
    this.entity = entity;
    this.strategy = getStrategy(entity.type);
    this.strafeDir = 0;
    this.strafeTimer = 0;
    this.retreatTimer = 0;
    this.lastHitTime = 0;
  }
}

export class CombatSkill extends Skill {
  private state = CombatState.FIND;
  private target: AttackTarget | null = null;
  private path: { x: number; y: number; z: number }[] = [];
  private pathIndex = 0;
  private attackDelay = 0;
  private health = 20;
  private maxHealth = 20;
  private onHealthChange: ((payload: { health: number; maxHealth: number }) => void) | null = null;
  private tickCounter = 0;

  constructor() {
    super("combat", 10);
  }

  async enter(ctx: SkillContext): Promise<void> {
    ctx.logger.info("Entering COMBAT state");
    this.state = CombatState.FIND;
    this.target = null;
    this.path = [];
    this.attackDelay = 0;
    this.tickCounter = 0;

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
    this.tickCounter++;

    if (this.attackDelay > 0) {
      this.attackDelay--;
    }

    switch (this.state) {
      case CombatState.FIND: {
        const allNearby = world.getNearbyEntities(pos, SCAN_RADIUS);
        const hostiles = allNearby.filter((e) => e.isHostile);

        if (hostiles.length === 0) {
          return "idle";
        }

        const nearest = hostiles.reduce((a, b) =>
          distance(pos, a.position) < distance(pos, b.position) ? a : b
        );

        this.target = new AttackTarget(nearest);
        ctx.logger.info({
          entity: nearest.type,
          strategy: CombatStrategy[this.target.strategy],
          pos: nearest.position,
        }, "Hostile found, engaging");
        this.state = CombatState.PATH;
        break;
      }

      case CombatState.PATH: {
        if (!this.target) {
          this.state = CombatState.FIND;
          break;
        }

        const entity = this._findLiveEntity(ctx, this.target.entity.runtimeId);
        if (!entity) {
          ctx.logger.info("Target eliminated or lost");
          this.target = null;
          this.state = CombatState.FIND;
          break;
        }
        this.target.entity = entity;

        const distToTarget = distance(pos, entity.position);
        const strategy = this.target.strategy;

        const effectiveRange = strategy === CombatStrategy.HIT_AND_RUN
          ? CREEPER_SAFE_RANGE - 0.5
          : ATTACK_RANGE;

        if (distToTarget <= effectiveRange) {
          this.state = CombatState.ATTACK;
          break;
        }

        if (this.path.length === 0 || this.tickCounter % 20 === 0) {
          const start = vec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z));
          const end = vec3(
            Math.floor(entity.position.x),
            Math.floor(entity.position.y),
            Math.floor(entity.position.z)
          );

          const tctx = this._makeTraversalContext(ctx);
          const pf = new Pathfinder(tctx, 10000, (nodes, duration, failed) => {
            ctx.metrics?.recordPathfinding(nodes, duration, failed);
            ctx.circuitBreaker?.recordResult(failed);
          }, ctx.circuitBreaker);
          const result = pf.findPath(start, end);

          if (result.length > 0) {
            this.path = result.map((n) => ({ x: n.x, y: n.y, z: n.z }));
            this.pathIndex = 0;
          } else {
            ctx.logger.warn("No path to target, retrying");
            this.path = [];
          }
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
        if (!this.target) {
          this.state = CombatState.FIND;
          break;
        }

        const entity = this._findLiveEntity(ctx, this.target.entity.runtimeId);
        if (!entity) {
          ctx.logger.info("Target eliminated");
          this.target = null;
          this.state = CombatState.FIND;
          break;
        }
        this.target.entity = entity;

        if (this.health / this.maxHealth < 0.2) {
          ctx.logger.warn({ health: this.health }, "Low health, fleeing!");
          this.state = CombatState.FLEE;
          break;
        }

        const dist = distance(pos, entity.position);
        const strategy = this.target.strategy;

        if (strategy === CombatStrategy.WARDEN_FLEE) {
          if (dist < WARDEN_AVOID_RANGE) {
            this._fleeFrom(ctx, pos, entity.position, FLEE_DISTANCE * 2);
          } else {
            return "idle";
          }
          break;
        }

        if (strategy === CombatStrategy.LOOK_UP) {
          movement.lookAt(entity.position);
          const targetRange = entity.type === "minecraft:phantom" ? ATTACK_RANGE : ATTACK_RANGE * 2;
          if (dist > targetRange) {
            this.state = CombatState.PATH;
            this.path = [];
          } else if (this.attackDelay <= 0) {
            movement.attack(entity.runtimeId, entity.position);
            this.attackDelay = ATTACK_COOLDOWN;
            ctx.logger.info({ type: entity.type }, "Attacking flying target");
          }
          break;
        }

        if (strategy === CombatStrategy.HIT_AND_RUN) {
          if (dist > CREEPER_SAFE_RANGE) {
            this.state = CombatState.PATH;
            this.path = [];
            break;
          }
          movement.lookAt(entity.position);
          if (this.attackDelay <= 0 && dist <= ATTACK_RANGE + 1) {
            movement.attack(entity.runtimeId, entity.position);
            this.attackDelay = ATTACK_COOLDOWN;
            this.target.retreatTimer = 8;
            ctx.logger.info({ type: entity.type }, "Hit creeper, retreating");
          }
          if (this.target.retreatTimer > 0) {
            this.target.retreatTimer--;
            this._retreatFrom(ctx, pos, entity.position, 3);
          }
          break;
        }

        if (strategy === CombatStrategy.RUSH) {
          if (dist > ATTACK_RANGE + 0.5) {
            movement.lookAt(entity.position);
            movement.setPosition(
              pos.x + (entity.position.x - pos.x) * 0.5,
              pos.y,
              pos.z + (entity.position.z - pos.z) * 0.5
            );
          } else if (this.attackDelay <= 0) {
            movement.lookAt(entity.position);
            movement.attack(entity.runtimeId, entity.position);
            this.attackDelay = Math.max(4, ATTACK_COOLDOWN - 4);
            ctx.logger.info({ type: entity.type }, "Rushing attack");
          }
          break;
        }

        if (strategy === CombatStrategy.SIDESTEP) {
          if (dist > ATTACK_RANGE + 0.5) {
            movement.lookAt(entity.position);
            if (this.target.strafeTimer <= 0) {
              this.target.strafeDir = (this.target.strafeDir === 0 ? 1 : -this.target.strafeDir) * (Math.random() > 0.5 ? 1 : -1) || 1;
              this.target.strafeTimer = 10;
            }
            this.target.strafeTimer--;
            const angle = this.target.strafeDir * SKELETON_STRAFE_ANGLE * (Math.PI / 180);
            const forwardX = entity.position.x - pos.x;
            const forwardZ = entity.position.z - pos.z;
            const fLen = Math.sqrt(forwardX * forwardX + forwardZ * forwardZ) || 1;
            const cosA = Math.cos(angle), sinA = Math.sin(angle);
            const sx = (forwardX / fLen) * cosA - (forwardZ / fLen) * sinA;
            const sz = (forwardX / fLen) * sinA + (forwardZ / fLen) * cosA;
            movement.setPosition(
              pos.x + sx * 0.4,
              pos.y,
              pos.z + sz * 0.4
            );
          } else if (this.attackDelay <= 0) {
            movement.lookAt(entity.position);
            movement.attack(entity.runtimeId, entity.position);
            this.attackDelay = ATTACK_COOLDOWN;
            ctx.logger.info({ type: entity.type, strategy: "sidestep" }, "Attack");
          }
          break;
        }

        if (strategy === CombatStrategy.DEFLECT) {
          movement.lookAt(entity.position);
          if (this.attackDelay <= 0 && dist < GHAST_DEFLECT_RANGE) {
            movement.attack(entity.runtimeId, entity.position);
            this.attackDelay = ATTACK_COOLDOWN;
            ctx.logger.info({ type: entity.type }, "Deflecting fireball / attacking ghast");
          }
          if (dist > ATTACK_RANGE * 3) {
            this.state = CombatState.PATH;
            this.path = [];
          }
          break;
        }

        {
          if (dist > ATTACK_RANGE) {
            this.state = CombatState.PATH;
            this.path = [];
            break;
          }

          movement.lookAt(entity.position);
          if (this.attackDelay <= 0) {
            movement.attack(entity.runtimeId, entity.position);
            this.attackDelay = ATTACK_COOLDOWN;
            ctx.logger.info({ type: entity.type }, "Attacking target");
          }
        }
        break;
      }

      case CombatState.FLEE: {
        const hostiles = world.getNearbyEntities(pos, FLEE_SAFE_RADIUS)
          .filter((e) => e.isHostile);

        if (hostiles.length === 0) {
          ctx.logger.info("Safe, returning to idle");
          this.target = null;
          return "idle";
        }

        const nearestHostile = hostiles.reduce((a, b) =>
          distance(pos, a.position) < distance(pos, b.position) ? a : b
        );

        this._fleeFrom(ctx, pos, nearestHostile.position, FLEE_DISTANCE);
        break;
      }
    }

    return null;
  }

  private _findLiveEntity(ctx: SkillContext, runtimeId: bigint): EntityInfo | null {
    return ctx.world.getEntities().find((e) => e.runtimeId === runtimeId) ?? null;
  }

  private _makeTraversalContext(ctx: SkillContext): TraversalContext {
    const world = ctx.world;
    return {
      isBlockSolid: (p) => world.isBlockSolid(p),
      isWaterBlock: (p) => world.isWaterBlock(p),
      isWaterSurface: (p) => world.isWaterSurface(p),
      isClimbable: (p) => world.isClimbable(p),
      isMineable: (p) => world.isMineable(p),
      isDoor: (p) => world.isDoor(p),
    };
  }

  private _fleeFrom(ctx: SkillContext, pos: Vec3, fromPos: Vec3, distance: number): void {
    const movement = ctx.movement;
    const dx = pos.x - fromPos.x;
    const dy = pos.y - fromPos.y;
    const dz = pos.z - fromPos.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

    const fleeTarget = vec3(
      pos.x + (dx / len) * distance,
      pos.y + (dy / len) * distance,
      pos.z + (dz / len) * distance
    );

    movement.startSprinting();
    movement.lookAt(fleeTarget);
    movement.setPosition(fleeTarget.x, fleeTarget.y, fleeTarget.z);
  }

  private _retreatFrom(ctx: SkillContext, pos: Vec3, fromPos: Vec3, distance: number): void {
    const movement = ctx.movement;
    const dx = pos.x - fromPos.x;
    const dz = pos.z - fromPos.z;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;

    movement.lookAt(fromPos);
    movement.setPosition(
      pos.x + (dx / len) * 0.4,
      pos.y,
      pos.z + (dz / len) * 0.4
    );
    movement.startSprinting();
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
