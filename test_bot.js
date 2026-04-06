require('dotenv').config();
const mineflayer = require('mineflayer');

const bot = mineflayer.createBot({
  host: process.env.MINECRAFT_SERVER_HOST || 'localhost',
  port: parseInt(process.env.MINECRAFT_SERVER_PORT || '25565'),
  username: 'test_bot',
  version: '1.21.11'
});

bot.on('spawn', () => {
  console.log('Bot spawned successfully');
  console.log('Bot position:', bot.entity.position);
});

bot.on('error', (err) => {
  console.log('Bot error:', err.message);
});

bot.on('end', () => {
  console.log('Bot ended');
});

setTimeout(() => {
  console.log('Timeout - checking bot status');
  if (bot.bot && bot.bot.entity) {
    console.log('Bot is still running');
    console.log('Bot position:', bot.bot.entity.position);
  } else {
    console.log('Bot has exited');
  }
}, 5000);
