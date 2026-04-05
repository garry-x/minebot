const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.resolve(__dirname, '../bot/bot_config.db'));

const BotGoal = {
  table: 'bot_goals',
  
  createTable: function() {
    return new Promise((resolve, reject) => {
      const sql = `
        CREATE TABLE IF NOT EXISTS ${this.table} (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          bot_id TEXT NOT NULL,
          goal_id TEXT NOT NULL,
          progress REAL DEFAULT 0,
          goal_state TEXT,
          started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          completed_at TIMESTAMP,
          FOREIGN KEY (bot_id) REFERENCES bot_states(bot_id)
        )
      `;
      db.run(sql, function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  },
  
  saveGoal: function(botId, goalId, goalState) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO ${this.table} 
        (bot_id, goal_id, progress, goal_state, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;
      db.run(sql, [botId, goalId, goalState.progress, JSON.stringify(goalState)], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  },
  
  getGoal: function(botId) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM ${this.table} WHERE bot_id = ? ORDER BY updated_at DESC LIMIT 1`;
      db.get(sql, [botId], (err, row) => {
        if (err) reject(err);
        else if (row) {
          resolve({
            ...row,
            goal_state: JSON.parse(row.goal_state)
          });
        } else {
          resolve(null);
        }
      });
    });
  },
  
  updateProgress: function(botId, progress) {
    return new Promise((resolve, reject) => {
      const sql = `UPDATE ${this.table} SET progress = ?, updated_at = CURRENT_TIMESTAMP WHERE bot_id = ?`;
      db.run(sql, [progress, botId], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  },
  
  completeGoal: function(botId) {
    return new Promise((resolve, reject) => {
      const sql = `UPDATE ${this.table} SET completed_at = CURRENT_TIMESTAMP WHERE bot_id = ?`;
      db.run(sql, [botId], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }
};

module.exports = BotGoal;
