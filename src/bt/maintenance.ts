import { Selector } from "./nodes/selector.js";
import { Sequence } from "./nodes/sequence.js";
import { Condition } from "./nodes/condition.js";
import { isNight } from "./conditions/environment.js";
import { toolDurabilityLow, armorDurabilityLow } from "./conditions/durability.js";
import { hasGarbageInInventory } from "./conditions/organization.js";
import { depositItems, sortChests } from "./actions/storage.js";
import { cookRawMeat } from "./actions/food.js";
import { executeCrafting } from "./actions/skill.js";
import { dropGarbage } from "./actions/organization.js";
import { buildSafehouse } from "./actions/safehouse.js";

export const maintenanceSubtree = new Selector([
  new Sequence([
    new Condition((bb) => bb.ctx.inventory.isFull()),
    depositItems,
    sortChests,
  ]),
  new Sequence([
    new Condition((bb) => bb.ctx.inventory.countItem("raw_beef")
      + bb.ctx.inventory.countItem("raw_porkchop")
      + bb.ctx.inventory.countItem("raw_chicken")
      + bb.ctx.inventory.countItem("raw_mutton") > 0),
    cookRawMeat,
  ]),
  new Sequence([toolDurabilityLow, executeCrafting]),
  new Sequence([armorDurabilityLow, executeCrafting]),
  new Sequence([hasGarbageInInventory, dropGarbage]),
  new Sequence([isNight, buildSafehouse]),
]);
