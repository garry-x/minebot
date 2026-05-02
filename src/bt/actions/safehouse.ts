import { Action } from "../nodes/action.js";
import type { Blackboard } from "../types.js";
import { Vec3 } from "../../utils/vec3.js";

export const buildSafehouse = new Action(
  "idle",
  (bb) => {
    bb.safehouseState.built = true;
    const pos = bb.ctx.world.getPlayerPosition();
    bb.safehouseState.position = { x: pos.x, y: pos.y, z: pos.z };
    bb.safehouseState.hasWorkbench = false;
    bb.ctx.logger?.info("BT> SAFEHOUSE: marking safehouse at current position");
  },
  (bb) => bb.safehouseState.built
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
