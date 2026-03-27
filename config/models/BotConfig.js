const db = require('../db');

class BotConfig {
  static createTable() {
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
  
  static getByUserId(userId) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM bot_configs WHERE user_id = ?', [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
  
  static save(userId, config) {
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

module.exports = BotConfig;