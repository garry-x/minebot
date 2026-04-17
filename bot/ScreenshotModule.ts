import { Bot } from 'mineflayer';

interface CaptureOptions {
  width?: number;
  height?: number;
  quality?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Canvas = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CanvasRenderingContext2D = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Three = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WorldView = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Viewer = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WebGLRenderer = any;

class ScreenshotModule {
  private bot: Bot;
  private canvas: Canvas | null;
  private ctx: CanvasRenderingContext2D | null;
  private isInitialized: boolean;
  private usePrismarine: boolean;
  private renderer: WebGLRenderer | null;
  private viewer: Viewer | null;
  private worldView: WorldView | null;

  constructor(bot: Bot) {
    this.bot = bot;
    this.canvas = null;
    this.ctx = null;
    this.isInitialized = false;
    this.usePrismarine = true;
    this.renderer = null;
    this.viewer = null;
    this.worldView = null;
  }

  async initialize(width: number, height: number): Promise<boolean> {
    const { createCanvas } = require('canvas');
    this.canvas = createCanvas(width, height);
    this.ctx = this.canvas.getContext('2d');

    this.usePrismarine = true;

    this.isInitialized = true;
    const logger = require('./logger');
    logger.debug(`[Screenshot] Module initialized: ${width} x ${height} (prismarine: ${this.usePrismarine})`);
    return true;
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  async captureWithOptions(options: CaptureOptions = {}): Promise<Buffer> {
    if (!this.isInitialized) {
      throw new Error('Screenshot module not initialized');
    }

    const { width = 854, height = 480, quality = 0.8 } = options;

    this.canvas!.width = width;
    this.canvas!.height = height;
    this.ctx!.fillStyle = '#000000';
    this.ctx!.fillRect(0, 0, width, height);

    const logger = require('./logger');

    if (this.usePrismarine && this.bot && this.bot.entity && this.bot.entity.position) {
      try {
        const THREE: any = require('three');
        const { WorldView: WV, Viewer: V } = require('prismarine-viewer/viewer') as {
          WorldView: new (world: unknown, renderDistance: number, position: unknown) => WorldView;
          Viewer: new (renderer: WebGLRenderer) => Viewer;
        };

        if ((this.bot as any).isAlive) {
          if (!this.renderer) {
            this.renderer = new THREE.WebGLRenderer({
              canvas: this.canvas!,
              antialias: true,
              preserveDrawingBuffer: true
            });
            this.renderer.setSize(width, height);
            this.renderer.setPixelRatio(1);

            this.viewer = new V(this.renderer);
            this.viewer.setVersion(this.bot.version);
            this.viewer.setFirstPersonCamera(
              this.bot.entity.position,
              this.bot.entity.yaw,
              this.bot.entity.pitch
            );

            this.worldView = new WV((this.bot as any).world, 6, this.bot.entity.position);
            this.viewer.listen(this.worldView);
            this.worldView.init(this.bot.entity.position);
          }

          this.viewer.update();
          this.renderer.render(this.viewer.scene, this.viewer.camera);

          const buffer = this.canvas!.toBuffer('image/jpeg', {
            quality: Math.min(Math.max(quality, 0.3), 0.95)
          });
          return buffer;
        }
      } catch (err: unknown) {
        const error = err as Error;
        logger.debug('[Screenshot] 3D rendering failed, falling back to text: ' + error.message);
      }
    }

    this.ctx!.fillStyle = '#ffffff';
    this.ctx!.font = '16px Arial';

    let yOffset = 30;
    if (this.bot && this.bot.entity && this.bot.entity.position) {
      const pos = this.bot.entity.position;
      this.ctx!.fillText(`Bot: ${this.bot.username}`, 10, yOffset);
      yOffset += 20;
      this.ctx!.fillText(`Position: ${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)}`, 10, yOffset);
      yOffset += 20;
      this.ctx!.fillText(`Health: ${this.bot.health} | Food: ${this.bot.food}`, 10, yOffset);
      yOffset += 20;
      this.ctx!.fillText(`Dimension: ${(this.bot as any).world.dimension}`, 10, yOffset);
      yOffset += 20;
      this.ctx!.fillText(`Time: ${this.bot.time.timeOfDay}`, 10, yOffset);
    } else {
      this.ctx!.fillText('Bot not connected', 10, yOffset);
    }

    return this.canvas!.toBuffer('image/jpeg', { quality: Math.min(Math.max(quality, 0.3), 0.95) });
  }

  async capture(): Promise<Buffer> {
    return this.captureWithOptions({});
  }

  destroy(): void {
    this.canvas = null;
    this.ctx = null;
    this.renderer = null;
    this.viewer = null;
    this.worldView = null;
    this.isInitialized = false;
  }
}

export = ScreenshotModule;