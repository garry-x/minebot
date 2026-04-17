import { EventEmitter } from 'events';
import type { ServerResponse } from 'http';

export interface BotStreamOptions {
  fps?: number;
  quality?: number;
  width?: number;
  height?: number;
}

export interface ScreenshotOptions {
  width: number;
  height: number;
  quality: number;
}

export interface ScreenshotFn {
  (options: ScreenshotOptions): Promise<Buffer | null>;
}

export interface Viewer {
  id: string;
  response: ServerResponse;
  connectedAt: number;
  bytesSent: number;
}

export interface StreamMetrics {
  bytesSent: number;
  framesSent: number;
  lastError: string | null;
  lastErrorTime: number | null;
}

export interface StreamStats {
  botId: string;
  isRunning: boolean;
  viewerCount: number;
  frameCount: number;
  fps: number;
  bandwidth: string;
  settings: BotStreamOptions;
  metrics: StreamMetrics;
}

export interface StreamEventData {
  botId: string;
}

export class BotStream extends EventEmitter {
  public botId: string;
  public options: BotStreamOptions;
  public isRunning: boolean;
  public viewers: Map<string, Viewer>;
  public frameCount: number;
  public startTime: number | null;
  public lastFrameTime: number;
  public frameInterval: number;
  public screenshotFn: ScreenshotFn | null;

  private frameLoopTimer: NodeJS.Timeout | null;
  private metrics: StreamMetrics;

  constructor(botId: string, options: BotStreamOptions = {}) {
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
    this.frameInterval = 1000 / (this.options.fps || 20);
    this.frameLoopTimer = null;
    this.screenshotFn = null;

    this.metrics = {
      bytesSent: 0,
      framesSent: 0,
      lastError: null,
      lastErrorTime: null
    };
  }

  public setScreenshotFn(fn: ScreenshotFn): void {
    this.screenshotFn = fn;
  }

  public addViewer(response: ServerResponse): string {
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
      throw new Error(`Failed to set response headers: ${(err as Error).message}`);
    }

    const viewer: Viewer = {
      id: viewerId,
      response: response,
      connectedAt: Date.now(),
      bytesSent: 0
    };

    this.viewers.set(viewerId, viewer);

    response.on('close', () => {
      this.removeViewer(viewerId);
    });

    response.on('error', () => {
      this.removeViewer(viewerId);
    });

    if (!this.isRunning) {
      this.start();
    }

    return viewerId;
  }

  public removeViewer(viewerId: string): void {
    const viewer = this.viewers.get(viewerId);
    if (viewer) {
      this.viewers.delete(viewerId);
    }

    if (this.viewers.size === 0 && this.isRunning) {
      this.stop();
    }
  }

  public start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.startTime = Date.now();
    this.frameCount = 0;
    this.lastFrameTime = Date.now();

    this.emit('start', { botId: this.botId });

    this._runFrameLoop();
  }

  private _runFrameLoop(): void {
    if (!this.isRunning) return;

    const now = Date.now();
    const elapsed = now - this.lastFrameTime;

    if (elapsed >= this.frameInterval) {
      this._captureAndSendFrame();
      this.lastFrameTime = now;
    }

    const nextTick = Math.max(0, this.frameInterval - (Date.now() - now));
    this.frameLoopTimer = setTimeout(() => this._runFrameLoop(), nextTick);
    (this.frameLoopTimer as NodeJS.Timeout).unref();
  }

  private async _captureAndSendFrame(): Promise<void> {
    if (!this.screenshotFn || this.viewers.size === 0) return;

    try {
      const frameBuffer = await this.screenshotFn({
        width: this.options.width || 854,
        height: this.options.height || 480,
        quality: this.options.quality || 0.7
      });

      if (frameBuffer) {
        this._broadcastFrame(frameBuffer);
      }
    } catch (err) {
      this.metrics.lastError = (err as Error).message;
      this.metrics.lastErrorTime = Date.now();
    }
  }

  private _broadcastFrame(imageBuffer: Buffer): void {
    if (!this.isRunning || this.viewers.size === 0) return;

    const boundary = '--frameboundary';
    const header = `\r\n${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${imageBuffer.length}\r\n\r\n`;
    const deadViewers: string[] = [];

    for (const [viewerId, viewer] of Array.from(this.viewers.entries())) {
      try {
        if (viewer.response.writableEnded) {
          deadViewers.push(viewerId);
          continue;
        }

        viewer.response.write(header);
        viewer.response.write(imageBuffer);

        viewer.bytesSent += header.length + imageBuffer.length;
        this.metrics.bytesSent += header.length + imageBuffer.length;
      } catch {
        deadViewers.push(viewerId);
      }
    }

    for (const viewerId of deadViewers) {
      this.removeViewer(viewerId);
    }

    this.frameCount++;
    this.metrics.framesSent++;
  }

  public stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.frameLoopTimer) {
      clearTimeout(this.frameLoopTimer);
      this.frameLoopTimer = null;
    }

    for (const [_, viewer] of Array.from(this.viewers.entries())) {
      try {
        if (!viewer.response.writableEnded) {
          viewer.response.end();
        }
      } catch {
        // ignore
      }
    }
    this.viewers.clear();

    this.emit('stop', { botId: this.botId });
  }

  public updateOptions(newOptions: BotStreamOptions = {}): void {
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

  public getStats(): StreamStats {
    const uptime = this.startTime ? Date.now() - this.startTime : 0;
    const fps = uptime > 0 ? (this.frameCount / (uptime / 1000)).toFixed(1) : '0';
    const bandwidth = uptime > 0 ? ((this.metrics.bytesSent * 8) / (uptime / 1000) / 1000000).toFixed(2) : '0';

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

  public destroy(): void {
    this.stop();
    this.removeAllListeners();
    this.screenshotFn = null;
  }
}

export default BotStream;