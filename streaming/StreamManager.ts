import { BotStream, ScreenshotFn, StreamStats } from './BotStream';

export interface StreamManagerOptions {
  maxStreamsPerBot?: number;
  maxTotalStreams?: number;
  autoStopOnNoViewers?: boolean;
}

export interface OverallStats {
  totalStreams: number;
  totalViewers: number;
  totalFrames: number;
  streams: Record<string, StreamStats>;
}

export class StreamManager {
  private activeStreams: Map<string, BotStream>;
  private maxStreamsPerBot: number;
  private maxTotalStreams: number;
  private autoStopOnNoViewers: boolean;

  constructor(options: StreamManagerOptions = {}) {
    this.activeStreams = new Map();
    this.maxStreamsPerBot = options.maxStreamsPerBot || 1;
    this.maxTotalStreams = options.maxTotalStreams || 10;
    this.autoStopOnNoViewers = options.autoStopOnNoViewers !== false;
  }

  public getOrCreateStream(botId: string, options: Record<string, unknown> = {}, screenshotFn?: ScreenshotFn): BotStream {
    let stream = this.activeStreams.get(botId);

    if (!stream) {
      if (this.activeStreams.size >= this.maxTotalStreams) {
        throw new Error(`Maximum total streams reached (${this.maxTotalStreams})`);
      }

      stream = new BotStream(botId, options);

      if (screenshotFn) {
        stream.setScreenshotFn(screenshotFn);
      }

      this.activeStreams.set(botId, stream);

      stream.on('stop', ({ botId }: { botId: string }) => {
        if (this.autoStopOnNoViewers) {
          this.activeStreams.delete(botId);
        }
      });
    } else if (screenshotFn && !stream.screenshotFn) {
      stream.setScreenshotFn(screenshotFn);
    }

    return stream;
  }

  public getStream(botId: string): BotStream | null {
    return this.activeStreams.get(botId) || null;
  }

  public stopStream(botId: string): boolean {
    const stream = this.activeStreams.get(botId);
    if (stream) {
      stream.destroy();
      this.activeStreams.delete(botId);
      return true;
    }
    return false;
  }

  public getAllStreams(): StreamStats[] {
    const result: StreamStats[] = [];
    for (const [_, stream] of Array.from(this.activeStreams.entries())) {
      result.push(stream.getStats());
    }
    return result;
  }

  public hasStream(botId: string): boolean {
    return this.activeStreams.has(botId);
  }

  public setScreenshotFn(botId: string, screenshotFn: ScreenshotFn): void {
    const stream = this.activeStreams.get(botId);
    if (stream) {
      stream.setScreenshotFn(screenshotFn);
    }
  }

  public getStreamStats(botId: string): StreamStats | null {
    const stream = this.activeStreams.get(botId);
    if (!stream) return null;
    return stream.getStats();
  }

  public getOverallStats(): OverallStats {
    const stats: OverallStats = {
      totalStreams: this.activeStreams.size,
      totalViewers: 0,
      totalFrames: 0,
      streams: {}
    };

    for (const [botId, stream] of Array.from(this.activeStreams.entries())) {
      const s = stream.getStats();
      stats.totalViewers += s.viewerCount;
      stats.totalFrames += s.frameCount;
      stats.streams[botId] = s;
    }

    return stats;
  }

  public destroy(): void {
    for (const [_, stream] of Array.from(this.activeStreams.entries())) {
      stream.destroy();
    }
    this.activeStreams.clear();
  }
}

export default StreamManager;