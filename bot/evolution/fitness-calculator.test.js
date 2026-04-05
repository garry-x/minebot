const { test } = require('node:test');
const assert = require('node:assert/strict');
const FitnessCalculator = require('./fitness-calculator');

test('FitnessCalculator', async (t) => {
  await t.test('calcPathFitness - failure case', () => {
    const outcome = { success: false, duration_ms: 5000, health_change: 0 };
    assert.strictEqual(FitnessCalculator.calcPathFitness(outcome), 0.1);
  });

  await t.test('calcPathFitness - success with good time', () => {
    const outcome = { success: true, duration_ms: 10000, health_change: 0 };
    const score = FitnessCalculator.calcPathFitness(outcome);
    assert.ok(score > 0.5);
    assert.ok(score <= 1.0);
  });

  await t.test('calcPathFitness - success with health loss', () => {
    const outcome = { success: true, duration_ms: 10000, health_change: -5 };
    const score = FitnessCalculator.calcPathFitness(outcome);
    assert.ok(score < 1.0);
  });

  await t.test('calcResourceFitness - failure case', () => {
    const outcome = { success: false, duration_ms: 5000, resource_gained: 0, resource_cost: 0 };
    assert.strictEqual(FitnessCalculator.calcResourceFitness(outcome), 0.1);
  });

  await t.test('calcResourceFitness - success with good efficiency', () => {
    const outcome = { success: true, duration_ms: 1000, resource_gained: 64, resource_cost: 1 };
    const score = FitnessCalculator.calcResourceFitness(outcome);
    assert.ok(score > 0.8);
  });

  await t.test('calcResourceFitness - success with high cost', () => {
    const outcome = { success: true, duration_ms: 1000, resource_gained: 64, resource_cost: 8 };
    const score = FitnessCalculator.calcResourceFitness(outcome);
    assert.ok(score < 0.8);
  });

  await t.test('calcBehaviorFitness - failure case', () => {
    const outcome = { success: false, duration_ms: 5000 };
    assert.strictEqual(FitnessCalculator.calcBehaviorFitness(outcome), 0.1);
  });

  await t.test('calcBehaviorFitness - success fast', () => {
    const outcome = { success: true, duration_ms: 10000 };
    const score = FitnessCalculator.calcBehaviorFitness(outcome);
    assert.strictEqual(score, 1.0);
  });

  await t.test('calcBehaviorFitness - success slow', () => {
    const outcome = { success: true, duration_ms: 60000 };
    const score = FitnessCalculator.calcBehaviorFitness(outcome);
    assert.strictEqual(score, 0.75);
  });
});
