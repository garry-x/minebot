import { Bot, Entity } from 'mineflayer';
import { Vec3 } from 'vec3';
import logger from './logger';

interface MoveOptions {
  range?: number;
  timeout?: number;
}

interface FollowOptions {
  distance?: number;
}

interface TargetPosition {
  x: number;
  y: number;
  z: number;
}

interface PathfinderMovements {
}

class Pathfinder {
  private bot: Bot;
  private movements: PathfinderMovements | null;

  constructor(bot: Bot) {
    this.bot = bot;
    this.movements = null;

    if (!bot.pathfinder) {
      throw new Error('mineflayer-pathfinder plugin not loaded');
    }

    const { Movements } = require('mineflayer-pathfinder');
    const mcData = (bot as any)._client?.mcData || (bot as any).mcData;
    if (!mcData) {
      throw new Error('mcData not available');
    }
    this.movements = new Movements(bot, mcData) as PathfinderMovements;
    bot.pathfinder.setMovements(this.movements);
    logger.info('[Pathfinder] Using mineflayer-pathfinder plugin');
  }

  async moveTo(target: TargetPosition | Vec3, options: MoveOptions = {}): Promise<void> {
    const {
      range = 1,
      timeout = parseInt(process.env.PATHFINDER_TIMEOUT || '30000')
    } = options;

    const targetVec = target instanceof Vec3 ? target : new Vec3(target.x, target.y, target.z);
    logger.debug(`[Pathfinder] Moving to ${targetVec.x}, ${targetVec.y}, ${targetVec.z}`);

    return this.moveWithPlugin(targetVec, { range, timeout });
  }

  async moveWithPlugin(target: Vec3, options: MoveOptions = {}): Promise<void> {
    const { range = 1, timeout = 30000 } = options;

    const { GoalNear } = require('mineflayer-pathfinder').goals;
    const goal = new GoalNear(target.x, target.y, target.z, range);

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.bot.pathfinder.stop();
        const dist = this.bot.entity.position.distanceTo(target);
        if (dist <= range + 2) {
          logger.debug(`[Pathfinder] Close enough (${dist.toFixed(2)}), resolving`);
          resolve();
          return;
        }
        reject(new Error(`Pathfinder timeout, dist: ${dist.toFixed(2)}`));
      }, timeout);

      this.bot.pathfinder.goto(goal)
        .then(() => {
          clearTimeout(timeoutId);
          logger.debug('[Pathfinder] Reached target via plugin');
          resolve();
        })
        .catch((err: Error) => {
          clearTimeout(timeoutId);
          const dist = this.bot.entity.position.distanceTo(target);
          if (dist <= range + 2) {
            logger.debug(`[Pathfinder] Close enough after error (${dist.toFixed(2)})`);
            resolve();
            return;
          }
          logger.debug(`[Pathfinder] Plugin error: ${err.message}, dist: ${dist.toFixed(2)}`);
          reject(err);
        });
    });
  }

  async moveToBlock(blockPosition: TargetPosition | Vec3, options: MoveOptions = {}): Promise<void> {
    return this.moveTo(blockPosition, options);
  }

  async follow(entity: Entity, options: FollowOptions = {}): Promise<void> {
    const { distance = 2 } = options;

    const { GoalFollow } = require('mineflayer-pathfinder').goals;
    const goal = new GoalFollow(entity, distance);
    return this.bot.pathfinder.goto(goal);
  }

  stop(): void {
    this.bot.setControlState('forward', false);
    this.bot.setControlState('sprint', false);
    this.bot.setControlState('jump', false);
    this.bot.setControlState('left', false);
    this.bot.setControlState('right', false);

    try {
      this.bot.pathfinder.stop();
    } catch (e) {
    }

    logger.debug('[Pathfinder] Movement stopped');
  }

  isMoving(): boolean {
    return this.bot.controlState.forward ||
           this.bot.controlState.sprint ||
           this.bot.controlState.jump;
  }

  async flyTo(target: TargetPosition | Vec3, speed: number = 1): Promise<void> {
    return this.moveTo(target, { timeout: 60000 });
  }
}

export default Pathfinder;