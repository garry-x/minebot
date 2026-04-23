// bot/engine/modes/building.ts

import { BaseMode } from './base';

export class BuildingMode extends BaseMode {
  get name() { return 'building'; }
  get priority() { return 6; }
  get description() { return 'Build structures when activated by command.'; }
  isEventDriven = true;

  private building = false;
  private buildQueue: { material: string; width: number; length: number; height: number; offsetX: number; offsetZ: number; offsetY: number }[] = [];
  private currentBuild: typeof this.buildQueue[number] | null = null;

  onEvent(bot: any, event: { type: string; data?: Record<string, unknown> }): void {
    if (event.type === 'build_start' && event.data) {
      this.building = true;
      this.buildQueue.push(event.data as any);
      if (!this.currentBuild) {
        this.processNextBuild(bot);
      }
    }
  }

  private processNextBuild(bot: any): void {
    if (this.buildQueue.length === 0) {
      this.building = false;
      this.currentBuild = null;
      return;
    }
    this.currentBuild = this.buildQueue.shift()!;
  }

  onUpdate(bot: any, delta: number): boolean {
    return this.building;
  }

  off(bot: any): void {
    this.building = false;
    this.buildQueue = [];
    this.currentBuild = null;
  }
}
