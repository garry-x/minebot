import { Action } from "../nodes/action.js";
import type { Blackboard } from "../types.js";

export const buildSafehouse = new Action(
  "building",
  (bb) => {
    bb.safehouseState.built = false;
    bb.ctx.logger?.info("BT> SAFEHOUSE: building safehouse");
  },
  (bb) => {
    return bb.safehouseState.built;
  }
);

export const placeWorkbench = new Action(
  "building",
  (bb) => { bb.ctx.logger?.info("BT> SAFEHOUSE: placing workbench"); },
  (bb) => bb.safehouseState.hasWorkbench
);

export const placeFurnace = new Action(
  "building",
  (bb) => { bb.ctx.logger?.info("BT> SAFEHOUSE: placing furnace"); },
  (bb) => bb.safehouseState.hasFurnace
);

export const placeTorches = new Action(
  "building",
  (bb) => { bb.ctx.logger?.info("BT> SAFEHOUSE: placing torches"); },
  (bb) => bb.safehouseState.hasTorches
);
