import { Sequence } from "../nodes/sequence.js";
import { Action } from "../nodes/action.js";

const executeDragonHunt = new Action(
  "dragon_hunt",
  (bb) => { bb.ctx.logger?.info("BT> END: hunting dragon"); }
);

export const endPhaseSubtree = new Sequence([
  executeDragonHunt,
]);
