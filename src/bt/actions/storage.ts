import { Action } from "../nodes/action.js";
import type { Blackboard } from "../types.js";

export const depositItems = new Action(
  "idle",
  (bb) => { bb.ctx.logger?.info("BT> STORAGE: depositing items to chest"); },
  (bb) => !bb.ctx.inventory.isFull()
);

export const placeChest = new Action(
  "building",
  (bb) => { bb.ctx.logger?.info("BT> STORAGE: placing chest"); },
  (bb) => bb.safehouseState.chestCount >= 2
);

export const sortChests = new Action(
  "idle",
  (bb) => { bb.ctx.logger?.info("BT> STORAGE: sorting chests"); },
  (bb) => {
    bb.organizationState.lastSortTime = Date.now();
    return true;
  }
);
