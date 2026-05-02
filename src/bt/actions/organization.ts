import { Action } from "../nodes/action.js";
import type { Blackboard } from "../types.js";

export const standardizeHotbar = new Action(
  "idle",
  (bb) => {
    bb.ctx.logger?.info("BT> ORG: standardizing hotbar");
    bb.organizationState.hotbarLayoutOk = false;
  },
  (bb) => {
    bb.organizationState.hotbarLayoutOk = true;
    return bb.organizationState.hotbarLayoutOk;
  }
);

export const dropGarbage = new Action(
  "idle",
  (bb) => {
    bb.ctx.logger?.info("BT> ORG: dropping garbage items");
    bb.organizationState.hasGarbage = false;
  },
  () => true
);
