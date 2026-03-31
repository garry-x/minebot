require('dotenv').config();
const MinecraftBot = require('./bot/index');

const bot = new MinecraftBot({
  host: process.env.MINECRAFT_SERVER_HOST || 'localhost',
  port: parseInt(process.env.MINECRAFT_SERVER_PORT || '25565'),
  botServerHost: 'localhost',
  botServerPort: 9500
});

console.log('Starting bot...');
bot.connect('debug_bot', null)
  .then(() => {
    console.log('Bot connected successfully');
    console.log('Bot ID:', bot.botId);
    console.log('Bot connected:', bot.isConnected);
    
    // Wait a bit to see if bot stays connected
    setTimeout(() => {
      console.log('Checking bot status after 5 seconds...');
      console.log('Bot connected:', bot.isConnected);
      console.log('Bot:', bot.bot ? 'exists' : 'null');
      if (bot.bot && bot.bot.entity) {
        console.log('Bot position:', bot.bot.entity.position);
      }
      bot.disconnect();
      process.exit(0);
    }, 5000);
  })
  .catch((err) => {
    console.error('Error connecting bot:', err);
    process.exit(1);
  });

// Add timeout to detect hangs
setTimeout(() => {
  console.log('Timeout - checking bot status');
  if (bot.bot && bot.bot.entity) {
    console.log('Bot is still running');
  } else {
    console.log('Bot has exited or failed');
  }
  process.exit(0);
}, 15000);
