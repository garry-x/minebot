#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, '../data/minebot.db');
const BACKUP_PATH = path.join(__dirname, '../data/minebot.db.backup');

async function optimizeDatabase() {
  console.log('🔧 Starting database optimization...');
  
  if (!fs.existsSync(DB_PATH)) {
    console.log('❌ Database file not found:', DB_PATH);
    return;
  }

  console.log(`📋 Creating backup: ${BACKUP_PATH}`);
  fs.copyFileSync(DB_PATH, BACKUP_PATH);

  const db = new sqlite3.Database(DB_PATH);
  
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      console.log('📊 Database statistics:');
      
      db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
        if (err) {
          console.error('❌ Failed to get table info:', err.message);
          reject(err);
          return;
        }
        
        tables.forEach(table => {
          db.get(`SELECT COUNT(*) as count FROM ${table.name}`, (err, row) => {
            if (!err && row) {
              console.log(`  Table ${table.name}: ${row.count} rows`);
            }
          });
        });
      });

      console.log('\n⚡ Optimizing database...');
      db.run('VACUUM', (err) => {
        if (err) {
          console.error('❌ Database optimization failed:', err.message);
        } else {
          console.log('✅ Database optimization complete');
        }
        
        console.log('\n📈 Creating indexes...');
        const indexes = [
          'CREATE INDEX IF NOT EXISTS idx_bot_states_bot_id ON bot_states(bot_id)',
          'CREATE INDEX IF NOT EXISTS idx_bot_goals_bot_id ON bot_goals(bot_id)',
          'CREATE INDEX IF NOT EXISTS idx_bot_events_bot_id ON bot_events(bot_id)'
        ];
        
        let completed = 0;
        indexes.forEach(sql => {
          db.run(sql, (err) => {
            if (err) {
              console.error(`❌ Failed to create index:`, err.message);
            }
            completed++;
            
            if (completed === indexes.length) {
              console.log('✅ Index creation complete');
              
              fs.stat(DB_PATH, (err, stats) => {
                if (!err) {
                  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
                  console.log(`\n📊 After optimization:`);
                  console.log(`   File size: ${sizeMB} MB`);
                  console.log(`   Backup: ${BACKUP_PATH}`);
                  
                  console.log('\n🎉 Database optimization complete!');
                  db.close();
                  resolve();
                }
              });
            }
          });
        });
      });
    });
  });
}

optimizeDatabase().catch(err => {
  console.error('❌ Database optimization error:', err);
  process.exit(1);
});