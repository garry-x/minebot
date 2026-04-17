import sqlite3 from 'sqlite3';
import path from 'path';

const db = new sqlite3.Database(path.resolve(__dirname, '../../bot/bot_config.db'));

export interface GoalState {
  progress: number;
  [key: string]: unknown;
}

export interface BotGoalRow {
  id: number;
  bot_id: string;
  goal_id: string;
  progress: number;
  goal_state: string;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface BotGoalData {
  bot_id: string;
  goal_id: string;
  goal_state: GoalState;
}

export const BotGoal = {
  table: 'bot_goals',
  
  createTable(): Promise<void> {
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
  
  saveGoal(botId: string, goalId: string, goalState: GoalState): Promise<number> {
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
  
  getGoal(botId: string): Promise<BotGoalData | null> {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM ${this.table} WHERE bot_id = ? ORDER BY updated_at DESC LIMIT 1`;
      db.get(sql, [botId], (err, row) => {
        if (err) reject(err);
        else if (row) {
          const typedRow = row as BotGoalRow;
          resolve({
            ...typedRow,
            goal_state: JSON.parse(typedRow.goal_state)
          } as BotGoalData);
        } else {
          resolve(null);
        }
      });
    });
  },
  
  updateProgress(botId: string, progress: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const sql = `UPDATE ${this.table} SET progress = ?, updated_at = CURRENT_TIMESTAMP WHERE bot_id = ?`;
      db.run(sql, [progress, botId], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  },
  
  completeGoal(botId: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const sql = `UPDATE ${this.table} SET completed_at = CURRENT_TIMESTAMP WHERE bot_id = ?`;
      db.run(sql, [botId], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }
};

export default BotGoal;