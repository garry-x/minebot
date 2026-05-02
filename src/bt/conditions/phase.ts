import { Condition } from "../nodes/condition.js";
import { PhaseType } from "../types.js";
import type { Blackboard } from "../types.js";

export const isPhase = (phase: PhaseType) => new Condition(
  (bb) => bb.currentPhase === phase
);

export const hasReachedPhase = (phase: PhaseType) => new Condition(
  (bb) => bb.currentPhase >= phase
);
