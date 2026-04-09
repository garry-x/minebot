#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, '../bot/evolution.db');
const BACKUP_PATH = path.join(__dirname, '../bot/evolution.db.backup');

async function optimizeDatabase() {
  console.log('🔧 开始优化数据库...');
  
  // 1. 创建备份
  if (fs.existsSync(DB_PATH)) {
    console.log(`📋 创建备份: ${BACKUP_PATH}`);
    fs.copyFileSync(DB_PATH, BACKUP_PATH);
  }
  
  const db = new sqlite3.Database(DB_PATH);
  
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      console.log('📊 数据库统计信息:');
      
      // 获取表信息
      db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
        if (err) {
          console.error('❌ 获取表信息失败:', err.message);
          reject(err);
          return;
        }
        
        tables.forEach(table => {
          db.get(`SELECT COUNT(*) as count FROM ${table.name}`, (err, row) => {
            if (!err && row) {
              console.log(`  表 ${table.name}: ${row.count} 条记录`);
            }
          });
        });
      });
      
      // 清理旧数据（保留最近1000条记录）
      console.log('\n🧹 清理旧数据...');
      db.run(`
        DELETE FROM experience_log 
        WHERE id NOT IN (
          SELECT id FROM experience_log 
          ORDER BY created_at DESC 
          LIMIT 1000
        )
      `, function(err) {
        if (err) {
          console.error('❌ 清理经验日志失败:', err.message);
        } else {
          console.log(`✅ 清理完成，删除 ${this.changes} 条记录`);
        }
      });
      
      // 清理无效的快照
      db.run(`
        DELETE FROM evolution_snapshots 
        WHERE created_at < datetime('now', '-7 days')
      `, function(err) {
        if (err) {
          console.error('❌ 清理快照失败:', err.message);
        } else {
          console.log(`✅ 清理完成，删除 ${this.changes} 条快照记录`);
        }
      });
      
      // 优化数据库
      console.log('\n⚡ 优化数据库结构...');
      db.run('VACUUM', (err) => {
        if (err) {
          console.error('❌ 数据库优化失败:', err.message);
        } else {
          console.log('✅ 数据库优化完成');
        }
        
        // 创建索引
        console.log('\n📈 创建/重建索引...');
        const indexes = [
          'CREATE INDEX IF NOT EXISTS idx_exp_bot_type ON experience_log(bot_id, experience_type)',
          'CREATE INDEX IF NOT EXISTS idx_exp_success ON experience_log(success)',
          'CREATE INDEX IF NOT EXISTS idx_exp_created ON experience_log(created_at)',
          'CREATE INDEX IF NOT EXISTS idx_weights_bot_domain ON evolution_weights(bot_id, domain)',
          'CREATE INDEX IF NOT EXISTS idx_snapshots_bot ON evolution_snapshots(bot_id)'
        ];
        
        let completed = 0;
        indexes.forEach(sql => {
          db.run(sql, (err) => {
            if (err) {
              console.error(`❌ 创建索引失败 (${sql}):`, err.message);
            }
            completed++;
            
            if (completed === indexes.length) {
              console.log('✅ 索引创建完成');
              
              // 最终统计
              db.get("SELECT COUNT(*) as total FROM experience_log", (err, row) => {
                if (!err && row) {
                  console.log(`\n📊 优化后统计:`);
                  console.log(`   经验记录: ${row.total} 条`);
                  
                  // 检查文件大小
                  fs.stat(DB_PATH, (err, stats) => {
                    if (!err) {
                      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
                      console.log(`   文件大小: ${sizeMB} MB`);
                      console.log(`   备份文件: ${BACKUP_PATH}`);
                      
                      console.log('\n🎉 数据库优化完成！');
                      db.close();
                      resolve();
                    }
                  });
                }
              });
            }
          });
        });
      });
    });
  });
}

// 运行优化
optimizeDatabase().catch(err => {
  console.error('❌ 数据库优化过程出错:', err);
  process.exit(1);
});