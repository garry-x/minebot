import { Vec3, vec3, manhattan } from "../utils/vec3.js";
import { MoveType, isTraversable, type TraversalContext, type PathNode } from "./pathfinding-types.js";
import type { PathfindingCircuitBreaker } from "./circuit-breaker.js";

const NEIGHBOR_OFFSETS_PHASES = [
  {
    offsets: [
      { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
      { x: 1, y: 0, z: 1 }, { x: 1, y: 0, z: -1 },
      { x: -1, y: 0, z: 1 }, { x: -1, y: 0, z: -1 },
      { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
    ], enableDig: false },
  {
    offsets: [
      { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
      { x: 1, y: 0, z: 1 }, { x: 1, y: 0, z: -1 },
      { x: -1, y: 0, z: 1 }, { x: -1, y: 0, z: -1 },
      { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
    ], enableDig: true },
];

export class Pathfinder {
  private ctx: TraversalContext;
  private maxNodes: number;
  private onPathfinding?: (nodes: number, durationMs: number, failed: boolean) => void;
  private circuitBreaker?: PathfindingCircuitBreaker;

  constructor(
    traversalCtx: TraversalContext,
    maxNodes = 10000,
    onPathfinding?: (nodes: number, durationMs: number, failed: boolean) => void,
    circuitBreaker?: PathfindingCircuitBreaker
  ) {
    this.ctx = traversalCtx;
    this.maxNodes = maxNodes;
    this.onPathfinding = onPathfinding;
    this.circuitBreaker = circuitBreaker;
  }

  findPath(start: Vec3, end: Vec3): PathNode[] {
    if (this.circuitBreaker?.isDisabled()) {
      this.onPathfinding?.(0, 0, true);
      return [];
    }

    const startTime = Date.now();
    let totalIterations = 0;

    for (const phase of NEIGHBOR_OFFSETS_PHASES) {
      const result = this._findPathWithOffsets(start, end, phase.offsets, phase.enableDig, () => totalIterations);
      totalIterations += result.iterations;
      if (result.path.length > 0) {
        const durationMs = Date.now() - startTime;
        this.onPathfinding?.(totalIterations, durationMs, false);
        return result.path;
      }
    }

    const durationMs = Date.now() - startTime;
    this.onPathfinding?.(totalIterations, durationMs, true);
    return [];
  }

  private _findPathWithOffsets(
    start: Vec3, end: Vec3,
    offsets: { x: number; y: number; z: number }[],
    enableDig: boolean,
    getIterations: () => number
  ): { path: PathNode[]; iterations: number } {
    let iterations = 0;

    const endFloor = {
      x: Math.floor(end.x), y: Math.floor(end.y), z: Math.floor(end.z)
    };

    const startNode: PathNode = {
      x: Math.floor(start.x), y: Math.floor(start.y), z: Math.floor(start.z),
      g: 0, h: 0, f: 0, parent: null,
      moveType: MoveType.WALK, costMultiplier: 1,
    };
    startNode.h = manhattan(
      { x: startNode.x, y: startNode.y, z: startNode.z }, endFloor
    );
    startNode.f = startNode.h;

    if (startNode.x === endFloor.x && startNode.y === endFloor.y && startNode.z === endFloor.z) {
      return { path: [startNode], iterations: 0 };
    }

    const openSet: PathNode[] = [startNode];
    const closedSet = new Set<string>();
    const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

    while (openSet.length > 0 && iterations < this.maxNodes) {
      iterations++;
      let lowestIdx = 0;
      for (let i = 1; i < openSet.length; i++) {
        if (openSet[i].f < openSet[lowestIdx].f) lowestIdx = i;
      }
      const current = openSet.splice(lowestIdx, 1)[0];

      if (current.x === endFloor.x && current.y === endFloor.y && current.z === endFloor.z) {
        return { path: this.reconstructPath(current), iterations };
      }

      closedSet.add(key(current.x, current.y, current.z));

      for (const offset of offsets) {
        const nx = current.x + offset.x;
        const ny = current.y + offset.y;
        const nz = current.z + offset.z;
        const nk = key(nx, ny, nz);

        if (closedSet.has(nk)) continue;

        const tr = isTraversable(
          { x: nx, y: ny, z: nz },
          { x: current.x, y: current.y, z: current.z },
          this.ctx
        );

        if (!tr.traversable) continue;
        if (tr.moveType === MoveType.DIG && !enableDig) continue;

        // Corner cutting prevention
        if (offset.x !== 0 && offset.z !== 0
          && tr.moveType !== MoveType.CLIMB
          && tr.moveType !== MoveType.SWIM
          && tr.moveType !== MoveType.BOAT) {
          const a1 = isTraversable(
            { x: current.x + offset.x, y: ny, z: current.z },
            { x: current.x, y: current.y, z: current.z }, this.ctx
          );
          const a2 = isTraversable(
            { x: current.x, y: ny, z: current.z + offset.z },
            { x: current.x, y: current.y, z: current.z }, this.ctx
          );
          if (!a1.traversable || !a2.traversable) continue;
        }

        const g = current.g + tr.costMultiplier;
        const h = manhattan({ x: nx, y: ny, z: nz }, endFloor);
        const f = g + h;

        const existing = openSet.find((n) => n.x === nx && n.y === ny && n.z === nz);
        if (existing) {
          if (g < existing.g) {
            existing.g = g;
            existing.f = f;
            existing.parent = current;
            existing.moveType = tr.moveType;
            existing.costMultiplier = tr.costMultiplier;
          }
        } else {
          openSet.push({
            x: nx, y: ny, z: nz,
            g, h, f,
            parent: current,
            moveType: tr.moveType,
            costMultiplier: tr.costMultiplier,
          });
        }
      }
    }

    return { path: [], iterations };
  }

  private reconstructPath(node: PathNode): PathNode[] {
    const path: PathNode[] = [];
    let current: PathNode | null = node;
    while (current) {
      path.push(current);
      current = current.parent;
    }
    path.reverse();
    return path;
  }
}
