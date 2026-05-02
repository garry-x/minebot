import { Action } from "../nodes/action.js";
import type { Blackboard } from "../types.js";

export const waitTicks = (ticks: number) => {
  let elapsed = 0;
  return new Action(
    "idle",
    () => { elapsed = 0; },
    () => { elapsed++; return elapsed >= ticks; }
  );
};
