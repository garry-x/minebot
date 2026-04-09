#!/usr/bin/env node
/**
 * 日志管理工具脚本
 * 提供日志轮转、压缩、清理和统计功能
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 引入日志管理模块
const logManager = require('../bot/log-manager');

function printUsage() {
  console.log(`
日志管理工具

用法: node manage-logs.js <command> [options]

命令:
  check             检查日志是否需要轮转
  rotate           立即执行日志轮转
  compress <file>  压缩指定的日志文件
  stats            显示日志文件统计信息
  list             列出所有日志文件
  cleanup          清理超出保留期限的日志文件
  help             显示此帮助信息

选项:
  --force         强制操作（忽略确认）
  --verbose       详细输出

示例:
  node manage-logs.js check
  node manage-logs.js rotate --force
  node manage-logs.js cleanup
  node manage-logs.js stats
`);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    printUsage();
    process.exit(0);
  }
  
  const command = args[0];
  const forceFlag = args.includes('--force');
  const verboseFlag = args.includes('--verbose') || args.includes('-v');
  
  try {
    switch (command) {
      case 'check':
        const needsRotation = await logManager.checkRotationNeeded();
        if (needsRotation) {
          console.log('✅ 日志需要轮转');
          console.log('💡 使用 "node manage-logs.js rotate" 执行轮转');
        } else {
          console.log('ℹ️  日志不需要轮转');
        }
        break;
        
      case 'rotate':
        if (!forceFlag && !confirmAction('确定要执行日志轮转吗？')) {
          console.log('❌ 操作已取消');
          process.exit(0);
        }
        
        const result = await logManager.rotateLogs();
        if (result) {
          console.log('✅ 日志轮转成功');
          const stats = await logManager.getLogStats();
          console.log(`📊 新日志文件: ${stats.lines} 行, ${stats.size} 字节`);
        } else {
          console.log('❌ 日志轮转失败');
        }
        break;
        
      case 'compress':
        if (args.length < 2) {
          console.error('❌ 请指定要压缩的文件名');
          process.exit(1);
        }
        
        const fileToCompress = args[1];
        const filePath = path.isAbsolute(fileToCompress) ? fileToCompress : path.join(process.cwd(), fileToCompress);
        
        if (!fs.existsSync(filePath)) {
          console.error(`❌ 文件不存在: ${filePath}`);
          process.exit(1);
        }
        
        const compressedPath = await logManager.compressLogFile(filePath);
        console.log(`✅ 文件压缩成功: ${compressedPath}`);
        break;
        
      case 'stats':
        const stats = await logManager.getLogStats();
        
        console.log('📊 日志文件统计信息');
        console.log('─'.repeat(50));
        
        if (stats.error) {
          console.error(`❌ 获取统计信息失败: ${stats.error}`);
        } else if (!stats.currentLog.exists) {
          console.log('ℹ️  日志文件不存在');
        } else {
          console.log(`📁 当前日志文件:`);
          console.log(`  📏 大小: ${(stats.currentLog.size / (1024 * 1024)).toFixed(2)} MB`);
          console.log(`  📈 行数: ${stats.currentLog.lines} 行`);
          
          console.log(`\n📁 轮转日志文件: ${stats.rotatedLogs.length} 个`);
          if (stats.rotatedLogs.length > 0) {
            stats.rotatedLogs.forEach((log, index) => {
              console.log(`  ${index + 1}. ${log.name} (${(log.size / 1024).toFixed(1)} KB)`);
            });
          }
          
          console.log('\n🔧 日志配置:');
          console.log(`  启用压缩: ${stats.compression}`);
          console.log(`  保留天数: ${stats.retentionDays} 天`);
          console.log(`  最大大小: ${(stats.maxSize / (1024 * 1024)).toFixed(2)} MB`);
          console.log(`  备份数量: ${stats.backups}`);
        }
        break;
        
      case 'list':
        const listStats = await logManager.getLogStats();
        
        if (listStats.error) {
          console.error(`❌ 列出文件失败: ${listStats.error}`);
        } else {
          console.log('📁 日志文件列表');
          console.log('─'.repeat(80));
          
          // 计算总大小
          let totalSize = listStats.currentLog.size;
          listStats.rotatedLogs.forEach(log => {
            totalSize += log.size;
          });
          
          const totalFiles = 1 + listStats.rotatedLogs.length; // 当前日志 + 轮转日志
          
          console.log(`总计 ${totalFiles} 个文件, ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);
          console.log();
          
          // 当前日志文件
          if (listStats.currentLog.exists) {
            console.log('📝 [当前] bot_server.log');
            console.log(`   大小: ${(listStats.currentLog.size / (1024 * 1024)).toFixed(2)} MB`);
            console.log(`   行数: ${listStats.currentLog.lines} 行`);
            console.log();
          }
          
          // 轮转的日志文件
          if (listStats.rotatedLogs.length > 0) {
            listStats.rotatedLogs.forEach((log, index) => {
              const compression = log.compressed ? ' (已压缩)' : '';
              console.log(`📁 ${log.name}${compression}`);
              console.log(`   大小: ${(log.size / 1024).toFixed(1)} KB`);
              console.log(`   修改: ${log.mtime.toLocaleString()}`);
              console.log(`   天数: ${log.ageDays} 天前`);
              console.log();
            });
          } else {
            console.log('ℹ️  没有轮转的日志文件');
          }
        }
        break;
        
      case 'cleanup':
        if (!forceFlag && !confirmAction('确定要清理超出保留期限的日志文件吗？')) {
          console.log('❌ 操作已取消');
          process.exit(0);
        }
        
        const cleanupResult = await logManager.cleanupOldLogs();
        console.log(`✅ 日志清理完成`);
        console.log(`🗑️  删除了 ${cleanupResult.deletedCount} 个文件`);
        console.log(`⚠️  有 ${cleanupResult.errorCount} 个错误`);
        break;
        
      case 'help':
      case '--help':
      case '-h':
        printUsage();
        break;
        
      default:
        console.error(`❌ 未知命令: ${command}`);
        printUsage();
        process.exit(1);
    }
    
    // 如果有详细输出标志，显示更多信息
    if (verboseFlag) {
      console.log('\n🔍 详细配置:');
      console.log(`   配置对象:`, logManager.LOG_CONFIG);
      // 从log-manager模块获取日志目录和文件路径
      const logStats = await logManager.getLogStats();
      if (!logStats.error) {
        console.log(`   当前日志文件大小: ${logStats.currentLog.size} 字节`);
        console.log(`   轮转日志数量: ${logStats.rotatedLogs.length}`);
      }
    }
  } catch (error) {
    console.error(`❌ 执行命令时出错: ${error.message}`);
    process.exit(1);
  }
}

function confirmAction(message) {
  // 简单实现，如果需要可以在生产环境中使用 readline
  console.log(`${message} (yes/no): `);
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(`${message} (yes/no): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

if (require.main === module) {
  main();
}