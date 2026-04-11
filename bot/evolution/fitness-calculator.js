class FitnessCalculator {
  static calcPathFitness(outcome) {
    if (!outcome.success) {
      return 0.1;
    }

    const duration_ms = outcome.duration_ms || 0;
    const health_change = outcome.health_change || 0;
    
    const timeScore = Math.max(0, 1 - (duration_ms / 60000));
    const healthScore = Math.max(0, 1 + health_change / 20);
    
    return 0.6 * timeScore + 0.4 * healthScore;
  }

  static calcResourceFitness(outcome) {
    if (!outcome.success) {
      return 0.1;
    }

    const duration_ms = outcome.duration_ms || 0;
    const resource_gained = outcome.count || outcome.resource_gained || 1;
    const resource_cost = outcome.resource_cost || 0;
    
    const durationInSeconds = duration_ms / 1000;
    const efficiencyScore = Math.min(1, resource_gained / (durationInSeconds || 1));
    const costScore = Math.max(0, 1 - resource_cost / 10);
    
    return 0.7 * efficiencyScore + 0.3 * costScore;
  }

  static calcBehaviorFitness(outcome) {
    if (!outcome.success) {
      return 0.1;
    }

    const duration_ms = outcome.duration_ms || 0;
    const timeBonus = duration_ms < 30000 ? 1 : 0.5;
    
    return 0.5 + 0.5 * timeBonus;
  }

  static calcStateFitness(outcome) {
    if (!outcome.success) {
      return 0.1;
    }

    const value_changed = outcome.value_changed !== undefined ? outcome.value_changed : true;
    if (!value_changed) {
      return 0.5;
    }

    const new_value = outcome.new_value || 0;
    const old_value = outcome.old_value || 0;
    const improvement = new_value > old_value;
    
    return improvement ? 0.8 : 0.2;
  }
}

module.exports = FitnessCalculator;
