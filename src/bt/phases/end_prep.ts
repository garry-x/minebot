import { Sequence } from "../nodes/sequence.js";
import { executeCrafting } from "../actions/skill.js";

export const endPrepSubtree = new Sequence([
  executeCrafting,
  executeCrafting,
]);
