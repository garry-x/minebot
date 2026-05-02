import { Sequence } from "../nodes/sequence.js";
import { Selector } from "../nodes/selector.js";
import { hasDiamond } from "../conditions/inventory.js";
import { executeGathering } from "../actions/skill.js";

export const diamondPhaseSubtree = new Sequence([
  new Selector([
    new Sequence([hasDiamond(1), executeGathering]),
    executeGathering,
  ]),
]);
