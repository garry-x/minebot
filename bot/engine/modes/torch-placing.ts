// bot/engine/modes/torch-placing.ts

import { BaseMode } from './base';
import { Vec3 } from 'vec3';

export class TorchPlacingMode extends BaseMode {
  get name() { return 'torch_placing'; }
  get priority() { return 5; }
  get description() { return 'Place torches when nearby light level is too low.'; }

  private lastPlace = 0;

  onUpdate(bot: any, delta: number): boolean {
    const now = Date.now();
    if (now - this.lastPlace < 5000) return true;

    const blockAtFeet = bot.blockAt(bot.entity.position);
    const lightLevel = blockAtFeet?.light?.blockLight ?? 0;

    if (lightLevel >= 7) return false;

    const torch = bot.inventory.findInventoryItem('torch', null);
    if (!torch) return false;

    const pos = bot.entity.position;
    const footBlock = bot.blockAt(new Vec3(Math.floor(pos.x), Math.floor(pos.y) - 1, Math.floor(pos.z)));
    if (footBlock) {
      bot.placeBlock(footBlock, null);
      this.lastPlace = now;
    }

    return true;
  }
}
