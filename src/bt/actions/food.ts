import { Action } from "../nodes/action.js";
import type { Blackboard } from "../types.js";

export const cookRawMeat = new Action(
  "crafting",
  (bb) => { bb.ctx.logger?.info("BT> FOOD: cooking raw meat"); },
  (bb) => {
    const inv = bb.ctx.inventory;
    return inv.countItem("raw_beef") + inv.countItem("raw_porkchop")
      + inv.countItem("raw_chicken") + inv.countItem("raw_mutton") === 0;
  }
);

export const huntAnimal = new Action(
  "combat",
  (bb) => { bb.ctx.logger?.info("BT> FOOD: hunting animals"); },
  (bb) => bb.ctx.inventory.countItem("cooked_beef")
    + bb.ctx.inventory.countItem("cooked_porkchop")
    + bb.ctx.inventory.countItem("cooked_chicken")
    + bb.ctx.inventory.countItem("cooked_mutton") >= 64
);
