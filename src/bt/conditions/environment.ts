import { Condition } from "../nodes/condition.js";
import type { Blackboard } from "../types.js";

export const isNight = new Condition((bb) => !bb.daytime);

export const isExposed = new Condition((bb) => {
  const pos = bb.ctx.world.getPlayerPosition();
  for (let y = pos.y + 1; y <= pos.y + 10; y++) {
    if (bb.ctx.world.isBlockSolid({ x: pos.x, y, z: pos.z })) {
      return false;
    }
  }
  return true;
});

export const hostilesInRange = (range: number) => new Condition((bb) => {
  const pos = bb.ctx.world.getPlayerPosition();
  const entities = bb.ctx.world.getNearbyEntities(pos, range);
  return entities.some((e) => {
    const name = (e as any).name ?? "";
    return name.includes("zombie") || name.includes("skeleton")
      || name.includes("spider") || name.includes("creeper")
      || name.includes("enderman") || name.includes("witch")
      || name.includes("blaze") || name.includes("ghast")
      || name.includes("slime") || name.includes("phantom");
  });
});

export const isInNether = new Condition((bb) => bb.dimension === 1);

export const isInEnd = new Condition((bb) => bb.dimension === 2);
