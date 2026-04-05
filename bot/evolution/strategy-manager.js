const WeightEngine = require('./weight-engine');
const ExperienceLogger = require('./experience-logger');
const EvolutionStorage = require('./evolution-storage');
const FitnessCalculator = require('./fitness-calculator');

class StrategyEvolutionManager {
  constructor(botId, options = {}) {
    this.botId = botId;
    this.dbPath = options.dbPath || null;
    
    this.storage = new EvolutionStorage(this.dbPath);
    this.weightEngines = {
      path: new WeightEngine('path'),
      resource: new WeightEngine('resource'),
      behavior: new WeightEngine('behavior')
    };
    
    this.experienceLogger = new ExperienceLogger(this.storage);
    
    this.experienceCount = 0;
    this.baselineFitness = 0.5;
    this.lastFitnessScores = [];
  }

  async connect() {
    await this.storage.connect();
    await this.storage.initialize();
    await this._loadWeights();
  }

  async _loadWeights() {
    const domains = ['path', 'resource', 'behavior'];
    
    for (const domain of domains) {
      const savedWeights = await this.storage.loadWeights(this.botId, domain);
      
      if (savedWeights) {
        const engine = this.weightEngines[domain];
        engine.activeWeights = savedWeights.weight_vector;
        engine.experienceCount = savedWeights.version * 10;
      }
    }
  }

  getWeights(domain) {
    if (!this.weightEngines[domain]) {
      throw new Error(`Invalid domain: ${domain}`);
    }
    
    return this.weightEngines[domain].getWeights();
  }

  async recordExperience(experience) {
    const domain = experience.type;
    
    if (!this.weightEngines[domain]) {
      throw new Error(`Invalid domain: ${domain}`);
    }
    
    const fitnessScore = this._calculateFitness(domain, experience.outcome);
    
    experience.fitness_score = fitnessScore;
    
    await this.experienceLogger.record(experience);
    await this.experienceLogger.flush();
    
    await this.storage.saveExperience(experience);
    
    const engine = this.weightEngines[domain];
    engine.update(experience, fitnessScore);
    
    await this.storage.saveWeights(this.botId, domain, engine.activeWeights);
    
    await this._saveSnapshot('weight_update', domain);
    
    this.lastFitnessScores.push(fitnessScore);
    this.experienceCount++;
    
    if (this.lastFitnessScores.length > 50) {
      this.lastFitnessScores.shift();
    }
    
    if (this.experienceCount % 10 === 0) {
      await this._updateBaseline();
    }
    
    return {
      success: true,
      domain,
      fitnessScore,
      version: engine.experienceCount
    };
  }

  _calculateFitness(domain, outcome) {
    switch (domain) {
      case 'path':
        return FitnessCalculator.calcPathFitness(outcome);
      case 'resource':
        return FitnessCalculator.calcResourceFitness(outcome);
      case 'behavior':
        return FitnessCalculator.calcBehaviorFitness(outcome);
      default:
        return outcome.success ? 0.5 : 0.1;
    }
  }

  async _updateBaseline() {
    if (this.lastFitnessScores.length < 10) {
      return;
    }
    
    this.baselineFitness = this.lastFitnessScores.slice(0, -10).reduce((a, b) => a + b, 0) / (this.lastFitnessScores.length - 10);
  }

  getOptimalAction(domain, context) {
    if (!this.weightEngines[domain]) {
      throw new Error(`Invalid domain: ${domain}`);
    }
    
    return this.weightEngines[domain].getOptimalAction ? 
      this.weightEngines[domain].getOptimalAction(context) : 
      this._getDefaultActionSuggestion(domain);
  }

  _getDefaultActionSuggestion(domain) {
    return {
      action: 'default',
      target: null,
      confidence: 0.5,
      reason: 'No historical data available'
    };
  }

  async getEvolutionStats() {
    const domains = ['path', 'resource', 'behavior'];
    const stats = {
      botId: this.botId,
      totalExperiences: this.experienceCount,
      totalWeightUpdates: this.experienceCount,
      baselineFitness: this.baselineFitness,
      recentFitness: [...this.lastFitnessScores],
      domains: {}
    };
    
    for (const domain of domains) {
      const engine = this.weightEngines[domain];
      const domainStats = await this.storage.queryExperience(this.botId, domain, 100);
      
      stats.domains[domain] = {
        totalExperiences: domainStats.length,
        activeWeights: engine.getWeights(),
        version: engine.experienceCount
      };
    }
    
    return stats;
  }

  async reset() {
    const domains = ['path', 'resource', 'behavior'];
    
    for (const domain of domains) {
      const engine = this.weightEngines[domain];
      engine.reset();
      await this.storage.saveWeights(this.botId, domain, engine.activeWeights);
    }
    
    this.experienceCount = 0;
    this.lastFitnessScores = [];
    this.baselineFitness = 0.5;
  }

  async _saveSnapshot(type, data) {
    await this.storage.saveSnapshot(this.botId, type, data);
  }

  async rollbackToSnapshot(snapshotId) {
    const snapshot = await this.storage.loadSnapshot(snapshotId);
    
    if (!snapshot) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }
    
    await this._saveSnapshot('pre_rollback', { snapshotId, timestamp: new Date().toISOString() });
    
    if (snapshot.data && snapshot.data.domain) {
      const domain = snapshot.data.domain;
      const engine = this.weightEngines[domain];
      
      const weights = await this.storage.loadWeights(this.botId, domain);
      if (weights) {
        engine.activeWeights = weights.weight_vector;
      }
    }
    
    await this.storage.saveSnapshot(this.botId, 'post_rollback', {
      snapshotId,
      timestamp: new Date().toISOString()
    });
    
    return { success: true, snapshotId };
  }

  async rollbackOnRegression() {
    if (this.lastFitnessScores.length < 20) {
      return false;
    }
    
    const recentAvg = this.lastFitnessScores.slice(-10).reduce((a, b) => a + b, 0) / 10;
    const baseline = this.baselineFitness || 0.5;
    
    if (recentAvg < baseline * 0.7) {
      const snapshots = await this.storage.getSnapshots(this.botId, 10);
      const milestones = snapshots.filter(s => s.snapshot_type === 'milestone');
      
      if (milestones.length > 0) {
        const latestMilestone = milestones[0];
        await this.rollbackToSnapshot(latestMilestone.id);
        return true;
      }
    }
    
    return false;
  }
}

module.exports = StrategyEvolutionManager;
