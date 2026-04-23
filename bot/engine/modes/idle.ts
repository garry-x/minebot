// bot/engine/modes/idle.ts

import { BaseMode } from './base';

export class IdleMode extends BaseMode {
  get name() { return 'idle'; }
  get priority() { return 7; }
  get description() { return 'Default fallback mode - no action.'; }

  onUpdate(bot: any, delta: number): boolean {
    return false;
  }
}
