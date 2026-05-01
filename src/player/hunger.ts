import { getLogger } from "../utils/logger.js";

export interface HungerState {
  hunger: number;
  saturation: number;
  exhaustion: number;
}

export const HUNGER_MAX = 20;
export const EAT_THRESHOLD = 15;
export const LOW_HEALTH_THRESHOLD = 8;

export class HungerTracker {
  hunger = 20;
  saturation = 20;
  exhaustion = 0;

  updateFromAttributes(attributes: Array<{ name: string; current: number }>): void {
    for (const attr of attributes) {
      switch (attr.name) {
        case "player.hunger":
          this.hunger = attr.current;
          break;
        case "player.saturation":
          this.saturation = attr.current;
          break;
        case "player.exhaustion":
          this.exhaustion = attr.current;
          break;
      }
    }
  }

  shouldEat(): boolean {
    return this.hunger <= EAT_THRESHOLD;
  }

  isStarving(): boolean {
    return this.hunger <= 0;
  }

  getHungerRatio(): number {
    return this.hunger / HUNGER_MAX;
  }

  reset(): void {
    this.hunger = 20;
    this.saturation = 20;
    this.exhaustion = 0;
  }
}
