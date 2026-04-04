const { EventEmitter } = require('events');

class BotStream extends EventEmitter {
  constructor(botId, options = {}) {
    super();
    
    this.botId = botId;
    this.options = {
      fps: Math.min(Math.max(options.fps || 20, 5), 30),
      quality: Math.min(Math.max(options.quality || 0.7, 0.3), 0.95),
      width: options.width || 854,
      height: options.height || 480,
      ...options
    };
    
    this.isRunning = false;
    this.viewers = new Map();
    this.frameCount = 0;
    this.startTime = null;
    this.lastFrameTime = 0;
    this.frameInterval = 1000 / this.options.fps;
    this.frameLoopTimer = null;
    this.screenshotFn = null;
    
    this.metrics = {
      bytesSent: 0,
      framesSent: 0,
      lastError: null,
      lastErrorTime: null
    };
  }

  setScreenshotFn(fn) {
    this.screenshotFn = fn;
  }

  addViewer(response) {
    if (!response || typeof response.write !== 'function') {
      throw new Error('Invalid HTTP response object');
    }

    const viewerId = `viewer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      response.writeHead(200, {
        'Content-Type': 'multipart/x-mixed-replace; boundary=--frameboundary',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Connection': 'close',
        'Pragma': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      });
    } catch (err) {
      throw new Error(`Failed to set response headers: ${err.message}`);
    }
    
    const viewer = {
      id: viewerId,
      response: response,
      connectedAt: Date.now(),
      bytesSent: 0
    };
    
    this.viewers.set(viewerId, viewer);
    
    response.on('close', () => {
      this.removeViewer(viewerId);
    });
    
    response.on('error', (err) => {
      this.removeViewer(viewerId);
    });
    
    if (!this.isRunning) {
      this.start();
    }
    
    return viewerId;
  }

  removeViewer(viewerId) {
    const viewer = this.viewers.get(viewerId);
    if (viewer) {
      this.viewers.delete(viewerId);
    }
    
    if (this.viewers.size === 0 && this.isRunning) {
      this.stop();
    }
  }

  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.startTime = Date.now();
    this.frameCount = 0;
    this.lastFrameTime = Date.now();
    
    this.emit('start', { botId: this.botId });
    
    this._runFrameLoop();
  }

  _runFrameLoop() {
    if (!this.isRunning) return;
    
    const now = Date.now();
    const elapsed = now - this.lastFrameTime;
    
    if (elapsed >= this.frameInterval) {
      this._captureAndSendFrame();
      this.lastFrameTime = now;
    }
    
    const nextTick = Math.max(0, this.frameInterval - (Date.now() - now));
    this.frameLoopTimer = setTimeout(() => this._runFrameLoop(), nextTick);
    this.frameLoopTimer.unref();
  }

  async _captureAndSendFrame() {
    if (!this.screenshotFn || this.viewers.size === 0) return;
    
    try {
      const frameBuffer = await this.screenshotFn({
        width: this.options.width,
        height: this.options.height,
        quality: this.options.quality
      });
      
      if (frameBuffer) {
        this._broadcastFrame(frameBuffer);
      }
    } catch (err) {
      this.metrics.lastError = err.message;
      this.metrics.lastErrorTime = Date.now();
    }
  }

  _broadcastFrame(imageBuffer) {
    if (!this.isRunning || this.viewers.size === 0) return;
    
    const boundary = '--frameboundary';
    const header = `\r\n${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${imageBuffer.length}\r\n\r\n`;
    const deadViewers = [];
    
    for (const [viewerId, viewer] of this.viewers) {
      try {
        if (viewer.response.writableEnded) {
          deadViewers.push(viewerId);
          continue;
        }
        
        viewer.response.write(header);
        viewer.response.write(imageBuffer);
        
        viewer.bytesSent += header.length + imageBuffer.length;
        this.metrics.bytesSent += header.length + imageBuffer.length;
      } catch (err) {
        deadViewers.push(viewerId);
      }
    }
    
    for (const viewerId of deadViewers) {
      this.removeViewer(viewerId);
    }
    
    this.frameCount++;
    this.metrics.framesSent++;
  }

  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    if (this.frameLoopTimer) {
      clearTimeout(this.frameLoopTimer);
      this.frameLoopTimer = null;
    }
    
    for (const [viewerId, viewer] of this.viewers) {
      try {
        if (!viewer.response.writableEnded) {
          viewer.response.end();
        }
      } catch (err) {
        // ignore
      }
    }
    this.viewers.clear();
    
    this.emit('stop', { botId: this.botId });
  }

  updateOptions(newOptions = {}) {
    if (newOptions.fps) {
      this.options.fps = Math.min(Math.max(newOptions.fps, 5), 30);
      this.frameInterval = 1000 / this.options.fps;
    }
    if (newOptions.quality) {
      this.options.quality = Math.min(Math.max(newOptions.quality, 0.3), 0.95);
    }
    if (newOptions.width) this.options.width = newOptions.width;
    if (newOptions.height) this.options.height = newOptions.height;
  }

  getStats() {
    const uptime = this.startTime ? Date.now() - this.startTime : 0;
    const fps = uptime > 0 ? (this.frameCount / (uptime / 1000)).toFixed(1) : 0;
    const bandwidth = uptime > 0 ? ((this.metrics.bytesSent * 8) / (uptime / 1000) / 1000000).toFixed(2) : 0;
    
    return {
      botId: this.botId,
      isRunning: this.isRunning,
      viewerCount: this.viewers.size,
      frameCount: this.frameCount,
      fps: parseFloat(fps),
      bandwidth: `${bandwidth} Mbps`,
      settings: { ...this.options },
      metrics: { ...this.metrics }
    };
  }

  destroy() {
    this.stop();
    this.removeAllListeners();
    this.screenshotFn = null;
  }
}

module.exports = BotStream;
