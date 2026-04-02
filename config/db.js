const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.resolve(__dirname, '../bot_config.db'), (err) => {
  if (err) {
    console.error('Could not connect to database', err);
  } else {
    console.log('Connected to SQLite database');
    // Set busy timeout
    db.run('PRAGMA busy_timeout = 5000', (err) => {
      if (err) {
        console.error('Could not set busy timeout', err);
      }
    });
  }
});

module.exports = db;