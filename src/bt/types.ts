import type { SkillContext } from "../skills/skill.js";
import type { Vec3 } from "../utils/vec3.js";

export enum NodeStatus { SUCCESS, FAILURE, RUNNING }

export enum PhaseType {
  SPAWN = 0,
  STONE = 1,
  IRON = 2,
  DIAMOND = 3,
  NETHER_ENTRY = 4,
  NETHER = 5,
  END_PREP = 6,
  STRONGHOLD = 7,
  END = 8,
}

export interface SafehouseState {
  built: boolean;
  position: Vec3 | null;
  hasWorkbench: boolean;
  hasFurnace: boolean;
  hasTorches: boolean;
  chestCount: number;
}

export interface StockpileState {
  trackedChests: Vec3[];
  lastDepositTime: number;
  stockpileMet: boolean;
}

export interface OrganizationState {
  hotbarLayoutOk: boolean;
  hasGarbage: boolean;
  lastSortTime: number;
}

export interface Blackboard {
  ctx: SkillContext;
  currentPhase: PhaseType;
  phaseData: Record<string, unknown>;
  safehouseState: SafehouseState;
  stockpileState: StockpileState;
  organizationState: OrganizationState;
  hp: number;
  daytime: boolean;
  dimension: number;
  lastSkill: string | null;
}

export interface BTNode {
  tick(bb: Blackboard): NodeStatus;
  reset(): void;
}
