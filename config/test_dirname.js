const path = require('path');
console.log('__dirname:', __dirname);
console.log('path.resolve(__dirname, "..", "bot", "bot_config.db"):', path.resolve(__dirname, '..', 'bot', 'bot_config.db'));
module.exports = 'test';
