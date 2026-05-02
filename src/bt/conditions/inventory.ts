import { Condition } from "../nodes/condition.js";
import type { Blackboard } from "../types.js";

export const hasItem = (name: string, minCount = 1) => new Condition(
  (bb) => bb.ctx.inventory.countItem(name) >= minCount
);

export const isInventoryFull = new Condition(
  (bb) => bb.ctx.inventory.isFull()
);

export const hasPickaxe = new Condition(
  (bb) => bb.ctx.inventory.hasItem("wooden_pickaxe")
    || bb.ctx.inventory.hasItem("stone_pickaxe")
    || bb.ctx.inventory.hasItem("iron_pickaxe")
    || bb.ctx.inventory.hasItem("diamond_pickaxe")
);

export const hasWeapon = new Condition(
  (bb) => bb.ctx.inventory.hasItem("wooden_sword")
    || bb.ctx.inventory.hasItem("stone_sword")
    || bb.ctx.inventory.hasItem("iron_sword")
    || bb.ctx.inventory.hasItem("diamond_sword")
    || bb.ctx.inventory.hasItem("wooden_axe")
    || bb.ctx.inventory.hasItem("stone_axe")
    || bb.ctx.inventory.hasItem("iron_axe")
    || bb.ctx.inventory.hasItem("diamond_axe")
);

export const hasWood = (minCount = 4) => new Condition(
  (bb) => ["oak_log", "birch_log", "spruce_log", "jungle_log",
    "acacia_log", "dark_oak_log", "mangrove_log", "cherry_log"]
    .reduce((sum, name) => sum + bb.ctx.inventory.countItem(name), 0) >= minCount
);

export const hasStone = (minCount = 8) => new Condition(
  (bb) => bb.ctx.inventory.countItem("cobblestone") >= minCount
);

export const hasIron = (minCount = 3) => new Condition(
  (bb) => bb.ctx.inventory.countItem("iron_ingot") >= minCount
);

export const hasDiamond = (minCount = 1) => new Condition(
  (bb) => bb.ctx.inventory.countItem("diamond") >= minCount
);
