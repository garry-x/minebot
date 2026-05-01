import { describe, it } from "node:test";
import assert from "node:assert";
import { add, sub, scale, length, distance, floor, equals } from "../../src/utils/vec3.js";

describe("Vec3 utilities", () => {
  it("adds two vectors", () => {
    assert.ok(equals(add({ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 }), { x: 5, y: 7, z: 9 }));
  });

  it("subtracts two vectors", () => {
    assert.ok(equals(sub({ x: 5, y: 5, z: 5 }, { x: 2, y: 1, z: 3 }), { x: 3, y: 4, z: 2 }));
  });

  it("scales a vector", () => {
    assert.ok(equals(scale({ x: 1, y: 2, z: 3 }, 2), { x: 2, y: 4, z: 6 }));
  });

  it("computes length", () => {
    assert.strictEqual(length({ x: 3, y: 4, z: 0 }), 5);
  });

  it("computes distance", () => {
    assert.strictEqual(distance({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }), 5);
  });

  it("floors a vector", () => {
    assert.ok(equals(floor({ x: 1.7, y: -2.3, z: 3.9 }), { x: 1, y: -3, z: 3 }));
  });

  it("equals returns false for different vectors", () => {
    assert.strictEqual(equals({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }), false);
  });
});
