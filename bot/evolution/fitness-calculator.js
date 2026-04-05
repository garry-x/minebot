class FitnessCalculator {
  static calcPathFitness(outcome) {
    if (!outcome.success) {
      return 0.1;
    }

    const timeScore = Math.max(0, 1 - (outcome.duration_ms / 60000));
    const healthScore = Math.max(0, 1 + outcome.health_change / 20);
    
    return 0.6 * timeScore + 0.4 * healthScore;
  }

  static calcResourceFitness(outcome) {
    if (!outcome.success) {
      return 0.1;
    }

    const durationInSeconds = outcome.duration_ms / 1000;
    const efficiencyScore = Math.min(1, outcome.resource_gained / (durationInSeconds || 1));
    const costScore = Math.max(0, 1 - outcome.resource_cost / 10);
    
    return 0.7 * efficiencyScore + 0.3 * costScore;
  }

  static calcBehaviorFitness(outcome) {
    if (!outcome.success) {
      return 0.1;
    }

    const timeBonus = outcome.duration_ms < 30000 ? 1 : 0.5;
    
    return 0.5 + 0.5 * timeBonus;
  }
}

module.exports = FitnessCalculator;
