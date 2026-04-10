require('dotenv').config();
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', process.env.LOG_DIR || 'logs');
const LOG_FILE = path.join(LOG_DIR, process.env.BOT_LOG_FILE || 'bot_server.log');

const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4
};

let currentLevel = 'debug';

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function getFormattedTimestamp() {
  return new Date().toISOString();
}

function getCallerModule() {
  const err = new Error();
  const stack = err.stack.split('\n');
  
  for (let i = 3; i < stack.length; i++) {
    const match = stack[i].match(/at\s+(?:(\w+)\s+)?(?:(\w+)\.(\w+)|(\S+))\s*$/);
    if (match && !stack[i].includes('logger.js')) {
      const filePath = match[4] || match[5];
      if (filePath) {
        const fileName = path.basename(filePath);
        if (fileName !== 'logger.js' && fileName !== '<anonymous>') {
          return `[${fileName}]`;
        }
      }
    }
  }
  
  return '[unknown]';
}

function formatMessage(level, message, ...args) {
  const timestamp = getFormattedTimestamp();
  const module = getCallerModule();
  const formattedMessage = args.length > 0 
    ? `${message} ${args.map(a => {
        if (a instanceof Error) return a.message;
        if (typeof a === 'object') return JSON.stringify(a);
        return String(a);
      }).join(' ')}`
    : message;
  
  return `[${timestamp}] [${level.toUpperCase()}] ${module} ${formattedMessage}\n`;
}

let logStream = null;

function getLogStream() {
  if (!logStream) {
    ensureLogDir();
    logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
  }
  return logStream;
}

function log(level, message, ...args) {
  if (LEVELS[level] > LEVELS[currentLevel]) {
    return;
  }
  
  const logMessage = formatMessage(level, message, ...args);
  
  const stream = getLogStream();
  const canWrite = stream.write(logMessage);
  if (!canWrite) {
    stream.once('drain', () => {});
  }
  
  console[level](message, ...args);
}

const logger = {
  error: (message, ...args) => log('error', message, ...args),
  warn: (message, ...args) => log('warn', message, ...args),
  info: (message, ...args) => log('info', message, ...args),
  debug: (message, ...args) => log('debug', message, ...args),
  trace: (message, ...args) => log('trace', message, ...args),
  setLevel: (level) => {
    if (LEVELS[level] !== undefined) {
      currentLevel = level;
    } else {
      logger.error(`Invalid log level: ${level}. Valid levels: ${Object.keys(LEVELS).join(', ')}`);
    }
  },
  getLevel: () => currentLevel
};

module.exports = logger;
