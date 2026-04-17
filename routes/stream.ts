import express, { Router, Request, Response } from 'express';
import { createStreamManager } from '../streaming';
import { StreamManagerOptions, OverallStats } from '../streaming/StreamManager';
import { StreamStats, ScreenshotFn } from '../streaming/BotStream';

interface Bot {
  getScreenshotFn: () => ScreenshotFn | null;
}

interface StreamSettings {
  fps?: number;
  quality?: number;
  width?: number;
  height?: number;
}

const streamManagerOptions: StreamManagerOptions = {
  maxStreamsPerBot: 1,
  maxTotalStreams: 10,
  autoStopOnNoViewers: true
};

const streamManager = createStreamManager(streamManagerOptions);

export function streamRoutes(activeBots: Map<string, Bot>): Router {
  const router = express.Router();

  router.get('/streams', (req: Request, res: Response) => {
    try {
      const allStreams: StreamStats[] = streamManager.getAllStreams();
      res.json({ success: true, streams: allStreams, total: allStreams.length });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.get('/streams/:botId', (req: Request, res: Response) => {
    try {
      const { botId } = req.params;
      const stats: StreamStats | null = streamManager.getStreamStats(botId);

      if (!stats) {
        return res.status(404).json({ error: 'Stream not found', botId });
      }

      res.json({ success: true, stream: stats });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/streams/:botId/start', (req: Request, res: Response) => {
    try {
      const { botId } = req.params;
      const { fps = 20, quality = 0.7, width = 854, height = 480 }: StreamSettings = req.body;

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
      const stream = streamManager.getOrCreateStream(botId, { fps, quality, width, height }, screenshotFn!);

      res.json({
        success: true,
        botId,
        streamUrl: `/api/stream/${botId}/mjpeg`,
        settings: { fps, quality, width, height }
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/streams/:botId/stop', (req: Request, res: Response) => {
    try {
      const { botId } = req.params;
      const stopped = streamManager.stopStream(botId);

      res.json({
        success: true,
        botId,
        stopped
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.get('/stream/:botId/mjpeg', (req: Request, res: Response) => {
    try {
      const { botId } = req.params;
      const fps = req.query.fps ? parseInt(req.query.fps as string, 10) : 20;
      const quality = req.query.quality ? parseFloat(req.query.quality as string) : 0.7;
      const width = req.query.width ? parseInt(req.query.width as string, 10) : 854;
      const height = req.query.height ? parseInt(req.query.height as string, 10) : 480;

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
          fps,
          quality,
          width,
          height
        }, screenshotFn!);
      } else {
        stream.updateOptions({
          fps,
          quality,
          width,
          height
        });

        if (!stream.screenshotFn) {
          stream.setScreenshotFn(screenshotFn!);
        }
      }

      stream.addViewer(res as unknown as import('http').ServerResponse);
    } catch (err) {
      console.error(`[Stream] MJPEG error: ${(err as Error).message}`);
      if (!res.headersSent) {
        res.status(500).send('Stream error');
      }
    }
  });

  // Single screenshot endpoint (JPEG)
  router.get('/stream/:botId/screenshot', async (req: Request, res: Response) => {
    try {
      const { botId } = req.params;
      const width = req.query.width ? parseInt(req.query.width as string, 10) : 854;
      const height = req.query.height ? parseInt(req.query.height as string, 10) : 480;
      const quality = req.query.quality ? parseFloat(req.query.quality as string) : 0.8;

      const bot = activeBots.get(botId);
      if (!bot) {
        return res.status(404).send('Bot not found');
      }

      if (!bot.getScreenshotFn || !bot.getScreenshotFn()) {
        return res.status(500).send('Screenshot not available');
      }

      const screenshotFn = bot.getScreenshotFn();
      const buffer = await screenshotFn!({
        width,
        height,
        quality
      });

      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(buffer);
    } catch (err) {
      console.error(`[Stream] Screenshot error: ${(err as Error).message}`);
      if (!res.headersSent) {
        res.status(500).send('Screenshot error');
      }
    }
  });

  router.get('/stats', (req: Request, res: Response) => {
    try {
      const stats: OverallStats = streamManager.getOverallStats();
      res.json({ success: true, stats });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return router;
}

export { streamManager };
export default (activeBots: Map<string, Bot>) => streamRoutes(activeBots);
module.exports = { streamRoutes, streamManager };