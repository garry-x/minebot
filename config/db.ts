import * as sqlite3 from 'sqlite3';
import { Database } from 'sqlite3';
import logger from '../bot/logger';
import * as path from 'path';

const dbPath = path.resolve(__dirname, '..', 'bot', 'bot_config.db');
const db: Database = new sqlite3.Database(dbPath, (err: Error | null) => {
  if (err) {
    logger.error('Could not connect to database', err);
  } else {
    logger.trace('Connected to SQLite database');
    // Set busy timeout
    db.run('PRAGMA busy_timeout = 5000', (err: Error | null) => {
      if (err) {
        logger.error('Could not set busy timeout', err);
      }
    });
  }
});

db.on('error', (err: Error) => {
  logger.error('Database error:', err.message);
});

import BotGoal from './models/BotGoal';
BotGoal.createTable();

import BotState from './models/BotState';
BotState.createTable();

export default db;