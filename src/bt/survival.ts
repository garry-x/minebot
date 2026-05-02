import { InterruptibleSelector } from "./nodes/interruptible.js";
import { Sequence } from "./nodes/sequence.js";
import { Condition } from "./nodes/condition.js";
import { isHealthLow, isStarving, shouldEatNow, hasFood, hasNoFood } from "./conditions/health.js";
import { hostilesInRange } from "./conditions/environment.js";
import { hasWeapon } from "./conditions/inventory.js";
import { eatFood, fleeToSafety, digHideHole } from "./actions/survival.js";
import { executeCombat } from "./actions/skill.js";

export const survivalSubtree = new InterruptibleSelector([
  new Sequence([isHealthLow(0.3), hasFood, eatFood]),
  new Sequence([isHealthLow(0.3), hasNoFood, fleeToSafety, digHideHole]),
  new Sequence([isStarving, eatFood]),
  new Sequence([shouldEatNow, hasFood, eatFood]),
  new Sequence([hostilesInRange(2), hasWeapon, executeCombat]),
  new Sequence([hostilesInRange(2), new Condition(() => true), fleeToSafety, digHideHole]),
]);
