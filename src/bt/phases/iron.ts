import { Sequence } from "../nodes/sequence.js";
import { Selector } from "../nodes/selector.js";
import { hasIron } from "../conditions/inventory.js";
import { executeGathering } from "../actions/skill.js";

export const ironPhaseSubtree = new Sequence([
  new Selector([
    new Sequence([hasIron(3), executeGathering]),
    executeGathering,
  ]),
]);
