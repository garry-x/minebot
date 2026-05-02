import { Condition } from "../nodes/condition.js";
import type { Blackboard } from "../types.js";

export const isHotbarOkay = new Condition((bb) => {
  return bb.organizationState.hotbarLayoutOk;
});

export const hasGarbageInInventory = new Condition((bb) => {
  const garbageItems = ["rotten_flesh", "poisonous_potato", "spider_eye"];
  return garbageItems.some((item) => bb.ctx.inventory.hasItem(item));
});

export const chestNeedsSort = new Condition((bb) => {
  return bb.safehouseState.chestCount > 0
    && bb.organizationState.lastSortTime < Date.now() - 300000;
});
