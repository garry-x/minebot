import { InterruptibleSelector } from "./nodes/interruptible.js";
import { Sequence } from "./nodes/sequence.js";
import { Condition } from "./nodes/condition.js";
import { hostilesInRange } from "./conditions/environment.js";
import { hasWeapon } from "./conditions/inventory.js";
import { executeCombat } from "./actions/skill.js";
import { fleeToSafety } from "./actions/survival.js";

export const threatSubtree = new InterruptibleSelector([
  new Sequence([hostilesInRange(16), hasWeapon, executeCombat]),
  new Sequence([hostilesInRange(16), new Condition(() => true), fleeToSafety]),
]);
