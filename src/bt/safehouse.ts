import { InterruptibleSelector } from "./nodes/interruptible.js";
import { Sequence } from "./nodes/sequence.js";
import { Condition } from "./nodes/condition.js";
import { buildSafehouse, placeWorkbench, placeFurnace, placeTorches } from "./actions/safehouse.js";
import { placeChest } from "./actions/storage.js";

export const safehouseSubtree = new InterruptibleSelector([
  new Sequence([
    new Condition((bb) => !bb.safehouseState.built),
    buildSafehouse,
  ]),
  new Sequence([
    new Condition((bb) => !bb.safehouseState.hasWorkbench),
    placeWorkbench,
  ]),
  new Sequence([
    new Condition((bb) => !bb.safehouseState.hasFurnace),
    placeFurnace,
  ]),
  new Sequence([
    new Condition((bb) => !bb.safehouseState.hasTorches),
    placeTorches,
  ]),
  new Sequence([
    new Condition((bb) => bb.safehouseState.chestCount < 2),
    placeChest,
  ]),
]);
