module.exports = function(bot) {
  let lastHealth = bot.health;
  let lastFood = bot.food;
  let lastPosition = { x: bot.entity?.position?.x, y: bot.entity?.position?.y, z: bot.entity?.position?.z };
  
  return {
    // Event listeners for game events
    setupListeners: function() {
      // Listen for experience orb collection
      bot.on('experience', (orb) => {
        if (!orb) return;
        const xp = (orb && typeof orb === 'object' && orb.experience !== undefined) ? orb.experience : (typeof orb === 'string' ? orb : 'N/A');
        console.log(`Collected experience orb: ${xp} XP`);
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
      
      // Monitor health changes
      bot.on('update', () => {
        if (bot.health !== lastHealth) {
          console.log(`[State] Health changed: ${lastHealth.toFixed(1)} → ${bot.health.toFixed(1)} (${((bot.health - lastHealth) > 0 ? '+' : '')}${(bot.health - lastHealth).toFixed(1)})`);
          lastHealth = bot.health;
        }
      });
      
      // Monitor food changes
      bot.on('update', () => {
        if (bot.food !== lastFood) {
          console.log(`[State] Food changed: ${lastFood} → ${bot.food} (${bot.food - lastFood > 0 ? '+' : ''}${bot.food - lastFood})`);
          lastFood = bot.food;
        }
      });
      
      // Monitor position changes
      bot.on('move', () => {
        const newPos = bot.entity?.position;
        if (newPos) {
          const dist = Math.sqrt(
            Math.pow(newPos.x - lastPosition.x, 2) +
            Math.pow(newPos.y - lastPosition.y, 2) +
            Math.pow(newPos.z - lastPosition.z, 2)
          );
          
          if (dist > 1) {
            console.log(`[State] Position changed: (${lastPosition.x.toFixed(1)}, ${lastPosition.y.toFixed(1)}, ${lastPosition.z.toFixed(1)}) → (${newPos.x.toFixed(1)}, ${newPos.y.toFixed(1)}, ${newPos.z.toFixed(1)}) [dist: ${dist.toFixed(1)}]`);
            lastPosition = { x: newPos.x, y: newPos.y, z: newPos.z };
          }
        }
      });
    }
  };
};