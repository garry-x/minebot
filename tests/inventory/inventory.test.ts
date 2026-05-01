import { describe, it } from "node:test";
import assert from "node:assert";
import { Inventory } from "../../src/inventory/inventory.js";

describe("Inventory", () => {
  it("sets and gets items", () => {
    const inv = new Inventory();
    inv.setSlot(0, { slot: 0, itemId: 1, count: 64, name: "minecraft:stone" });
    const item = inv.getSlot(0);
    assert.ok(item);
    assert.strictEqual(item!.name, "minecraft:stone");
    assert.strictEqual(item!.count, 64);
  });

  it("finds items by name", () => {
    const inv = new Inventory();
    inv.setSlot(5, { slot: 5, itemId: 15, count: 3, name: "minecraft:iron_ore" });
    assert.strictEqual(inv.findItem("minecraft:iron_ore"), 5);
    assert.strictEqual(inv.findItem("minecraft:diamond"), -1);
  });

  it("counts items by name", () => {
    const inv = new Inventory();
    inv.setSlot(0, { slot: 0, itemId: 1, count: 10, name: "minecraft:coal" });
    inv.setSlot(1, { slot: 1, itemId: 1, count: 5, name: "minecraft:coal" });
    assert.strictEqual(inv.countItem("minecraft:coal"), 15);
  });

  it("selects hotbar slot", () => {
    const inv = new Inventory();
    inv.setSelectedSlot(3);
    assert.strictEqual(inv.getSelectedSlot(), 3);
  });

  it("clamps selected slot to 0-8", () => {
    const inv = new Inventory();
    inv.setSelectedSlot(12);
    assert.strictEqual(inv.getSelectedSlot(), 8);
    inv.setSelectedSlot(-3);
    assert.strictEqual(inv.getSelectedSlot(), 0);
  });

  it("detects empty slots", () => {
    const inv = new Inventory();
    inv.setSlot(0, { slot: 0, itemId: 1, count: 1, name: "x" });
    const empty = inv.getEmptySlots();
    assert.strictEqual(empty.length, 35);
    assert.ok(!empty.includes(0));
  });

  it("detects full inventory", () => {
    const inv = new Inventory();
    for (let i = 0; i < 36; i++) {
      inv.setSlot(i, { slot: i, itemId: 1, count: 1, name: "x" });
    }
    assert.ok(inv.isFull());
  });
});
