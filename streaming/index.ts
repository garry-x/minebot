import { StreamManager, StreamManagerOptions } from './StreamManager';
import { BotStream, BotStreamOptions } from './BotStream';

export { StreamManager, BotStream };

export function createStreamManager(options: StreamManagerOptions = {}): StreamManager {
  return new StreamManager(options);
}

export { BotStreamOptions, StreamManagerOptions };