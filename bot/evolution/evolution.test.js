const ExperienceLogger = require('./experience-logger');
const EvolutionStorage = require('./evolution-storage');
const StrategyEvolutionManager = require('./strategy-manager');
const FitnessCalculator = require('./fitness-calculator');
const WeightEngine = require('./weight-engine');
const fs = require('fs');
const path = require('path');

describe('Evolution System', () => {
  describe('Storage Layer', () => {
    let storage;
    const testDbPath = path.resolve(__dirname, 'test-evolution.db');

    beforeEach(() => {
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
      storage = new EvolutionStorage(testDbPath);
    });

    afterEach(async () => {
      if (storage) {
        await storage.close();
      }
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
    });

    describe('connect()', () => {
      it('should connect to database successfully', async () => {
        await expect(storage.connect()).resolves.toBeUndefined();
        expect(storage.db).toBeDefined();
      });

      it('should create database file', async () => {
        await storage.connect();
        expect(fs.existsSync(testDbPath)).toBe(true);
      });
    });

    describe('initialize()', () => {
      beforeEach(async () => {
        await storage.connect();
      });

      it('should create all required tables', async () => {
        await storage.initialize();
        
        const tables = await storage._getAll(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        );
        const tableNames = tables.map(t => t.name);
        
        expect(tableNames).toContain('evolution_weights');
        expect(tableNames).toContain('experience_log');
        expect(tableNames).toContain('evolution_snapshots');
        expect(tableNames).toContain('evolution_migrations');
      });

      it('should create indices', async () => {
        await storage.initialize();
        
        const indices = await storage._getAll(
          "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name"
        );
        const indexNames = indices.map(i => i.name);
        
        expect(indexNames).toContain('idx_weights_bot_domain');
        expect(indexNames).toContain('idx_exp_bot_type');
        expect(indexNames).toContain('idx_exp_success');
      });
    });

    describe('saveWeights() and loadWeights()', () => {
      beforeEach(async () => {
        await storage.connect();
        await storage.initialize();
      });

      it('should save weights successfully', async () => {
        const botId = 'test-bot-1';
        const domain = 'path';
        const weightVector = { distance: 0.3, safety: 0.4, speed: 0.3 };

        const result = await storage.saveWeights(botId, domain, weightVector);

        expect(result.success).toBe(true);
      });

      it('should load saved weights', async () => {
        const botId = 'test-bot-2';
        const domain = 'resource';
        const weightVector = { value: 0.4, proximity: 0.3, safety: 0.3 };

        await storage.saveWeights(botId, domain, weightVector);
        const loaded = await storage.loadWeights(botId, domain);

        expect(loaded).toBeDefined();
        expect(loaded.weight_vector).toEqual(weightVector);
        expect(loaded.version).toBe(1);
        expect(loaded.created_at).toBeDefined();
        expect(loaded.updated_at).toBeDefined();
      });

      it('should return null for non-existent weights', async () => {
        const result = await storage.loadWeights('non-existent', 'path');
        expect(result).toBeNull();
      });

      it('should bump version on update', async () => {
        const botId = 'test-bot-3';
        const domain = 'behavior';
        
        await storage.saveWeights(botId, domain, { x: 0.5, y: 0.5 });
        await storage.saveWeights(botId, domain, { x: 0.6, y: 0.4 });
        
        const loaded = await storage.loadWeights(botId, domain);
        expect(loaded.version).toBe(2);
      });

      it('should enforce UNIQUE constraint on (bot_id, domain)', async () => {
        const botId = 'test-bot-4';
        
        await expect(storage.saveWeights(botId, 'path', { x: 0.5 })).resolves.toBeDefined();
        await expect(storage.saveWeights(botId, 'path', { x: 0.6 })).resolves.toBeDefined();
        
        const weights = await storage._getOne(
          'SELECT COUNT(*) as count FROM evolution_weights WHERE bot_id = ? AND domain = ?',
          [botId, 'path']
        );
        expect(weights.count).toBe(1);
      });
    });

    describe('saveExperience() and saveExperienceBatch()', () => {
      beforeEach(async () => {
        await storage.connect();
        await storage.initialize();
      });

      it('should save single experience', async () => {
        const experience = {
          bot_id: 'test-bot',
          type: 'path',
          context: { position: { x: 0, y: 64, z: 0 } },
          action: 'move_to',
          outcome: { success: true, duration_ms: 5000 },
          fitness_score: 0.8
        };

        const result = await storage.saveExperience(experience);

        expect(result.success).toBe(true);
        expect(result.count).toBe(1);
      });

      it('should save batch of experiences', async () => {
        const experiences = [
          {
            bot_id: 'test-bot',
            type: 'path',
            context: { position: { x: 0, y: 64, z: 0 } },
            action: 'move_to',
            outcome: { success: true, duration_ms: 5000 },
            fitness_score: 0.8
          },
          {
            bot_id: 'test-bot',
            type: 'path',
            context: { position: { x: 10, y: 64, z: 0 } },
            action: 'move_to',
            outcome: { success: false, duration_ms: 10000, error: 'obstacle' },
            fitness_score: 0.2
          }
        ];

        const result = await storage.saveExperienceBatch(experiences);

        expect(result.success).toBe(true);
        expect(result.count).toBe(2);
      });

      it('should validate JSON for context, outcome columns', async () => {
        const goodExperience = {
          bot_id: 'test-bot',
          type: 'path',
          context: { position: { x: 0, y: 64, z: 0 } },
          action: 'move_to',
          outcome: { success: true },
          fitness_score: 0.8
        };

        await expect(storage.saveExperience(goodExperience)).resolves.toBeDefined();

        const badExperience = {
          bot_id: 'test-bot',
          type: 'path',
          context: undefined,
          action: 'move_to',
          outcome: { success: true }
        };

        await expect(storage.saveExperience(badExperience)).rejects.toThrow();
      });

      it('should store success as INTEGER 1 or 0', async () => {
        const successExp = {
          bot_id: 'test-bot',
          type: 'path',
          context: {},
          action: 'action1',
          outcome: { success: true },
          fitness_score: 0.8
        };

        const failExp = {
          bot_id: 'test-bot',
          type: 'path',
          context: {},
          action: 'action2',
          outcome: { success: false }
        };

        await storage.saveExperience(successExp);
        await storage.saveExperience(failExp);

        const rows = await storage._getAll('SELECT success FROM experience_log');
        expect(rows[0].success).toBe(1);
        expect(rows[1].success).toBe(0);
      });

      it('should store fitness_score as REAL', async () => {
        const experience = {
          bot_id: 'test-bot',
          type: 'path',
          context: {},
          action: 'move_to',
          outcome: { success: true },
          fitness_score: 0.856789
        };

        await storage.saveExperience(experience);

        const row = await storage._getOne('SELECT fitness_score FROM experience_log');
        expect(row.fitness_score).toBeCloseTo(0.856789);
      });
    });

    describe('getWeightHistory()', () => {
      beforeEach(async () => {
        await storage.connect();
        await storage.initialize();
      });

      it('should return empty array for non-existent weights', async () => {
        const history = await storage.getWeightHistory('non-existent', 'path');
        expect(history).toEqual([]);
      });

      it('should return the latest version', async () => {
        const botId = 'test-bot';
        const domain = 'path';

        await storage.saveWeights(botId, domain, { x: 0.1, y: 0.9 });
        await storage.saveWeights(botId, domain, { x: 0.2, y: 0.8 });
        await storage.saveWeights(botId, domain, { x: 0.3, y: 0.7 });

        const history = await storage.getWeightHistory(botId, domain, 10);

        expect(history.length).toBe(1);
        expect(history[0].version).toBe(3);
      });
    });

    describe('saveSnapshot(), getSnapshots(), loadSnapshot()', () => {
      beforeEach(async () => {
        await storage.connect();
        await storage.initialize();
      });

      it('should save snapshot', async () => {
        const botId = 'test-bot';
        const type = 'milestone';
        const data = { weights: { x: 0.5 }, score: 100 };

        const result = await storage.saveSnapshot(botId, type, data);

        expect(result.success).toBe(true);
        expect(result.id).toBeDefined();
      });

      it('should get snapshots for bot', async () => {
        const botId = 'test-bot';

        for (let i = 0; i < 5; i++) {
          await storage.saveSnapshot(botId, 'milestone', { iteration: i });
        }

        const snapshots = await storage.getSnapshots(botId, 3);

        expect(snapshots.length).toBe(3);
        expect(snapshots[0].data.iteration).toBe(4);
        expect(snapshots[1].data.iteration).toBe(3);
      });

      it('should load specific snapshot by ID', async () => {
        const botId = 'test-bot';
        const type = 'weight_update';
        const data = { version: 5, weights: { x: 0.7 } };

        const saveResult = await storage.saveSnapshot(botId, type, data);
        const loaded = await storage.loadSnapshot(saveResult.id);

        expect(loaded).toBeDefined();
        expect(loaded.data).toEqual(data);
      });

      it('should return null for non-existent snapshot', async () => {
        const loaded = await storage.loadSnapshot(999999);
        expect(loaded).toBeNull();
      });
    });

    describe('queryExperience()', () => {
      beforeEach(async () => {
        await storage.connect();
        await storage.initialize();
      });

      it('should query experiences by bot_id and type', async () => {
        const botId = 'test-bot';

        for (let i = 0; i < 10; i++) {
          await storage.saveExperience({
            bot_id: botId,
            type: i < 5 ? 'path' : 'resource',
            context: {},
            action: 'action',
            outcome: { success: true },
            fitness_score: 0.5 + i * 0.1
          });
        }

        const pathExperiences = await storage.queryExperience(botId, 'path', 3);
        const resourceExperiences = await storage.queryExperience(botId, 'resource', 3);

        expect(pathExperiences.length).toBe(3);
        expect(resourceExperiences.length).toBe(3);
      });

      it('should return experiences in descending order by id', async () => {
        const botId = 'test-bot';

        await storage.saveExperience({
          bot_id: botId,
          type: 'path',
          context: {},
          action: 'action1',
          outcome: { success: true },
          fitness_score: 0.5
        });

        const experiences = await storage.queryExperience(botId, 'path', 10);
        expect(experiences.length).toBe(1);
      });
    });

    describe('cleanupOldExperiences()', () => {
      beforeEach(async () => {
        await storage.connect();
        await storage.initialize();
      });

      it('should keep maxCount experiences', async () => {
        const botId = 'test-bot';
        const type = 'path';

        for (let i = 0; i < 20; i++) {
          await storage.saveExperience({
            bot_id: botId,
            type,
            context: {},
            action: 'action',
            outcome: { success: true }
          });
        }

        const cleanupResult = await storage.cleanupOldExperiences(botId, type, 10);

        expect(cleanupResult.success).toBe(true);
        expect(cleanupResult.cleaned).toBe(10);

        const remaining = await storage.queryExperience(botId, type, 100);
        expect(remaining.length).toBe(10);
      });

      it('should not delete if below maxCount', async () => {
        const botId = 'test-bot';
        const type = 'path';

        for (let i = 0; i < 5; i++) {
          await storage.saveExperience({
            bot_id: botId,
            type,
            context: {},
            action: 'action',
            outcome: { success: true }
          });
        }

        const cleanupResult = await storage.cleanupOldExperiences(botId, type, 10);

        expect(cleanupResult.success).toBe(true);
        expect(cleanupResult.cleaned).toBe(0);
      });
    });
  });

  describe('Fitness Calculator', () => {
    describe('Path Fitness', () => {
      it('should calculate fitness for successful path', () => {
        const outcome = { success: true, duration_ms: 5000, health_change: 0 };
        const score = FitnessCalculator.calcPathFitness(outcome);
        
        expect(score).toBeGreaterThan(0.5);
        expect(score).toBeLessThanOrEqual(1);
      });

      it('should penalize failed path', () => {
        const outcome = { success: false, duration_ms: 5000, health_change: 0 };
        const score = FitnessCalculator.calcPathFitness(outcome);
        
        expect(score).toBe(0.1);
      });

      it('should penalize slow paths', () => {
        const fastOutcome = { success: true, duration_ms: 5000, health_change: 0 };
        const slowOutcome = { success: true, duration_ms: 60000, health_change: 0 };
        
        const fastScore = FitnessCalculator.calcPathFitness(fastOutcome);
        const slowScore = FitnessCalculator.calcPathFitness(slowOutcome);
        
        expect(fastScore).toBeGreaterThan(slowScore);
      });

      it('should reward health gains', () => {
        const outcome = { success: true, duration_ms: 10000, health_change: 4 };
        const score = FitnessCalculator.calcPathFitness(outcome);
        
        expect(score).toBeGreaterThan(0.5);
      });
    });

    describe('Resource Fitness', () => {
      it('should calculate fitness for successful resource gathering', () => {
        const outcome = { 
          success: true, 
          duration_ms: 1000, 
          resource_gained: 10, 
          resource_cost: 1 
        };
        const score = FitnessCalculator.calcResourceFitness(outcome);
        
        expect(score).toBeGreaterThan(0.5);
      });

      it('should penalize failed resource gathering', () => {
        const outcome = { 
          success: false, 
          duration_ms: 1000, 
          resource_gained: 0, 
          resource_cost: 0 
        };
        const score = FitnessCalculator.calcResourceFitness(outcome);
        
        expect(score).toBe(0.1);
      });

      it('should consider efficiency', () => {
        const efficient = { 
          success: true, 
          duration_ms: 1000, 
          resource_gained: 10, 
          resource_cost: 1 
        };
        const inefficient = { 
          success: true, 
          duration_ms: 10000, 
          resource_gained: 10, 
          resource_cost: 1 
        };
        
        expect(FitnessCalculator.calcResourceFitness(efficient))
          .toBeGreaterThan(FitnessCalculator.calcResourceFitness(inefficient));
      });
    });

    describe('Behavior Fitness', () => {
      it('should reward quick successful behaviors', () => {
        const fastOutcome = { success: true, duration_ms: 10000, resource_cost: 0, health_change: 0 };
        const slowOutcome = { success: true, duration_ms: 60000, resource_cost: 0, health_change: 0 };
        
        const fastScore = FitnessCalculator.calcBehaviorFitness(fastOutcome);
        const slowScore = FitnessCalculator.calcBehaviorFitness(slowOutcome);
        
        expect(fastScore).toBeGreaterThan(slowScore);
        expect(fastScore).toBe(1);
        expect(slowScore).toBe(0.5);
      });

      it('should penalize failed behaviors', () => {
        const outcome = { success: false, duration_ms: 1000, resource_cost: 0, health_change: 0 };
        const score = FitnessCalculator.calcBehaviorFitness(outcome);
        
        expect(score).toBe(0.1);
      });
    });
  });

  describe('Weight Engine', () => {
    let engine;

    describe('Initialization', () => {
      it('should initialize with default weights for path domain', () => {
        engine = new WeightEngine('path');
        const weights = engine.getWeights();
        
        expect(weights).toEqual({
          distance: 0.3,
          safety: 0.3,
          speed: 0.2,
          terrain_type: 0.2
        });
        expect(engine.isValid()).toBe(true);
      });

      it('should initialize with default weights for resource domain', () => {
        engine = new WeightEngine('resource');
        const weights = engine.getWeights();
        
        expect(weights).toEqual({
          value: 0.3,
          proximity: 0.3,
          safety: 0.2,
          tool_efficiency: 0.2
        });
        expect(engine.isValid()).toBe(true);
      });

      it('should initialize with default weights for behavior domain', () => {
        engine = new WeightEngine('behavior');
        const weights = engine.getWeights();
        
        expect(weights).toEqual({
          health_risk: 0.25,
          resource_urgency: 0.25,
          goal_progress: 0.25,
          exploration_value: 0.25
        });
        expect(engine.isValid()).toBe(true);
      });
    });

    describe('Weight Updates', () => {
      beforeEach(() => {
        engine = new WeightEngine('path');
      });

      it('should update weights based on fitness score', () => {
        const initialWeights = engine.getWeights();
        
        const experience = { type: 'path' };
        engine.update(experience, 0.7);
        
        const updatedWeights = engine.getWeights();
        expect(updatedWeights).not.toEqual(initialWeights);
      });

      it('should increase weights when fitness > 0.5', () => {
        const initialWeights = engine.getWeights();
        
        engine.update({ type: 'path' }, 0.8);
        engine.update({ type: 'path' }, 0.8);
        
        const updatedWeights = engine.getWeights();
        
        for (const key in initialWeights) {
          expect(updatedWeights[key]).toBeDefined();
        }
      });

      it('should decrease weights when fitness < 0.5', () => {
        const initialWeights = engine.getWeights();
        
        engine.update({ type: 'path' }, 0.3);
        
        const updatedWeights = engine.getWeights();
        expect(updatedWeights).not.toEqual(initialWeights);
      });

      it('should maintain weight constraints (min 0.05, max 0.95)', () => {
        for (let i = 0; i < 100; i++) {
          engine.update({ type: 'path' }, i % 2 === 0 ? 0.9 : 0.1);
        }
        
        const weights = engine.getWeights();
        for (const key in weights) {
          expect(weights[key]).toBeGreaterThanOrEqual(0.05);
          expect(weights[key]).toBeLessThanOrEqual(0.95);
        }
      });

      it('should maintain weights summing to 1.0', () => {
        for (let i = 0; i < 50; i++) {
          engine.update({ type: 'path' }, Math.random() > 0.5 ? 0.7 : 0.3);
        }
        
        const weights = engine.getWeights();
        const sum = Object.values(weights).reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1.0);
      });
    });

    describe('Learning Rate', () => {
      beforeEach(() => {
        engine = new WeightEngine('path');
      });

      it('should start with initial learning rate', () => {
        expect(engine.getLearningRate()).toBeCloseTo(0.05, 3);
      });

      it('should decay learning rate over time', () => {
        engine.experienceCount = 100;
        const rate1 = engine.getLearningRate();
        
        engine.experienceCount = 1000;
        const rate2 = engine.getLearningRate();
        
        expect(rate2).toBeLessThan(rate1);
        expect(rate2).toBeGreaterThanOrEqual(0.005);
      });
    });

    describe('Warm Start', () => {
      it('should track experience count', () => {
        engine = new WeightEngine('path');
        expect(engine.getExperienceCount()).toBe(0);
        
        engine.update({ type: 'path' }, 0.5);
        expect(engine.getExperienceCount()).toBe(1);
        
        engine.update({ type: 'path' }, 0.5);
        expect(engine.getExperienceCount()).toBe(2);
      });

      it('should reset experience count on reset', () => {
        engine = new WeightEngine('path');
        engine.experienceCount = 10;
        
        engine.reset();
        expect(engine.getExperienceCount()).toBe(0);
        expect(engine.isValid()).toBe(true);
      });
    });

    describe('Validation', () => {
      it('should validate weight sum', () => {
        engine = new WeightEngine('path');
        expect(engine.isValid()).toBe(true);
        
        engine.experienceCount = 100;
        engine.update({ type: 'path' }, 0.1);
        expect(engine.isValid()).toBe(true);
      });

      it('should reject invalid weight configurations', () => {
        engine = new WeightEngine('path');
        engine.activeWeights = { distance: 0.5, safety: 0.5, speed: 0.5, terrain_type: 0.5 };
        expect(engine.isValid()).toBe(false);
      });
    });
  });

  describe('Experience Logger', () => {
    let storage;
    let logger;
    let testDbPath;
    let testWalPath;

    beforeEach(async () => {
      testDbPath = path.resolve(__dirname, 'test-evolution-logger.db');
      testWalPath = path.resolve(__dirname, 'test-wal-logger.json');
      
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
      
      if (fs.existsSync(testWalPath)) {
        fs.unlinkSync(testWalPath);
      }

      storage = new EvolutionStorage(testDbPath);
      await storage.connect();
      await storage.initialize();
      
      logger = new ExperienceLogger(storage);
      logger.walPath = testWalPath;
    });

    afterEach(async () => {
      if (logger.flushTimer) {
        clearTimeout(logger.flushTimer);
        logger.flushTimer = null;
      }
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
      if (fs.existsSync(testWalPath)) {
        fs.unlinkSync(testWalPath);
      }
      
      if (storage && storage.close) {
        await storage.close();
      }
    });

    describe('Buffer Accumulation', () => {
      it('should add experiences to buffer', async () => {
        const experience = {
          bot_id: 'test-bot-1',
          type: 'path',
          context: {
            bot_position: { x: 10, y: 64, z: -20 },
            bot_health: 20,
            bot_food: 20,
            inventory_summary: { 'minecraft:stone': 5 },
            current_goal: 'mine_stone',
            time_of_day: 1000,
            nearby_threats: 0,
            active_weights: { distance: 0.3, safety: 0.3, speed: 0.2, terrain_type: 0.2 }
          },
          action: 'move_to',
          outcome: {
            success: true,
            duration_ms: 5000,
            resource_cost: 0,
            health_change: 0,
            error_message: null
          },
          timestamp: new Date().toISOString()
        };

        await logger.record(experience);
        
        expect(logger.buffer.length).toBe(1);
        expect(logger.bufferSize).toBe(1);
        expect(logger.buffer[0]).toEqual(experience);
      });

      it('should track buffer stats correctly', async () => {
        for (let i = 0; i < 5; i++) {
          await logger.record({
            bot_id: 'test-bot',
            type: 'path',
            context: { bot_position: { x: 0, y: 64, z: 0 }, bot_health: 20, bot_food: 20, inventory_summary: {}, current_goal: null, time_of_day: 0, nearby_threats: 0, active_weights: {} },
            action: 'move',
            outcome: { success: true, duration_ms: 1000, resource_cost: 0, health_change: 0, error_message: null },
            timestamp: new Date().toISOString()
          });
        }

        const stats = logger.getBufferStats();
        expect(stats.bufferSize).toBe(5);
        expect(stats.bufferLength).toBe(5);
        expect(stats.timeSinceLastFlush).toBeGreaterThanOrEqual(0);
        expect(stats.isFlushing).toBe(false);
      });
    });

    describe('Auto-flush on buffer full', () => {
      it('should flush automatically when buffer reaches 10 records', async () => {
        const experiences = [];
        for (let i = 0; i < 10; i++) {
          experiences.push({
            bot_id: 'test-bot-auto',
            type: 'path',
            context: { bot_position: { x: i, y: 64, z: i }, bot_health: 20, bot_food: 20, inventory_summary: {}, current_goal: null, time_of_day: 0, nearby_threats: 0, active_weights: {} },
            action: 'move',
            outcome: { success: true, duration_ms: 1000, resource_cost: 0, health_change: 0, error_message: null },
            timestamp: new Date().toISOString()
          });
          await logger.record(experiences[i]);
        }

        expect(logger.buffer.length).toBe(0);
        expect(logger.bufferSize).toBe(0);
        
        const results = await storage.queryExperience('test-bot-auto', 'path', 10);
        expect(results.length).toBe(10);
      });

      it('should support manual flush', async () => {
        jest.useFakeTimers();
        
        const experience = {
          bot_id: 'test-bot-manual',
          type: 'path',
          context: { bot_position: { x: 0, y: 64, z: 0 }, bot_health: 20, bot_food: 20, inventory_summary: {}, current_goal: null, time_of_day: 0, nearby_threats: 0, active_weights: {} },
          action: 'move',
          outcome: { success: true, duration_ms: 1000, resource_cost: 0, health_change: 0, error_message: null },
          timestamp: new Date().toISOString()
        };

        await logger.record(experience);
        expect(logger.buffer.length).toBe(1);
        
        await logger.flush();
        expect(logger.buffer.length).toBe(0);
        
        const results = await storage.queryExperience('test-bot-manual', 'path', 10);
        expect(results.length).toBe(1);
        
        jest.useRealTimers();
      });
    });

    describe('WAL persistence', () => {
      it('should persist to WAL file when called directly', async () => {
        const experiences = [];
        for (let i = 0; i < 5; i++) {
          experiences.push({
            bot_id: 'test-bot-wal',
            type: 'path',
            context: { bot_position: { x: i, y: 64, z: i }, bot_health: 20, bot_food: 20, inventory_summary: {}, current_goal: null, time_of_day: 0, nearby_threats: 0, active_weights: {} },
            action: 'move',
            outcome: { success: true, duration_ms: 1000, resource_cost: 0, health_change: 0, error_message: null },
            timestamp: new Date().toISOString()
          });
        }

        logger.buffer = experiences;
        logger.bufferSize = experiences.length;
        
        await logger._persistToWAL();

        expect(fs.existsSync(testWalPath)).toBe(true);
        
        const walContent = fs.readFileSync(testWalPath, 'utf8');
        const walData = JSON.parse(walContent);
        
        expect(walData.length).toBeGreaterThan(0);
        expect(walData[0].botId).toBe('test-bot-wal');
        expect(walData[0].domain).toBe('path');
        expect(walData[0].experiences.length).toBe(5);
      });

      it('should load and clear WAL file', async () => {
        const walData = [{
          botId: 'test-bot-wal-load',
          domain: 'resource',
          experiences: [],
          timestamp: new Date().toISOString()
        }];
        
        fs.writeFileSync(testWalPath, JSON.stringify(walData, null, 2));
        
        const loadedExperiences = await logger.loadFromWAL();
        expect(loadedExperiences.length).toBe(0);
        expect(fs.existsSync(testWalPath)).toBe(false);
      });
    });

    describe('Query functionality', () => {
      it('should query experiences from database', async () => {
        const experiences = [];
        for (let i = 0; i < 5; i++) {
          const exp = {
            bot_id: 'test-bot-query',
            type: 'behavior',
            context: { bot_position: { x: 0, y: 64, z: 0 }, bot_health: 20, bot_food: 20, inventory_summary: {}, current_goal: null, time_of_day: 0, nearby_threats: 0, active_weights: {} },
            action: 'attack',
            outcome: { success: i % 2 === 0, duration_ms: 1500, resource_cost: 0, health_change: -1, error_message: null },
            timestamp: new Date().toISOString()
          };
          experiences.push(exp);
          await logger.record(exp);
        }
        
        await logger.flush();

        const results = await logger.query('test-bot-query', 'behavior', 10);
        expect(results.length).toBe(5);
        expect(results[0].type).toBe('behavior');
        expect(results[0].bot_id).toBe('test-bot-query');
      });

      it('should handle empty query results', async () => {
        const results = await logger.query('nonexistent-bot', 'path', 10);
        expect(results.length).toBe(0);
      });

      it('should respect limit parameter', async () => {
        for (let i = 0; i < 20; i++) {
          await logger.record({
            bot_id: 'test-bot-limit',
            type: 'resource',
            context: { bot_position: { x: 0, y: 64, z: 0 }, bot_health: 20, bot_food: 20, inventory_summary: {}, current_goal: null, time_of_day: 0, nearby_threats: 0, active_weights: {} },
            action: 'gather',
            outcome: { success: true, duration_ms: 1000, resource_cost: 0, health_change: 0, error_message: null },
            timestamp: new Date().toISOString()
          });
        }
        
        await logger.flush();

        const results = await logger.query('test-bot-limit', 'resource', 5);
        expect(results.length).toBe(5);
      });
    });

    describe('Integration with EvolutionStorage', () => {
      it('should work with full storage integration', async () => {
        const experiences = [];
        for (let i = 0; i < 12; i++) {
          const exp = {
            bot_id: 'test-bot-integration',
            type: i < 4 ? 'path' : i < 8 ? 'resource' : 'behavior',
            context: { 
              bot_position: { x: i, y: 64 + i, z: i }, 
              bot_health: 20 - i, 
              bot_food: 20, 
              inventory_summary: { [`item_${i}`]: i + 1 }, 
              current_goal: `goal_${i}`, 
              time_of_day: i * 1000, 
              nearby_threats: i, 
              active_weights: { distance: 0.3, safety: 0.3, speed: 0.2, terrain_type: 0.2 } 
            },
            action: `action_${i}`,
            outcome: { 
              success: true, 
              duration_ms: 1000 + i * 100, 
              resource_cost: i, 
              health_change: -i, 
              error_message: null 
            },
            timestamp: new Date().toISOString()
          };
          experiences.push(exp);
          await logger.record(exp);
        }
        
        await logger.flush();

        const pathResults = await logger.query('test-bot-integration', 'path', 10);
        expect(pathResults.length).toBe(4);

        const resourceResults = await logger.query('test-bot-integration', 'resource', 10);
        expect(resourceResults.length).toBe(4);

        const behaviorResults = await logger.query('test-bot-integration', 'behavior', 10);
        expect(behaviorResults.length).toBe(4);
      });
    });
  });

  describe('Strategy Manager', () => {
    let manager;
    let testDbPath;
    const testBotId = 'test-bot-strategy';

    const createTestExperience = (domain, success = true, override = {}) => ({
      bot_id: testBotId,
      type: domain,
      context: {
        bot_position: { x: 0, y: 64, z: 0 },
        bot_health: 20,
        bot_food: 20,
        inventory_summary: {},
        current_goal: null,
        time_of_day: 0,
        nearby_threats: 0,
        active_weights: {}
      },
      action: 'test_action',
      outcome: {
        success,
        duration_ms: 1000,
        resource_cost: 0,
        health_change: 0,
        error_message: null,
        ...override.outcome
      },
      timestamp: new Date().toISOString(),
      ...override
    });

    beforeEach(async () => {
      testDbPath = path.resolve(__dirname, 'test-evolution-manager.db');
      
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }

      manager = new StrategyEvolutionManager(testBotId, {
        dbPath: testDbPath
      });
    });

    afterEach(async () => {
      if (manager && manager.storage && manager.storage.close) {
        await manager.storage.close();
      }
      
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
    });

    describe('Integration with ExperienceLogger', () => {
      it('should work with full experience flow', async () => {
        await manager.storage.connect();
        await manager.storage.initialize();
        
        const experiences = [];
        for (let i = 0; i < 15; i++) {
          const domain = i < 5 ? 'path' : i < 10 ? 'resource' : 'behavior';
          experiences.push(createTestExperience(domain, true));
        }
        
        for (const exp of experiences) {
          await manager.recordExperience(exp);
        }
        
        const stats = await manager.getEvolutionStats();
        
        expect(stats.totalExperiences).toBeGreaterThanOrEqual(15);
        expect(stats.domains.path).toBeDefined();
        expect(stats.domains.resource).toBeDefined();
        expect(stats.domains.behavior).toBeDefined();
      });
    });

    describe('Fitness Calculator Integration', () => {
      it('should use fitness calculator for path domain', async () => {
        const successOutcome = { success: true, duration_ms: 5000, resource_cost: 0, health_change: 0, error_message: null };
        const failOutcome = { success: false, duration_ms: 1000, resource_cost: 0, health_change: 0, error_message: null };
        
        const successScore = FitnessCalculator.calcPathFitness(successOutcome);
        const failScore = FitnessCalculator.calcPathFitness(failOutcome);
        
        expect(successScore).toBeGreaterThan(failScore);
        expect(successScore).toBeGreaterThan(0.5);
        expect(failScore).toBeLessThan(0.2);
      });

      it('should use fitness calculator for resource domain', async () => {
        const successOutcome = { 
          success: true, 
          duration_ms: 1000, 
          resource_gained: 10, 
          resource_cost: 1, 
          error_message: null 
        };
        const failOutcome = { 
          success: false, 
          duration_ms: 1000, 
          resource_gained: 0, 
          resource_cost: 0, 
          error_message: null 
        };
        
        const successScore = FitnessCalculator.calcResourceFitness(successOutcome);
        const failScore = FitnessCalculator.calcResourceFitness(failOutcome);
        
        expect(successScore).toBeGreaterThan(failScore);
      });

      it('should use fitness calculator for behavior domain', async () => {
        const fastOutcome = { success: true, duration_ms: 10000, resource_cost: 0, health_change: 0, error_message: null };
        const slowOutcome = { success: true, duration_ms: 60000, resource_cost: 0, health_change: 0, error_message: null };
        
        const fastScore = FitnessCalculator.calcBehaviorFitness(fastOutcome);
        const slowScore = FitnessCalculator.calcBehaviorFitness(slowOutcome);
        
        expect(fastScore).toBeGreaterThan(slowScore);
      });
    });

    describe('Weight Engine Integration', () => {
      it('should use weight engine for path domain', async () => {
        await manager.storage.connect();
        await manager.storage.initialize();
        
        const initialWeights = manager.getWeights('path');
        expect(initialWeights).toEqual({
          distance: 0.3,
          safety: 0.3,
          speed: 0.2,
          terrain_type: 0.2
        });

        const experience = createTestExperience('path', true);
        await manager.recordExperience(experience);
        
        const updatedWeights = manager.getWeights('path');
        expect(updatedWeights).not.toEqual(initialWeights);
      });

      it('should isolate weight updates between domains', async () => {
        await manager.storage.connect();
        await manager.storage.initialize();
        
        const initialPathWeights = manager.getWeights('path');
        const initialResourceWeights = manager.getWeights('resource');
        
        const pathExperience = createTestExperience('path', true);
        await manager.recordExperience(pathExperience);
        
        const updatedPathWeights = manager.getWeights('path');
        const updatedResourceWeights = manager.getWeights('resource');
        
        expect(updatedPathWeights).not.toEqual(initialPathWeights);
        expect(updatedResourceWeights).toEqual(initialResourceWeights);
      });
    });

    describe('Baseline Update', () => {
      it('should update baseline after 10 experiences', async () => {
        await manager.storage.connect();
        await manager.storage.initialize();
        
        for (let i = 0; i < 10; i++) {
          const experience = createTestExperience('path', true);
          await manager.recordExperience(experience);
        }
        
        expect(manager.baselineFitness).toBeGreaterThan(0);
      });
    });

    describe('Rollback functionality', () => {
      it('should save snapshots on weight updates', async () => {
        await manager.storage.connect();
        await manager.storage.initialize();
        
        const experience = createTestExperience('path', true);
        await manager.recordExperience(experience);
        
        const snapshots = await manager.storage.getSnapshots(testBotId, 10);
        expect(snapshots.length).toBeGreaterThan(0);
        expect(snapshots.some(s => s.snapshot_type === 'weight_update')).toBe(true);
      });

      it('should rollback to milestone snapshot', async () => {
        await manager.storage.connect();
        await manager.storage.initialize();
        
        for (let i = 0; i < 5; i++) {
          const experience = createTestExperience('path', true);
          await manager.recordExperience(experience);
        }
        
        await manager.storage.saveSnapshot(testBotId, 'milestone', { weights: manager.getWeights('path') });
        
        const milestones = await manager.storage.getSnapshots(testBotId, 10);
        const milestone = milestones.find(s => s.snapshot_type === 'milestone');
        
        expect(milestone).toBeDefined();
        
        const initialWeights = manager.getWeights('path');
        
        const result = await manager.rollbackToSnapshot(milestone.id);
        expect(result.success).toBe(true);
        expect(result.snapshotId).toBe(milestone.id);
      });
    });
  });

  describe('Integration', () => {
    let storage;
    let manager;
    let testDbPath;
    const testBotId = 'test-integration-bot';

    beforeEach(async () => {
      testDbPath = path.resolve(__dirname, 'test-integration.db');
      
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }

      storage = new EvolutionStorage(testDbPath);
      manager = new StrategyEvolutionManager(testBotId, {
        dbPath: testDbPath
      });
      await storage.connect();
      await storage.initialize();
    });

    afterEach(async () => {
      if (manager && manager.storage && manager.storage.close) {
        await manager.storage.close();
      }
      
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
    });

    afterEach(async () => {
      if (manager && manager.storage && manager.storage.close) {
        await manager.storage.close();
      }
      
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
    });

    describe('Full experience flow', () => {
      it('should handle full experience flow end-to-end', async () => {
        await manager.storage.connect();
        await manager.storage.initialize();
        
        const experience = {
          bot_id: testBotId,
          type: 'path',
          context: {
            bot_position: { x: 10, y: 64, z: -20 },
            bot_health: 20,
            bot_food: 20,
            inventory_summary: {},
            current_goal: 'mine_stone',
            time_of_day: 1000,
            nearby_threats: 0,
            active_weights: { distance: 0.3, safety: 0.3, speed: 0.2, terrain_type: 0.2 }
          },
          action: 'move_to',
          outcome: {
            success: true,
            duration_ms: 5000,
            resource_cost: 0,
            health_change: 0,
            error_message: null
          },
          timestamp: new Date().toISOString()
        };

        await manager.recordExperience(experience);
        
        const weightVector = { distance: 0.35, safety: 0.25, speed: 0.2, terrain_type: 0.2 };
        await manager.storage.saveWeights(testBotId, 'path', weightVector);
        
        const loadedWeights = await manager.storage.loadWeights(testBotId, 'path');
        expect(loadedWeights).toBeDefined();
        expect(loadedWeights.weight_vector).toEqual(weightVector);
        
        const savedExperiences = await manager.storage.queryExperience(testBotId, 'path', 1);
        expect(savedExperiences.length).toBe(1);
        expect(savedExperiences[0].fitness_score).toBeGreaterThan(0);
        
        await manager.storage.saveSnapshot(testBotId, 'milestone', {
          weights: weightVector,
          fitness: savedExperiences[0].fitness_score
        });
        
        const snapshots = await manager.storage.getSnapshots(testBotId, 10);
        expect(snapshots.length).toBeGreaterThan(0);
        expect(snapshots[0].data.fitness).toBeGreaterThan(0);
      });
    });

    describe('Weight convergence', () => {
      it('should show weight convergence over 50+ experiences', async () => {
        await manager.storage.connect();
        await manager.storage.initialize();
        
        const weightTracking = [];
        
        for (let i = 0; i < 60; i++) {
          const domain = i % 3;
          const expType = domain === 0 ? 'path' : domain === 1 ? 'resource' : 'behavior';
          const success = Math.random() > 0.3;
          
          const experience = {
            bot_id: testBotId,
            type: expType,
            context: {
              bot_position: { x: 0, y: 64, z: 0 },
              bot_health: 20,
              bot_food: 20,
              inventory_summary: {},
              current_goal: null,
              time_of_day: 0,
              nearby_threats: 0,
              active_weights: {}
            },
            action: `action_${i}`,
            outcome: {
              success,
              duration_ms: 1000 + Math.random() * 5000,
              resource_cost: 0,
              health_change: 0,
              error_message: null
            },
            timestamp: new Date().toISOString()
          };
          
          await manager.recordExperience(experience);
          
          if (i === 19 || i === 49 || i === 59) {
            const weights = manager.getWeights('path');
            weightTracking.push({
              iter: i,
              weights: { ...weights },
              variance: Object.values(weights).reduce((a, b) => a + Math.abs(b - 0.25), 0)
            });
          }
        }
        
        expect(weightTracking.length).toBe(3);
        expect(weightTracking[0].iter).toBe(19);
        expect(weightTracking[1].iter).toBe(49);
        expect(weightTracking[2].iter).toBe(59);
        
        const pathEngine = manager.weightEngines['path'];
        expect(pathEngine.experienceCount).toBeGreaterThanOrEqual(20);
      });
    });

    describe('Performance regression', () => {
      it('should detect and rollback on performance regression', async () => {
        for (let i = 0; i < 50; i++) {
          const experience = {
            bot_id: testBotId,
            type: 'path',
            context: { bot_position: { x: 0, y: 64, z: 0 }, bot_health: 20, bot_food: 20, inventory_summary: {}, current_goal: null, time_of_day: 0, nearby_threats: 0, active_weights: {} },
            action: 'move',
            outcome: {
              success: true,
              duration_ms: 1000,
              resource_cost: 0,
              health_change: 0,
              error_message: null
            },
            timestamp: new Date().toISOString()
          };
          await manager.recordExperience(experience);
        }
        
        await manager.storage.saveSnapshot(testBotId, 'milestone', { 
          weights: manager.getWeights('path'),
          iteration: 50
        });
        
        for (let i = 0; i < 15; i++) {
          const experience = {
            bot_id: testBotId,
            type: 'path',
            context: { bot_position: { x: 0, y: 64, z: 0 }, bot_health: 20, bot_food: 20, inventory_summary: {}, current_goal: null, time_of_day: 0, nearby_threats: 0, active_weights: {} },
            action: 'move',
            outcome: {
              success: false,
              duration_ms: 10000,
              resource_cost: 0,
              health_change: -5,
              error_message: 'obstacle'
            },
            timestamp: new Date().toISOString()
          };
          await manager.recordExperience(experience);
        }
        
        const rolledBack = await manager.rollbackOnRegression();
        expect(rolledBack).toBe(true);
        
        const snapshots = await manager.storage.getSnapshots(testBotId, 10);
        const postRollback = snapshots.find(s => s.snapshot_type === 'post_rollback');
        expect(postRollback).toBeDefined();
      });
    });

    describe('Warm-start behavior', () => {
      it('should use uniform weights during warm-start period', async () => {
        await manager.storage.connect();
        await manager.storage.initialize();
        
        const initialWeights = manager.getWeights('path');
        expect(initialWeights).toEqual({
          distance: 0.3,
          safety: 0.3,
          speed: 0.2,
          terrain_type: 0.2
        });
        
        for (let i = 0; i < 20; i++) {
          const experience = {
            bot_id: testBotId,
            type: 'path',
            context: { bot_position: { x: 0, y: 64, z: 0 }, bot_health: 20, bot_food: 20, inventory_summary: {}, current_goal: null, time_of_day: 0, nearby_threats: 0, active_weights: {} },
            action: 'move',
            outcome: {
              success: Math.random() > 0.5,
              duration_ms: 1000,
              resource_cost: 0,
              health_change: 0,
              error_message: null
            },
            timestamp: new Date().toISOString()
          };
          await manager.recordExperience(experience);
        }
        
        const engine = manager.weightEngines['path'];
        expect(engine.experienceCount).toBe(20);
        
        const afterWarmStartWeights = manager.getWeights('path');
        expect(afterWarmStartWeights).not.toEqual(initialWeights);
      });
    });

    describe('Multi-domain isolation', () => {
      it('should isolate domains during updates', async () => {
        await manager.storage.connect();
        await manager.storage.initialize();
        
        const initialPathWeights = manager.getWeights('path');
        const initialResourceWeights = manager.getWeights('resource');
        const initialBehaviorWeights = manager.getWeights('behavior');
        
        const pathExperience = {
          bot_id: testBotId,
          type: 'path',
          context: { bot_position: { x: 0, y: 64, z: 0 }, bot_health: 20, bot_food: 20, inventory_summary: {}, current_goal: null, time_of_day: 0, nearby_threats: 0, active_weights: {} },
          action: 'move',
          outcome: { success: true, duration_ms: 1000, resource_cost: 0, health_change: 0, error_message: null },
          timestamp: new Date().toISOString()
        };
        
        await manager.recordExperience(pathExperience);
        
        const updatedPathWeights = manager.getWeights('path');
        const updatedResourceWeights = manager.getWeights('resource');
        const updatedBehaviorWeights = manager.getWeights('behavior');
        
        expect(updatedPathWeights).not.toEqual(initialPathWeights);
        expect(updatedResourceWeights).toEqual(initialResourceWeights);
        expect(updatedBehaviorWeights).toEqual(initialBehaviorWeights);
        
        const resourceExperience = {
          bot_id: testBotId,
          type: 'resource',
          context: { bot_position: { x: 0, y: 64, z: 0 }, bot_health: 20, bot_food: 20, inventory_summary: {}, current_goal: null, time_of_day: 0, nearby_threats: 0, active_weights: {} },
          action: 'gather',
          outcome: { success: true, resource_gained: 10, resource_cost: 1, duration_ms: 1000, health_change: 0, error_message: null },
          timestamp: new Date().toISOString()
        };
        
        await manager.recordExperience(resourceExperience);
        
        const updatedPathWeights2 = manager.getWeights('path');
        const updatedResourceWeights2 = manager.getWeights('resource');
        const updatedBehaviorWeights2 = manager.getWeights('behavior');
        
        expect(updatedPathWeights2).toEqual(updatedPathWeights);
        expect(updatedResourceWeights2).not.toEqual(initialResourceWeights);
        expect(updatedBehaviorWeights2).toEqual(updatedBehaviorWeights);
      });
    });

    describe('Snapshot lifecycle', () => {
      it('should handle snapshot lifecycle correctly', async () => {
        await manager.storage.connect();
        await manager.storage.initialize();
        
        const saveResult = await manager.storage.saveSnapshot(testBotId, 'test', {
          weights: { key: 'value' },
          score: 100,
          iteration: 5
        });
        
        expect(saveResult.success).toBe(true);
        expect(saveResult.id).toBeDefined();
        
        const snapshots = await manager.storage.getSnapshots(testBotId, 10);
        expect(snapshots.length).toBe(1);
        expect(snapshots[0].data.score).toBe(100);
        expect(snapshots[0].data.iteration).toBe(5);
        
        const loaded = await manager.storage.loadSnapshot(saveResult.id);
        expect(loaded).toBeDefined();
        expect(loaded.data).toEqual(snapshots[0].data);
      });
    });

    describe('Batch experience flow', () => {
      it('should process batch experiences efficiently', async () => {
        await manager.storage.connect();
        await manager.storage.initialize();
        
        const experiences = [];
        for (let i = 0; i < 10; i++) {
          experiences.push({
            bot_id: testBotId,
            type: 'path',
            context: { bot_position: { x: i, y: 64, z: i }, bot_health: 20, bot_food: 20, inventory_summary: {}, current_goal: null, time_of_day: 0, nearby_threats: 0, active_weights: {} },
            action: 'move',
            outcome: {
              success: true,
              duration_ms: 1000 + i * 100,
              resource_cost: 0,
              health_change: 0,
              error_message: null
            },
            timestamp: new Date().toISOString()
          });
        }
        
        await manager.experienceLogger.buffer.push(...experiences);
        await manager.experienceLogger.flush();
        
        const storageResult = await manager.storage.saveExperienceBatch(experiences);
        expect(storageResult.success).toBe(true);
        expect(storageResult.count).toBe(10);
        
        const queryResult = await manager.storage.queryExperience(testBotId, 'path', 15);
        expect(queryResult.length).toBe(10);
        
        for (let i = 0; i < 10; i++) {
          expect(queryResult[i].bot_id).toBe(testBotId);
          expect(queryResult[i].type).toBe('path');
          expect(queryResult[i].success).toBe(true);
        }
        
        const stats = await manager.getEvolutionStats();
        expect(stats.totalExperiences).toBeGreaterThanOrEqual(10);
      });
    });
  });
});
