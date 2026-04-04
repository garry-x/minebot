const express = require('express');
const router = express.Router();
const { createStreamManager } = require('../streaming');

const streamManager = createStreamManager({
  maxStreamsPerBot: 1,
  maxTotalStreams: 10,
  autoStopOnNoViewers: true
});

module.exports = function(activeBots) {

  router.get('/streams', (req, res) => {
    try {
      const allStreams = streamManager.getAllStreams();
      res.json({ success: true, streams: allStreams, total: allStreams.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/streams/:botId', (req, res) => {
    try {
      const { botId } = req.params;
      const stats = streamManager.getStreamStats(botId);
      
      if (!stats) {
        return res.status(404).json({ error: 'Stream not found', botId });
      }
      
      res.json({ success: true, stream: stats });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/streams/:botId/start', (req, res) => {
    try {
      const { botId } = req.params;
      const { fps = 20, quality = 0.7, width = 854, height = 480 } = req.body;
      
      const bot = activeBots.get(botId);
      if (!bot) {
        return res.status(404).json({ error: `Bot not found: ${botId}` });
      }
      
      if (!bot.getScreenshotFn || !bot.getScreenshotFn()) {
        return res.status(400).json({ 
          error: 'Screenshot not available',
          message: 'Bot screenshot module is not ready. Ensure canvas/prismarine-viewer are installed.'
        });
      }

      const screenshotFn = bot.getScreenshotFn();
      const stream = streamManager.getOrCreateStream(botId, { fps, quality, width, height }, screenshotFn);
      
      res.json({ 
        success: true, 
        botId,
        streamUrl: `/api/stream/${botId}/mjpeg`,
        settings: { fps, quality, width, height }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/streams/:botId/stop', (req, res) => {
    try {
      const { botId } = req.params;
      const stopped = streamManager.stopStream(botId);
      
      res.json({ 
        success: true, 
        botId,
        stopped 
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/stream/:botId/mjpeg', (req, res) => {
    try {
      const { botId } = req.params;
      const { fps = 20, quality = 0.7, width = 854, height = 480 } = req.query;
      
      const bot = activeBots.get(botId);
      if (!bot) {
        return res.status(404).send('Bot not found');
      }

      if (!bot.getScreenshotFn || !bot.getScreenshotFn()) {
        return res.status(500).send('Screenshot not available');
      }

      const screenshotFn = bot.getScreenshotFn();
      
      let stream = streamManager.getStream(botId);
      if (!stream) {
        stream = streamManager.getOrCreateStream(botId, { 
          fps: parseInt(fps), 
          quality: parseFloat(quality), 
          width: parseInt(width), 
          height: parseInt(height) 
        }, screenshotFn);
      } else {
        stream.updateOptions({ 
          fps: parseInt(fps), 
          quality: parseFloat(quality), 
          width: parseInt(width), 
          height: parseInt(height) 
        });
        
        if (!stream.screenshotFn) {
          stream.setScreenshotFn(screenshotFn);
        }
      }
      
      stream.addViewer(res);
    } catch (err) {
      console.error(`[Stream] MJPEG error: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).send('Stream error');
      }
    }
  });

  router.get('/stats', (req, res) => {
    try {
      const stats = streamManager.getOverallStats();
      res.json({ success: true, stats });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};

module.exports.streamManager = streamManager;
