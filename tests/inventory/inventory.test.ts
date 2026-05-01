import { describe, it } from "node:test";
import assert from "node:assert";
import {
  Inventory,
  ARMOR_HELMET,
  ARMOR_CHESTPLATE,
  ARMOR_LEGGINGS,
  ARMOR_BOOTS,
} from "../../src/inventory/inventory.js";

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

  // Armor tests
  it("has correct armor slot constants", () => {
    assert.strictEqual(ARMOR_HELMET, 0);
    assert.strictEqual(ARMOR_CHESTPLATE, 1);
    assert.strictEqual(ARMOR_LEGGINGS, 2);
    assert.strictEqual(ARMOR_BOOTS, 3);
  });

  it("sets and gets armor", () => {
    const inv = new Inventory();
    inv.setArmor(ARMOR_HELMET, { slot: 0, itemId: 298, count: 1, name: "minecraft:leather_helmet" });
    const item = inv.getArmor(ARMOR_HELMET);
    assert.ok(item);
    assert.strictEqual(item!.name, "minecraft:leather_helmet");
  });

  it("sets null armor removes it", () => {
    const inv = new Inventory();
    inv.setArmor(ARMOR_CHESTPLATE, { slot: 1, itemId: 299, count: 1, name: "minecraft:leather_chestplate" });
    inv.setArmor(ARMOR_CHESTPLATE, null);
    assert.strictEqual(inv.getArmor(ARMOR_CHESTPLATE), null);
  });

  it("hasArmorEquipped returns true when armor present", () => {
    const inv = new Inventory();
    assert.strictEqual(inv.hasArmorEquipped(), false);
    inv.setArmor(0, { slot: 0, itemId: 298, count: 1, name: "minecraft:leather_helmet" });
    assert.strictEqual(inv.hasArmorEquipped(), true);
  });

  it("getArmorMaterial extracts material from name", () => {
    const inv = new Inventory();
    inv.setArmor(0, { slot: 0, itemId: 307, count: 1, name: "minecraft:iron_helmet" });
    assert.strictEqual(inv.getArmorMaterial(0), "iron");

    inv.setArmor(1, { slot: 1, itemId: 311, count: 1, name: "minecraft:diamond_chestplate" });
    assert.strictEqual(inv.getArmorMaterial(1), "diamond");

    inv.setArmor(2, { slot: 2, itemId: 316, count: 1, name: "minecraft:netherite_leggings" });
    assert.strictEqual(inv.getArmorMaterial(2), "netherite");
  });

  it("getArmorMaterial returns null for missing armor", () => {
    const inv = new Inventory();
    assert.strictEqual(inv.getArmorMaterial(0), null);
  });

  it("isBetterArmor compares material priorities", () => {
    const inv = new Inventory();
    assert.strictEqual(inv.isBetterArmor(null, "leather"), true);
    assert.strictEqual(inv.isBetterArmor("leather", "iron"), true);
    assert.strictEqual(inv.isBetterArmor("iron", "leather"), false);
    assert.strictEqual(inv.isBetterArmor("diamond", "netherite"), true);
    assert.strictEqual(inv.isBetterArmor("netherite", "diamond"), false);
    assert.strictEqual(inv.isBetterArmor("iron", "iron"), false);
  });

  it("getArmorType returns correct armor type string", () => {
    const inv = new Inventory();
    assert.strictEqual(inv.getArmorType(0), "helmet");
    assert.strictEqual(inv.getArmorType(1), "chestplate");
    assert.strictEqual(inv.getArmorType(2), "leggings");
    assert.strictEqual(inv.getArmorType(3), "boots");
    assert.strictEqual(inv.getArmorType(9), "unknown");
  });

  it("findBestArmor finds upgrade in inventory", () => {
    const inv = new Inventory();
    inv.setArmor(0, { slot: 0, itemId: 298, count: 1, name: "minecraft:leather_helmet" });
    inv.setSlot(5, { slot: 5, itemId: 302, count: 1, name: "minecraft:chainmail_helmet" });

    const best = inv.findBestArmor(0);
    assert.strictEqual(best, 5);
  });

  it("findBestArmor returns -1 when no better armor", () => {
    const inv = new Inventory();
    inv.setArmor(0, { slot: 0, itemId: 302, count: 1, name: "minecraft:chainmail_helmet" });
    inv.setSlot(3, { slot: 3, itemId: 298, count: 1, name: "minecraft:leather_helmet" });

    const best = inv.findBestArmor(0);
    assert.strictEqual(best, -1);
  });

  it("findBestArmor returns upgrade when no armor equipped", () => {
    const inv = new Inventory();
    inv.setSlot(7, { slot: 7, itemId: 309, count: 1, name: "minecraft:iron_boots" });

    const best = inv.findBestArmor(3);
    assert.strictEqual(best, 7);
  });
});
