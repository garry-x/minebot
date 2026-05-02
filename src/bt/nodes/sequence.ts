import type { BTNode, Blackboard } from "../types.js";
import { NodeStatus } from "../types.js";

export class Sequence implements BTNode {
  private currentChild: number = 0;

  constructor(private children: BTNode[]) {}

  tick(bb: Blackboard): NodeStatus {
    while (this.currentChild < this.children.length) {
      const status = this.children[this.currentChild].tick(bb);
      if (status === NodeStatus.FAILURE) {
        this.currentChild = 0;
        return NodeStatus.FAILURE;
      }
      if (status === NodeStatus.RUNNING) {
        return NodeStatus.RUNNING;
      }
      this.currentChild++;
    }
    this.currentChild = 0;
    return NodeStatus.SUCCESS;
  }

  reset(): void {
    this.currentChild = 0;
    for (const child of this.children) child.reset();
  }
}
