const { createCanvas } = require('canvas');

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
    
    // Try to use prismarine-viewer for 3D rendering if available
    try {
      // Try to load without WebGL dependencies
      const { WorldView, Viewer } = require('prismarine-viewer/viewer');
      this.usePrismarine = true;
      console.log('[Screenshot] prismarine-viewer detected, will attempt 3D rendering');
    } catch (err) {
      this.usePrismarine = false;
      console.log('[Screenshot] prismarine-viewer not available, using text-only mode');
    }
    
    this.isInitialized = true;
    console.log('[Screenshot] Module initialized:', width, 'x', height, '(prismarine:', this.usePrismarine + ')');
    return true;
  }

  isReady() {
    return this.isInitialized;
  }

  async captureWithOptions(options = {}) {
    if (!this.isInitialized) {
      throw new Error('Screenshot module not initialized');
    }

    const { width = 854, height = 480, quality = 0.8 } = options;

    // Initialize canvas dimensions
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, width, height);

    // If prismarine-viewer is available and bot is connected, try 3D rendering
    if (this.usePrismarine && this.bot && this.bot.entity && this.bot.entity.position) {
      try {
        const THREE = require('three');
        const { WorldView, Viewer } = require('prismarine-viewer/viewer');
        
        // Only create renderer if bot is alive
        if (this.bot.isAlive) {
          if (!this.renderer) {
            this.renderer = new THREE.WebGLRenderer({ 
              canvas: this.canvas,
              antialias: true,
              preserveDrawingBuffer: true
            });
            this.renderer.setSize(width, height);
            this.renderer.setPixelRatio(1);
            
            this.viewer = new Viewer(this.renderer);
            this.viewer.setVersion(this.bot.version);
            this.viewer.setFirstPersonCamera(
              this.bot.entity.position,
              this.bot.entity.yaw,
              this.bot.entity.pitch
            );
            
            this.worldView = new WorldView(this.bot.world, 6, this.bot.entity.position);
            this.viewer.listen(this.worldView);
            this.worldView.init(this.bot.entity.position);
          }
          
          // Update and render
          this.viewer.update();
          this.renderer.render(this.viewer.scene, this.viewer.camera);
          
          const buffer = this.canvas.toBuffer('image/jpeg', { 
            quality: Math.min(Math.max(quality, 0.3), 0.95) 
          });
          return buffer;
        }
      } catch (err) {
        console.log('[Screenshot] 3D rendering failed, falling back to text:', err.message);
      }
    }

    // Fallback to text-only screenshot
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '16px Arial';
    
    let yOffset = 30;
    if (this.bot && this.bot.entity && this.bot.entity.position) {
      const pos = this.bot.entity.position;
      this.ctx.fillText(`Bot: ${this.bot.username}`, 10, yOffset);
      yOffset += 20;
      this.ctx.fillText(`Position: ${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)}`, 10, yOffset);
      yOffset += 20;
      this.ctx.fillText(`Health: ${this.bot.health} | Food: ${this.bot.food}`, 10, yOffset);
      yOffset += 20;
      this.ctx.fillText(`Dimension: ${this.bot.world.dimension}`, 10, yOffset);
      yOffset += 20;
      this.ctx.fillText(`Time: ${this.bot.time.timeOfDay}`, 10, yOffset);
    } else {
      this.ctx.fillText('Bot not connected', 10, yOffset);
    }

    return this.canvas.toBuffer('image/jpeg', { quality: Math.min(Math.max(quality, 0.3), 0.95) });
  }

  async capture() {
    return this.captureWithOptions({});
  }

  destroy() {
    this.canvas = null;
    this.ctx = null;
    this.renderer = null;
    this.viewer = null;
    this.worldView = null;
    this.isInitialized = false;
  }
}

module.exports = ScreenshotModule;
