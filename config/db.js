const sqlite3 = require('sqlite3').verbose();
const logger = require("../bot/logger");
const path = require('path');

const dbPath = path.resolve(__dirname, '..', 'bot', 'bot_config.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    logger.error('Could not connect to database', err);
  } else {
    logger.trace('Connected to SQLite database');
    // Set busy timeout
    db.run('PRAGMA busy_timeout = 5000', (err) => {
      if (err) {
        logger.error('Could not set busy timeout', err);
      }
    });
  }
});

db.on('error', (err) => {
  logger.error('Database error:', err.message);
});

const BotGoal = require('./models/BotGoal');
BotGoal.createTable();

const BotState = require('./models/BotState');
BotState.createTable();

// Initialize evolution tables
const EvolutionStorage = require('../bot/evolution/evolution-storage');
const evolutionStorage = new EvolutionStorage();
evolutionStorage.connect()
  .then(() => {
    logger.trace('[Evolution] Connecting to evolution database...');
    return evolutionStorage.initialize();
  })
  .then(() => {
    logger.trace('[Evolution] Evolution tables initialized successfully');
  })
  .catch((err) => {
    logger.error('[Evolution] Failed to initialize evolution tables:', err.message);
  });

module.exports = db;
