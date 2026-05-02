import type { BTNode, Blackboard } from "../types.js";
import { NodeStatus } from "../types.js";

export class Action implements BTNode {
  constructor(
    private skillName: string,
    private onEnter?: (bb: Blackboard) => void,
    private isComplete?: (bb: Blackboard) => boolean,
  ) {}

  tick(bb: Blackboard): NodeStatus {
    if (bb.lastSkill !== this.skillName) {
      this.onEnter?.(bb);
      bb.lastSkill = this.skillName;
    }
    if (this.isComplete?.(bb)) {
      return NodeStatus.SUCCESS;
    }
    return NodeStatus.RUNNING;
  }

  reset(): void {}
}
