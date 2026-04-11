const GoalSystem = require('../bot/goal-system');

describe('GoalSystem', () => {
  describe('Goals Structure', () => {
    test('should have exactly 10 predefined goals', () => {
      const goals = GoalSystem.getAllGoals();
      expect(goals).toHaveLength(10);
    });

    test('should have basic_survival goal', () => {
      const goal = GoalSystem.getGoal('basic_survival');
      expect(goal).toBeDefined();
      expect(goal.id).toBe('basic_survival');
      expect(goal.name).toBe('基础生存');
      expect(goal.difficulty).toBe('beginner');
    });

    test('should have iron_gear goal', () => {
      const goal = GoalSystem.getGoal('iron_gear');
      expect(goal).toBeDefined();
      expect(goal.id).toBe('iron_gear');
      expect(goal.name).toBe('铁装备');
      expect(goal.difficulty).toBe('beginner');
    });

    test('should have nether_portal goal', () => {
      const goal = GoalSystem.getGoal('nether_portal');
      expect(goal).toBeDefined();
      expect(goal.id).toBe('nether_portal');
    });

    test('should have auto_farm goal', () => {
      const goal = GoalSystem.getGoal('auto_farm');
      expect(goal).toBeDefined();
      expect(goal.id).toBe('auto_farm');
    });

    test('should have diamond_gear goal', () => {
      const goal = GoalSystem.getGoal('diamond_gear');
      expect(goal).toBeDefined();
      expect(goal.id).toBe('diamond_gear');
    });

    test('should have auto_mining goal', () => {
      const goal = GoalSystem.getGoal('auto_mining');
      expect(goal).toBeDefined();
      expect(goal.id).toBe('auto_mining');
    });

    test('should have enchanting goal', () => {
      const goal = GoalSystem.getGoal('enchanting');
      expect(goal).toBeDefined();
      expect(goal.id).toBe('enchanting');
    });

    test('should have furnace_array goal', () => {
      const goal = GoalSystem.getGoal('furnace_array');
      expect(goal).toBeDefined();
      expect(goal.id).toBe('furnace_array');
    });

    test('should have end_portal goal', () => {
      const goal = GoalSystem.getGoal('end_portal');
      expect(goal).toBeDefined();
      expect(goal.id).toBe('end_portal');
    });

    test('should have redstone_auto goal', () => {
      const goal = GoalSystem.getGoal('redstone_auto');
      expect(goal).toBeDefined();
      expect(goal.id).toBe('redstone_auto');
    });
  });

  describe('Goal State Creation', () => {
    test('should create goal state for iron_gear', () => {
      const state = GoalSystem.createGoalState('iron_gear', 'test-bot');
      expect(state).toBeDefined();
      expect(state.goalId).toBe('iron_gear');
      expect(state.botId).toBe('test-bot');
      expect(state.progress).toBe(0);
      expect(state.subTasks).toHaveLength(7);
    });

    test('should create goal state for basic_survival', () => {
      const state = GoalSystem.createGoalState('basic_survival', 'bot-1');
      expect(state.goalId).toBe('basic_survival');
      expect(state.subTasks).toHaveLength(4);
    });

    test('should default to basic_survival for invalid goal', () => {
      const state = GoalSystem.createGoalState('invalid-goal', 'bot-1');
      expect(state).toBeDefined();
    });
  });

  describe('Progress Calculation', () => {
    test('should calculate 0% progress for empty inventory', () => {
      const state = GoalSystem.createGoalState('basic_survival', 'test-bot');
      const result = GoalSystem.calculateProgress(state, []);
      expect(result.progress).toBe(0);
      expect(result.completedTasks).toBe(0);
    });

    test('should calculate 100% progress when all tasks completed', () => {
      const state = GoalSystem.createGoalState('basic_survival', 'test-bot');
      const inventory = [
        { name: 'oak_log', count: 64 },
        { name: 'cobblestone', count: 64 },
        { name: 'wheat', count: 10 }
      ];
      
      state.subTasks.forEach(task => {
        if (task.target === 'oak_log') task.completed = true;
        else if (task.target === 'cobblestone') task.completed = true;
        else if (task.target === 'wheat') task.completed = true;
        else if (task.type === 'build') task.completed = true;
      });
      const result = GoalSystem.calculateProgress(state, inventory);
      expect(result.progress).toBe(1);
      expect(result.completedTasks).toBe(3);
      expect(result.totalTasks).toBe(3);
    });

    test('should calculate partial progress', () => {
      const state = GoalSystem.createGoalState('basic_survival', 'test-bot');
      const inventory = [
        { name: 'oak_log', count: 64 }
      ];
      
      state.subTasks[0].completed = true;
      const result = GoalSystem.calculateProgress(state, inventory);
      expect(result.progress).toBe(1/3);
      expect(result.completedTasks).toBe(1);
      expect(result.totalTasks).toBe(3);
    });

    test('should calculate iron_gear progress', () => {
      const state = GoalSystem.createGoalState('iron_gear', 'test-bot');
      const inventory = [
        { name: 'iron_ingot', count: 24 },
        { name: 'coal', count: 24 }
      ];
      
      for (const subTask of state.subTasks) {
        if (subTask.target && ['iron_ingot', 'coal'].includes(subTask.target)) {
          subTask.completed = true;
        }
      }
      const result = GoalSystem.calculateProgress(state, inventory);
      expect(result.completedTasks).toBe(3);
      expect(result.totalTasks).toBe(7);
      expect(result.progress).toBe(3/7);
    });
  });

  describe('Difficulty Levels', () => {
    test('should have correct difficulty distributions', () => {
      const goals = GoalSystem.getAllGoals();
      
      const beginner = goals.filter(g => g.difficulty === 'beginner');
      const intermediate = goals.filter(g => g.difficulty === 'intermediate');
      const advanced = goals.filter(g => g.difficulty === 'advanced');
      const expert = goals.filter(g => g.difficulty === 'expert');
      
      expect(beginner).toHaveLength(2);
      expect(intermediate).toHaveLength(2);
      expect(advanced).toHaveLength(4);
      expect(expert).toHaveLength(2);
    });
  });

  describe('SubTask Structure', () => {
    test('should have proper subTask structure', () => {
      const goal = GoalSystem.getGoal('basic_survival');
      expect(goal.subTasks).toHaveLength(4);
      
      expect(goal.subTasks[0]).toEqual({
        id: 'gather_wood',
        name: '收集木材',
        targetCategory: 'wood',
        required: 64
      });
      
      expect(goal.subTasks[3]).toEqual({
        id: 'build_shelter',
        name: '建造庇护所',
        type: 'build',
        dimensions: '3x3x3',
        optional: true
      });
    });

    test('should have rewards for each goal', () => {
      const goals = GoalSystem.getAllGoals();
      goals.forEach(goal => {
        expect(goal.rewards).toBeDefined();
        expect(Array.isArray(goal.rewards)).toBe(true);
        expect(goal.rewards.length).toBeGreaterThanOrEqual(1);
      });
    });
  });
});
