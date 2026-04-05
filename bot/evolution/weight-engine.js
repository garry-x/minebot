class WeightEngine {
  constructor(domain) {
    this.domains = {
      path: {
        distance: 0.3,
        safety: 0.3,
        speed: 0.2,
        terrain_type: 0.2
      },
      resource: {
        value: 0.3,
        proximity: 0.3,
        safety: 0.2,
        tool_efficiency: 0.2
      },
      behavior: {
        health_risk: 0.25,
        resource_urgency: 0.25,
        goal_progress: 0.25,
        exploration_value: 0.25
      }
    };

    this.initialWeights = this.domains[domain];
    this.activeWeights = { ...this.initialWeights };
    this.config = {
      initialLearningRate: 0.05,
      minLearningRate: 0.005,
      decayFactor: 0.9995,
      minWeight: 0.05,
      maxWeight: 0.95,
      warmStartThreshold: 20
    };
    this.experienceCount = 0;
  }

  getWeights() {
    return { ...this.activeWeights };
  }

  getLearningRate() {
    return Math.max(
      this.config.minLearningRate,
      this.config.initialLearningRate * Math.pow(this.config.decayFactor, this.experienceCount)
    );
  }

  getExperienceCount() {
    return this.experienceCount;
  }

  isValid() {
    const weights = Object.values(this.activeWeights);
    const sum = weights.reduce((acc, val) => acc + val, 0);
    
    if (Math.abs(sum - 1.0) > 0.0001) {
      return false;
    }
    
    for (const weight of weights) {
      if (weight < this.config.minWeight || weight > this.config.maxWeight) {
        return false;
      }
    }
    
    return true;
  }

  update(experience, fitnessScore) {
    const lr = this.getLearningRate();
    const baseline = 0.5;
    const delta = fitnessScore - baseline;
    
    if (delta === 0) return;
    
    const activeWeights = experience.context.active_weights || this.activeWeights;
    
    for (const [dim, weight] of Object.entries(this.activeWeights)) {
      const activeWeight = activeWeights[dim] || weight;
      const credit = delta * activeWeight;
      this.activeWeights[dim] = Math.max(
        this.config.minWeight,
        Math.min(this.config.maxWeight, weight + lr * credit)
      );
    }
    
    this.experienceCount++;
  }

  reset() {
    this.activeWeights = { ...this.initialWeights };
    this.experienceCount = 0;
  }
}

module.exports = WeightEngine;
