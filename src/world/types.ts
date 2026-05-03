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

export enum MobCategory {
  HOSTILE = "hostile",
  NEUTRAL = "neutral",
  FRIENDLY = "friendly",
  PASSIVE = "passive",
  PLAYER = "player",
}

export interface EntityInfo {
  id: bigint;
  runtimeId: bigint;
  type: string;
  position: Vec3;
  velocity: Vec3;
  isHostile: boolean;
  isPlayer: boolean;
  isFriendly: boolean;
  category: MobCategory;
}

export interface InventorySlot {
  slot: number;
  itemId: number;
  count: number;
  metadata?: number;
  durability?: number;
  maxDurability?: number;
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
  "ladder", "vine", "weeping_vines",
  "twisting_vines", "scaffolding"
]);

export const WATER_BLOCKS = new Set([
  "water", "flowing_water"
]);

export const MINEABLE_BLOCKS = new Set([
  "dirt", "grass_block", "gravel",
  "sand", "stone", "cobblestone",
  "netherrack", "oak_log", "birch_log",
  "spruce_log", "jungle_log", "acacia_log",
  "dark_oak_log", "mangrove_log",
  "cherry_log", "oak_leaves", "birch_leaves",
  "spruce_leaves", "jungle_leaves", "acacia_leaves",
  "dark_oak_leaves", "mangrove_leaves",
  "cherry_leaves",
]);

export const DOOR_BLOCKS = new Set([
  "wooden_door", "iron_door",
  "spruce_door", "birch_door", "jungle_door",
  "acacia_door", "dark_oak_door", "mangrove_door",
  "cherry_door", "fence_gate", "spruce_fence_gate",
  "birch_fence_gate", "jungle_fence_gate",
  "acacia_fence_gate", "dark_oak_fence_gate",
  "mangrove_fence_gate", "cherry_fence_gate",
]);
