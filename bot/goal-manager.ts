// bot/goal-manager.ts

import { Logger } from './logger';

export type GoalState = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'FAILED';
export type GoalType = 'SELF_PROMPTER' | 'COMMAND' | 'MANUAL';

export interface Goal {
  id: string;
  name: string;
  description: string;
  state: GoalState;
  type: GoalType;
  createdAt: number;
  completedAt?: number;
  commands?: string[];
  result?: string;
}

export interface GoalParams {
  name: string;
  description: string;
  type: GoalType;
  commands?: string[];
}

export class GoalManager {
  private goals = new Map<string, Goal>();
  private activeGoals = new Set<string>();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  create(type: GoalType, params: GoalParams): Goal {
    const id = `goal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const goal: Goal = {
      id,
      name: params.name,
      description: params.description,
      state: 'ACTIVE',
      type,
      createdAt: Date.now(),
      commands: params.commands,
    };
    this.goals.set(id, goal);
    this.activeGoals.add(id);
    this.logger.info(`Goal created: ${goal.name} (${id})`);
    return goal;
  }

  complete(id: string, result?: string): void {
    const goal = this.goals.get(id);
    if (goal) {
      goal.state = 'COMPLETED';
      goal.completedAt = Date.now();
      goal.result = result;
      this.activeGoals.delete(id);
      this.logger.info(`Goal completed: ${goal.name}`);
    }
  }

  fail(id: string, reason?: string): void {
    const goal = this.goals.get(id);
    if (goal) {
      goal.state = 'FAILED';
      goal.result = reason;
      this.activeGoals.delete(id);
      this.logger.info(`Goal failed: ${goal.name} (${reason})`);
    }
  }

  getActive(): Goal[] {
    return Array.from(this.activeGoals)
      .map(id => this.goals.get(id))
      .filter((g): g is Goal => !!g);
  }

  getHistory(): Goal[] {
    return Array.from(this.goals.values())
      .filter(g => g.state === 'COMPLETED' || g.state === 'FAILED')
      .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  }

  toContextString(): string {
    const active = this.getActive();
    const recentHistory = this.getHistory().slice(0, 5);

    let ctx = '';
    if (active.length > 0) {
      ctx += 'Active goals:\n';
      for (const g of active) {
        ctx += `  - ${g.name}: ${g.description}\n`;
      }
    }
    if (recentHistory.length > 0) {
      ctx += '\nRecent completed goals:\n';
      for (const g of recentHistory) {
        const status = g.state === 'COMPLETED' ? 'completed' : 'failed';
        const result = g.result ? ` (${g.result})` : '';
        ctx += `  - ${g.name}: ${status}${result}\n`;
      }
    }

    return ctx || 'No active or recent goals.';
  }
}
