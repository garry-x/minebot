const logger = require('../logger');

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

  getOptimalAction(context) {
    if (!context || !context.targetBlocks) {
      return {
        action: 'default',
        target: null,
        confidence: 0.5,
        reason: 'No context available'
      };
    }

    const weights = this.activeWeights;
    const blocks = context.targetBlocks;
    
    if (!blocks || blocks.length === 0) {
      return {
        action: 'default',
        target: null,
        confidence: 0.5,
        reason: 'No target blocks'
      };
    }

    const scoredBlocks = blocks.map(block => {
      const score = this._calculateBlockScore(block, weights, context);
      return { block, score };
    });

    scoredBlocks.sort((a, b) => b.score - a.score);

    const bestBlock = scoredBlocks[0];
    const confidence = bestBlock.score;

    return {
      action: 'prioritized',
      target: bestBlock.block,
      order: scoredBlocks.map(sb => sb.block),
      confidence: Math.min(1, confidence),
      reason: `Selected based on learned weights: ${JSON.stringify(weights)}`
    };
  }

  _calculateBlockScore(block, weights, context) {
    let score = 0;
    const botPos = context.position || { x: 0, y: 0, z: 0 };
    
    if (block.position) {
      const dx = block.position.x - botPos.x;
      const dy = block.position.y - botPos.y;
      const dz = block.position.z - botPos.z;
      const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
      
      if (weights.proximity !== undefined) {
        const proximityScore = Math.max(0, 1 - distance / 50);
        score += weights.proximity * proximityScore;
      }
      if (weights.distance !== undefined) {
        const distanceScore = Math.max(0, 1 - distance / 50);
        score += weights.distance * distanceScore;
      }
    }

    if (block.value !== undefined && weights.value !== undefined) {
      score += weights.value * block.value;
    }

    if (weights.safety !== undefined) {
      const safetyScore = block.safe !== false ? 1 : 0.1;
      score += weights.safety * safetyScore;
    }

    if (weights.tool_efficiency !== undefined && block.toolEfficiency !== undefined) {
      score += weights.tool_efficiency * block.toolEfficiency;
    }

    return score;
  }
}

module.exports = WeightEngine;
