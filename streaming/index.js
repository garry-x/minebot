const StreamManager = require('./StreamManager');
const BotStream = require('./BotStream');

function createStreamManager(options = {}) {
  return new StreamManager(options);
}

module.exports = {
  StreamManager,
  BotStream,
  createStreamManager
};
