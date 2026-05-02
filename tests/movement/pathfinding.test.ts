import { describe, it } from "node:test";
import assert from "node:assert";
import { Pathfinder } from "../../src/movement/pathfinding.js";
import { TraversalContext, MoveType } from "../../src/movement/pathfinding-types.js";
import { vec3 } from "../../src/utils/vec3.js";

function createTraversalContext(walls: { x: number; y: number; z: number }[]): TraversalContext {
  const wallSet = new Set(walls.map((w) => `${w.x},${w.y},${w.z}`));
  const checker = (pos: { x: number; y: number; z: number }) =>
    pos.y === 63 || wallSet.has(`${pos.x},${pos.y},${pos.z}`);
  return {
    isBlockSolid: checker,
    isWaterBlock: () => false,
    isWaterSurface: () => false,
    isClimbable: () => false,
    isMineable: () => false,
    isDoor: () => false,
  };
}

function createPathfinder(walls: { x: number; y: number; z: number }[]) {
  return new Pathfinder(createTraversalContext(walls));
}

describe("Pathfinder", () => {
  it("finds a straight-line path", () => {
    const pf = createPathfinder([]);
    const path = pf.findPath(vec3(0, 64, 0), vec3(5, 64, 0));
    assert.ok(path.length > 0, "path should not be empty");
    const last = path[path.length - 1];
    assert.strictEqual(last.x, 5);
    assert.strictEqual(last.z, 0);
  });

  it("navigates around a wall", () => {
    const pf = createPathfinder([
      { x: 2, y: 64, z: 0 },
    ]);
    const path = pf.findPath(vec3(0, 64, 0), vec3(4, 64, 0));
    assert.ok(path.length > 0, "should find path around wall");
  });

  it("returns empty for unreachable target", () => {
    const walls: { x: number; y: number; z: number }[] = [];
    // Fully enclose start in a 3D box: walls at x ∈ [-2,2], z ∈ [-2,2], y ∈ [58,70]
    // with only (0,64,0) hollow
    for (let x = -2; x <= 2; x++) {
      for (let z = -2; z <= 2; z++) {
        for (let y = 58; y <= 70; y++) {
          if (x === 0 && z === 0 && y === 64) continue;
          walls.push({ x, y, z });
        }
      }
    }
    const pf = createPathfinder(walls);
    const path = pf.findPath(vec3(0, 64, 0), vec3(10, 64, 10));
    assert.strictEqual(path.length, 0);
  });

  it("handles same start and target", () => {
    const pf = createPathfinder([]);
    const path = pf.findPath(vec3(1, 64, 2), vec3(1, 64, 2));
    assert.strictEqual(path.length, 1);
    assert.strictEqual(path[0].x, 1);
    assert.strictEqual(path[0].z, 2);
  });
});
