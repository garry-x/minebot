import type { Bot } from 'mineflayer';
import type { Vec3 } from 'vec3';

export interface BotRef {
  bot: Bot;
}

// World snapshot
export interface WorldState {
  time: {
    timeOfDay: number;  // 0-24000, <13000 = daytime
    isDaytime: boolean;
  };
  weather: string;
  nearbyEntities: NearbyEntity[];
  nearbyBlocks: string[];
  lightLevel: number;
}

export interface NearbyEntity {
  type: string;
  distance: number;
  name?: string;
  hostiles?: string[];  // entity types
}

// Inventory snapshot
export interface Inventory {
  items: InventoryItem[];
  counts: Record<string, number>;
  armor: {
    head?: string;
    chest?: string;
    legs?: string;
    feet?: string;
  };
}

export interface InventoryItem {
  name: string;
  count: number;
  slot: number;
}

// Assessment results
export interface AssessmentResult {
  health: number;
  maxHealth: number;
  food: number;
  hunger: number;
  experience: number;
  inventoryCount: Record<string, number>;
  nearbyHostiles: number;
  dangerousMobs: string[];
  threatScore: number;
  isOverwhelmed: boolean;
  isDaytime: boolean;
  damageRecent: boolean;
}

export type Priority =
  | 'emergency'
  | 'survival'
  | 'food'
  | 'heal'
  | 'gather_food'
  | 'combat'
  | 'goal_progress';

export type ActionType =
  | 'idle'
  | 'gather'
  | 'heal_immediate'
  | 'find_shelter'
  | 'combat'
  | 'retreat'
  | 'craft'
  | 'build'
  | 'explore';

export type ThreatLevel = 'low' | 'medium' | 'high' | 'critical';
export type HealthStatus = 'safe' | 'warning' | 'critical';

// LLM decision result
export interface LLMDecision {
  reason: string;
  primaryAction: ActionType;
  target: {
    type: 'block' | 'entity' | 'position' | 'item';
    value: string;
  };
  urgency: 'high' | 'medium' | 'low';
  strategy: string;
}

// Event types
export type GameEventType =
  | 'bot_death'
  | 'bot_hurt'
  | 'bot_respawn'
  | 'entity_spawn'
  | 'entity_die'
  | 'entity_attack'
  | 'item_pickup'
  | 'block_mined'
  | 'block_placed'
  | 'inventory_changed'
  | 'health_changed'
  | 'food_changed';

export interface GameEvent {
  type: GameEventType;
  timestamp: number;
  data?: Record<string, unknown>;
}

// Hostile mob definitions
export const HOSTILE_MOBS = [
  'zombie', 'skeleton', 'spider', 'creeper', 'enderman',
  'witch', 'slime', 'phantom', 'drowned', 'pillager',
  'ravager', 'vex', 'husk', 'stray', 'drowned',
] as const;

export const DANGEROUS_MOBS = [
  'creeper', 'blaze', 'ghast', 'ravager', 'wither_skeleton',
  'enderman', 'phantom', 'witch',
] as const;

// Mob strategy
export interface MobStrategy {
  retreatDist: number;
  action: 'aggressive' | 'keep_distance' | 'close_distance' | 'cautious';
}

export const MOB_STRATEGIES: Record<string, MobStrategy> = {
  creeper:       { retreatDist: 8,  action: 'keep_distance' },
  skeleton:      { retreatDist: 5,  action: 'close_distance' },
  zombie:        { retreatDist: 3,  action: 'aggressive' },
  enderman:      { retreatDist: 6,  action: 'cautious' },
  phantom:       { retreatDist: 10, action: 'keep_distance' },
  ravager:       { retreatDist: 10, action: 'keep_distance' },
  spider:        { retreatDist: 4,  action: 'aggressive' },
  witch:         { retreatDist: 6,  action: 'keep_distance' },
  slime:         { retreatDist: 4,  action: 'aggressive' },
  blaze:         { retreatDist: 8,  action: 'keep_distance' },
  husk:          { retreatDist: 3,  action: 'aggressive' },
  stray:         { retreatDist: 5,  action: 'close_distance' },
  drowned:       { retreatDist: 3,  action: 'aggressive' },
  pillager:      { retreatDist: 6,  action: 'keep_distance' },
  vex:           { retreatDist: 5,  action: 'aggressive' },
  wither_skeleton: { retreatDist: 5, action: 'aggressive' },
};
