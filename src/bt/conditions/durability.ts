import { Condition } from "../nodes/condition.js";
import type { Blackboard } from "../types.js";

export const toolDurabilityLow = new Condition((bb) => {
  const inv = bb.ctx.inventory;
  const tools = ["wooden_pickaxe", "stone_pickaxe", "iron_pickaxe",
    "diamond_pickaxe", "wooden_sword", "stone_sword", "iron_sword",
    "diamond_sword", "wooden_axe", "stone_axe", "iron_axe", "diamond_axe"];
  for (const tool of tools) {
    const best = inv.getBestDurability(tool);
    if (best && best.durability < 0.25) return true;
  }
  return false;
});

export const armorDurabilityLow = new Condition((bb) => {
  for (let i = 0; i < 4; i++) {
    const armor = bb.ctx.inventory.getArmor(i);
    if (armor && (armor.durability ?? 1) < 0.2) return true;
  }
  return false;
});

export const hasBackupTool = new Condition((bb) => {
  const inv = bb.ctx.inventory;
  return inv.hasItem("stone_pickaxe") || inv.hasItem("iron_pickaxe")
    || inv.hasItem("diamond_pickaxe")
    || inv.countItem("iron_ingot") >= 3
    || inv.countItem("diamond") >= 3;
});
