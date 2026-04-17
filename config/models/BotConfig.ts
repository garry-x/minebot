import db from '../db';

export interface BotConfigData {
  buildingWidth?: number;
  buildingLength?: number;
  buildingHeight?: number;
  buildingBlockType?: string;
  gatheringRadius?: number;
  gatheringTargets?: string[];
}

export interface BotConfigRow {
  id: number;
  user_id: string;
  building_width: number;
  building_length: number;
  building_height: number;
  building_block_type: string;
  gathering_radius: number;
  gathering_targets: string;
  created_at: string;
  updated_at: string;
}

export class BotConfig {
  static createTable(): void {
    const sql = `
      CREATE TABLE IF NOT EXISTS bot_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        building_width INTEGER DEFAULT 5,
        building_length INTEGER DEFAULT 5,
        building_height INTEGER DEFAULT 3,
        building_block_type TEXT DEFAULT 'oak_planks',
        gathering_radius INTEGER DEFAULT 10,
        gathering_targets TEXT DEFAULT '["oak_log","cobblestone","iron_ore","coal_ore"]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    db.run(sql);
  }
  
  static getByUserId(userId: string): Promise<BotConfigRow | undefined> {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM bot_configs WHERE user_id = ?', [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row as BotConfigRow | undefined);
      });
    });
  }
  
  static save(userId: string, config: BotConfigData): Promise<number> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO bot_configs 
        (user_id, building_width, building_length, building_height, building_block_type, 
         gathering_radius, gathering_targets, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;
      
      db.run(sql, [
        userId,
        config.buildingWidth || 5,
        config.buildingLength || 5,
        config.buildingHeight || 3,
        config.buildingBlockType || 'oak_planks',
        config.gatheringRadius || 10,
        JSON.stringify(config.gatheringTargets || ['oak_log', 'cobblestone', 'iron_ore', 'coal_ore'])
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }
}

export default BotConfig;