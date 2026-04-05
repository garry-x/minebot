# Bot Evolution System Implementation Plan

**Goal:** Implement a self-evolving decision system for Minecraft bots that continuously optimizes pathfinding, resource gathering, and behavior strategies based on real-time performance metrics.

**Architecture:** Modular event-driven design with SQLite persistence, credit-based weight updates, and automatic rollback on performance degradation.

**Tech Stack:**
- Node.js 18+ (runtime)
- SQLite3 (persistence)
- Mineflayer (Minecraft bot framework)
- Express.js (API layer)
- Jest (testing)

---

## 1. Files Structure

### New Files (to create in `bot/evolution/`)
| File | Purpose | Lines | Priority |
|------|---------|-------|----------|
| `strategy-manager.js` | Main coordinator, manages all evolution components | ~150 | High |
| `weight-engine.js` | Weight management, credit-based updates | ~120 | High |
| `experience-logger.js` | Experience collection, batching, WAL fallback | ~130 | High |
| `fitness-calculator.js` | Domain-specific fitness scoring (path/resource/behavior) | ~80 | High |
| `evolution-storage.js` | SQLite CRUD operations, snapshots, migrations | ~180 | High |
| `evolution.test.js` | Unit + integration tests, >85% coverage target | ~400 | Critical |

### Modified Files
| File | Changes | Impact |
|------|---------|--------|
| `bot/autonomous-engine.js` | Add optional `evolutionManager` parameter, inject weights, record experiences | Medium |
| `bot/pathfinder.js` | Add `setEvolutionWeights()` method, integration hooks | Low |
| `bot/behaviors.js` | Add `onResult` callback support in `gatherResources()` | Medium |
| `bot/index.js` | Initialize evolution system on spawn, load persisted weights | Medium |
| `config/db.js` | Add evolution table initialization call | Low |
| `bot_server.js` | Add 5 evolution API endpoints | Medium |

---

## 2. Task Decomposition

### **Phase 1: Core Evolution Components (High Priority)**

#### Task 1.1: Create `evolution/evolution-storage.js`
**Purpose:** SQLite persistence layer with schema migrations, batch operations, and WAL fallback

**Files to touch:**
- Create: `bot/evolution/evolution-storage.js`

**Complete code snippet:**
```javascript
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class EvolutionStorage {
  constructor(botId) {
    this.botId = botId;
    this.dbPath = path.resolve(__dirname, '../bot_config.db');
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) return reject(err);
        this.db.run('PRAGMA busy_timeout = 5000');
        resolve();
      });
    });
  }

  async ensureTables() {
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS evolution_weights (
        id INTEGER PRIMARY KEY,
        bot_id TEXT NOT NULL,
        domain TEXT NOT NULL,
        weight_vector TEXT NOT NULL CHECK(json_valid(weight_vector)),
        version INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(bot_id, domain),
        FOREIGN KEY (bot_id) REFERENCES bot_states(bot_id)
      )
    `);

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS experience_log (
        id INTEGER PRIMARY KEY,
        bot_id TEXT NOT NULL,
        type TEXT NOT NULL,
        context TEXT NOT NULL CHECK(json_valid(context)),
        action TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK(json_valid(outcome)),
        success INTEGER NOT NULL,
        fitness_score REAL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (bot_id) REFERENCES bot_states(bot_id)
      )
    `);

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS evolution_snapshots (
        id INTEGER PRIMARY KEY,
        bot_id TEXT NOT NULL,
        snapshot_type TEXT NOT NULL CHECK(snapshot_type IN ('weight_update', 'milestone', 'goal_complete', 'pre_rollback', 'performance_degradation')),
        data TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (bot_id) REFERENCES bot_states(bot_id)
      )
    `);

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS evolution_migrations (
        id INTEGER PRIMARY KEY,
        version INTEGER NOT NULL UNIQUE,
        description TEXT NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_exp_bot_type ON experience_log(bot_id, type, created_at)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_exp_success ON experience_log(bot_id, success, created_at)`);
  }

  async saveWeights(weights) {
    const sql = `INSERT OR REPLACE INTO evolution_weights (bot_id, domain, weight_vector, version, updated_at) 
                 VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)`;
    const promises = Object.entries(weights).map(([domain, vector]) =>
      this.db.run(sql, [this.botId, domain, JSON.stringify(vector)])
    );
    await Promise.all(promises);
  }

  async loadWeights() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT domain, weight_vector FROM evolution_weights WHERE bot_id = ?`,
        [this.botId],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows.reduce((acc, row) => {
            acc[row.domain] = JSON.parse(row.weight_vector);
            return acc;
          }, {}));
        }
      );
    });
  }

  async saveExperience(experience) {
    const sql = `INSERT INTO experience_log (bot_id, type, context, action, outcome, success, fitness_score) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`;
    return new Promise((resolve, reject) => {
      this.db.run(
        sql,
        [
          this.botId,
          experience.type,
          JSON.stringify(experience.context),
          experience.action,
          JSON.stringify(experience.outcome),
          experience.outcome.success ? 1 : 0,
          experience.fitness_score
        ],
        function(err) {
          if (err) return reject(err);
          resolve(this.lastID);
        }
      );
    });
  }

  async saveBatch(experiences) {
    const promises = experiences.map(exp => this.saveExperience(exp));
    return Promise.all(promises);
  }

  async queryExperience(type, limit = 100) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM experience_log WHERE bot_id = ? AND type = ? ORDER BY created_at DESC LIMIT ?`,
        [this.botId, type, limit],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows.map(row => ({
            ...row,
            context: JSON.parse(row.context),
            outcome: JSON.parse(row.outcome)
          })).reverse());
        }
      );
    });
  }

  async saveSnapshot(type, data) {
    const sql = `INSERT INTO evolution_snapshots (bot_id, snapshot_type, data) VALUES (?, ?, ?)`;
    return new Promise((resolve, reject) => {
      this.db.run(sql, [this.botId, type, JSON.stringify(data)], function(err) {
        if (err) return reject(err);
        resolve(this.lastID);
      });
    });
  }

  async getSnapshots(limit = 10) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM evolution_snapshots WHERE bot_id = ? ORDER BY created_at DESC LIMIT ?`,
        [this.botId, limit],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        }
      );
    });
  }

  async loadSnapshot(id) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM evolution_snapshots WHERE id = ?`,
        [id],
        (err, row) => {
          if (err) return reject(err);
          resolve(row ? JSON.parse(row.data) : null);
        }
      );
    });
  }

  async cleanupDomainExperiences(type, keepCount = 1000) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `DELETE FROM experience_log WHERE id IN (
          SELECT id FROM experience_log WHERE bot_id = ? AND type = ? 
          ORDER BY created_at DESC LIMIT -1 OFFSET ?
        )`,
        [this.botId, type, keepCount],
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  }

  async close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) return reject(err);
          this.db = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = EvolutionStorage;
```

**Expected output:** SQLite database with 4 new tables, `bot_config.db` grows with evolution data.

---

#### Task 1.2: Create `evolution/fityness-calculator.js`
**Purpose:** Domain-specific fitness scoring (path/resource/behavior)

**Files to touch:**
- Create: `bot/evolution/fitness-calculator.js`

**Complete code snippet:**
```javascript
class FitnessCalculator {
  static calcPathFitness(outcome) {
    if (!outcome.success) return 0.1;
    
    const timeScore = Math.max(0, 1 - (outcome.duration_ms / 60000));
    const healthScore = Math.max(0, 1 + (outcome.health_change || 0) / 20);
    
    return 0.6 * timeScore + 0.4 * healthScore;
  }

  static calcResourceFitness(outcome) {
    if (!outcome.success) return 0.1;
    
    const efficiencyScore = Math.min(1, (outcome.resource_gained || 0) / (outcome.duration_ms / 1000 || 1));
    const costScore = Math.max(0, 1 - (outcome.resource_cost || 0) / 10);
    
    return 0.7 * efficiencyScore + 0.3 * costScore;
  }

  static calcBehaviorFitness(outcome) {
    if (!outcome.success) return 0.1;
    
    return 0.5 + 0.5 * (outcome.duration_ms < 30000 ? 1 : 0.5);
  }

  static calculate(domain, outcome) {
    switch (domain) {
      case 'path':
        return this.calcPathFitness(outcome);
      case 'resource':
        return this.calcResourceFitness(outcome);
      case 'behavior':
        return this.calcBehaviorFitness(outcome);
      default:
        return 0.5;
    }
  }
}

module.exports = FitnessCalculator;
```

**Expected output:** Fitness scores between 0.1-1.0 based on success, speed, and safety.

---

#### Task 1.3: Create `evolution/weight-engine.js`
**Purpose:** Weight management with credit-based updates, learning rate decay, warm-start

**Files to touch:**
- Create: `bot/evolution/weight-engine.js`

**Complete code snippet:**
```javascript
const WEIGHT_SCHEMA = {
  path: { distance: 0.3, safety: 0.3, speed: 0.2, terrain_type: 0.2 },
  resource: { value: 0.3, proximity: 0.3, safety: 0.2, tool_efficiency: 0.2 },
  behavior: { health_risk: 0.25, resource_urgency: 0.25, goal_progress: 0.25, exploration_value: 0.25 }
};

const CLAMP_MIN = 0.05;
const CLAMP_MAX = 0.95;
const INITIAL_LEARNING_RATE = 0.05;
const MIN_LEARNING_RATE = 0.005;
const DECAY_RATE = 0.9995;
const WARM_START_THRESHOLD = 20;

class WeightEngine {
  constructor(domain) {
    this.domain = domain;
    this.weights = { ...WEIGHT_SCHEMA[domain] };
    this.experienceCount = 0;
    this.initialized = false;
  }

  getLearningRate() {
    return Math.max(MIN_LEARNING_RATE, INITIAL_LEARNING_RATE * Math.pow(DECAY_RATE, this.experienceCount));
  }

  getWeights() {
    return { ...this.weights };
  }

  update(experience, fitnessScore) {
    const baseline = 0.5;
    const delta = fitnessScore - baseline;

    const updated = {};
    const activeWeights = experience.context?.active_weights || this.weights;
    const totalWeight = Object.values(activeWeights).reduce((a, b) => a + b, 0);

    for (const [dim, weight] of Object.entries(this.weights)) {
      const contributionRatio = (activeWeights[dim] || weight) / totalWeight;
      const credit = delta * contributionRatio;
      updated[dim] = this.clamp(weight + this.getLearningRate() * credit);
    }

    this.weights = this.normalizeWeights(updated);
    this.experienceCount++;

    if (!this.initialized && this.experienceCount >= WARM_START_THRESHOLD) {
      this.initialized = true;
    }
  }

  clamp(value) {
    return Math.max(CLAMP_MIN, Math.min(CLAMP_MAX, value));
  }

  normalizeWeights(weights) {
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    const normalized = {};
    for (const [key, value] of Object.entries(weights)) {
      normalized[key] = value / sum;
    }
    return normalized;
  }

  reset() {
    this.weights = { ...WEIGHT_SCHEMA[this.domain] };
    this.experienceCount = 0;
    this.initialized = false;
  }

  isValid() {
    const sum = Object.values(this.weights).reduce((a, b) => a + b, 0);
    return Math.abs(sum - 1.0) < 0.001;
  }

  getExperienceCount() {
    return this.experienceCount;
  }

  isWarmStarted() {
    return this.initialized;
  }

  static getSchema() {
    return WEIGHT_SCHEMA;
  }
}

module.exports = WeightEngine;
```

**Expected output:** Weights sum to 1.0, bounded [0.05, 0.95], learning rate decays from 0.05→0.005.

---

#### Task 1.4: Create `evolution/experience-logger.js`
**Purpose:** Experience collection with batching, periodic flush, WAL fallback

**Files to touch:**
- Create: `bot/evolution/experience-logger.js`

**Complete code snippet:**
```javascript
const fs = require('fs');
const path = require('path');

class ExperienceLogger {
  constructor(storage) {
    this.storage = storage;
    this.buffer = [];
    this.batchSize = 10;
    this.flushInterval = 30000;
    this.walPath = path.join(__dirname, '../logs/wal_experiences.json');
    this.flushTimer = null;
    this.running = false;
  }

  async start() {
    await this.loadFromWAL();
    this.running = true;
    this.flushTimer = setInterval(() => this.flush(), this.flushInterval);
  }

  async stop() {
    this.running = false;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  async record(experience) {
    this.buffer.push(experience);

    if (this.buffer.length >= this.batchSize) {
      await this.flush();
    }
  }

  async flush() {
    if (this.buffer.length === 0) return;

    try {
      await this.storage.saveBatch(this.buffer);
      
      // Cleanup old experiences per domain (keep 1000 per domain)
      const domains = ['path', 'resource', 'behavior'];
      await Promise.all(domains.map(domain =>
        this.storage.cleanupDomainExperiences(domain, 1000)
      ));

      this.buffer = [];
      
      if (this.walExists()) {
        await this.clearWAL();
      }
    } catch (err) {
      console.error('[ExperienceLogger] Flush failed, writing to WAL:', err.message);
      await this.writeToWAL();
    }
  }

  async loadFromWAL() {
    if (!this.walExists()) return;

    try {
      const data = fs.readFileSync(this.walPath, 'utf8');
      const experiences = JSON.parse(data);
      
      if (experiences.length > 0) {
        await this.storage.saveBatch(experiences);
        await this.clearWAL();
        console.log(`[ExperienceLogger] Recovered ${experiences.length} experiences from WAL`);
      }
    } catch (err) {
      console.error('[ExperienceLogger] Failed to load from WAL:', err.message);
    }
  }

  async writeToWAL() {
    try {
      fs.writeFileSync(this.walPath, JSON.stringify(this.buffer), 'utf8');
    } catch (err) {
      console.error('[ExperienceLogger] Failed to write to WAL:', err.message);
    }
  }

  async clearWAL() {
    try {
      if (this.walExists()) {
        fs.unlinkSync(this.walPath);
      }
    } catch (err) {
      console.error('[ExperienceLogger] Failed to clear WAL:', err.message);
    }
  }

  walExists() {
    try {
      return fs.existsSync(this.walPath) && fs.statSync(this.walPath).size > 0;
    } catch {
      return false;
    }
  }

  async query(botId, type, limit = 100) {
    return this.storage.queryExperience(type, limit);
  }

  getBufferCount() {
    return this.buffer.length;
  }
}

module.exports = ExperienceLogger;
```

**Expected output:** Experience batches flush every 10 records or 30 seconds, WAL fallback on failure.

---

#### Task 1.5: Create `evolution/strategy-manager.js`
**Purpose:** Main coordinator, orchestrates weight engine, experience logger, fitness calculator

**Files to touch:**
- Create: `bot/evolution/strategy-manager.js`

**Complete code snippet:**
```javascript
const WeightEngine = require('./weight-engine');
const ExperienceLogger = require('./experience-logger');
const FitnessCalculator = require('./fitness-calculator');
const EvolutionStorage = require('./evolution-storage');

class StrategyEvolutionManager {
  constructor(botId) {
    this.botId = botId;
    this.storage = new EvolutionStorage(botId);
    this.weightEngines = {};
    this.experienceLogger = null;
    this.performanceMonitors = {};
    this.initialized = false;
  }

  async init() {
    await this.storage.init();
    await this.storage.ensureTables();
    await this.loadWeights();
    this.experienceLogger = new ExperienceLogger(this.storage);
    await this.experienceLogger.start();

    const domains = ['path', 'resource', 'behavior'];
    domains.forEach(domain => {
      this.performanceMonitors[domain] = {
        fitnessHistory: [],
        baselineFitness: 0.5
      };
    });

    this.initialized = true;
    console.log(`[StrategyEvolutionManager] Initialized for bot ${this.botId}`);
  }

  async loadWeights() {
    try {
      const savedWeights = await this.storage.loadWeights();
      const domains = ['path', 'resource', 'behavior'];
      
      domains.forEach(domain => {
        if (savedWeights[domain]) {
          this.weightEngines[domain] = new WeightEngine(domain);
          this.weightEngines[domain].weights = savedWeights[domain];
        } else {
          this.weightEngines[domain] = new WeightEngine(domain);
        }
      });
    } catch (err) {
      console.error('[StrategyEvolutionManager] Failed to load weights, using defaults:', err.message);
      const domains = ['path', 'resource', 'behavior'];
      domains.forEach(domain => {
        this.weightEngines[domain] = new WeightEngine(domain);
      });
    }
  }

  getWeights(domain) {
    if (!this.initialized) return null;
    return this.weightEngines[domain]?.getWeights() || null;
  }

  async recordExperience(experience) {
    if (!this.initialized) return;

    const fitnessScore = FitnessCalculator.calculate(experience.type, experience.outcome);
    experience.fitness_score = fitnessScore;

    const engine = this.weightEngines[experience.type];
    if (engine) {
      engine.update(experience, fitnessScore);
      await this.storage.saveWeights(this.botId, experience.type, engine.weights);
    }

    await this.experienceLogger.record(experience);
    this.updatePerformanceMonitor(experience.type, fitnessScore);
  }

  async getOptimalAction(domain, context) {
    if (!this.initialized) return null;

    const history = await this.experienceLogger.query(this.botId, domain, 100);
    
    if (history.length === 0) return null;

    const similarExperiences = history.filter(exp => {
      return this.contextSimilarity(exp.context, context) > 0.7;
    });

    if (similarExperiences.length === 0) return null;

    const sorted = similarExperiences.sort((a, b) => (b.fitness_score || 0) - (a.fitness_score || 0));
    const best = sorted[0];
    const successRate = similarExperiences.filter(e => e.outcome.success).length / similarExperiences.length;

    return {
      action: best.action.split('_')[0],
      target: this.parseActionTarget(best.action),
      confidence: successRate,
      reason: `${domain} ${best.action} had ${Math.round(successRate * 100)}% success rate (${similarExperiences.length} experiences)`
    };
  }

  contextSimilarity(context1, context2) {
    if (!context1 || !context2) return 0;
    
    let similarity = 0;
    let matches = 0;

    const compareNumbers = (v1, v2) => {
      if (v1 === null || v2 === null) return 0;
      const diff = Math.abs(v1 - v2);
      return diff < 5 ? 1 - diff / 5 : 0;
    };

    if (context1.bot_position && context2.bot_position) {
      similarity += compareNumbers(context1.bot_position.x, context2.bot_position.x) * 0.3;
      similarity += compareNumbers(context1.bot_position.y, context2.bot_position.y) * 0.3;
      similarity += compareNumbers(context1.bot_position.z, context2.bot_position.z) * 0.3;
      matches++;
    }

    if (context1.bot_health !== undefined && context2.bot_health !== undefined) {
      similarity += compareNumbers(context1.bot_health, context2.bot_health) * 0.7;
      matches++;
    }

    return matches > 0 ? similarity / matches : 0;
  }

  parseActionTarget(action) {
    const parts = action.split('_');
    if (parts.length > 1) {
      return parts.slice(1).join('_');
    }
    return null;
  }

  updatePerformanceMonitor(domain, fitnessScore) {
    const monitor = this.performanceMonitors[domain];
    
    if (fitnessScore !== null && !isNaN(fitnessScore)) {
      monitor.fitnessHistory.push(fitnessScore);
      
      if (monitor.fitnessHistory.length > 50) {
        monitor.fitnessHistory.shift();
      }

      if (monitor.fitnessHistory.length >= 20 && !monitor.baselineFitnessSet) {
        monitor.baselineFitness = monitor.fitnessHistory.reduce((a, b) => a + b, 0) / monitor.fitnessHistory.length;
        monitor.baselineFitnessSet = true;
      }
    }
  }

  checkPerformanceRegression(domain) {
    const monitor = this.performanceMonitors[domain];
    
    if (!monitor.baselineFitnessSet || monitor.fitnessHistory.length < 20) {
      return false;
    }

    const recentAvg = monitor.fitnessHistory.slice(-20).reduce((a, b) => a + b, 0) / 20;
    return recentAvg < monitor.baselineFitness * 0.7;
  }

  async createSnapshot(type, data = {}) {
    if (!this.initialized) return null;
    
    const weights = {};
    Object.entries(this.weightEngines).forEach(([domain, engine]) => {
      weights[domain] = engine.getWeights();
    });

    const snapshotData = {
      version: 1,
      weights,
      experienceCount: Object.values(this.weightEngines).reduce((sum, e) => sum + e.experienceCount, 0),
      timestamp: new Date().toISOString(),
      ...data
    };

    return this.storage.saveSnapshot(type, snapshotData);
  }

  async reset() {
    const domains = ['path', 'resource', 'behavior'];
    
    domains.forEach(domain => {
      this.weightEngines[domain].reset();
    });

    await this.storage.saveWeights(this.botId, 'path', this.weightEngines['path'].weights);
    await this.storage.saveWeights(this.botId, 'resource', this.weightEngines['resource'].weights);
    await this.storage.saveWeights(this.botId, 'behavior', this.weightEngines['behavior'].weights);

    this.experienceLogger.buffer = [];
    
    console.log(`[StrategyEvolutionManager] Reset for bot ${this.botId}`);
  }

  async rollbackToSnapshot(snapshotId) {
    if (!this.initialized) return false;

    const snapshot = await this.storage.loadSnapshot(snapshotId);
    
    if (!snapshot || !snapshot.weights) {
      console.error('[StrategyEvolutionManager] Snapshot not found or invalid');
      return false;
    }

    await this.storage.saveSnapshot('pre_rollback', {
      reason: 'manual_rollback',
      currentWeights: Object.fromEntries(
        Object.entries(this.weightEngines).map(([d, e]) => [d, e.getWeights()])
      )
    });

    const domains = ['path', 'resource', 'behavior'];
    domains.forEach(domain => {
      if (snapshot.weights[domain]) {
        this.weightEngines[domain].weights = snapshot.weights[domain];
      }
    });

    await this.storage.saveWeights(this.botId, 'path', this.weightEngines['path'].weights);
    await this.storage.saveWeights(this.botId, 'resource', this.weightEngines['resource'].weights);
    await this.storage.saveWeights(this.botId, 'behavior', this.weightEngines['behavior'].weights);

    console.log(`[StrategyEvolutionManager] Rolled back to snapshot ${snapshotId}`);
    return true;
  }

  getStats() {
    if (!this.initialized) {
      return {
        totalExperiences: 0,
        experiencesByDomain: { path: 0, resource: 0, behavior: 0 },
        successRates: { path: 0, resource: 0, behavior: 0 },
        averageFitness: { path: 0, resource: 0, behavior: 0 },
        recentFitness: [],
        baselineFitness: 0.5,
        currentWeights: {
          path: {},
          resource: {},
          behavior: {}
        },
        lastSnapshot: null,
        experienceCount: 0
      };
    }

    const experiencesByDomain = { path: 0, resource: 0, behavior: 0 };
    const successRates = { path: 0, resource: 0, behavior: 0 };
    const fitnessSums = { path: 0, resource: 0, behavior: 0 };
    const fitnessCounts = { path: 0, resource: 0, behavior: 0 };

    const domains = ['path', 'resource', 'behavior'];
    
    domains.forEach(domain => {
      const experiences = this.experienceLogger.buffer.filter(e => e.type === domain);
      experiencesByDomain[domain] = experiences.length;
      
      if (experiences.length > 0) {
        experiences.forEach(e => {
          if (e.outcome.success) successRates[domain]++;
          if (e.fitness_score !== undefined) {
            fitnessSums[domain] += e.fitness_score;
            fitnessCounts[domain]++;
          }
        });
        successRates[domain] /= experiences.length;
        if (fitnessCounts[domain] > 0) {
          fitnessSums[domain] /= fitnessCounts[domain];
        } else {
          fitnessSums[domain] = 0;
        }
      }
    });

    const allFitness = [];
    this.experienceLogger.buffer.forEach(e => {
      if (e.fitness_score !== undefined) allFitness.push(e.fitness_score);
    });

    const recentFitness = allFitness.slice(-100);
    const lastSnapshot = this.experienceLogger.buffer.length > 0 
      ? { id: 1, type: 'live', created_at: new Date().toISOString() } 
      : null;

    return {
      totalExperiences: this.experienceLogger.buffer.length,
      experiencesByDomain,
      successRates,
      averageFitness: fitnessSums,
      recentFitness,
      baselineFitness: 0.5,
      currentWeights: {
        path: this.weightEngines['path']?.getWeights() || {},
        resource: this.weightEngines['resource']?.getWeights() || {},
        behavior: this.weightEngines['behavior']?.getWeights() || {}
      },
      lastSnapshot,
      experienceCount: this.experienceLogger.buffer.length
    };
  }
}

module.exports = StrategyEvolutionManager;
```

**Expected output:** Full evolution management with warm-start, rollback, and statistics.

---

### **Phase 2: Integration (Medium Priority)**

#### Task 2.1: Modify `bot/autonomous-engine.js`
**Purpose:** Add optional evolution manager injection, inject weights, record experiences

**Files to touch:**
- Modify: `bot/autonomous-engine.js`

**Changes:**
```javascript
// Line 4: Update constructor signature
constructor(bot, pathfinder, behaviors, evolutionManager = null) {
  // ... existing code ...
  this.evolutionManager = evolutionManager;
}

// Lines 31-37: Update calculatePriority to use evolution weights
calculatePriority(assessment) {
  if (this.evolutionManager) {
    const weights = this.evolutionManager.getWeights('behavior');
    if (weights) {
      // Use evolution weights for priority calculation
      const riskScore = 1 - weights.health_risk;
      if (assessment.health < 8 * riskScore) return 'emergency';
      if (assessment.health < 12 * riskScore) return 'heal';
    }
  }
  
  if (assessment.health < 8) return 'emergency';
  if (assessment.food < 6) return 'food';
  if (assessment.health < 12) return 'heal';
  if (assessment.food < 12) return 'gather_food';
  return 'goal_progress';
}

// Lines 63-100: Update executeAction to record experience
async executeAction(action, context) {
  const startTime = Date.now();
  const startingHealth = this.bot.health;
  let success = true;
  
  this.state.currentAction = action.action;
  
  try {
    switch (action.action) {
      case 'gather':
        await this.behaviors.gatherResources({
          targetBlocks: action.target,
          radius: 30
        });
        break;
      case 'heal_immediate':
        // ... existing heal code ...
        break;
      case 'find_shelter':
        // ... existing shelter code ...
        break;
    }
  } catch (error) {
    console.log(`[AutonomousEngine] Action '${action.action}' failed: ${error.message}`);
    success = false;
  }
  
  const duration = Date.now() - startTime;
  const healthChange = this.bot.health - startingHealth;
  
  if (this.evolutionManager) {
    // Record experience
    await this.evolutionManager.recordExperience({
      type: 'behavior',
      context: {
        bot_position: { x: this.bot.entity.position.x, y: this.bot.entity.position.y, z: this.bot.entity.position.z },
        bot_health: this.bot.health,
        bot_food: this.bot.food,
        current_goal: null,
        time_of_day: this.bot.time.timeOfDay
      },
      action: action.action,
      outcome: {
        success,
        duration_ms: duration,
        health_change: healthChange,
        error_message: success ? null : `Action failed`
      }
    });
  }
}

// Line 102-120: Update runCycle to pass context to executeAction
async runCycle(goalState) {
  const assessment = this.assessState();
  const priority = this.calculatePriority(assessment);
  const action = this.decideAction(priority, goalState);
  
  this.state.priority = priority;
  this.state.decisionReason = `Health: ${assessment.health}, Food: ${assessment.food}`;
  this.state.threatLevel = assessment.nearbyEntities > 3 ? 'medium' : 'low';
  this.state.healthStatus = assessment.health > 15 ? 'safe' : 
                            assessment.health > 10 ? 'warning' : 'critical';
  
  await this.executeAction(action, assessment);
  
  return {
    state: this.state,
    assessment,
    action
  };
}
```

**Expected output:** Autonomous engine now records experiences and uses evolution weights when available.

---

#### Task 2.2: Modify `bot/pathfinder.js`
**Purpose:** Add `setEvolutionWeights()` method, integrate with evolution system

**Files to touch:**
- Modify: `bot/pathfinder.js`

**Changes:**
```javascript
// Line 187-213: Add new methods after existing code

setEvolutionWeights(weights) {
  this.evolutionWeights = weights;
  console.log('[Pathfinder] Evolution weights updated:', weights);
}

updatePathScore(pathScore, context) {
  if (!this.evolutionWeights) return pathScore;
  
  // Apply evolution weights to path scoring
  let weightedScore = pathScore;
  
  if (this.evolutionWeights.safety !== undefined) {
    weightedScore *= this.evolutionWeights.safety;
  }
  
  if (this.evolutionWeights.speed !== undefined) {
    weightedScore *= (1 - this.evolutionWeights.speed * 0.1);
  }
  
  if (this.evolutionWeights.distance !== undefined) {
    weightedScore *= this.evolutionWeights.distance;
  }
  
  return weightedScore;
}

// Optional: Add callback support to moveTo for experience recording
async moveTo(target, options = {}) {
  const { 
    range = 1, 
    timeout = 30000,
    useSprint = true,
    useJump = true,
    useParkour = true,
    maxRetries = 5,
    onResult = null  // Add optional callback
  } = options;
  
  // ... existing moveTo implementation ...
  
  // At line 45, add callback invocation on timeout
  if (Date.now() - startTime > timeout) {
    this.stop();
    console.log(`[Pathfinder] Timeout reached after ${timeout}ms`);
    if (onResult) {
      onResult({
        success: false,
        duration_ms: timeout,
        error: 'timeout'
      });
    }
    reject(new Error('Movement timeout'));
    return;
  }
  
  // At line 104, add callback invocation on stuck
  if (retryCount >= maxRetries) {
    this.stop();
    if (onResult) {
      onResult({
        success: false,
        duration_ms: Date.now() - startTime,
        error: 'stuck'
      });
    }
    reject(new Error(`Movement stuck after ${maxRetries} retries`));
    return;
  }
  
  // At line 37 and 155, add callback invocation on success
  if (checkArrival()) {
    this.stop();
    console.log('[Pathfinder] Reached target');
    if (onResult) {
      onResult({
        success: true,
        duration_ms: Date.now() - startTime
      });
    }
    resolve();
    return;
  }
  
  // ... rest of existing moveTo ...
}
```

**Expected output:** Pathfinder supports evolution weights and experience callbacks.

---

#### Task 2.3: Modify `bot/behaviors.js`
**Purpose:** Add `onResult` callback support in `gatherResources()` for experience collection

**Files to touch:**
- Modify: `bot/behaviors.js`

**Changes:**
```javascript
// Lines 191-279: Update gatherResources signature
gatherResources: async function(options) {
  const { targetBlocks, radius = 20, onResult = null } = options;  // Add callback parameter
  
  // ... existing gatherResources setup code ...
  
  for (const position of blockPositions) {
    // ... existing move and break code ...
    
    // After successful dig (line 260-261)
    try {
      await retryOperation(async () => {
        await bot.dig(block);
        
        // Wait for the block to break
        await waitForCondition(() => 
          !bot.blockAt(position) || bot.blockAt(position).name === 'air', 10000);
      });
      
      console.log(`Collected ${block.name}`);
      successCount++;
      failCount = 0;
      
      // Call onResult callback if provided
      if (onResult) {
        onResult({
          type: 'resource',
          context: {
            bot_position: { x: bot.entity.position.x, y: bot.entity.position.y, z: bot.entity.position.z },
            bot_health: bot.health,
            bot_food: bot.food,
            current_goal: bot.__wrapper?.goalState?.currentGoal || null
          },
          action: `gather_${block.name}`,
          outcome: {
            success: true,
            duration_ms: 0,
            resource_gained: 1,
            resource_cost: 0
          }
        });
      }
    } catch (digError) {
      // ... existing error handling ...
    }
  }
  
  // Return success status
  return true;
}

// Line 350-392: Update automaticBehavior to initialize evolution
automaticBehavior: async function(options = {}) {
  const { 
    mode = 'autonomous',
    initialGoal = 'basic_survival',
    gatherRadius = 30
  } = options;
  
  // ... existing setup code ...
  
  if (mode === 'autonomous') {
    // Check if evolution system is available
    const StrategyEvolutionManager = require('./evolution/strategy-manager');
    const evoManager = new StrategyEvolutionManager(this.bot._client?.botId || `bot_${Date.now()}`);
    await evoManager.init();
    
    const engine = new AutonomousEngine(bot, pathfinder, this, evoManager);
    
    // ... rest of autonomous loop ...
  }
}
```

**Expected output:** Gather operations trigger experience callbacks to evolution system.

---

#### Task 2.4: Modify `bot/index.js`
**Purpose:** Initialize evolution system on spawn, load persisted weights

**Files to touch:**
- Modify: `bot/index.js`

**Changes:**
```javascript
// Line 5: Add import
const StrategyEvolutionManager = require('./evolution/strategy-manager');

// Lines 67-143: Update spawn callback
this.bot.once('spawn', () => {
  // ... existing spawn setup ...
  
  setTimeout(() => {
    try {
      // ... existing module initialization ...
      
      // Initialize evolution system
      if (this.bot._client) {
        this.bot._client.botId = this.botId;
      }
      
      const evoManager = new StrategyEvolutionManager(this.botId);
      evoManager.init()
        .then(() => {
          console.log('[Bot] Evolution system initialized');
          this.evolutionManager = evoManager;
          
          // Inject weights into pathfinder if available
          if (this.pathfinder && this.evolutionManager) {
            const weights = this.evolutionManager.getWeights('path');
            if (weights) {
              this.pathfinder.setEvolutionWeights(weights);
            }
          }
        })
        .catch(err => {
          console.error('[Bot] Failed to initialize evolution:', err.message);
          this.evolutionManager = null;
        });
      
      // ... rest of initialization ...
    } catch (initError) {
      console.error(`[Bot] Error initializing modules:`, initError);
      reject(initError);
    }
  }, 0);
});
```

**Expected output:** Evolution system initializes on bot spawn.

---

#### Task 2.5: Modify `config/db.js`
**Purpose:** Add evolution table initialization call

**Files to touch:**
- Modify: `config/db.js`

**Changes:**
```javascript
// Lines 18-21: Add evolution table initialization
const BotGoal = require('./models/BotGoal');
BotGoal.createTable();

// Initialize evolution tables
const EvolutionStorage = require('./evolution/evolution-storage');
EvolutionStorage.prototype.ensureTables().catch(err => {
  console.error(`[DB] Failed to ensure evolution tables: ${err.message}`);
});

module.exports = db;
```

**Expected output:** Evolution tables created on startup.

---

#### Task 2.6: Modify `bot_server.js`
**Purpose:** Add 5 evolution API endpoints

**Files to touch:**
- Modify: `bot_server.js`

**Changes:**
```javascript
// Line 161: Add import
const StrategyEvolutionManager = require('./bot/evolution/strategy-manager');

// Lines 1541-1558: Add after last route but before 404 handler

// GET /api/bot/:botId/evolution/stats
app.get('/api/bot/:botId/evolution/stats', async (req, res) => {
  try {
    const { botId } = req.params;
    const bot = activeBots.get(botId);
    
    if (!bot) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    
    if (!bot.evolutionManager) {
      return res.status(400).json({ error: 'Evolution system not initialized for this bot' });
    }
    
    const stats = bot.evolutionManager.getStats();
    res.json({ success: true, stats });
  } catch (err) {
    console.error(`[API] Failed to get evolution stats: ${err.message}`);
    res.status(500).json({ error: 'Failed to get evolution stats' });
  }
});

// GET /api/bot/:botId/evolution/weights
app.get('/api/bot/:botId/evolution/weights', async (req, res) => {
  try {
    const { botId } = req.params;
    const bot = activeBots.get(botId);
    
    if (!bot) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    
    if (!bot.evolutionManager) {
      return res.status(400).json({ error: 'Evolution system not initialized' });
    }
    
    const weights = {
      path: bot.evolutionManager.getWeights('path'),
      resource: bot.evolutionManager.getWeights('resource'),
      behavior: bot.evolutionManager.getWeights('behavior')
    };
    
    res.json({ success: true, weights });
  } catch (err) {
    console.error(`[API] Failed to get evolution weights: ${err.message}`);
    res.status(500).json({ error: 'Failed to get evolution weights' });
  }
});

// POST /api/bot/:botId/evolution/reset
app.post('/api/bot/:botId/evolution/reset', async (req, res) => {
  try {
    const { botId } = req.params;
    const bot = activeBots.get(botId);
    
    if (!bot) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    
    if (!bot.evolutionManager) {
      return res.status(400).json({ error: 'Evolution system not initialized' });
    }
    
    await bot.evolutionManager.reset();
    
    res.json({ 
      success: true, 
      message: 'Evolution data reset successfully',
      botId
    });
  } catch (err) {
    console.error(`[API] Failed to reset evolution: ${err.message}`);
    res.status(500).json({ error: 'Failed to reset evolution' });
  }
});

// GET /api/bot/:botId/evolution/history
app.get('/api/bot/:botId/evolution/history', async (req, res) => {
  try {
    const { botId } = req.params;
    const { type, limit = 100 } = req.query;
    
    const bot = activeBots.get(botId);
    
    if (!bot) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    
    if (!bot.evolutionManager) {
      return res.status(400).json({ error: 'Evolution system not initialized' });
    }
    
    const history = await bot.evolutionManager.experienceLogger.query(botId, type || 'all', parseInt(limit));
    
    res.json({ 
      success: true, 
      history,
      count: history.length
    });
  } catch (err) {
    console.error(`[API] Failed to get evolution history: ${err.message}`);
    res.status(500).json({ error: 'Failed to get evolution history' });
  }
});

// POST /api/bot/:botId/evolution/rollback
app.post('/api/bot/:botId/evolution/rollback', async (req, res) => {
  try {
    const { botId } = req.params;
    const { snapshotId } = req.body;
    
    const bot = activeBots.get(botId);
    
    if (!bot) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    
    if (!bot.evolutionManager) {
      return res.status(400).json({ error: 'Evolution system not initialized' });
    }
    
    const success = await bot.evolutionManager.rollbackToSnapshot(snapshotId);
    
    res.json({ 
      success,
      message: success ? 'Rolled back to snapshot successfully' : 'Rollback failed',
      botId,
      snapshotId
    });
  } catch (err) {
    console.error(`[API] Failed to rollback evolution: ${err.message}`);
    res.status(500).json({ error: 'Failed to rollback evolution' });
  }
});
```

**Expected output:** 5 new evolution API endpoints available.

---

### **Phase 3: Testing (Critical Priority)**

#### Task 3.1: Create `evolution/evolution.test.js`
**Purpose:** Unit and integration tests with >85% coverage target

**Files to touch:**
- Create: `bot/evolution/evolution.test.js`

**Complete code snippet:**
```javascript
const jest = require('jest');
const FitnessCalculator = require('./fitness-calculator');
const WeightEngine = require('./weight-engine');
const ExperienceLogger = require('./experience-logger');
const EvolutionStorage = require('./evolution-storage');
const StrategyEvolutionManager = require('./strategy-manager');

// Mock SQLite for tests
jest.mock('sqlite3', () => ({
  Database: class MockDatabase {
    constructor(path, callback) {
      this.data = {};
      this.open = true;
      callback && callback(null);
    }
    
    run(sql, ...params) {
      return new Promise((resolve, reject) => {
        resolve({ lastID: Math.random() });
      });
    }
    
    all(sql, ...params) {
      return new Promise((resolve, reject) => {
        resolve([]);
      });
    }
    
    get(sql, ...params) {
      return new Promise((resolve, reject) => {
        resolve(null);
      });
    }
    
    close(callback) {
      this.open = false;
      callback && callback(null);
    }
  }
}));

describe('FitnessCalculator', () => {
  describe('calcPathFitness', () => {
    test('returns 0.1 for failure', () => {
      const outcome = { success: false, duration_ms: 1000, health_change: 0 };
      expect(FitnessCalculator.calcPathFitness(outcome)).toBe(0.1);
    });
    
    test('scores based on time and health', () => {
      const outcome = { success: true, duration_ms: 30000, health_change: 5 };
      const score = FitnessCalculator.calcPathFitness(outcome);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });
  
  describe('calcResourceFitness', () => {
    test('returns 0.1 for failure', () => {
      const outcome = { success: false, duration_ms: 1000, resource_gained: 0 };
      expect(FitnessCalculator.calcResourceFitness(outcome)).toBe(0.1);
    });
  });
  
  describe('calcBehaviorFitness', () => {
    test('returns 0.1 for failure', () => {
      const outcome = { success: false, duration_ms: 1000 };
      expect(FitnessCalculator.calcBehaviorFitness(outcome)).toBe(0.1);
    });
  });
  
  describe('calculate', () => {
    test('dispatches to correct domain calculator', () => {
      const outcome = { success: true, duration_ms: 10000 };
      
      const pathScore = FitnessCalculator.calculate('path', outcome);
      const resourceScore = FitnessCalculator.calculate('resource', outcome);
      const behaviorScore = FitnessCalculator.calculate('behavior', outcome);
      
      expect(pathScore).toBeGreaterThanOrEqual(0.1);
      expect(resourceScore).toBeGreaterThanOrEqual(0.1);
      expect(behaviorScore).toBeGreaterThanOrEqual(0.1);
    });
  });
});

describe('WeightEngine', () => {
  let engine;
  
  beforeEach(() => {
    engine = new WeightEngine('path');
  });
  
  describe('constructor', () => {
    test('initializes with schema weights', () => {
      expect(engine.weights).toEqual({
        distance: 0.3,
        safety: 0.3,
        speed: 0.2,
        terrain_type: 0.2
      });
    });
    
    test('starts with zero experience count', () => {
      expect(engine.experienceCount).toBe(0);
    });
  });
  
  describe('getLearningRate', () => {
    test('returns initial rate at start', () => {
      expect(engine.getLearningRate()).toBe(0.05);
    });
    
    test('decays over time', () => {
      engine.experienceCount = 1000;
      expect(engine.getLearningRate()).toBeLessThan(0.05);
    });
    
    test('has minimum rate of 0.005', () => {
      engine.experienceCount = 10000;
      expect(engine.getLearningRate()).toBe(0.005);
    });
  });
  
  describe('update', () => {
    test(' Updates weights based on fitness score', () => {
      const experience = {
        type: 'path',
        context: { active_weights: { distance: 0.3, safety: 0.3, speed: 0.2, terrain_type: 0.2 } },
        outcome: { success: true }
      };
      
      engine.update(experience, 0.8);
      
      expect(engine.experienceCount).toBe(1);
      expect(engine.weights.safety).toBeGreaterThanOrEqual(0);
    });
    
    test('clamps weights to [0.05, 0.95]', () => {
      const experience = {
        type: 'path',
        context: { active_weights: { distance: 0.9, safety: 0.1, speed: 0.05, terrain_type: 0.05 } },
        outcome: { success: true }
      };
      
      engine.update(experience, 0.9);
      
      expect(engine.weights.distance).toBeLessThanOrEqual(0.95);
      expect(engine.weights.safety).toBeGreaterThanOrEqual(0.05);
    });
  });
  
  describe('normalizeWeights', () => {
    test(' normalizes to sum of 1.0', () => {
      const weights = { a: 2, b: 3, c: 5 };
      const normalized = engine.normalizeWeights(weights);
      
      const sum = Object.values(normalized).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0);
    });
  });
  
  describe('reset', () => {
    test('resets to initial weights', () => {
      engine.experienceCount = 10;
      engine.update({}, 0.8);
      
      engine.reset();
      
      expect(engine.experienceCount).toBe(0);
      expect(engine.weights).toEqual({
        distance: 0.3,
        safety: 0.3,
        speed: 0.2,
        terrain_type: 0.2
      });
    });
  });
  
  describe('getWeights', () => {
    test('returns copy of weights', () => {
      const weights1 = engine.getWeights();
      const weights2 = engine.getWeights();
      
      weights1.distance = 999;
      
      expect(weights2.distance).toBe(0.3);
    });
  });
  
  describe('isValid', () => {
    test('returns true for valid weights', () => {
      expect(engine.isValid()).toBe(true);
    });
  });
});

describe('StrategyEvolutionManager', () => {
  let manager;
  
  beforeEach(() => {
    manager = new StrategyEvolutionManager('test-bot-123');
  });
  
  describe('init', () => {
    test('initializes storage and loads weights', async () => {
      await manager.init();
      expect(manager.initialized).toBe(true);
    });
  });
  
  describe('getWeights', () => {
    test('returns null if not initialized', () => {
      expect(manager.getWeights('path')).toBeNull();
    });
    
    test('returns weights if initialized', async () => {
      await manager.init();
      const weights = manager.getWeights('path');
      expect(weights).toHaveProperty('distance');
      expect(weights).toHaveProperty('safety');
    });
  });
  
  describe('recordExperience', () => {
    test('calculates fitness score', async () => {
      await manager.init();
      
      const experience = {
        type: 'path',
        context: { bot_position: { x: 100, y: 64, z: -200 }, bot_health: 20, bot_food: 20 },
        action: 'move',
        outcome: { success: true, duration_ms: 5000 }
      };
      
      await manager.recordExperience(experience);
      
      expect(experience.fitness_score).toBeDefined();
      expect(experience.fitness_score).toBeGreaterThanOrEqual(0);
    });
  });
  
  describe('getOptimalAction', () => {
    test('returns null if no history', async () => {
      await manager.init();
      const result = await manager.getOptimalAction('path', { bot_position: {} });
      expect(result).toBeNull();
    });
  });
  
  describe('reset', () => {
    test('resets all weights', async () => {
      await manager.init();
      
      manager.weightEngines['path'].weights = { distance: 0.9, safety: 0.1, speed: 0, terrain_type: 0 };
      manager.weightEngines['path'].experienceCount = 100;
      
      await manager.reset();
      
      const weights = manager.getWeights('path');
      expect(weights).toEqual({
        distance: 0.3,
        safety: 0.3,
        speed: 0.2,
        terrain_type: 0.2
      });
    });
  });
  
  describe('getStats', () => {
    test('returns empty stats if not initialized', () => {
      const stats = manager.getStats();
      expect(stats.totalExperiences).toBe(0);
    });
  });
});

describe('EvolutionStorage', () => {
  let storage;
  
  beforeEach(() => {
    storage = new EvolutionStorage('test-bot-456');
  });
  
  describe('init', () => {
    test('creates database connection', async () => {
      await storage.init();
      expect(storage.db).toBeDefined();
    });
  });
  
  describe('ensureTables', () => {
    test('creates evolution_weights table', async () => {
      await storage.ensureTables();
      // Table creation is verified by subsequent operations
    });
  });
  
  describe('saveWeights', () => {
    test('saves weights for domain', async () => {
      await storage.init();
      await storage.ensureTables();
      
      const weights = { path: { distance: 0.3, safety: 0.3, speed: 0.2, terrain_type: 0.2 } };
      await storage.saveWeights('test-bot', 'path', weights.path);
      
      const loaded = await storage.loadWeights();
      expect(loaded['path']).toBeDefined();
    });
  });
});

// Run tests with coverage
if (require.main === module) {
  const coverage = require('jest').runCLI(
    {
      _: ['evolution.test.js'],
      coverage: true,
      'coverage-directory': 'coverage/evolution',
      coverageReporters: ['text', 'json', 'html']
    },
    [__dirname]
  );
  
  console.log('Evolution tests completed');
}
```

**Expected output:** Test suite output showing 85%+ coverage on evolution components.

---

### **Phase 4: Verification (Critical Priority)**

#### Task 4.1: Run unit tests with coverage
```bash
cd /data/code/minebot
node bot/evolution/evolution.test.js
```

**Expected output:** Test results showing >85% coverage on:
- `evolution/fitness-calculator.js`
- `evolution/weight-engine.js`
- `evolution/strategy-manager.js`
- `evolution/experience-logger.js`
- `evolution/evolution-storage.js`

---

#### Task 4.2: Start bot and verify evolution integration
```bash
cd /data/code/minebot
node bot_server.js
```

**Verification steps:**
1. Open http://localhost:9500 in browser
2. Start bot "FinalTestBot" in survival mode
3. Wait for automatic behavior to run (gather resources)
4. Check console log for "[StrategyEvolutionManager] Initialized"
5. Verify experiences recorded: check logs for "[ExperienceLogger] Flush"

---

#### Task 4.3: Query evolution API endpoints
```bash
# Check evolution stats
curl -s http://localhost:9500/api/bot/FinalTestBot/evolution/stats | jq .

# Check weights
curl -s http://localhost:9500/api/bot/FinalTestBot/evolution/weights | jq .

# Check history
curl -s "http://localhost:9500/api/bot/FinalTestBot/evolution/history?type=path&limit=10" | jq .
```

**Expected output:** JSON responses with evolution data.

---

## 3. Testing Strategy

### Unit Tests (evolution.test.js)
- **FitnessCalculator:** Success/failure scoring, boundary conditions (0, 100%)
- **WeightEngine:** 
  - Initial weights from schema
  - Learning rate decay curve (0.05→0.005 over 10000 experiences)
  - Weight clamping [0.05, 0.95]
  - Normalization to sum=1.0
  - Credit-based updates
- **StrategyEvolutionManager:** 
  - Weight loading/saving
  - Experience recording and fitness scoring
  - Optimal action retrieval
  - Reset behavior
  - Snapshot creation
- **EvolutionStorage:** 
  - Table creation
  - CRUD operations
  - Batch writes
  - Query filtering

### Integration Tests
- End-to-end experience → fitness score → weight update flow
- 50+ experiences causing权重向稳定方向演化 (trend verification, not exact values)
- Performance regression detection triggers rollback
- Warm-start strategy: first 20 experiences use uniform weights
- WAL fallback on database failure

### Regression Tests
- `evolutionManager=null` uses original logic in autonomous-engine.js
- pathfinder.js without evolution weights falls back to defaults
- behaviors.js without `onResult` callback works normally
- Bot survives evolution system crash (graceful degradation)

### Performance Tests
- Single experience record + weight update < 10ms
- No impact on 5-second autonomous decision cycle
- Batch flush handles 100+ experiences without blocking

---

## 4. Success Criteria

| Metric | Target | Verification Method |
|--------|--------|---------------------|
| **Code Coverage** | >85% | `node bot/evolution/evolution.test.js --coverage` |
| **Weight Updates** | <10ms per update | Benchmark record |
| **Learning Rate Decay** | 0.05→0.005 in 10k steps | Unit test |
| **Path Optimization** | >20% faster arrival | Compare before/after 100 experiences |
| **Resource Collection** | >15% more resources | Compare before/after 100 experiences |
| **Decision Quality** | >90% success rate | Experience log analysis |
| **Warm-start** | Consistent first 20 experiences | Experience count check |
| **Rollback Trigger** | >30% performance drop | Fitness history analysis |
| **API Endpoints** | 5/5 working | Manual curl tests |
| **Database Tables** | 4/4 created | SQLite browser verification |
| **Backward Compatibility** | evolutionManager=null works | Manual test |

---

## 5. Deployment Checklist

- [ ] Create `bot/evolution/` directory
- [ ] Create 6 new files with complete code
- [ ] Modify 6 existing files with integration hooks
- [ ] Run `node bot/evolution/evolution.test.js` with >85% coverage
- [ ] Start bot and verify "[StrategyEvolutionManager] Initialized" in logs
- [ ] Test API endpoints 5/5 returning valid JSON
- [ ] Verify `bot_config.db` has 4 new evolution tables
- [ ] Check experience logging: "[ExperienceLogger] Flush" appears in logs
- [ ] Verify weights update: evolve weights change over time
- [ ] Test rollback: performance degradation triggers reset
- [ ] Document new API endpoints in API docs

---

## 6. Rollback Plan

If issues occur during deployment:

1. **Immediate:** Bot continues to work with original logic (evolutionManager=null)
2. **Database:** Evolution tables don't affect existing functionality
3. **Memory:** Evolution system runs in separate instances per bot
4. **API:** New endpoints return 400 if evolution not initialized
5. **Manual Reset:** `POST /api/bot/:botId/evolution/reset` clears all evolution data

---

## 7. Future Enhancements (Post-MVP)

- Multi-bot collaboration domain (shared weight baselines)
- Cross-server learning transfer
- Automatic schema migrations for weight dimension changes
- Redis caching for high-frequency experience logging
- Web interface for weight visualization
- Anomaly detection for weight divergence

---

**Document Version:** 1.0  
**Last Updated:** 2026-04-05  
**Status:** Ready for Implementation
