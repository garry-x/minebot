module.exports = function(bot) {
  return {
    // Event listeners for game events
    setupListeners: function() {
      // Listen for experience orb collection
      bot.on('experience', (orb) => {
        if (!orb) return;
        console.log(`Collected experience orb: ${typeof orb === 'string' ? orb : (orb?.experience || 'N/A')} XP`);
      });
      
      // Listen for item pickup
      bot.on('itemPickup', (item) => {
        console.log(`Picked up item: ${item.name} x${item.count}`);
      });
      
      // Listen for block break
      bot.on('blockBreak', (block) => {
        console.log(`Block broken: ${block.name} at (${block.position.x}, ${block.position.y}, ${block.position.z})`);
      });
      
      // Listen for block place
      bot.on('blockPlace', (block) => {
        console.log(`Block placed: ${block.name} at (${block.position.x}, ${block.position.y}, ${block.position.z})`);
      });
      
      // Listen for entity hurt (when bot takes damage)
      bot.on('hurt', () => {
        console.log(`Bot took damage! Health: ${bot.health}`);
      });
      
      // Listen for entity heal
      bot.on('heal', () => {
        console.log(`Bot healed! Health: ${bot.health}`);
      });
      
      // Listen for sleeping
      bot.on('sleep', () => {
        console.log(`Bot went to sleep`);
      });
      
      // Listen for waking up
      bot.on('wake', () => {
        console.log(`Bot woke up`);
      });
      
      // Listen for respawn (after death)
      bot.on('respawn', () => {
        console.log(`Bot respawned`);
      });
    }
  };
};