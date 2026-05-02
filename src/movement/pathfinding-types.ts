import type { Vec3 } from "../utils/vec3.js";

export enum MoveType { WALK, JUMP, CLIMB, DIG, SWIM, FALL, BOAT }

export interface TraversalResult {
  traversable: boolean;
  moveType: MoveType;
  costMultiplier: number;
}

export interface TraversalContext {
  isBlockSolid: (pos: Vec3) => boolean;
  isWaterBlock: (pos: Vec3) => boolean;
  isWaterSurface: (pos: Vec3) => boolean;
  isClimbable: (pos: Vec3) => boolean;
  isMineable: (pos: Vec3) => boolean;
  isDoor: (pos: Vec3) => boolean;
}

export interface PathNode {
  x: number; y: number; z: number;
  g: number; h: number; f: number;
  parent: PathNode | null;
  moveType: MoveType;
  costMultiplier: number;
}

export function isTraversable(
  pos: Vec3, from: Vec3, ctx: TraversalContext
): TraversalResult {
  const dx = pos.x - from.x, dy = pos.y - from.y, dz = pos.z - from.z;

  // 1. Water check
  if (ctx.isWaterBlock(pos)) {
    if (ctx.isWaterSurface(pos)) {
      return { traversable: true, moveType: MoveType.BOAT, costMultiplier: 0.5 };
    }
    return { traversable: true, moveType: MoveType.SWIM, costMultiplier: 1.2 };
  }

  // 2. Climbable
  if (ctx.isClimbable(pos)) {
    return { traversable: true, moveType: MoveType.CLIMB, costMultiplier: 2.0 };
  }

  // 3. SOLID: try DIG as fallback
  if (ctx.isBlockSolid(pos)) {
    if (ctx.isMineable(pos)) {
      return { traversable: true, moveType: MoveType.DIG, costMultiplier: 3.0 };
    }
    return { traversable: false, moveType: MoveType.WALK, costMultiplier: 1 };
  }

  // 4. AIR: check landing block below
  const blockBelow = { x: pos.x, y: pos.y - 1, z: pos.z };
  if (ctx.isBlockSolid(blockBelow)) {
    // Jump: 1-block up or flat with gap
    if (dy === 1 || (dy === 0 && isGapBetween(from, pos, ctx))) {
      return { traversable: true, moveType: MoveType.JUMP, costMultiplier: 1.5 };
    }
    // Fall: drop ≤3 blocks
    if (dy <= -1 && dy >= -3) {
      return { traversable: true, moveType: MoveType.FALL, costMultiplier: 0.8 };
    }
    return { traversable: true, moveType: MoveType.WALK, costMultiplier: 1 };
  }

  return { traversable: false, moveType: MoveType.WALK, costMultiplier: 1 };
}

function isGapBetween(
  from: Vec3, to: Vec3, ctx: TraversalContext
): boolean {
  const midX = Math.floor((from.x + to.x) / 2);
  const midZ = Math.floor((from.z + to.z) / 2);
  const mid = { x: midX, y: from.y, z: midZ };
  const belowMid = { x: midX, y: from.y - 1, z: midZ };
  if (ctx.isBlockSolid(mid)) return false;
  if (!ctx.isBlockSolid(belowMid)) return false;
  return true;
}
