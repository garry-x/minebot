import { Sequence } from "../nodes/sequence.js";
import { Selector } from "../nodes/selector.js";
import { hasWood } from "../conditions/inventory.js";
import { executeGathering, executeCrafting } from "../actions/skill.js";
import { buildSafehouse } from "../actions/safehouse.js";
import { placeChest } from "../actions/storage.js";

export const spawnPhaseSubtree = new Sequence([
  new Selector([
    new Sequence([hasWood(4), executeCrafting]),
    executeGathering,
  ]),
  buildSafehouse,
  placeChest,
]);
