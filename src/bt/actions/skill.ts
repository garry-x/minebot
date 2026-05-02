import { Action } from "../nodes/action.js";
import type { Blackboard } from "../types.js";

export const executeGathering = new Action(
  "gathering",
  (bb) => { bb.ctx.logger?.info("BT: starting gathering"); },
  (bb) => {
    const inv = bb.ctx.inventory;
    return inv.hasItem("oak_log") || inv.hasItem("cobblestone");
  }
);

export const executeCombat = new Action(
  "combat",
  (bb) => { bb.ctx.logger?.info("BT: engaging combat"); }
);

export const executeCrafting = new Action(
  "crafting",
  (bb) => { bb.ctx.logger?.info("BT: starting crafting"); }
);

export const executeBuilding = new Action(
  "building",
  (bb) => { bb.ctx.logger?.info("BT: starting building"); }
);

export const executeIdle = new Action(
  "idle",
  (bb) => { bb.ctx.logger?.info("BT: idle"); }
);
