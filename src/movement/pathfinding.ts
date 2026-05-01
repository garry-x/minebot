import { Vec3, vec3, manhattan } from "../utils/vec3.js";

export interface Node {
  x: number;
  y: number;
  z: number;
  g: number;
  h: number;
  f: number;
  parent: Node | null;
}

const NEIGHBOR_OFFSETS = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
  { x: 1, y: 0, z: 1 },
  { x: 1, y: 0, z: -1 },
  { x: -1, y: 0, z: 1 },
  { x: -1, y: 0, z: -1 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
];

export class Pathfinder {
  private isWalkable: (pos: Vec3) => boolean;
  private maxNodes: number;

  constructor(isWalkable: (pos: Vec3) => boolean, maxNodes = 10000) {
    this.isWalkable = isWalkable;
    this.maxNodes = maxNodes;
  }

  findPath(start: Vec3, end: Vec3): Node[] {
    const startNode: Node = {
      x: Math.floor(start.x), y: Math.floor(start.y), z: Math.floor(start.z),
      g: 0, h: 0, f: 0, parent: null,
    };
    startNode.h = manhattan({ x: startNode.x, y: startNode.y, z: startNode.z }, end);
    startNode.f = startNode.h;

    const endFloor = { x: Math.floor(end.x), y: Math.floor(end.y), z: Math.floor(end.z) };
    if (startNode.x === endFloor.x && startNode.y === endFloor.y && startNode.z === endFloor.z) {
      return [startNode];
    }

    const openSet: Node[] = [startNode];
    const closedSet = new Set<string>();
    const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

    let iterations = 0;
    while (openSet.length > 0 && iterations < this.maxNodes) {
      iterations++;
      let lowestIdx = 0;
      for (let i = 1; i < openSet.length; i++) {
        if (openSet[i].f < openSet[lowestIdx].f) lowestIdx = i;
      }
      const current = openSet.splice(lowestIdx, 1)[0];

      if (current.x === endFloor.x && current.y === endFloor.y && current.z === endFloor.z) {
        return this.reconstructPath(current);
      }

      closedSet.add(key(current.x, current.y, current.z));

      for (const offset of NEIGHBOR_OFFSETS) {
        const nx = current.x + offset.x;
        const ny = current.y + offset.y;
        const nz = current.z + offset.z;
        const nk = key(nx, ny, nz);

        if (closedSet.has(nk)) continue;
        if (!this.isWalkable({ x: nx, y: ny, z: nz })) continue;

        if (offset.x !== 0 && offset.z !== 0) {
          if (
            !this.isWalkable({ x: current.x + offset.x, y: ny, z: current.z }) ||
            !this.isWalkable({ x: current.x, y: ny, z: current.z + offset.z })
          ) continue;
        }

        const g = current.g + (offset.x !== 0 && offset.z !== 0 ? 1.414 : offset.y !== 0 ? 1.5 : 1);
        const h = manhattan({ x: nx, y: ny, z: nz }, endFloor);
        const f = g + h;

        const existing = openSet.find((n) => n.x === nx && n.y === ny && n.z === nz);
        if (existing) {
          if (g < existing.g) {
            existing.g = g;
            existing.f = f;
            existing.parent = current;
          }
        } else {
          openSet.push({ x: nx, y: ny, z: nz, g, h, f, parent: current });
        }
      }
    }
    return [];
  }

  private reconstructPath(node: Node): Node[] {
    const path: Node[] = [];
    let current: Node | null = node;
    while (current) {
      path.push(current);
      current = current.parent;
    }
    path.reverse();
    return path;
  }
}
