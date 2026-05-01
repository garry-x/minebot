import type { Vec3 } from "../utils/vec3.js";

export interface BlockInfo {
  position: Vec3;
  type: number;
  stateId: number;
  name: string;
  hardness: number;
  diggable: boolean;
  solid: boolean;
  transparent: boolean;
  light: number;
}

export interface EntityInfo {
  id: bigint;
  type: string;
  position: Vec3;
  velocity: Vec3;
  health?: number;
  isHostile: boolean;
}

export interface InventorySlot {
  slot: number;
  itemId: number;
  count: number;
  metadata?: number;
  durability?: number;
  name?: string;
}

export interface WorldBlockUpdate {
  position: Vec3;
  blockStateId: number;
}

export enum BlockCategory {
  SOLID = "solid",
  LIQUID = "liquid",
  AIR = "air",
  CLIMBABLE = "climbable",
  DANGEROUS = "dangerous",
  ORE = "ore",
}
