const { createCanvas, Image } = require('canvas');

class ScreenshotModule {
  constructor(bot) {
    this.bot = bot;
    this.canvas = null;
    this.ctx = null;
    this.isInitialized = false;
  }

  async initialize(width, height) {
    this.canvas = createCanvas(width, height);
    this.ctx = this.canvas.getContext('2d');
    this.isInitialized = true;
    console.log('[Screenshot] Module initialized with size:', width, 'x', height);
    return true;
  }

  isReady() {
    return this.isInitialized;
  }

  async captureWithOptions(options = {}) {
    if (!this.isInitialized) {
      throw new Error('Screenshot module not initialized');
    }

    const { width = 854, height = 480 } = options;

    try {
      this.canvas.width = width;
      this.canvas.height = height;
      this.ctx.fillStyle = '#000000';
      this.ctx.fillRect(0, 0, width, height);

      if (this.bot && this.bot.entity && this.bot.entity.position) {
        const pos = this.bot.entity.position;
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '16px Arial';
        this.ctx.fillText(`Bot: ${this.bot.username}`, 10, 30);
        this.ctx.fillText(`Position: ${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)}`, 10, 50);
        this.ctx.fillText(`Health: ${this.bot.health} | Food: ${this.bot.food}`, 10, 70);
        this.ctx.fillText(`Dimension: ${this.bot.world.dimension}`, 10, 90);
        this.ctx.fillText(`Time: ${this.bot.time.timeOfDay}`, 10, 110);
      }

      return this.canvas.toBuffer('image/jpeg', { quality: options.quality || 0.8 });
    } catch (err) {
      console.error('[Screenshot] Capture error:', err);
      throw err;
    }
  }

  async capture() {
    return this.captureWithOptions({});
  }

  destroy() {
    this.canvas = null;
    this.ctx = null;
    this.isInitialized = false;
  }
}

module.exports = ScreenshotModule;
