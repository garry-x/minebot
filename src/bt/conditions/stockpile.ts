import { Condition } from "../nodes/condition.js";
import type { Blackboard } from "../types.js";

export const isStockpileMet = new Condition((bb) => {
  return bb.stockpileState.stockpileMet;
});

export const chestCountEnough = (min: number) => new Condition((bb) => {
  return bb.safehouseState.chestCount >= min;
});

export const needsRestock = new Condition((bb) => {
  const hotbar = bb.ctx.inventory;
  const hasPick = hotbar.hasItem("stone_pickaxe")
    || hotbar.hasItem("iron_pickaxe")
    || hotbar.hasItem("diamond_pickaxe")
    || hotbar.hasItem("wooden_pickaxe");
  const hasSword = hotbar.hasItem("stone_sword")
    || hotbar.hasItem("iron_sword")
    || hotbar.hasItem("diamond_sword")
    || hotbar.hasItem("wooden_sword");
  const hasFood = hotbar.countItem("cooked_beef") + hotbar.countItem("cooked_porkchop")
    + hotbar.countItem("bread") + hotbar.countItem("cooked_chicken")
    + hotbar.countItem("cooked_mutton") + hotbar.countItem("cooked_salmon")
    + hotbar.countItem("cooked_cod") + hotbar.countItem("apple")
    + hotbar.countItem("carrot") + hotbar.countItem("raw_beef")
    + hotbar.countItem("raw_porkchop") >= 16;
  return !hasPick || !hasSword || !hasFood;
});
