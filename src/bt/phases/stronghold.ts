import { Sequence } from "../nodes/sequence.js";
import { Action } from "../nodes/action.js";

const executeStronghold = new Action(
  "stronghold",
  (bb) => { bb.ctx.logger?.info("BT> STRONGHOLD: searching stronghold"); }
);

export const strongholdSubtree = new Sequence([
  executeStronghold,
]);
