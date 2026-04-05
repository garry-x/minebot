const { test } = require('node:test');
const assert = require('node:assert/strict');
const WeightEngine = require('./weight-engine');

test('WeightEngine', async (t) => {
  await t.test('constructor - initializes with domain weights', () => {
    const engine = new WeightEngine('path');
    const weights = engine.getWeights();
    assert.strictEqual(weights.distance, 0.3);
    assert.strictEqual(weights.safety, 0.3);
    assert.strictEqual(weights.speed, 0.2);
    assert.strictEqual(weights.terrain_type, 0.2);
  });

  await t.test('constructor - initializes with resource domain', () => {
    const engine = new WeightEngine('resource');
    const weights = engine.getWeights();
    assert.strictEqual(weights.value, 0.3);
    assert.strictEqual(weights.proximity, 0.3);
    assert.strictEqual(weights.safety, 0.2);
    assert.strictEqual(weights.tool_efficiency, 0.2);
  });

  await t.test('constructor - initializes with behavior domain', () => {
    const engine = new WeightEngine('behavior');
    const weights = engine.getWeights();
    assert.strictEqual(weights.health_risk, 0.25);
    assert.strictEqual(weights.resource_urgency, 0.25);
    assert.strictEqual(weights.goal_progress, 0.25);
    assert.strictEqual(weights.exploration_value, 0.25);
  });

  await t.test('getWeights - returns copy of weights', () => {
    const engine = new WeightEngine('path');
    const weights1 = engine.getWeights();
    weights1.distance = 999;
    const weights2 = engine.getWeights();
    assert.strictEqual(weights2.distance, 0.3);
  });

  await t.test('getLearningRate - initial rate is 0.05', () => {
    const engine = new WeightEngine('path');
    assert.strictEqual(engine.getLearningRate(), 0.05);
  });

  await t.test('getLearningRate - decays over time', () => {
    const engine = new WeightEngine('path');
    engine.experienceCount = 1000;
    const rate1 = engine.getLearningRate();
    assert.ok(rate1 < 0.05);
    
    engine.experienceCount = 5000;
    const rate2 = engine.getLearningRate();
    assert.ok(rate2 < rate1);
  });

  await t.test('getLearningRate - min rate is 0.005', () => {
    const engine = new WeightEngine('path');
    engine.experienceCount = 10000;
    assert.strictEqual(engine.getLearningRate(), 0.005);
  });

  await t.test('isValid - valid weights sum to 1', () => {
    const engine = new WeightEngine('path');
    assert.strictEqual(engine.isValid(), true);
  });

  await t.test('isValid - invalid if not normalized', () => {
    const engine = new WeightEngine('path');
    engine.activeWeights.distance = 0.5;
    assert.strictEqual(engine.isValid(), false);
  });

  await t.test('getExperienceCount - returns count', () => {
    const engine = new WeightEngine('path');
    assert.strictEqual(engine.getExperienceCount(), 0);
  });

  await t.test('reset - resets to initial weights', () => {
    const engine = new WeightEngine('path');
    engine.experienceCount = 10;
    engine.activeWeights.distance = 0.5;
    engine.reset();
    assert.strictEqual(engine.getExperienceCount(), 0);
    assert.strictEqual(engine.activeWeights.distance, 0.3);
  });

  await t.test('update - increases weight for good fitness', () => {
    const engine = new WeightEngine('path');
    engine.activeWeights.distance = 0.3;
    engine.activeWeights.safety = 0.3;
    engine.activeWeights.speed = 0.2;
    engine.activeWeights.terrain_type = 0.2;
    
    const experience = {
      context: { active_weights: engine.activeWeights }
    };
    
    engine.update(experience, 0.8);
    assert.ok(engine.activeWeights.distance > 0.3);
  });

  await t.test('update - decreases weight for bad fitness', () => {
    const engine = new WeightEngine('path');
    engine.activeWeights.distance = 0.3;
    engine.activeWeights.safety = 0.3;
    engine.activeWeights.speed = 0.2;
    engine.activeWeights.terrain_type = 0.2;
    
    const experience = {
      context: { active_weights: engine.activeWeights }
    };
    
    engine.update(experience, 0.2);
    assert.ok(engine.activeWeights.distance < 0.3);
  });

  await t.test('update - does not change when fitness is 0.5', () => {
    const engine = new WeightEngine('path');
    const originalWeights = { ...engine.activeWeights };
    
    const experience = {
      context: { active_weights: engine.activeWeights }
    };
    
    engine.update(experience, 0.5);
    assert.deepStrictEqual(engine.activeWeights, originalWeights);
  });

  await t.test('update - counts experience', () => {
    const engine = new WeightEngine('path');
    const experience = {
      context: { active_weights: engine.activeWeights }
    };
    
    engine.update(experience, 0.8);
    assert.strictEqual(engine.getExperienceCount(), 1);
    
    engine.update(experience, 0.8);
    assert.strictEqual(engine.getExperienceCount(), 2);
  });
});
