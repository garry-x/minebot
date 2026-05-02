import { Sequence } from "../nodes/sequence.js";
import { executeCombat, executeGathering } from "../actions/skill.js";

export const netherPhaseSubtree = new Sequence([
  executeCombat,
  executeCombat,
  executeGathering,
]);
