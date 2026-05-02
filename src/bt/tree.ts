import { InterruptibleSelector } from "./nodes/interruptible.js";
import { Selector } from "./nodes/selector.js";
import { Sequence } from "./nodes/sequence.js";
import { survivalSubtree } from "./survival.js";
import { safehouseSubtree } from "./safehouse.js";
import { threatSubtree } from "./threat.js";
import { maintenanceSubtree } from "./maintenance.js";
import { spawnPhaseSubtree } from "./phases/spawn.js";
import { stonePhaseSubtree } from "./phases/stone.js";
import { ironPhaseSubtree } from "./phases/iron.js";
import { diamondPhaseSubtree } from "./phases/diamond.js";
import { netherEntrySubtree } from "./phases/nether_entry.js";
import { netherPhaseSubtree } from "./phases/nether.js";
import { endPrepSubtree } from "./phases/end_prep.js";
import { strongholdSubtree } from "./phases/stronghold.js";
import { endPhaseSubtree } from "./phases/end.js";
import { isPhase } from "./conditions/phase.js";
import { executeIdle } from "./actions/skill.js";
import { PhaseType } from "./types.js";
import type { BTNode, Blackboard } from "./types.js";

const phaseProgress: BTNode = new Selector([
  new Sequence([isPhase(PhaseType.SPAWN), spawnPhaseSubtree]),
  new Sequence([isPhase(PhaseType.STONE), stonePhaseSubtree]),
  new Sequence([isPhase(PhaseType.IRON), ironPhaseSubtree]),
  new Sequence([isPhase(PhaseType.DIAMOND), diamondPhaseSubtree]),
  new Sequence([isPhase(PhaseType.NETHER_ENTRY), netherEntrySubtree]),
  new Sequence([isPhase(PhaseType.NETHER), netherPhaseSubtree]),
  new Sequence([isPhase(PhaseType.END_PREP), endPrepSubtree]),
  new Sequence([isPhase(PhaseType.STRONGHOLD), strongholdSubtree]),
  new Sequence([isPhase(PhaseType.END), endPhaseSubtree]),
]);

export const rootTree = new InterruptibleSelector([
  // 1. SURVIVAL (life or death)
  survivalSubtree,
  // 2. THREAT_RESPONSE
  threatSubtree,
  // 3. PHASE_PROGRESS — work on current phase goals
  phaseProgress,
  // 4. SAFEHOUSE — maintenance only (first build is in SPAWN phase)
  safehouseSubtree,
  // 5. MAINTENANCE
  maintenanceSubtree,
  // 6. IDLE (fallback)
  executeIdle,
]);

export function determinePhase(bb: Blackboard): PhaseType {
  const inv = bb.ctx.inventory;

  if (bb.dimension === 2) return PhaseType.END;

  if (inv.countItem("ender_eye") >= 12) {
    return PhaseType.STRONGHOLD;
  }
  if (inv.countItem("blaze_rod") >= 6 && inv.countItem("ender_pearl") >= 12) {
    return PhaseType.END_PREP;
  }

  if (bb.dimension === 1) return PhaseType.NETHER;
  if (inv.countItem("obsidian") >= 10 && inv.hasItem("flint_and_steel")) {
    return PhaseType.NETHER_ENTRY;
  }

  if (inv.hasItem("diamond") || inv.hasItem("diamond_pickaxe")) {
    return PhaseType.DIAMOND;
  }

  if (inv.countItem("iron_ingot") >= 3 || inv.hasItem("iron_pickaxe")
    || inv.hasItem("iron_chestplate")) {
    return PhaseType.IRON;
  }

  if (inv.hasItem("stone_pickaxe") && inv.countItem("cobblestone") >= 8) {
    return PhaseType.STONE;
  }

  return PhaseType.SPAWN;
}
