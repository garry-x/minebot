# Evolution Module Analysis

## Overview

The Evolution Module is an adaptive learning system designed to optimize bot behavior through experience-based weight adjustment. It aims to allow bots to learn from past actions and improve their decision-making over time.

## Architecture

### Core Components

1. **StrategyEvolutionManager** (`bot/evolution/strategy-manager.js`)
   - Main coordinator for the evolution system
   - Manages multiple weight engines for different domains
   - Handles experience recording and weight updates

2. **WeightEngine** (`bot/evolution/weight-engine.js`)
   - Implements reinforcement learning algorithm
   - Manages adaptive weights for decision dimensions
   - Uses learning rate decay for stability

3. **FitnessCalculator** (`bot/evolution/fitness-calculator.js`)
   - Calculates fitness scores for different action outcomes
   - Domain-specific fitness functions for path, resource, behavior, and state

4. **ExperienceLogger** (`bot/evolution/experience-logger.js`)
   - Records experiences to database
   - Batch processing for performance

5. **EvolutionStorage** (`bot/evolution/evolution-storage.js`)
   - Database persistence layer
   - SQLite-based storage for experiences, weights, and snapshots

### Decision Domains

| Domain | Weights | Purpose |
|--------|---------|---------|
| path | distance, safety, speed, terrain_type | Optimize path finding |
| resource | value, proximity, safety, tool_efficiency | Optimize resource gathering |
| behavior | health_risk, resource_urgency, goal_progress, exploration_value | Optimize general behavior |

## Current Implementation Issues

### 1. Fitness Calculation Mismatch

The fitness functions reference fields that don't exist in the actual outcome data:

```javascript
// fitness-calculator.js - calcPathFitness
const timeScore = Math.max(0, 1 - (outcome.duration_ms / 60000));  // duration_ms not passed
const healthScore = Math.max(0, 1 + outcome.health_change / 20);   // health_change not passed
```

**Actual experience recorded** (`behaviors.js:433-439`):
```javascript
{
  type: 'resource',
  context: { targetBlock: block.name, position: position },
  action: 'gather',
  outcome: { success: true, block: block.name, count: 1 }
}
```

**Expected by fitness calculator**:
```javascript
{
  success: true,
  duration_ms: number,
  health_change: number,
  resource_gained: number,
  resource_cost: number
}
```

### 2. Weights Not Effectively Used

The system retrieves weights but doesn't use them effectively in decision-making:

```javascript
// behaviors.js:359
optimalStrategy = evolutionManager.getOptimalAction('resource', context);
```

The `getOptimalAction` returns a default suggestion because:
- The method tries to call `getOptimalAction` on WeightEngine which doesn't exist
- Falls back to `_getDefaultActionSuggestion` which always returns `{ action: 'default' }`

### 3. No Real Feedback Loop

- Experiences are recorded but weights are not actually influencing decisions
- The bot continues using default strategies regardless of learned weights
- No mechanism to apply learned weights to actual behavior selection

### 4. Empty Outcome Data

When recording failures, the outcome data is minimal:

```javascript
// behaviors.js:444-451
outcome: { success: false, reason: digError.message }
// Missing: duration_ms, resource_gained, resource_cost, etc.
```

This means the fitness calculation for failures is also incorrect.

## Usage in Codebase

### Recording Experiences

1. **Resource Gathering** (`bot/behaviors.js`):
   - Records success after successful dig
   - Records failure after dig error

2. **Bot Events** (`bot/events.js`):
   - Records experience on significant events

3. **Bot Server** (`bot_server.js`):
   - Records initial experience on bot creation

### Retrieving Stats

- API endpoint: `/api/bot/:botId/evolution/stats`
- Returns domain weights, experience counts, fitness history

## Recommendations for Optimization

### 1. Fix Data Flow
- Pass complete outcome data to `recordExperience`
- Include duration, resources gained/lost, health changes

### 2. Implement Effective Weight Usage
- Add proper `getOptimalAction` implementation in WeightEngine
- Actually use the weights to select actions (e.g., ordering blocks by learned value)

### 3. Add Feedback Loop
- Make `getOptimalAction` return weighted recommendations
- Use weights in actual decision making (not just logging)

### 4. Improve Fitness Calculations
- Make fitness calculations work with available data
- Add default values for missing fields

## Database Schema

### bot_states table
- Stores bot configuration and status
- Evolution metadata in `metadata` JSON field

### evolution_experiences table
- Individual experience records
- Indexed by bot_id, domain, timestamp

### evolution_weights table
- Current weight vectors per domain
- Version tracking for each domain

### evolution_snapshots table
- Periodic snapshots for rollback capability

## Conclusion

The Evolution Module has the infrastructure for adaptive learning but lacks proper integration with actual decision-making. The core issue is that:

1. **Data is not flowing correctly** - Fitness functions expect fields that aren't being recorded
2. **Learned weights aren't applied** - Weights are stored but not used to influence behavior
3. **No closed feedback loop** - The system records experiences but doesn't learn from them in a way that affects future decisions

To make evolution work effectively, we need to:
1. Fix the data collection to pass complete outcome information
2. Implement proper action selection using learned weights
3. Ensure the feedback loop actually influences bot behavior