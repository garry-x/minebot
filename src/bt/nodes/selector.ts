import type { BTNode, Blackboard } from "../types.js";
import { NodeStatus } from "../types.js";

export class Selector implements BTNode {
  constructor(private children: BTNode[]) {}

  tick(bb: Blackboard): NodeStatus {
    for (const child of this.children) {
      const status = child.tick(bb);
      if (status !== NodeStatus.FAILURE) return status;
    }
    return NodeStatus.FAILURE;
  }

  reset(): void {
    for (const child of this.children) child.reset();
  }
}
