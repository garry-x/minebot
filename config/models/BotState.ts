import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = path.resolve(__dirname, '../../bot/bot_config.db');
const db = new sqlite3.Database(dbPath);

// Enable WAL mode for better concurrent write performance
db.run('PRAGMA journal_mode=WAL');
db.run('PRAGMA synchronous=NORMAL');

export interface BotStateData {
  username: string;
  mode?: string;
  position_x?: number | null;
  position_y?: number | null;
  position_z?: number | null;
  health?: number;
  food?: number;
  status?: string;
  stop_reason?: string | null;
}

export interface BotStateRow {
  bot_id: string;
  username: string;
  mode: string;
  position_x: number | null;
  position_y: number | null;
  position_z: number | null;
  health: number;
  food: number;
  status: string;
  stop_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServerStateData {
  status?: string;
  port?: number | null;
  pid?: number | null;
  uptime_seconds?: number;
  last_started_at?: string | null;
  last_stopped_at?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ServerStateRow {
  server_type: string;
  status: string;
  port: number | null;
  pid: number | null;
  uptime_seconds: number;
  last_started_at: string | null;
  last_stopped_at: string | null;
  metadata: string;
  updated_at: string;
}

export interface BotEventData {
  eventType: string;
  message?: string;
  data?: unknown;
}

export interface BotEventRow {
  id: number;
  bot_id: string;
  event_type: string;
  message: string | null;
  data: string | null;
  created_at: string;
}

export class BotState {
  static createTable(): Promise<void> {
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
          stop_reason TEXT DEFAULT NULL,
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
          
          db.run('CREATE INDEX IF NOT EXISTS idx_bot_states_status ON bot_states(status)', function(err) {
            if (err) return reject(err);
            
            db.run('CREATE INDEX IF NOT EXISTS idx_bot_states_updated_at ON bot_states(updated_at)', function(err) {
              if (err) return reject(err);
              
              db.run('CREATE INDEX IF NOT EXISTS idx_bot_states_status_updated ON bot_states(status, updated_at)', function(err) {
                if (err) return reject(err);
                resolve();
              });
            });
          });
        });
      });
    });
  }
  
  static saveBot(botId: string, data: BotStateData): Promise<number> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO bot_states 
        (bot_id, username, mode, position_x, position_y, position_z, health, food, status, stop_reason, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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
        data.status || 'active',
        data.stop_reason || null
      ], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }
  
  static getActiveBots(): Promise<BotStateRow[]> {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM bot_states WHERE status = ?', ['active'], (err, rows) => {
        if (err) reject(err);
        else resolve(rows as BotStateRow[]);
      });
    });
  }
  
  static getAllBots(): Promise<BotStateRow[]> {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM bot_states ORDER BY created_at DESC', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows as BotStateRow[]);
      });
    });
  }
  
  static getBotsToAutoRestart(): Promise<BotStateRow[]> {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM bot_states WHERE status = 'stopped' AND stop_reason = 'server_stop'`;
      db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve((rows || []) as BotStateRow[]);
      });
    });
  }
  
  static getBot(botId: string): Promise<BotStateRow | undefined> {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM bot_states WHERE bot_id = ?', [botId], (err, row) => {
        if (err) reject(err);
        else resolve(row as BotStateRow | undefined);
      });
    });
  }
  
  static getBotById(botId: string): Promise<BotStateRow | undefined> {
    return this.getBot(botId);
  }
  
  static updateBotStatus(botId: string, status: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const sql = 'UPDATE bot_states SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE bot_id = ?';
      db.run(sql, [status, botId], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }
  
  static deleteBot(botId: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM bot_states WHERE bot_id = ?';
      db.run(sql, [botId], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }
  
  static deleteAllBots(): Promise<number> {
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
  
  static saveServerState(serverType: string, data: ServerStateData): Promise<number> {
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
  
  static getServerState(serverType: string): Promise<ServerStateRow | undefined> {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM server_states WHERE server_type = ?', [serverType], (err, row) => {
        if (err) reject(err);
        else resolve(row as ServerStateRow | undefined);
      });
    });
  }
  
  static cleanupOldBots(daysOld: number = 30): Promise<number> {
    return new Promise((resolve, reject) => {
      const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();
      const sql = 'DELETE FROM bot_states WHERE status = ? AND updated_at < ?';
      db.run(sql, ['stopped', cutoffDate], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  // Bot events storage
  static createEventsTable(): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `
        CREATE TABLE IF NOT EXISTS bot_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          bot_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          message TEXT,
          data TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;
      
      db.run(sql, function(err) {
        if (err) {
          return reject(err);
        }
        
        // Create index for faster queries
        const indexSql = `
          CREATE INDEX IF NOT EXISTS idx_bot_events_bot_id_created 
          ON bot_events(bot_id, created_at DESC)
        `;
        
        db.run(indexSql, function(err) {
          if (err) {
            return reject(err);
          }
          resolve();
        });
      });
    });
  }

  static addEvent(botId: string, eventType: string, message: string, data: unknown = null): Promise<number> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO bot_events (bot_id, event_type, message, data)
        VALUES (?, ?, ?, ?)
      `;
      
      db.run(sql, [botId, eventType, message, data ? JSON.stringify(data) : null], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  static getEvents(botId: string, limit: number = 50): Promise<BotEventRow[]> {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM bot_events 
        WHERE bot_id = ? 
        ORDER BY created_at DESC 
        LIMIT ?
      `;
      
      db.all(sql, [botId, limit], (err, rows) => {
        if (err) reject(err);
        else resolve((rows || []) as BotEventRow[]);
      });
    });
  }

  static clearOldEvents(botId: string, keepCount: number = 100): Promise<number> {
    return new Promise((resolve, reject) => {
      // Keep only the most recent events
      const sql = `
        DELETE FROM bot_events 
        WHERE bot_id = ? 
        AND id NOT IN (
          SELECT id FROM bot_events 
          WHERE bot_id = ? 
          ORDER BY created_at DESC 
          LIMIT ?
        )
      `;
      
      db.run(sql, [botId, botId, keepCount], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }
}

export default BotState;