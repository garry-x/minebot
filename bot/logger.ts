import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

interface LoggerOptions {
  level?: LogLevel;
}

interface Logger {
  error: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  debug: (message: string, ...args: unknown[]) => void;
  trace: (message: string, ...args: unknown[]) => void;
  setLevel: (level: LogLevel) => void;
  getLevel: () => LogLevel;
}

const LOG_DIR = path.join(__dirname, '..', process.env.LOG_DIR || 'logs');
const LOG_FILE = path.join(LOG_DIR, process.env.BOT_LOG_FILE || 'bot_server.log');

const LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4
};

let currentLevel: LogLevel = 'debug';

function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function getFormattedTimestamp(): string {
  return new Date().toISOString();
}

function getCallerModule(): string {
  const err = new Error();
  const stack = err.stack?.split('\n') || [];

  // V8 internal modules and node internals to skip
  const skipPatterns = [
    'logger.ts', 'logger.js',
    'timers', 'internal/timers',
    'node:internal', 'node:',
    '<anonymous>', 'native',
    'process._tickCallback',
    'Console.log', 'Console.warn', 'Console.error', 'Console.debug',
  ];

  for (let i = 2; i < stack.length; i++) {
    const frame = stack[i];
    
    // Skip if frame matches any known pattern to skip
    if (skipPatterns.some(p => frame.includes(p))) {
      continue;
    }
    
    // Standard V8 stack format: "at functionName (filePath:line:col)"
    let fileMatch = frame.match(/\(([^)]+):(\d+):(\d+)\)/);
    if (fileMatch && fileMatch[1]) {
      const filePath = fileMatch[1];
      // Skip node internals, node_modules, and internal modules
      if (filePath.includes('node_modules') || 
          filePath.startsWith('node:') || 
          filePath.includes('internal/') ||
          filePath.includes('<')) {
        continue;
      }
      const fileName = path.basename(filePath);
      if (fileName !== 'logger.ts' && fileName !== 'logger.js') {
        return `[${fileName}]`;
      }
    }
    
    // Alternative format: "at functionName filePath:line:col"
    if (!fileMatch) {
      fileMatch = frame.match(/(\S+\.ts):\d+:\d+/);
      if (fileMatch && fileMatch[1] && 
          !fileMatch[1].includes('node_modules') &&
          !fileMatch[1].includes('internal/')) {
        const fileName = path.basename(fileMatch[1]);
        if (fileName !== 'logger.ts' && fileName !== 'logger.js') {
          return `[${fileName}]`;
        }
      }
    }
  }

  return '[unknown]';
}

function formatMessage(level: LogLevel, message: string, ...args: unknown[]): string {
  const timestamp = getFormattedTimestamp();
  const module = getCallerModule();
  const formattedMessage = args.length > 0
    ? `${message} ${args.map((a) => {
        if (a instanceof Error) return a.message;
        if (typeof a === 'object') return JSON.stringify(a);
        return String(a);
      }).join(' ')}`
    : message;

  return `[${timestamp}] [${level.toUpperCase()}] ${module} ${formattedMessage}\n`;
}

let logStream: fs.WriteStream | null = null;

function getLogStream(): fs.WriteStream {
  if (!logStream) {
    ensureLogDir();
    logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
  }
  return logStream;
}

function log(level: LogLevel, message: string, ...args: unknown[]): void {
  if (LEVELS[level] > LEVELS[currentLevel]) {
    return;
  }

  const logMessage = formatMessage(level, message, ...args);

  const stream = getLogStream();
  const canWrite = stream.write(logMessage);
  if (!canWrite) {
    stream.once('drain', () => {});
  }

  if (level === 'error') {
    console.error(message, ...args);
  } else if (level === 'warn') {
    console.warn(message, ...args);
  } else if (level === 'debug') {
    console.debug(message, ...args);
  } else if (level === 'trace') {
    console.log(message, ...args);
  } else {
    console.log(message, ...args);
  }
}

const logger: Logger = {
  error: (message: string, ...args: unknown[]) => log('error', message, ...args),
  warn: (message: string, ...args: unknown[]) => log('warn', message, ...args),
  info: (message: string, ...args: unknown[]) => log('info', message, ...args),
  debug: (message: string, ...args: unknown[]) => log('debug', message, ...args),
  trace: (message: string, ...args: unknown[]) => log('trace', message, ...args),
  setLevel: (level: LogLevel): void => {
    if (LEVELS[level] !== undefined) {
      currentLevel = level;
    } else {
      logger.error(`Invalid log level: ${level}. Valid levels: ${Object.keys(LEVELS).join(', ')}`);
    }
  },
  getLevel: (): LogLevel => currentLevel
};

export default logger;