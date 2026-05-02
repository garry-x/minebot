import { InterruptibleSelector } from "./nodes/interruptible.js";
import { Sequence } from "./nodes/sequence.js";
import { Condition } from "./nodes/condition.js";
import { buildSafehouse, placeWorkbench, placeFurnace, placeTorches } from "./actions/safehouse.js";
import { placeChest } from "./actions/storage.js";

export const safehouseSubtree = new InterruptibleSelector([
  // Only build safehouse from scratch if we have materials AND no safehouse yet
  new Sequence([
    new Condition((bb) => !bb.safehouseState.built
      && bb.ctx.inventory.countItem("oak_log") + bb.ctx.inventory.countItem("cobblestone") >= 8),
    buildSafehouse,
  ]),
  // Missing workbench? Place it (needs crafting_table in inventory)
  new Sequence([
    new Condition((bb) => !bb.safehouseState.hasWorkbench
      && bb.ctx.inventory.hasItem("crafting_table")),
    placeWorkbench,
  ]),
  // Missing furnace? Place it (needs furnace in inventory)
  new Sequence([
    new Condition((bb) => !bb.safehouseState.hasFurnace
      && bb.ctx.inventory.hasItem("furnace")),
    placeFurnace,
  ]),
  // Missing torches? Place them
  new Sequence([
    new Condition((bb) => !bb.safehouseState.hasTorches
      && bb.ctx.inventory.countItem("torch") >= 4),
    placeTorches,
  ]),
  // Missing chests? Place them
  new Sequence([
    new Condition((bb) => bb.safehouseState.chestCount < 2
      && bb.ctx.inventory.hasItem("chest")),
    placeChest,
  ]),
]);
