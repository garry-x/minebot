import type { BTNode, Blackboard } from "../types.js";
import { NodeStatus } from "../types.js";

export class Condition implements BTNode {
  constructor(private check: (bb: Blackboard) => boolean) {}

  tick(bb: Blackboard): NodeStatus {
    return this.check(bb) ? NodeStatus.SUCCESS : NodeStatus.FAILURE;
  }

  reset(): void {}
}
