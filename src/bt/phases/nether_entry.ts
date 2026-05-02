import { Sequence } from "../nodes/sequence.js";
import { Condition } from "../nodes/condition.js";
import { executeBuilding } from "../actions/skill.js";

export const netherEntrySubtree = new Sequence([
  new Condition((bb) => bb.ctx.inventory.countItem("obsidian") >= 10),
  new Condition((bb) => bb.ctx.inventory.hasItem("flint_and_steel")),
  executeBuilding,
]);
