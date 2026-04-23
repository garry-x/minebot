// bot/engine/modes/base.ts

import type { Mode } from '../mode-controller';

export abstract class BaseMode implements Mode {
  abstract get name(): string;
  abstract get priority(): number;
  abstract get description(): string;
  tickRate = 300;
  isEventDriven = false;

  on?(bot: any): void {}
  off?(bot: any): void {}
  abstract onUpdate(bot: any, delta: number): boolean;
}
