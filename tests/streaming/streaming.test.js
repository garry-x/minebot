const BotStream = require('../streaming/BotStream');
const StreamManager = require('../streaming/StreamManager');

describe('BotStream', () => {
  let botStream;
  const botId = 'test-bot-123';

  beforeEach(() => {
    botStream = new BotStream(botId, { fps: 20, quality: 0.7 });
  });

  afterEach(() => {
    botStream.destroy();
  });

  test('should create stream with correct settings', () => {
    expect(botStream.botId).toBe(botId);
    expect(botStream.options.fps).toBe(20);
    expect(botStream.options.quality).toBe(0.7);
    expect(botStream.isRunning).toBe(false);
  });

  test('should start and stop stream', () => {
    botStream.start();
    expect(botStream.isRunning).toBe(true);
    
    botStream.stop();
    expect(botStream.isRunning).toBe(false);
  });

  test('should update options', () => {
    botStream.updateOptions({ fps: 30, quality: 0.9 });
    expect(botStream.options.fps).toBe(30);
    expect(botStream.options.quality).toBe(0.9);
    expect(botStream.frameInterval).toBe(1000 / 30);
  });

  test('should get stats', () => {
    const stats = botStream.getStats();
    expect(stats.botId).toBe(botId);
    expect(stats.isRunning).toBe(false);
    expect(stats.fps).toBe(0);
    expect(stats.settings.fps).toBe(20);
  });
});

describe('StreamManager', () => {
  let streamManager;
  const botId = 'test-bot-456';

  beforeEach(() => {
    streamManager = new StreamManager();
  });

  afterEach(() => {
    streamManager.destroy();
  });

  test('should create and manage streams', () => {
    const screenshotFn = () => Promise.resolve(Buffer.from('test'));
    
    const stream = streamManager.getOrCreateStream(botId, { fps: 20 }, screenshotFn);
    expect(stream).toBeDefined();
    expect(stream.botId).toBe(botId);
    expect(streamManager.hasStream(botId)).toBe(true);
  });

  test('should get stream stats', () => {
    const screenshotFn = () => Promise.resolve(Buffer.from('test'));
    streamManager.getOrCreateStream(botId, { fps: 20 }, screenshotFn);
    
    const stats = streamManager.getStreamStats(botId);
    expect(stats).toBeDefined();
    expect(stats.botId).toBe(botId);
  });

  test('should stop stream', () => {
    const screenshotFn = () => Promise.resolve(Buffer.from('test'));
    streamManager.getOrCreateStream(botId, { fps: 20 }, screenshotFn);
    
    const stopped = streamManager.stopStream(botId);
    expect(stopped).toBe(true);
    expect(streamManager.hasStream(botId)).toBe(false);
  });

  test('should get all streams', () => {
    const screenshotFn = () => Promise.resolve(Buffer.from('test'));
    streamManager.getOrCreateStream('bot1', { fps: 20 }, screenshotFn);
    streamManager.getOrCreateStream('bot2', { fps: 25 }, screenshotFn);
    
    const allStreams = streamManager.getAllStreams();
    expect(allStreams.length).toBe(2);
    expect(allStreams[0].botId).toBe('bot1');
    expect(allStreams[1].botId).toBe('bot2');
  });
});

// Mock test for ScreenshotModule (requires canvas/prismarine-viewer)
describe('ScreenshotModule (mock)', () => {
  test('should have correct interface', () => {
    const ScreenshotModule = require('../bot/ScreenshotModule');
    
    const mockBot = { username: 'testbot' };
    const module = new ScreenshotModule(mockBot);
    
    expect(module).toBeDefined();
    expect(typeof module.initialize).toBe('function');
    expect(typeof module.capture).toBe('function');
    expect(typeof module.destroy).toBe('function');
  });
});
