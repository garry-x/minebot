import type { BTNode, Blackboard } from "./types.js";

export class BehaviorTree {
  private root: BTNode;
  private blackboard: Blackboard;

  constructor(root: BTNode, blackboard: Blackboard) {
    this.root = root;
    this.blackboard = blackboard;
  }

  tick(): string | null {
    this.root.tick(this.blackboard);
    return this.blackboard.lastSkill;
  }

  getBlackboard(): Blackboard {
    return this.blackboard;
  }

  reset(): void {
    this.root.reset();
    this.blackboard.lastSkill = null;
  }
}
