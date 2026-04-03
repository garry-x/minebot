const AutonomousEngine = require('./bot/autonomous-engine');

console.log('Test 1: Loading AutonomousEngine module');
try {
  const engine = new AutonomousEngine({ bot: {} }, { pathfinder: {} }, { behaviors: {} });
  console.log('✓ AutonomousEngine instantiated successfully');
} catch (error) {
  console.error('✗ Failed to instantiate:', error.message);
  process.exit(1);
}

console.log('\nTest 2: Checking assessState method');
try {
  const mockBot = {
    health: 20,
    food: 18,
    inventory: { items: () => [] },
    time: { timeOfDay: 8000 },
    entities: []
  };
  const engine = new AutonomousEngine(mockBot, {}, {});
  const assessment = engine.assessState();
  console.log('✓ assessState returns:', assessment);
} catch (error) {
  console.error('✗ assessState failed:', error.message);
  process.exit(1);
}

console.log('\nTest 3: Checking calculatePriority method');
try {
  const mockBot = {
    health: 5,
    food: 18,
    inventory: { items: () => [] },
    time: { timeOfDay: 8000 },
    entities: []
  };
  const engine = new AutonomousEngine(mockBot, {}, {});
  const priority = engine.calculatePriority({ health: 5, food: 18, inventoryCount: 0, isDaytime: true, nearbyEntities: 0 });
  console.log('✓ calculatePriority (low health) returns:', priority);
  if (priority !== 'emergency') {
    console.error('✗ Expected priority to be "emergency"');
    process.exit(1);
  }
  
  const priority2 = engine.calculatePriority({ health: 18, food: 5, inventoryCount: 0, isDaytime: true, nearbyEntities: 0 });
  console.log('✓ calculatePriority (low food) returns:', priority2);
  if (priority2 !== 'food') {
    console.error('✗ Expected priority to be "food"');
    process.exit(1);
  }
  
  const priority3 = engine.calculatePriority({ health: 18, food: 18, inventoryCount: 0, isDaytime: true, nearbyEntities: 0 });
  console.log('✓ calculatePriority (normal) returns:', priority3);
  if (priority3 !== 'goal_progress') {
    console.error('✗ Expected priority to be "goal_progress"');
    process.exit(1);
  }
} catch (error) {
  console.error('✗ calculatePriority failed:', error.message);
  process.exit(1);
}

console.log('\nTest 4: Checking decideAction method');
try {
  const engine = new AutonomousEngine({}, {}, {});
  const action1 = engine.decideAction('emergency', {});
  console.log('✓ decideAction (emergency) returns:', action1);
  if (action1.action !== 'heal_immediate') {
    console.error('✗ Expected action to be "heal_immediate"');
    process.exit(1);
  }
  
  const action2 = engine.decideAction('food', {});
  console.log('✓ decideAction (food) returns:', action2);
  if (action2.action !== 'gather') {
    console.error('✗ Expected action to be "gather"');
    process.exit(1);
  }
  
  const action3 = engine.decideAction('goal_progress', { currentGoal: 'build_house' });
  console.log('✓ decideAction (goal_progress) returns:', action3);
} catch (error) {
  console.error('✗ decideAction failed:', error.message);
  process.exit(1);
}

console.log('\n✓ All tests passed! AutonomousEngine module is working correctly.');
process.exit(0);
