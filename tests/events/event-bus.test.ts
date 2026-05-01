import { describe, it } from "node:test";
import assert from "node:assert";
import { EventBus } from "../../src/events/event-bus.js";

describe("EventBus", () => {
  it("emits and receives events", () => {
    const bus = new EventBus();
    const values: number[] = [];
    bus.on("test", (n: number) => values.push(n));
    bus.emit("test", 42);
    bus.emit("test", 99);
    assert.deepStrictEqual(values, [42, 99]);
  });

  it("supports multiple listeners for same event", () => {
    const bus = new EventBus();
    let a = 0;
    let b = 0;
    bus.on("x", () => a++);
    bus.on("x", () => b++);
    bus.emit("x");
    assert.strictEqual(a, 1);
    assert.strictEqual(b, 1);
  });

  it("removes listeners with off()", () => {
    const bus = new EventBus();
    let count = 0;
    const fn = () => count++;
    bus.on("y", fn);
    bus.emit("y");
    bus.off("y", fn);
    bus.emit("y");
    assert.strictEqual(count, 1);
  });

  it("once() fires only once", () => {
    const bus = new EventBus();
    let count = 0;
    bus.once("z", () => count++);
    bus.emit("z");
    bus.emit("z");
    assert.strictEqual(count, 1);
  });

  it("removeAllListeners clears all", () => {
    const bus = new EventBus();
    let count = 0;
    bus.on("w", () => count++);
    bus.on("w", () => count++);
    bus.removeAllListeners("w");
    bus.emit("w");
    assert.strictEqual(count, 0);
  });

  it("listenerCount returns correct count", () => {
    const bus = new EventBus();
    bus.on("a", () => {});
    bus.on("a", () => {});
    bus.on("b", () => {});
    assert.strictEqual(bus.listenerCount("a"), 2);
    assert.strictEqual(bus.listenerCount("b"), 1);
  });
});
