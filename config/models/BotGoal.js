const db = require('../db');

const BotGoal = {
  table: 'bot_goals',
  
  createTable: async function() {
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
    await db.run(sql);
  },
  
  saveGoal: async function(botId, goalId, goalState) {
    const sql = `
      INSERT OR REPLACE INTO ${this.table} 
      (bot_id, goal_id, progress, goal_state, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;
    await db.run(sql, [botId, goalId, goalState.progress, JSON.stringify(goalState)]);
  },
  
  getGoal: async function(botId) {
    const sql = `SELECT * FROM ${this.table} WHERE bot_id = ? ORDER BY updated_at DESC LIMIT 1`;
    const row = await db.get(sql, [botId]);
    
    if (row) {
      return {
        ...row,
        goal_state: JSON.parse(row.goal_state)
      };
    }
    return null;
  },
  
  updateProgress: async function(botId, progress) {
    const sql = `UPDATE ${this.table} SET progress = ?, updated_at = CURRENT_TIMESTAMP WHERE bot_id = ?`;
    await db.run(sql, [progress, botId]);
  },
  
  completeGoal: async function(botId) {
    const sql = `UPDATE ${this.table} SET completed_at = CURRENT_TIMESTAMP WHERE bot_id = ?`;
    await db.run(sql, [botId]);
  }
};

module.exports = BotGoal;
