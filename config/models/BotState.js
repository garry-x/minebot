const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, '../../bot_config.db');
const db = new sqlite3.Database(dbPath);

class BotState {
  static createTable() {
    return new Promise((resolve, reject) => {
      const sql = `
        CREATE TABLE IF NOT EXISTS bot_states (
          bot_id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          mode TEXT DEFAULT 'survival',
          position_x REAL,
          position_y REAL,
          position_z REAL,
          health INTEGER DEFAULT 20,
          food INTEGER DEFAULT 20,
          status TEXT DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;
      
      db.run(sql, function(err) {
        if (err) {
          return reject(err);
        }
        
        const serverSql = `
          CREATE TABLE IF NOT EXISTS server_states (
            server_type TEXT PRIMARY KEY,
            status TEXT DEFAULT 'running',
            port INTEGER,
            pid INTEGER,
            uptime_seconds INTEGER DEFAULT 0,
            last_started_at TIMESTAMP,
            last_stopped_at TIMESTAMP,
            metadata TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `;
        
        db.run(serverSql, function(err) {
          if (err) {
            return reject(err);
          }
          resolve();
        });
      });
    });
  }
  
  static saveBot(botId, data) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO bot_states 
        (bot_id, username, mode, position_x, position_y, position_z, health, food, status, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;
      
      db.run(sql, [
        botId,
        data.username,
        data.mode || 'survival',
        data.position_x || null,
        data.position_y || null,
        data.position_z || null,
        data.health || 20,
        data.food || 20,
        data.status || 'active'
      ], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }
  
  static getActiveBots() {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM bot_states WHERE status = ?', ['active'], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
  
  static getAllBots() {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM bot_states ORDER BY created_at DESC', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
  
  static getBot(botId) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM bot_states WHERE bot_id = ?', [botId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
  
  static getBotById(botId) {
    return this.getBot(botId);
  }
  
  static updateBotStatus(botId, status) {
    return new Promise((resolve, reject) => {
      const sql = 'UPDATE bot_states SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE bot_id = ?';
      db.run(sql, [status, botId], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }
  
  static deleteBot(botId) {
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM bot_states WHERE bot_id = ?';
      db.run(sql, [botId], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }
  
  static deleteAllBots() {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        db.run('UPDATE bot_states SET status = ?', ['stopped'], function(err) {
          if (err) {
            db.run('ROLLBACK');
            return reject(err);
          }
          
          db.run('DELETE FROM bot_states', [], function(err) {
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }
            db.run('COMMIT');
            resolve(this.changes);
          });
        });
      });
    });
  }
  
  static saveServerState(serverType, data) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO server_states 
        (server_type, status, port, pid, uptime_seconds, last_started_at, last_stopped_at, metadata, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;
      
      db.run(sql, [
        serverType,
        data.status || 'running',
        data.port || null,
        data.pid || null,
        data.uptime_seconds || 0,
        data.last_started_at || null,
        data.last_stopped_at || null,
        JSON.stringify(data.metadata || {})
      ], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }
  
  static getServerState(serverType) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM server_states WHERE server_type = ?', [serverType], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
  
  static cleanupOldBots(daysOld = 30) {
    return new Promise((resolve, reject) => {
      const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();
      const sql = 'DELETE FROM bot_states WHERE status = ? AND updated_at < ?';
      db.run(sql, ['stopped', cutoffDate], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }
}

module.exports = BotState;
