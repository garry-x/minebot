import { Sequence } from "../nodes/sequence.js";
import { Selector } from "../nodes/selector.js";
import { hasStone } from "../conditions/inventory.js";
import { executeGathering, executeBuilding } from "../actions/skill.js";
import { placeWorkbench, placeFurnace } from "../actions/safehouse.js";
import { placeChest } from "../actions/storage.js";

export const stonePhaseSubtree = new Sequence([
  placeWorkbench,
  placeFurnace,
  new Selector([
    new Sequence([hasStone(8), executeBuilding]),
    executeGathering,
  ]),
  placeChest,
]);
