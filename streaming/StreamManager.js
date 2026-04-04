const BotStream = require('./BotStream');

class StreamManager {
  constructor(options = {}) {
    this.activeStreams = new Map();
    this.maxStreamsPerBot = options.maxStreamsPerBot || 1;
    this.maxTotalStreams = options.maxTotalStreams || 10;
    this.autoStopOnNoViewers = options.autoStopOnNoViewers !== false;
  }

  getOrCreateStream(botId, options = {}, screenshotFn) {
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
      
      stream.on('stop', ({ botId }) => {
        if (this.autoStopOnNoViewers) {
          this.activeStreams.delete(botId);
        }
      });
    } else if (screenshotFn && !stream.screenshotFn) {
      stream.setScreenshotFn(screenshotFn);
    }
    
    return stream;
  }

  getStream(botId) {
    return this.activeStreams.get(botId) || null;
  }

  stopStream(botId) {
    const stream = this.activeStreams.get(botId);
    if (stream) {
      stream.destroy();
      this.activeStreams.delete(botId);
      return true;
    }
    return false;
  }

  getAllStreams() {
    const result = [];
    for (const [botId, stream] of this.activeStreams) {
      result.push(stream.getStats());
    }
    return result;
  }

  hasStream(botId) {
    return this.activeStreams.has(botId);
  }

  setScreenshotFn(botId, screenshotFn) {
    const stream = this.activeStreams.get(botId);
    if (stream) {
      stream.setScreenshotFn(screenshotFn);
    }
  }

  getStreamStats(botId) {
    const stream = this.activeStreams.get(botId);
    if (!stream) return null;
    return stream.getStats();
  }

  getOverallStats() {
    const stats = {
      totalStreams: this.activeStreams.size,
      totalViewers: 0,
      totalFrames: 0,
      streams: {}
    };
    
    for (const [botId, stream] of this.activeStreams) {
      const s = stream.getStats();
      stats.totalViewers += s.viewerCount;
      stats.totalFrames += s.frameCount;
      stats.streams[botId] = s;
    }
    
    return stats;
  }

  destroy() {
    for (const [botId, stream] of this.activeStreams) {
      stream.destroy();
    }
    this.activeStreams.clear();
  }
}

module.exports = StreamManager;
