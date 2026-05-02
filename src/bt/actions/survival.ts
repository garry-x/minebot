import { Action } from "../nodes/action.js";
import type { Blackboard } from "../types.js";

export const eatFood = new Action(
  "idle",
  (bb) => { bb.ctx.logger?.info("BT> SURVIVAL: eating"); }
);

export const fleeToSafety = new Action(
  "idle",
  (bb) => { bb.ctx.logger?.info("BT> SURVIVAL: fleeing"); }
);

export const digHideHole = new Action(
  "building",
  (bb) => { bb.ctx.logger?.info("BT> SURVIVAL: digging hide"); },
  (bb) => {
    const pos = bb.ctx.world.getPlayerPosition();
    for (let y = pos.y + 1; y <= pos.y + 5; y++) {
      if (bb.ctx.world.isBlockSolid({ x: pos.x, y, z: pos.z })) return true;
    }
    return false;
  }
);
