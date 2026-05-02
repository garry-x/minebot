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
  id: bigint;          // unique_id
  runtimeId: bigint;   // runtime_entity_id
  type: string;
  position: Vec3;
  velocity: Vec3;
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
  MINEABLE = "mineable",
  DOOR = "door",
}

export const CLIMBABLE_BLOCKS = new Set([
  "minecraft:ladder", "minecraft:vine", "minecraft:weeping_vines",
  "minecraft:twisting_vines", "minecraft:scaffolding"
]);

export const WATER_BLOCKS = new Set([
  "minecraft:water", "minecraft:flowing_water"
]);

export const MINEABLE_BLOCKS = new Set([
  "minecraft:dirt", "minecraft:grass_block", "minecraft:gravel",
  "minecraft:sand", "minecraft:stone", "minecraft:cobblestone",
  "minecraft:netherrack", "minecraft:oak_log", "minecraft:birch_log",
  "minecraft:spruce_log", "minecraft:jungle_log", "minecraft:acacia_log",
  "minecraft:dark_oak_log", "minecraft:mangrove_log",
  "minecraft:cherry_log", "minecraft:oak_leaves", "minecraft:birch_leaves",
  "minecraft:spruce_leaves", "minecraft:jungle_leaves", "minecraft:acacia_leaves",
  "minecraft:dark_oak_leaves", "minecraft:mangrove_leaves",
  "minecraft:cherry_leaves",
]);

export const DOOR_BLOCKS = new Set([
  "minecraft:wooden_door", "minecraft:iron_door",
  "minecraft:spruce_door", "minecraft:birch_door", "minecraft:jungle_door",
  "minecraft:acacia_door", "minecraft:dark_oak_door", "minecraft:mangrove_door",
  "minecraft:cherry_door", "minecraft:fence_gate", "minecraft:spruce_fence_gate",
  "minecraft:birch_fence_gate", "minecraft:jungle_fence_gate",
  "minecraft:acacia_fence_gate", "minecraft:dark_oak_fence_gate",
  "minecraft:mangrove_fence_gate", "minecraft:cherry_fence_gate",
]);
