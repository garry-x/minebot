import { Condition } from "../nodes/condition.js";
import type { Blackboard } from "../types.js";

export const isHealthLow = (threshold = 0.3) => new Condition(
  (bb) => (bb.ctx.hunger as any)?.maxHealth
    ? bb.hp / ((bb.ctx.hunger as any)?.maxHealth ?? 20) < threshold
    : bb.hp < 6
);

export const isStarving = new Condition((bb) => {
  return bb.ctx.hunger?.isStarving() ?? false;
});

export const shouldEatNow = new Condition((bb) => {
  return bb.ctx.hunger?.shouldEat() ?? false;
});

export const hasFood = new Condition((bb) => {
  return (bb.ctx.inventory.countItem("apple") > 0)
    || (bb.ctx.inventory.countItem("cooked_beef") > 0)
    || (bb.ctx.inventory.countItem("cooked_porkchop") > 0)
    || (bb.ctx.inventory.countItem("bread") > 0)
    || (bb.ctx.inventory.countItem("cooked_chicken") > 0)
    || (bb.ctx.inventory.countItem("cooked_mutton") > 0)
    || (bb.ctx.inventory.countItem("cooked_salmon") > 0)
    || (bb.ctx.inventory.countItem("cooked_cod") > 0)
    || (bb.ctx.inventory.countItem("carrot") > 0)
    || (bb.ctx.inventory.countItem("melon_slice") > 0)
    || (bb.ctx.inventory.countItem("raw_beef") > 0)
    || (bb.ctx.inventory.countItem("raw_porkchop") > 0);
});

export const hasNoFood = new Condition((bb) => {
  const inv = bb.ctx.inventory;
  const foodItems = ["apple", "cooked_beef", "cooked_porkchop", "bread",
    "cooked_chicken", "cooked_mutton", "cooked_salmon", "cooked_cod",
    "carrot", "melon_slice", "raw_beef", "raw_porkchop"];
  return foodItems.every((item) => inv.countItem(item) === 0);
});
