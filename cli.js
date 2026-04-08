#!/usr/bin/env node
require('dotenv').config();

const { Command } = require('commander');
const fs = require('fs');
const path = require('path');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');

const program = new Command();

// 配置文件路径
const LOG_DIR = path.join(__dirname, 'logs');
const BOT_PID_FILE = path.join(LOG_DIR, 'bot_server.pid');
const MINECRAFT_PID_FILE = path.join(LOG_DIR, 'minecraft_server.pid');
const BOT_SERVER_SCRIPT = path.join(__dirname, 'bot_server.js');
const MINECRAFT_SERVER_DIR = path.join(__dirname, process.env.MINECRAFT_SERVER_DIR || 'resources');
const MINECRAFT_JAR_FILENAME = process.env.MINECRAFT_JAR_PATH || 'minecraft_server.1.21.11.jar';
const MINECRAFT_SERVER_JAR = path.join(MINECRAFT_SERVER_DIR, MINECRAFT_JAR_FILENAME);

// 工具函数
function isProcessRunning(pid) {
  try {
    if (!pid) return false;
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function loadPid(type) {
  const pidFile = type === 'bot' ? BOT_PID_FILE : MINECRAFT_PID_FILE;
  try {
    if (fs.existsSync(pidFile)) return parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
  } catch {}
  return null;
}

function savePid(pid, type) {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(type === 'bot' ? BOT_PID_FILE : MINECRAFT_PID_FILE, pid.toString());
}

async function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    try {
      const req = http.request(options, res => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
            }
          } catch (e) {
            reject(new Error(`Invalid response: ${e.message}`));
          }
        });
      });
      req.on('error', e => {
        reject(new Error(`Request error: ${e.message}`));
      });
      req.on('timeout', () => {
        reject(new Error('Request timeout'));
        req.destroy();
      });
      if (postData) req.write(postData);
      req.end();
    } catch (error) {
      reject(new Error(`Request creation failed: ${error.message}`));
    }
  });
}

function formatUptime(seconds) {
  if (!seconds) return 'N/A';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

async function getBotServerStatus() {
  try {
    // 首先检查健康状态
    const healthData = await makeRequest({
      hostname: 'localhost',
      port: process.env.BOT_SERVER_PORT || process.env.PORT || 9500,
      path: '/api/health',
      method: 'GET',
      timeout: 2000
    });
    
    // 如果健康检查通过，获取服务器状态（包含活跃机器人数量）
    let serverStatusData = { activeBots: 0 };
    try {
      serverStatusData = await makeRequest({
        hostname: 'localhost',
        port: process.env.BOT_SERVER_PORT || process.env.PORT || 9500,
        path: '/api/server/status',
        method: 'GET',
        timeout: 2000
      });
    } catch (statusError) {
      // 如果/server/status失败，使用默认值
      console.warn('⚠️  无法获取服务器状态详情，使用默认值');
    }
    
    // 服务器返回status: 'OK'，我们需要转换为'RUNNING'状态
    return {
      status: healthData.status === 'OK' ? 'RUNNING' : healthData.status,
      uptime: healthData.uptimeSeconds ? formatUptime(healthData.uptimeSeconds) : 'N/A',
      version: '1.0.0',
      activeBots: serverStatusData.activeBots || 0,
      serverMode: healthData.serverMode || 'normal',
      timestamp: healthData.timestamp,
      mcServer: healthData.mcServer,
      mcPort: healthData.mcPort,
      uptimeSeconds: healthData.uptimeSeconds
    };
  } catch (error) {
    return { status: 'NOT_RUNNING' };
  }
}

async function getMinecraftServerStatus() {
  return new Promise(resolve => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.connect({ host: 'localhost', port: 25565 }, () => {
      socket.destroy();
      resolve({ status: 'RUNNING', players: 0, version: '1.21.11', world: 'default' });
    });
    socket.on('error', () => resolve({ status: 'NOT_RUNNING' }));
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ status: 'NOT_RUNNING' });
    });
  });
}

// 基础命令配置
program.name('minebot').description('Minecraft AI Robot System - 命令行管理工具').version('1.0.0');

// 创建服务器命令组
const serverCommand = program.command('server').description('Bot服务器管理');

// 启动Bot服务器
serverCommand
  .command('start')
  .description('启动Bot服务器')
  .option('--verbose', '详细模式输出')
  .action(async options => {
    console.log('🚀 启动Minecraft AI Bot服务器...');

    const existingPid = loadPid('bot');
    if (existingPid && isProcessRunning(existingPid)) {
      console.log('❌ Bot服务器已经在运行中');
      return;
    }

    const LOG_FILE = path.join(LOG_DIR, 'bot_server.log');
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

    const verboseFlag = options.verbose ? '--verbose' : '';
    const startScript = `#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 24.14.1 > /dev/null 2>&1
nohup node ${BOT_SERVER_SCRIPT} ${verboseFlag} > ${LOG_FILE} 2>&1 &
`;

    const scriptFile = '/tmp/start_bot_server.sh';
    fs.writeFileSync(scriptFile, startScript);
    fs.chmodSync(scriptFile, '755');

    try {
      const child = spawn('bash', [scriptFile], {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: true,
        env: process.env
      });

      let output = '';
      child.stdout.on('data', data => (output += data.toString()));

      child.on('close', async () => {
        // 等待服务器启动
        await new Promise(resolve => setTimeout(resolve, 2000));

        const status = await getBotServerStatus();
        if (status.status === 'RUNNING') {
          console.log('✅ Bot服务器启动成功！');
          console.log(`📊 状态: ${status.status}`);
          console.log(`⏱️  运行时间: ${status.uptime || '刚刚启动'}`);
          console.log(`🤖 活跃机器人: ${status.activeBots || 0}`);
          console.log(`🔌 服务器模式: ${status.serverMode || 'normal'}`);
        } else {
          console.log('❌ Bot服务器启动失败');
        }
      });
    } catch (error) {
      console.error(`❌ 启动失败: ${error.message}`);
    }
  });

// 停止Bot服务器
serverCommand
  .command('stop')
  .description('停止Bot服务器')
  .option('-f, --force', '强制停止')
  .action(async options => {
    console.log('🛑 停止Bot服务器...');

    const pid = loadPid('bot');
    if (!pid || !isProcessRunning(pid)) {
      console.log('ℹ️  Bot服务器未运行');
      return;
    }

    try {
      // 尝试通过API优雅停止
      const reqOptions = {
        hostname: 'localhost',
        port: process.env.BOT_SERVER_PORT || process.env.PORT || 9500,
        path: '/api/server/stop',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      };

      const req = http.request(reqOptions, res => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          try {
            fs.unlinkSync(BOT_PID_FILE);
          } catch {}
        });
      });

      req.on('error', () => {
        try {
          fs.unlinkSync(BOT_PID_FILE);
        } catch {}
      });

      req.end();

      // 超时后强制停止
      setTimeout(() => {
        try {
          process.kill(pid, options.force ? 'SIGKILL' : 'SIGTERM');
          try {
            fs.unlinkSync(BOT_PID_FILE);
          } catch {}
        } catch {}
      }, 1000);

      console.log('✅ Bot服务器停止命令已发送');
    } catch (error) {
      console.error(`❌ 停止失败: ${error.message}`);
    }
  });

// 重启Bot服务器
serverCommand
  .command('restart')
  .description('重启Bot服务器')
  .action(async () => {
    console.log('🔄 重启Bot服务器...');

    // 先停止
    const pid = loadPid('bot');
    if (pid && isProcessRunning(pid)) {
      try {
        process.kill(pid, 'SIGTERM');
        console.log('✅ 已发送停止信号');
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch {}
    }

    // 再启动
    try {
      const LOG_FILE = path.join(LOG_DIR, 'bot_server.log');
      const verboseFlag = '';
      const startScript = `#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 24.14.1 > /dev/null 2>&1
nohup node ${BOT_SERVER_SCRIPT} ${verboseFlag} > ${LOG_FILE} 2>&1 &
`;

      const scriptFile = '/tmp/restart_bot_server.sh';
      fs.writeFileSync(scriptFile, startScript);
      fs.chmodSync(scriptFile, '755');

      const child = spawn('bash', [scriptFile], {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: true,
        env: process.env
      });

      child.on('close', async () => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const status = await getBotServerStatus();
        if (status.status === 'RUNNING') {
          console.log('✅ Bot服务器重启成功！');
        } else {
          console.log('❌ Bot服务器重启失败');
        }
      });
    } catch (error) {
      console.error(`❌ 重启失败: ${error.message}`);
    }
  });

// Bot管理命令
const botCommand = program.command('bot').description('机器人管理');

// 启动机器人
botCommand
  .command('start <username>')
  .description('启动一个机器人')
  .option('-h, --host <host>', 'Minecraft服务器地址', 'localhost')
  .option('-p, --port <port>', 'Minecraft服务器端口', '25565')
  .option('--version <version>', 'Minecraft版本', '1.21.11')
  .action(async (username, options) => {
    console.log(`🤖 启动机器人 "${username}"...`);

    const botStatus = await getBotServerStatus();
    if (botStatus.status !== 'RUNNING') {
      console.log('❌ Bot服务器未运行，请先运行 "minebot server start"');
      return;
    }

    try {
      const data = await makeRequest(
        {
          hostname: 'localhost',
          port: process.env.BOT_SERVER_PORT || process.env.PORT || 9500,
          path: '/api/bot/start',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          timeout: 5000
        },
        JSON.stringify({
          username,
          host: options.host,
          port: parseInt(options.port),
          version: options.version
        })
      );

      if (data.success) {
        console.log(`✅ 机器人 "${username}" 启动成功！`);
        if (data.botId) console.log(`🤖 Bot ID: ${data.botId}`);
        if (data.goal) console.log(`🎯 自动目标: ${data.goal}`);
        console.log(`📝 ${data.message || '自动行为已启用'}`);
      } else {
        console.log(`❌ 启动失败: ${data.error || '未知错误'}`);
      }
    } catch (error) {
      console.error(`❌ 请求失败: ${error.message}`);
    }
  });

// 停止机器人
botCommand
  .command('stop <botId>')
  .description('停止一个机器人')
  .action(async botId => {
    console.log(`🛑 停止机器人 "${botId}"...`);

    const botStatus = await getBotServerStatus();
    if (botStatus.status !== 'RUNNING') {
      console.log('❌ Bot服务器未运行');
      return;
    }

    try {
      const data = await makeRequest({
        hostname: 'localhost',
        port: process.env.BOT_SERVER_PORT || process.env.PORT || 9500,
        path: `/api/bot/${botId}/stop`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      });

      if (data.success) {
        console.log(`✅ 机器人 "${botId}" 停止成功！`);
      } else {
        console.log(`❌ 停止失败: ${data.error || '未知错误'}`);
      }
    } catch (error) {
      console.error(`❌ 请求失败: ${error.message}`);
    }
  });

// 列出所有机器人
botCommand
  .command('list')
  .description('列出所有机器人')
  .action(async () => {
    console.log('📋 机器人列表...\n');

    const botStatus = await getBotServerStatus();
    if (botStatus.status !== 'RUNNING') {
      console.log('❌ Bot服务器未运行');
      return;
    }

    try {
      const data = await makeRequest({
        hostname: 'localhost',
        port: process.env.BOT_SERVER_PORT || process.env.PORT || 9500,
        path: '/api/bots',
        method: 'GET',
        timeout: 5000
      });

      const bots = Array.isArray(data?.bots) ? data.bots : [];

      if (bots.length === 0) {
        console.log('没有运行的机器人');
        return;
      }

      console.log(`总共 ${bots.length} 个机器人:\n`);

      for (const bot of bots) {
        const botId = bot.botId || bot.id || 'Unknown';
        console.log(`🤖 ID: ${botId}`);
        console.log(`  名称: ${bot.username || 'Unknown'}`);
        console.log(`  状态: ${bot.state || 'UNKNOWN'}`);

        // 获取bot的goal状态
        try {
          const goalData = await makeRequest({
            hostname: 'localhost',
            port: process.env.BOT_SERVER_PORT || process.env.PORT || 9500,
            path: `/api/bot/${botId}/goal/status`,
            method: 'GET',
            timeout: 3000
          });

          if (goalData.currentGoal || goalData.goalState) {
            const goalState = goalData.currentGoal || goalData.goalState;
            const goalName = goalState.name || goalState.goalId || 'Unknown';
            const progress = Math.round((goalData.progress || goalState.progress || 0) * 100);
            const progressBar = '█'.repeat(Math.floor(progress / 10)) + '░'.repeat(10 - Math.floor(progress / 10));
            console.log(`  🎯 目标: ${goalName} ${progressBar} ${progress}%`);
          } else {
            console.log(`  🎯 目标: 未设置`);
          }
        } catch (goalError) {
          console.log(`  🎯 目标: 获取失败`);
        }

        if (bot.position) {
          console.log(
            `  位置: ${Math.floor(bot.position.x)}, ${Math.floor(bot.position.y)}, ${Math.floor(bot.position.z)}`
          );
        }
        console.log(`  生命值: ${bot.health || 20}/20`);
        console.log(`  饥饿值: ${bot.food || 20}/20`);
        console.log('---');
      }
    } catch (error) {
      console.error(`❌ 请求失败: ${error.message}`);
    }
  });

// 启动机器人自动目标
botCommand
  .command('auto-start <botId>')
  .description('启动机器人自动目标')
  .option('-g, --goal <goalId>', '设置初始目标', 'basic_survival')
  .option('-m, --mode <mode>', '设置模式', 'survival')
  .action(async (botId, options) => {
    console.log(`🤖 启动机器人 "${botId}" 自动目标...`);

    const botStatus = await getBotServerStatus();
    if (botStatus.status !== 'RUNNING') {
      console.log('❌ Bot服务器未运行');
      return;
    }

    try {
      const data = await makeRequest(
        {
          hostname: 'localhost',
          port: process.env.BOT_SERVER_PORT || process.env.PORT || 9500,
          path: '/api/bot/automatic',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          timeout: 5000
        },
        JSON.stringify({
          botId,
          mode: options.mode,
          initialGoal: options.goal
        })
      );

      if (data.success) {
        console.log(`✅ 机器人 "${botId}" 自动目标启动成功！`);
        console.log(`🎯 目标: ${data.goal || options.goal}`);
        console.log(`🎮 模式: ${data.mode || options.mode}`);
        if (data.message) console.log(`📝 ${data.message}`);
      } else {
        console.log(`❌ 启动失败: ${data.error || '未知错误'}`);
      }
    } catch (error) {
      console.error(`❌ 请求失败: ${error.message}`);
    }
  });

// 停止机器人自动目标
botCommand
  .command('auto-stop <botId>')
  .description('停止机器人自动目标')
  .action(async (botId) => {
    console.log(`🛑 停止机器人 "${botId}" 自动目标...`);

    const botStatus = await getBotServerStatus();
    if (botStatus.status !== 'RUNNING') {
      console.log('❌ Bot服务器未运行');
      return;
    }

    try {
      const data = await makeRequest({
        hostname: 'localhost',
        port: process.env.BOT_SERVER_PORT || process.env.PORT || 9500,
        path: `/api/bot/${botId}/stop`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      });

      if (data.success) {
        console.log(`✅ 机器人 "${botId}" 自动目标停止成功！`);
      } else {
        console.log(`❌ 停止失败: ${data.error || '未知错误'}`);
      }
    } catch (error) {
      console.error(`❌ 请求失败: ${error.message}`);
    }
  });

// 设置机器人目标或列出所有目标
botCommand
  .command('goal [botId] [goalId]')
  .description('设置机器人目标或列出所有可用目标')
  .action(async (botId, goalId) => {
    // 如果没有提供参数，列出所有可用目标
    if (!botId) {
      const botStatus = await getBotServerStatus();
      if (botStatus.status !== 'RUNNING') {
        console.log('❌ Bot服务器未运行');
        return;
      }

      try {
        const data = await makeRequest({
          hostname: 'localhost',
          port: process.env.BOT_SERVER_PORT || process.env.PORT || 9500,
          path: '/api/goals',
          method: 'GET',
          timeout: 5000
        });

        if (data.success && data.goals) {
          // 难度标签映射
          const difficultyLabels = {
            beginner: '🟢 初级',
            intermediate: '🟡 中级',
            advanced: '🔴 高级',
            expert: '🔵 专家'
          };

          console.log(`\n🎯 可用目标列表 (共${data.goals.length}个):\n`);
          console.log('ID                    难度     名称');
          console.log('─'.repeat(60));

          data.goals.forEach(goal => {
            const difficulty = difficultyLabels[goal.difficulty] || '⚪ 其他';
            const name = goal.name.length > 10 ? goal.name.substring(0, 9) + '…' : goal.name.padEnd(10);
            console.log(`${goal.id.padEnd(20)} ${difficulty.padEnd(8)} ${name}`);
          });

          console.log('─'.repeat(60));
          console.log('\n💡 使用: minebot bot goal <botId> <goalId>');
          console.log('📖 查看详情: minebot bot goal <goalId> --info');
        } else {
          console.log('❌ 获取目标列表失败');
        }
      } catch (error) {
        console.error(`❌ 请求失败: ${error.message}`);
      }
      return;
    }

    // 如果只提供了botId但没有提供goalId
    if (!goalId) {
      console.log('❌ 请提供目标ID');
      console.log('💡 使用 "minebot bot goal" 查看所有可用目标');
      return;
    }

    // 设置目标
    console.log(`🎯 设置机器人 "${botId}" 目标为 "${goalId}"...`);

    const botStatus = await getBotServerStatus();
    if (botStatus.status !== 'RUNNING') {
      console.log('❌ Bot服务器未运行');
      return;
    }

    try {
      const data = await makeRequest(
        {
          hostname: 'localhost',
          port: process.env.BOT_SERVER_PORT || process.env.PORT || 9500,
          path: `/api/bot/${botId}/goal/select`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          timeout: 5000
        },
        JSON.stringify({ goalId })
      );

      if (data.success) {
        console.log(`✅ 机器人目标设置成功！`);
        console.log(`🎯 目标: ${data.goalName || goalId}`);
        if (data.message) console.log(`📝 ${data.message}`);
      } else {
        console.log(`❌ 设置失败: ${data.error || '未知错误'}`);
      }
    } catch (error) {
      console.error(`❌ 请求失败: ${error.message}`);
    }
  });

// 查看机器人目标状态
botCommand
  .command('goal-status <botId>')
  .description('查看机器人目标状态')
  .action(async (botId) => {
    console.log(`📊 查看机器人 "${botId}" 目标状态...`);

    const botStatus = await getBotServerStatus();
    if (botStatus.status !== 'RUNNING') {
      console.log('❌ Bot服务器未运行');
      return;
    }

    try {
      const data = await makeRequest({
        hostname: 'localhost',
        port: process.env.BOT_SERVER_PORT || process.env.PORT || 9500,
        path: `/api/bot/${botId}/goal/status`,
        method: 'GET',
        timeout: 5000
      });

      console.log(`🤖 机器人 "${botId}" 目标状态:`);
      
      if (data.error) {
        console.log(`  ❌ ${data.error}`);
        return;
      }
      
      if (data.currentGoal) {
        console.log(`  🎯 当前目标: ${data.currentGoal.name || data.currentGoal.id || '未知'}`);
        if (data.currentGoal.description) console.log(`  📝 描述: ${data.currentGoal.description}`);
      }
      
      if (data.progress !== undefined) {
        const progressBar = '█'.repeat(Math.floor(data.progress / 10)) + '░'.repeat(10 - Math.floor(data.progress / 10));
        console.log(`  📈 总体进度: ${progressBar} ${data.progress}%`);
      }
      
      if (data.subTasks && Array.isArray(data.subTasks)) {
        console.log(`  📋 子任务进度:`);
        data.subTasks.forEach((task, index) => {
          const status = task.completed ? '✅' : (task.started ? '🔄' : '⏳');
          const progress = task.progress !== undefined ? ` (${task.progress}%)` : '';
          console.log(`    ${status} ${task.name || task.id}: ${task.completed ? '已完成' : '进行中'}${progress}`);
        });
      }
      
      if (data.materials && Object.keys(data.materials).length > 0) {
        console.log(`  🧱 收集材料:`);
        Object.entries(data.materials).forEach(([material, count]) => {
          console.log(`    📦 ${material}: ${count}`);
        });
      }
      
      if (data.startedAt) {
        const started = new Date(data.startedAt);
        const now = new Date();
        const duration = Math.floor((now - started) / 1000 / 60); // 分钟
        console.log(`  ⏱️  已运行: ${duration}分钟`);
      }
      
    } catch (error) {
      console.error(`❌ 请求失败: ${error.message}`);
    }
  });

// 自动目标控制命令
const autoCommand = botCommand.command('auto <botId>').description('机器人自动目标控制');

// 启动自动目标
autoCommand
  .command('start')
  .description('启动机器人自动目标')
  .option('-g, --goal <goalId>', '设置初始目标', 'basic_survival')
  .option('-m, --mode <mode>', '设置模式', 'survival')
  .action(async (botId, options) => {
    console.log(`🤖 启动机器人 "${botId}" 自动目标...`);

    const botStatus = await getBotServerStatus();
    if (botStatus.status !== 'RUNNING') {
      console.log('❌ Bot服务器未运行');
      return;
    }

    try {
      const data = await makeRequest(
        {
          hostname: 'localhost',
          port: process.env.BOT_SERVER_PORT || process.env.PORT || 9500,
          path: '/api/bot/automatic',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          timeout: 5000
        },
        JSON.stringify({
          botId,
          mode: options.mode,
          initialGoal: options.goal
        })
      );

      if (data.success) {
        console.log(`✅ 机器人 "${botId}" 自动目标启动成功！`);
        console.log(`🎯 目标: ${data.goal || options.goal}`);
        console.log(`🎮 模式: ${data.mode || options.mode}`);
        if (data.message) console.log(`📝 ${data.message}`);
      } else {
        console.log(`❌ 启动失败: ${data.error || '未知错误'}`);
      }
    } catch (error) {
      console.error(`❌ 请求失败: ${error.message}`);
    }
  });

// 停止自动目标
autoCommand
  .command('stop')
  .description('停止机器人自动目标')
  .action(async (botId) => {
    console.log(`🛑 停止机器人 "${botId}" 自动目标...`);

    const botStatus = await getBotServerStatus();
    if (botStatus.status !== 'RUNNING') {
      console.log('❌ Bot服务器未运行');
      return;
    }

    try {
      const data = await makeRequest({
        hostname: 'localhost',
        port: process.env.BOT_SERVER_PORT || process.env.PORT || 9500,
        path: `/api/bot/${botId}/stop`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      });

      if (data.success) {
        console.log(`✅ 机器人 "${botId}" 自动目标停止成功！`);
      } else {
        console.log(`❌ 停止失败: ${data.error || '未知错误'}`);
      }
    } catch (error) {
      console.error(`❌ 请求失败: ${error.message}`);
    }
  });

// 设置自动目标
autoCommand
  .command('goal <goalId>')
  .description('设置机器人目标')
  .action(async (botId, goalId) => {
    console.log(`🎯 设置机器人 "${botId}" 目标为 "${goalId}"...`);

    const botStatus = await getBotServerStatus();
    if (botStatus.status !== 'RUNNING') {
      console.log('❌ Bot服务器未运行');
      return;
    }

    try {
      const data = await makeRequest(
        {
          hostname: 'localhost',
          port: process.env.BOT_SERVER_PORT || process.env.PORT || 9500,
          path: `/api/bot/${botId}/goal/select`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          timeout: 5000
        },
        JSON.stringify({ goalId })
      );

      if (data.success) {
        console.log(`✅ 机器人目标设置成功！`);
        console.log(`🎯 目标: ${data.goalName || goalId}`);
        if (data.message) console.log(`📝 ${data.message}`);
      } else {
        console.log(`❌ 设置失败: ${data.error || '未知错误'}`);
      }
    } catch (error) {
      console.error(`❌ 请求失败: ${error.message}`);
    }
  });

// 查看自动目标状态
autoCommand
  .command('status')
  .description('查看机器人自动目标状态')
  .action(async (botId) => {
    console.log(`📊 查看机器人 "${botId}" 自动目标状态...`);

    const botStatus = await getBotServerStatus();
    if (botStatus.status !== 'RUNNING') {
      console.log('❌ Bot服务器未运行');
      return;
    }

    try {
      const data = await makeRequest({
        hostname: 'localhost',
        port: process.env.BOT_SERVER_PORT || process.env.PORT || 9500,
        path: `/api/bot/${botId}/goal/status`,
        method: 'GET',
        timeout: 5000
      });

      console.log(`🤖 机器人 "${botId}" 状态:`);
      if (data.status) console.log(`  🔄 状态: ${data.status}`);
      if (data.progress) console.log(`  📈 进度: ${data.progress}%`);
      if (data.currentGoal) console.log(`  🎯 目标: ${data.currentGoal}`);
      if (data.subTasks) {
        console.log(`  📋 子任务:`);
        data.subTasks.forEach((task, index) => {
          const status = task.completed ? '✅' : '⏳';
          console.log(`    ${status} ${task.name}: ${task.progress || 0}%`);
        });
      }
      if (data.materials) {
        console.log(`  🧱 收集材料:`);
        Object.entries(data.materials).forEach(([material, count]) => {
          console.log(`    📦 ${material}: ${count}`);
        });
      }
    } catch (error) {
      console.error(`❌ 请求失败: ${error.message}`);
    }
  });

// Minecraft服务器管理命令
const mcCommand = program.command('mc').description('Minecraft服务器管理');

// 启动Minecraft服务器
mcCommand
  .command('start')
  .description('启动Minecraft服务器')
  .option('-p, --path <path>', 'Minecraft服务器JAR文件路径，默认从.env读取')
  .option('-m, --memory <memory>', '分配内存大小，默认从.env读取MINECRAFT_MAX_MEMORY')
  .option('--args <args>', '服务器启动参数，默认从.env读取MINECRAFT_SERVER_ARGS')
  .action(async options => {
    console.log('🎮 启动Minecraft服务器...');

    // 检查是否已在运行
    const existingPid = loadPid('minecraft');
    if (existingPid && isProcessRunning(existingPid)) {
      console.log('❌ Minecraft服务器已经在运行中');
      return;
    }

    // 确定JAR文件路径
    let serverJarPath;
    if (options.path) {
      serverJarPath = options.path;
      console.log(`📁 使用自定义路径: ${serverJarPath}`);
    } else {
      // 从.env读取配置
      const serverDir = process.env.MINECRAFT_SERVER_DIR || 'resources';
      const jarFilename = process.env.MINECRAFT_JAR_PATH || 'minecraft_server.1.21.11.jar';
      serverJarPath = path.join(__dirname, serverDir, jarFilename);
      console.log(`📁 使用环境配置路径: ${serverJarPath}`);
    }

    // 检查JAR文件是否存在
    if (!fs.existsSync(serverJarPath)) {
      console.error(`❌ Minecraft服务器JAR文件不存在: ${serverJarPath}`);
      console.error('请确保文件存在或使用 --path 参数指定正确路径');
      return;
    }

    // 确定内存分配
    const memory = options.memory || process.env.MINECRAFT_MAX_MEMORY || '1G';
    const serverArgs = options.args || process.env.MINECRAFT_SERVER_ARGS || 'nogui';

    console.log(`⚙️  配置: 内存=${memory}, 参数=${serverArgs}`);

    // 创建日志目录
    const LOG_FILE = path.join(LOG_DIR, 'minecraft_server.log');
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }

    // 启动服务器
    try {
      const child = spawn(
        'java',
        [`-Xmx${memory}`, `-Xms${memory}`, '-jar', serverJarPath, serverArgs],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
          detached: true,
          cwd: path.dirname(serverJarPath),
          env: process.env
        }
      );

      // 保存PID
      savePid(child.pid, 'minecraft');
      console.log(`✅ Minecraft服务器启动成功！PID: ${child.pid}`);

      // 处理输出
      child.stdout.on('data', data => {
        const output = data.toString().trim();
        if (output) console.log(`[MC] ${output}`);
      });

      child.stderr.on('data', data => {
        const error = data.toString().trim();
        if (error) console.error(`[MC Error] ${error}`);
      });

      child.on('close', code => {
        console.log(`🛑 Minecraft服务器已退出，代码: ${code}`);
        // 清理PID文件
        try {
          if (fs.existsSync(MINECRAFT_PID_FILE)) {
            fs.unlinkSync(MINECRAFT_PID_FILE);
          }
        } catch {}
      });

      // 输出日志文件位置
      console.log(`📝 日志文件: ${LOG_FILE}`);
      console.log('ℹ️  使用 "minebot mc status" 检查服务器状态');
      console.log('ℹ️  使用 "minebot mc end" 停止服务器');

      // 将输出重定向到日志文件
      const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
      child.stdout.pipe(logStream);
      child.stderr.pipe(logStream);
    } catch (error) {
      console.error(`❌ 启动失败: ${error.message}`);
    }
  });

// 停止Minecraft服务器
mcCommand
  .command('end')
  .description('停止Minecraft服务器')
  .alias('stop')
  .option('-f, --force', '强制停止')
  .action(async options => {
    console.log('🛑 停止Minecraft服务器...');

    const pid = loadPid('minecraft');
    if (!pid || !isProcessRunning(pid)) {
      console.log('ℹ️  Minecraft服务器未运行');
      return;
    }

    try {
      // 尝试通过发送空行到控制台来停止服务器（Minecraft服务器通常响应 "stop" 命令）
      // 对于Minecraft服务器，我们发送 "stop" 命令到标准输入
      const serverProcess = process;
      // 由于我们无法直接访问子进程的stdin，我们使用SIGTERM然后SIGKILL

      // 先发送SIGTERM让服务器优雅关闭
      process.kill(pid, 'SIGTERM');
      console.log('✅ 已发送停止信号 (SIGTERM)');

      // 等待5秒，然后强制停止
      setTimeout(() => {
        if (isProcessRunning(pid)) {
          if (options.force) {
            console.log('⚠️  服务器未响应，强制停止 (SIGKILL)...');
            try {
              process.kill(pid, 'SIGKILL');
            } catch {}
          } else {
            console.log('⚠️  服务器未响应，尝试再次发送SIGTERM...');
            try {
              process.kill(pid, 'SIGTERM');
            } catch {}
          }
        }
      }, 5000);

      // 清理PID文件
      try {
        if (fs.existsSync(MINECRAFT_PID_FILE)) {
          fs.unlinkSync(MINECRAFT_PID_FILE);
        }
      } catch {}

      console.log('✅ Minecraft服务器停止命令已发送');
      console.log('ℹ️  服务器可能需要几秒钟来保存世界并关闭');
    } catch (error) {
      console.error(`❌ 停止失败: ${error.message}`);
    }
  });

// 重启Minecraft服务器
mcCommand
  .command('restart')
  .description('重启Minecraft服务器')
  .option('-p, --path <path>', 'Minecraft服务器JAR文件路径，默认从.env读取')
  .option('-m, --memory <memory>', '分配内存大小，默认从.env读取MINECRAFT_MAX_MEMORY')
  .option('--args <args>', '服务器启动参数，默认从.env读取MINECRAFT_SERVER_ARGS')
  .action(async options => {
    console.log('🔄 重启Minecraft服务器...');

    // 先停止
    const pid = loadPid('minecraft');
    if (pid && isProcessRunning(pid)) {
      try {
        process.kill(pid, 'SIGTERM');
        console.log('✅ 已发送停止信号');
        // 等待服务器关闭
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch {}
    }

    // 再启动
    try {
      // 使用与start命令相同的逻辑
      let serverJarPath;
      if (options.path) {
        serverJarPath = options.path;
      } else {
        const serverDir = process.env.MINECRAFT_SERVER_DIR || 'resources';
        const jarFilename = process.env.MINECRAFT_JAR_PATH || 'minecraft_server.1.21.11.jar';
        serverJarPath = path.join(__dirname, serverDir, jarFilename);
      }

      if (!fs.existsSync(serverJarPath)) {
        console.error(`❌ Minecraft服务器JAR文件不存在: ${serverJarPath}`);
        return;
      }

      const memory = options.memory || process.env.MINECRAFT_MAX_MEMORY || '1G';
      const serverArgs = options.args || process.env.MINECRAFT_SERVER_ARGS || 'nogui';

      const child = spawn(
        'java',
        [`-Xmx${memory}`, `-Xms${memory}`, '-jar', serverJarPath, serverArgs],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
          detached: true,
          cwd: path.dirname(serverJarPath),
          env: process.env
        }
      );

      savePid(child.pid, 'minecraft');
      console.log(`✅ Minecraft服务器重启成功！PID: ${child.pid}`);

      // 处理输出
      child.stdout.on('data', data => {
        const output = data.toString().trim();
        if (output) console.log(`[MC] ${output}`);
      });

      child.stderr.on('data', data => {
        const error = data.toString().trim();
        if (error) console.error(`[MC Error] ${error}`);
      });

      console.log('✅ Minecraft服务器已重启');
      console.log('ℹ️  使用 "minebot mc status" 检查服务器状态');
    } catch (error) {
      console.error(`❌ 重启失败: ${error.message}`);
    }
  });

// 查看Minecraft服务器状态
mcCommand
  .command('status')
  .description('查看Minecraft服务器状态')
  .action(async () => {
    console.log('📊 检查Minecraft服务器状态...');

    const status = await getMinecraftServerStatus();

    if (status.status === 'RUNNING') {
      console.log(`✅ 状态: ${status.status}`);
      console.log(`🏷️  版本: ${status.version}`);
      console.log(`👥 在线玩家: ${status.players}`);
      console.log(`🌍 世界: ${status.world}`);

      // 显示PID信息
      const pid = loadPid('minecraft');
      if (pid && isProcessRunning(pid)) {
        console.log(`🔢 PID: ${pid}`);
      }
    } else {
      console.log(`❌ 状态: ${status.status}`);
      console.log('ℹ️  使用 "minebot mc start" 启动服务器');
    }
  });

program
  .command('status')
  .description('查看系统状态')
  .action(async () => {
    console.log('📊 检查系统状态...\n');

    const [botStatus, mcStatus] = await Promise.all([
      getBotServerStatus(),
      getMinecraftServerStatus()
    ]);

    console.log('🤖 Bot服务器状态:');
    if (botStatus.status === 'RUNNING') {
      console.log(`  ✅ 状态: ${botStatus.status}`);
      console.log(`  ⏱️  运行时间: ${botStatus.uptime || 'N/A'}`);
      console.log(`  🔌 版本: ${botStatus.version || 'N/A'}`);
      console.log(`  🤖 活跃机器人: ${botStatus.activeBots || 0}`);
      console.log(`  🎮 服务器模式: ${botStatus.serverMode || 'normal'}`);
    } else {
      console.log(`  ❌ 状态: ${botStatus.status}`);
    }

    console.log('\n🎮 Minecraft服务器状态:');
    if (mcStatus.status === 'RUNNING') {
      console.log(`  ✅ 状态: ${mcStatus.status}`);
      console.log(`  🏷️  版本: ${mcStatus.version}`);
      console.log(`  👥 在线玩家: ${mcStatus.players}`);
      console.log(`  🌍 世界: ${mcStatus.world}`);
    } else {
      console.log(`  ❌ 状态: ${mcStatus.status}`);
    }
  });

// 帮助命令
program
  .command('help')
  .description('显示帮助信息')
  .action(() => {
    program.help();
  });

// 如果没有参数，显示帮助
if (process.argv.length <= 2) {
  program.help();
} else {
  program.parse(process.argv);
}
