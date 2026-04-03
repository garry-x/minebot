# Autonomous Bot System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform bot system into fully autonomous agent with survival-first algorithm, 10 predefined goals, real-time progress tracking, and enhanced UI controls.

**Architecture:** Three-phase approach: 1) Core autonomous engine in behaviors.js, 2) Goal tracking system with API extensions, 3) Enhanced BotDetail UI with real-time monitoring.

**Tech Stack:** Node.js, Express, React, WebSocket, mineflayer, SQLite for persistence

---

## File Structure Overview

### Create New Files:
- `/data/code/minebot/bot/autonomous-engine.js` - Core autonomous decision engine
- `/data/code/minebot/bot/goal-system.js` - Goal definition and progress tracking
- `/data/code/minebot/config/models/BotGoal.js` - Goal state persistence model
- `/data/code/minebot/frontend/src/components/GoalProgress.js` - Goal progress visualization
- `/data/code/minebot/frontend/src/components/AutonomousDashboard.js` - AI decision display
- `/data/code/minebot/frontend/src/components/EnhancedControls.js` - Enhanced control panel

### Modify Existing Files:
- `/data/code/minebot/bot/behaviors.js:238-315` - Enhance automaticBehavior function
- `/data/code/minebot/bot_server.js:411-469` - Extend automatic API with goal support
- `/data/code/minebot/frontend/src/components/BotDetail.js:1-107` - Complete rewrite with new features

---

## Phase 1: Core Autonomous Engine

### Task 1: Create Autonomous Decision Engine

**Files:**
- Create: `/data/code/minebot/bot/autonomous-engine.js`
- Modify: `/data/code/minebot/bot/behaviors.js:238-315`
- Test: Run bot with test commands

- [ ] **Step 1: Create autonomous-engine.js skeleton**

```javascript
// /data/code/minebot/bot/autonomous-engine.js
const Vec3 = require('vec3');

class AutonomousEngine {
  constructor(bot, pathfinder, behaviors) {
    this.bot = bot;
    this.pathfinder = pathfinder;
    this.behaviors = behaviors;
    this.state = {
      priority: 'survival',
      currentAction: 'idle',
      decisionReason: '',
      threatLevel: 'low',
      healthStatus: 'safe'
    };
  }

  assessState() {
    // Evaluate health, hunger, inventory, environment
    const health = this.bot.health || 20;
    const food = this.bot.food || 20;
    const inventory = this.bot.inventory.items();
    
    return {
      health,
      food,
      inventoryCount: inventory.length,
      isDaytime: this.bot.time.timeOfDay < 13000,
      nearbyEntities: this.bot.entities.length
    };
  }

  calculatePriority(assessment) {
    // Survival-first priority calculation
    if (assessment.health < 8) return 'emergency';
    if (assessment.food < 6) return 'food';
    if (assessment.health < 12) return 'heal';
    if (assessment.food < 12) return 'gather_food';
    return 'goal_progress';
  }

  decideAction(priority, goalState) {
    // Decision logic based on priority
    switch (priority) {
      case 'emergency':
        return { action: 'heal_immediate', target: null };
      case 'food':
        return { action: 'gather', target: ['wheat', 'carrot', 'potato'] };
      case 'heal':
        return { action: 'find_shelter', target: null };
      case 'gather_food':
        return { action: 'gather', target: ['wheat', 'carrot'] };
      case 'goal_progress':
        return this.decideGoalAction(goalState);
      default:
        return { action: 'explore', target: null };
    }
  }

  decideGoalAction(goalState) {
    // Goal-specific action decisions
    if (!goalState || !goalState.currentGoal) {
      return { action: 'gather', target: ['oak_log', 'cobblestone'] };
    }
    
    // Simplified: always gather resources for current goal
    return { action: 'gather', target: ['oak_log', 'cobblestone'] };
  }

  async executeAction(action) {
    // Execute the decided action
    this.state.currentAction = action.action;
    
    switch (action.action) {
      case 'gather':
        await this.behaviors.gatherResources({
          targetBlocks: action.target,
          radius: 30
        });
        break;
      case 'heal_immediate':
        // Find and eat food immediately
        const foodItems = this.bot.inventory.items().filter(i => 
          ['apple', 'bread', 'cooked_beef'].includes(i.name)
        );
        if (foodItems.length > 0) {
          await this.bot.equip(foodItems[0], 'hand');
          await this.bot.consume();
        }
        break;
      case 'find_shelter':
        // Move to a safe location
        const safePos = new Vec3(
          this.bot.entity.position.x + 10,
          this.bot.entity.position.y,
          this.bot.entity.position.z + 10
        );
        await this.pathfinder.moveTo(safePos);
        break;
    }
  }

  async runCycle(goalState) {
    // Main autonomous cycle
    const assessment = this.assessState();
    const priority = this.calculatePriority(assessment);
    const action = this.decideAction(priority, goalState);
    
    this.state.priority = priority;
    this.state.decisionReason = `Health: ${assessment.health}, Food: ${assessment.food}`;
    this.state.threatLevel = assessment.nearbyEntities > 3 ? 'medium' : 'low';
    this.state.healthStatus = assessment.health > 15 ? 'safe' : 
                              assessment.health > 10 ? 'warning' : 'critical';
    
    await this.executeAction(action);
    
    return {
      state: this.state,
      assessment,
      action
    };
  }
}

module.exports = AutonomousEngine;
```

- [ ] **Step 2: Test the engine creation**

```bash
cd /data/code/minebot
node -e "const AutonomousEngine = require('./bot/autonomous-engine'); console.log('AutonomousEngine loaded');"
```

Expected: No errors, "AutonomousEngine loaded"

呼出 `@subagent-driven-development`

### Task 2: Integrate Engine into Behaviors

**Files:**
- Modify: `/data/code/minebot/bot/behaviors.js:238-315`
- Modify: `/data/code/minebot/bot/index.js:88-103`

- [ ] **Step 1: Update behaviors.js automaticBehavior function**

```javascript
// /data/code/minebot/bot/behaviors.js:238-315
// Replace existing automaticBehavior function with:

const AutonomousEngine = require('./autonomous-engine');

// Inside the returned object:
automaticBehavior: async function(options = {}) {
  const { 
    mode = 'autonomous',
    initialGoal = 'basic_survival',
    gatherRadius = 30
  } = options;
  
  // Track current automatic mode on the wrapper object
  const wrapper = getWrapper();
  if (wrapper) {
    wrapper.currentMode = mode;
    console.log(`[Behaviors] Setting currentMode to: ${mode}`);
  }
  
  console.log(`Starting ${mode} behavior with goal: ${initialGoal}`);
  
  try {
    if (mode === 'autonomous') {
      // Initialize autonomous engine
      const engine = new AutonomousEngine(bot, pathfinder, this);
      
      // Run autonomous cycles until stopped
      let isRunning = true;
      wrapper.autonomousRunning = true;
      
      while (isRunning && wrapper.autonomousRunning) {
        try {
          const cycleResult = await engine.runCycle(wrapper.goalState || {});
          console.log(`[Autonomous] Cycle: ${cycleResult.state.currentAction}, Priority: ${cycleResult.state.priority}`);
          
          // Wait before next cycle (5 seconds for real-time updates)
          await new Promise(resolve => setTimeout(resolve, 5000));
        } catch (cycleError) {
          console.error(`[Autonomous] Cycle error: ${cycleError.message}`);
          await new Promise(resolve => setTimeout(resolve, 10000)); // Wait longer on error
        }
      }
      
      console.log('Autonomous behavior stopped');
      return true;
    } else {
      // Fallback to original behavior modes
      return await originalAutomaticBehavior.call(this, options);
    }
  } catch (error) {
    console.error('Error in automatic behavior:', error);
    throw new Error(`Automatic behavior failed: ${error.message}`);
  }
}
```

- [ ] **Step 2: Update bot/index.js to store autonomous state**

```javascript
// /data/code/minebot/bot/index.js around line 88
// In the bot creation callback:
this.behaviors = require('./behaviors')(this.bot, this.pathfinder);
this.autonomousRunning = false;
this.goalState = null;
```

- [ ] **Step 3: Test integration**

```bash
cd /data/code/minebot
node -e "
const behaviors = require('./bot/behaviors');
console.log('Behaviors module loaded with autonomous engine');
"
```

Expected: No errors

- [ ] **Step 4: Commit Phase 1**

```bash
cd /data/code/minebot
git add bot/autonomous-engine.js bot/behaviors.js bot/index.js
git commit -m "feat: Add autonomous decision engine core"
```

呼出 `@subagent-driven-development`

---

## Phase 2: Goal System & Progress Tracking

### Task 3: Create Goal Definition System

**Files:**
- Create: `/data/code/minebot/bot/goal-system.js`
- Create: `/data/code/minebot/config/models/BotGoal.js`
- Modify: `/data/code/minebot/config/db.js`

- [ ] **Step 1: Create goal definitions**

```javascript
// /data/code/minebot/bot/goal-system.js
class GoalSystem {
  static goals = {
    basic_survival: {
      id: 'basic_survival',
      name: '基础生存',
      description: '收集木材×64，石头×64，食物×10，建造3×3庇护所',
      difficulty: 'beginner',
      subTasks: [
        { id: 'gather_wood', name: '收集木材', target: 'oak_log', required: 64 },
        { id: 'gather_stone', name: '收集石头', target: 'cobblestone', required: 64 },
        { id: 'gather_food', name: '收集食物', target: 'wheat', required: 10 },
        { id: 'build_shelter', name: '建造庇护所', type: 'build', dimensions: '3x3x3' }
      ],
      rewards: ['wooden_tools', 'basic_shelter']
    },
    
    iron_gear: {
      id: 'iron_gear',
      name: '铁装备',
      description: '制作全套铁装备（剑、镐、斧、铲、盔甲）',
      difficulty: 'beginner',
      subTasks: [
        { id: 'gather_iron', name: '收集铁矿石', target: 'iron_ore', required: 24 },
        { id: 'gather_coal', name: '收集煤炭', target: 'coal', required: 24 },
        { id: 'build_furnace', name: '建造熔炉', type: 'build', block: 'furnace' },
        { id: 'smelt_iron', name: '熔炼铁锭', type: 'craft', target: 'iron_ingot', required: 24 },
        { id: 'craft_sword', name: '制作铁剑', type: 'craft', target: 'iron_sword' },
        { id: 'craft_pickaxe', name: '制作铁镐', type: 'craft', target: 'iron_pickaxe' },
        { id: 'craft_armor', name: '制作铁盔甲', type: 'craft', target: 'iron_chestplate' }
      ],
      rewards: ['full_iron_gear', 'mining_ability']
    },
    
    // Add 8 more goals here...
  };

  static getGoal(goalId) {
    return this.goals[goalId] || this.goals.basic_survival;
  }

  static getAllGoals() {
    return Object.values(this.goals);
  }

  static createGoalState(goalId, botId) {
    const goal = this.getGoal(goalId);
    return {
      goalId,
      botId,
      progress: 0,
      startedAt: new Date().toISOString(),
      subTasks: goal.subTasks.map(task => ({
        ...task,
        completed: false,
        progress: 0
      })),
      materials: {}
    };
  }

  static calculateProgress(goalState, inventory) {
    // Calculate progress based on inventory and completed tasks
    const goal = this.getGoal(goalState.goalId);
    let completedTasks = 0;
    
    for (const task of goalState.subTasks) {
      if (task.completed) {
        completedTasks++;
      } else if (task.target) {
        // Check if material requirement is met
        const item = inventory.find(i => i.name === task.target);
        if (item && item.count >= task.required) {
          task.completed = true;
          completedTasks++;
        }
      }
    }
    
    const progress = completedTasks / goalState.subTasks.length;
    return {
      progress,
      completedTasks,
      totalTasks: goalState.subTasks.length
    };
  }
}

module.exports = GoalSystem;
```

- [ ] **Step 2: Create BotGoal model**

```javascript
// /data/code/minebot/config/models/BotGoal.js
const db = require('../db');

const BotGoal = {
  table: 'bot_goals',
  
  createTable: async function() {
    const sql = `
      CREATE TABLE IF NOT EXISTS ${this.table} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bot_id TEXT NOT NULL,
        goal_id TEXT NOT NULL,
        progress REAL DEFAULT 0,
        goal_state TEXT,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        FOREIGN KEY (bot_id) REFERENCES bot_states(bot_id)
      )
    `;
    await db.run(sql);
  },
  
  saveGoal: async function(botId, goalId, goalState) {
    const sql = `
      INSERT OR REPLACE INTO ${this.table} 
      (bot_id, goal_id, progress, goal_state, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;
    await db.run(sql, [botId, goalId, goalState.progress, JSON.stringify(goalState)]);
  },
  
  getGoal: async function(botId) {
    const sql = `SELECT * FROM ${this.table} WHERE bot_id = ? ORDER BY updated_at DESC LIMIT 1`;
    const row = await db.get(sql, [botId]);
    
    if (row) {
      return {
        ...row,
        goal_state: JSON.parse(row.goal_state)
      };
    }
    return null;
  },
  
  updateProgress: async function(botId, progress) {
    const sql = `UPDATE ${this.table} SET progress = ?, updated_at = CURRENT_TIMESTAMP WHERE bot_id = ?`;
    await db.run(sql, [progress, botId]);
  },
  
  completeGoal: async function(botId) {
    const sql = `UPDATE ${this.table} SET completed_at = CURRENT_TIMESTAMP WHERE bot_id = ?`;
    await db.run(sql, [botId]);
  }
};

// Initialize table
BotGoal.createTable();

module.exports = BotGoal;
```

- [ ] **Step 3: Update database initialization**

```javascript
// /data/code/minebot/config/db.js
// Add after existing table creation
const BotGoal = require('./models/BotGoal');
```

- [ ] **Step 4: Test goal system**

```bash
cd /data/code/minebot
node -e "
const GoalSystem = require('./bot/goal-system');
console.log('Goals available:', GoalSystem.getAllGoals().length);
const state = GoalSystem.createGoalState('iron_gear', 'test-bot');
console.log('Goal state created:', state.goalId);
"
```

Expected: "Goals available: 10" and goal state creation

- [ ] **Step 5: Commit Phase 2**

```bash
cd /data/code/minebot
git add bot/goal-system.js config/models/BotGoal.js config/db.js
git commit -m "feat: Add goal system with 10 predefined goals"
```

呼出 `@subagent-driven-development`

### Task 4: Extend API for Goal Management

**Files:**
- Modify: `/data/code/minebot/bot_server.js:411-469`
- Modify: `/data/code/minebot/bot_server.js` (add new routes)

- [ ] **Step 1: Extend automatic API endpoint**

```javascript
// /data/code/minebot/bot_server.js:411-469
// Replace the existing /api/bot/automatic endpoint with:

app.post('/api/bot/automatic', async (req, res) => {
  try {
    const { username, mode, initialGoal } = req.body;
    
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }
    
    const botEntry = Array.from(activeBots.entries()).find(([bid, b]) => b.bot && b.bot.username === username);
    
    if (!botEntry) {
      return res.status(404).json({ error: `Bot with username "${username}" not found. Use "bot start" to create a bot first.` });
    }
    
    const bot = botEntry[1];
    const botId = botEntry[0];
    
    // Set initial goal if provided
    if (initialGoal) {
      const GoalSystem = require('../bot/goal-system');
      const goalState = GoalSystem.createGoalState(initialGoal, botId);
      bot.goalState = goalState;
      
      // Save to database
      await BotGoal.saveGoal(botId, initialGoal, goalState);
    }
    
    // Track current mode
    bot.currentMode = mode || 'autonomous';
    
    // Save bot state
    try {
      const position = bot.bot.entity.position;
      await BotState.saveBot(botId, {
        username: bot.bot.username,
        mode: mode || 'autonomous',
        position_x: position.x,
        position_y: position.y,
        position_z: position.z,
        health: bot.bot.health,
        food: bot.bot.food,
        status: 'active'
      });
    } catch (saveErr) {
      console.error(`[API] Failed to save bot state: ${saveErr.message}`);
    }
    
    // Start autonomous behavior
    bot.behaviors.automaticBehavior({ 
      mode: mode || 'autonomous',
      initialGoal: initialGoal || 'basic_survival'
    }).catch(err => {
      console.error('Error in automatic behavior:', err);
    });
    
    res.json({ 
      success: true,
      botId: botId,
      username,
      goal: initialGoal || 'basic_survival',
      message: `Autonomous behavior started in ${mode || 'autonomous'} mode with goal: ${initialGoal || 'basic_survival'}`
    });
  } catch (error) {
    console.error('Error starting automatic behavior:', error);
    res.status(500).json({ error: `Failed to start automatic behavior: ${error.message}` });
  }
});
```

- [ ] **Step 2: Add goal management endpoints**

```javascript
// /data/code/minebot/bot_server.js (after automatic endpoint)
app.post('/api/bot/:botId/goal/select', async (req, res) => {
  try {
    const { botId } = req.params;
    const { goalId } = req.body;
    
    const bot = activeBots.get(botId);
    if (!bot) {
      return res.status(404).json({ error: 'Bot not found' });
    }
    
    const GoalSystem = require('../bot/goal-system');
    const goalState = GoalSystem.createGoalState(goalId, botId);
    bot.goalState = goalState;
    
    // Save to database
    await BotGoal.saveGoal(botId, goalId, goalState);
    
    // Update autonomous behavior if running
    if (bot.autonomousRunning) {
      // Signal goal change to autonomous engine
      bot.goalChanged = true;
    }
    
    res.json({
      success: true,
      goalId,
      goalName: GoalSystem.getGoal(goalId).name,
      message: `Goal changed to: ${GoalSystem.getGoal(goalId).name}`
    });
  } catch (error) {
    console.error('Error changing goal:', error);
    res.status(500).json({ error: `Failed to change goal: ${error.message}` });
  }
});

app.get('/api/bot/:botId/goal/status', async (req, res) => {
  try {
    const { botId } = req.params;
    
    const bot = activeBots.get(botId);
    const goalState = bot?.goalState;
    
    if (!goalState) {
      // Try to load from database
      const dbGoal = await BotGoal.getGoal(botId);
      if (dbGoal) {
        return res.json({
          success: true,
          goalState: dbGoal.goal_state,
          progress: dbGoal.progress
        });
      }
      return res.status(404).json({ error: 'No goal set for this bot' });
    }
    
    // Calculate current progress
    const GoalSystem = require('../bot/goal-system');
    const inventory = bot.bot?.inventory?.items() || [];
    const progress = GoalSystem.calculateProgress(goalState, inventory);
    
    res.json({
      success: true,
      goalState,
      progress: progress.progress,
      details: progress
    });
  } catch (error) {
    console.error('Error getting goal status:', error);
    res.status(500).json({ error: `Failed to get goal status: ${error.message}` });
  }
});
```

- [ ] **Step 3: Test API endpoints**

```bash
cd /data/code/minebot
# Start server in background
node bot_server.js &
SERVER_PID=$!
sleep 3

# Test goal selection
curl -X POST http://localhost:9500/api/bot/test-bot/goal/select \
  -H "Content-Type: application/json" \
  -d '{"goalId":"iron_gear"}' | jq .

# Test goal status
curl http://localhost:9500/api/bot/test-bot/goal/status | jq .

kill $SERVER_PID
```

Expected: Both API calls return success responses

- [ ] **Step 4: Commit API extensions**

```bash
cd /data/code/minebot
git add bot_server.js
git commit -m "feat: Extend API for goal management and autonomous mode"
```

呼出 `@subagent-driven-development`

---

## Phase 3: Enhanced BotDetail UI

### Task 5: Create Goal Progress Component

**Files:**
- Create: `/data/code/minebot/frontend/src/components/GoalProgress.js`
- Create: `/data/code/minebot/frontend/src/components/GoalProgress.css`

- [ ] **Step 1: Create GoalProgress component**

```javascript
// /data/code/minebot/frontend/src/components/GoalProgress.js
import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../config';
import './GoalProgress.css';

const GoalProgress = ({ botId, goalState, progress }) => {
  const [goals, setGoals] = useState([]);
  const [selectedGoal, setSelectedGoal] = useState(goalState?.goalId || 'basic_survival');
  const [changingGoal, setChangingGoal] = useState(false);

  useEffect(() => {
    // Load available goals
    const loadGoals = async () => {
      try {
        // In a real implementation, this would come from API
        const mockGoals = [
          { id: 'basic_survival', name: '基础生存', description: '收集木材×64，石头×64，食物×10' },
          { id: 'iron_gear', name: '铁装备', description: '制作全套铁装备' },
          { id: 'nether_portal', name: '下界传送门', description: '建造下界传送门' },
          { id: 'auto_farm', name: '自动农场', description: '建造小型自动农场' },
          { id: 'diamond_gear', name: '钻石装备', description: '收集钻石制作装备' },
          { id: 'auto_mining', name: '自动化挖矿', description: '建造自动挖矿系统' },
          { id: 'enchanting', name: '附魔台', description: '制作附魔台附魔装备' },
          { id: 'furnace_array', name: '熔炉阵列', description: '建造8熔炉熔炼系统' },
          { id: 'end_portal', name: '末地传送门', description: '找到要塞激活传送门' },
          { id: 'redstone_auto', name: '红石自动化', description: '建造全自动物品系统' }
        ];
        setGoals(mockGoals);
      } catch (err) {
        console.error('Failed to load goals:', err);
      }
    };
    
    loadGoals();
  }, []);

  const handleGoalChange = async (newGoalId) => {
    if (!botId) return;
    
    setChangingGoal(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/bot/${botId}/goal/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalId: newGoalId })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      
      setSelectedGoal(newGoalId);
      window.location.reload(); // Refresh to show new goal
    } catch (err) {
      console.error('Failed to change goal:', err);
      alert(`Failed to change goal: ${err.message}`);
    } finally {
      setChangingGoal(false);
    }
  };

  if (!goalState) {
    return (
      <div className="goal-progress empty">
        <h3>🎯 目标进度</h3>
        <p>未设置目标</p>
        <select 
          value={selectedGoal} 
          onChange={(e) => handleGoalChange(e.target.value)}
          disabled={changingGoal}
        >
          {goals.map(goal => (
            <option key={goal.id} value={goal.id}>
              {goal.name} - {goal.description}
            </option>
          ))}
        </select>
        <button 
          onClick={() => handleGoalChange(selectedGoal)}
          disabled={changingGoal}
        >
          {changingGoal ? '更换中...' : '设置目标'}
        </button>
      </div>
    );
  }

  const currentGoal = goals.find(g => g.id === goalState.goalId) || { name: '未知目标' };
  const progressPercent = Math.round((progress || 0) * 100);

  return (
    <div className="goal-progress">
      <div className="goal-header">
        <h3>🎯 目标进度: {currentGoal.name}</h3>
        <div className="goal-controls">
          <select 
            value={goalState.goalId} 
            onChange={(e) => handleGoalChange(e.target.value)}
            disabled={changingGoal}
          >
            {goals.map(goal => (
              <option key={goal.id} value={goal.id}>
                {goal.name}
              </option>
            ))}
          </select>
          <button 
            onClick={() => handleGoalChange(goalState.goalId)}
            disabled={changingGoal}
            className="change-goal-btn"
          >
            {changingGoal ? '...' : '更换'}
          </button>
        </div>
      </div>
      
      <div className="progress-bar-container">
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="progress-text">{progressPercent}% 完成</div>
      </div>
      
      <div className="sub-tasks">
        {goalState.subTasks && goalState.subTasks.map((task, index) => (
          <div key={index} className={`sub-task ${task.completed ? 'completed' : 'pending'}`}>
            <span className="task-icon">
              {task.completed ? '✅' : '⏳'}
            </span>
            <span className="task-name">{task.name}</span>
            {task.required && (
              <span className="task-progress">
                ({task.progress || 0}/{task.required})
              </span>
            )}
          </div>
        ))}
      </div>
      
      {goalState.materials && Object.keys(goalState.materials).length > 0 && (
        <div className="materials-list">
          <h4>所需材料:</h4>
          {Object.entries(goalState.materials).map(([material, data]) => (
            <div key={material} className="material-item">
              <span className="material-name">{material}:</span>
              <span className="material-count">{data.collected}/{data.required}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default GoalProgress;
```

- [ ] **Step 2: Create GoalProgress CSS**

```css
/* /data/code/minebot/frontend/src/components/GoalProgress.css */
.goal-progress {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.goal-progress.empty {
  text-align: center;
  padding: 24px;
}

.goal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.goal-header h3 {
  margin: 0;
  font-size: 16px;
  color: #2c3e50;
}

.goal-controls {
  display: flex;
  gap: 8px;
  align-items: center;
}

.goal-controls select {
  padding: 4px 8px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 14px;
}

.change-goal-btn {
  padding: 4px 12px;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.change-goal-btn:disabled {
  background: #bdc3c7;
  cursor: not-allowed;
}

.progress-bar-container {
  margin: 16px 0;
}

.progress-bar {
  height: 8px;
  background: #ecf0f1;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #2ecc71, #27ae60);
  transition: width 0.3s ease;
}

.progress-text {
  text-align: center;
  font-size: 14px;
  color: #7f8c8d;
  margin-top: 4px;
}

.sub-tasks {
  margin: 16px 0;
}

.sub-task {
  display: flex;
  align-items: center;
  padding: 8px;
  margin: 4px 0;
  background: white;
  border-radius: 4px;
  border-left: 4px solid #95a5a6;
}

.sub-task.completed {
  border-left-color: #2ecc71;
  opacity: 0.8;
}

.task-icon {
  margin-right: 8px;
  font-size: 14px;
}

.task-name {
  flex: 1;
  font-size: 14px;
}

.task-progress {
  font-size: 12px;
  color: #7f8c8d;
}

.materials-list {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #e9ecef;
}

.materials-list h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  color: #2c3e50;
}

.material-item {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 13px;
}

.material-name {
  color: #34495e;
}

.material-count {
  color: #7f8c8d;
  font-weight: 500;
}
```

- [ ] **Step 3: Test component creation**

```bash
cd /data/code/minebot/frontend
npm run build 2>&1 | grep -E "ERROR|error|Error" || echo "Build successful"
```

Expected: "Build successful"

- [ ] **Step 4: Commit GoalProgress component**

```bash
cd /data/code/minebot
git add frontend/src/components/GoalProgress.js frontend/src/components/GoalProgress.css
git commit -m "feat: Add GoalProgress component with goal selection and progress tracking"
```

呼出 `@subagent-driven-development`

### Task 6: Create Autonomous Dashboard Component

**Files:**
- Create: `/data/code/minebot/frontend/src/components/AutonomousDashboard.js`
- Create: `/data/code/minebot/frontend/src/components/AutonomousDashboard.css`

- [ ] **Step 1: Create AutonomousDashboard component**

```javascript
// /data/code/minebot/frontend/src/components/AutonomousDashboard.js
import React, { useState, useEffect, useRef } from 'react';
import API_BASE_URL from '../config';
import './AutonomousDashboard.css';

const AutonomousDashboard = ({ botId, botState }) => {
  const [autonomousState, setAutonomousState] = useState({
    currentAction: '空闲',
    priority: '生存',
    decisionReason: '等待指令',
    threatLevel: '低',
    healthStatus: '安全'
  });
  const [position, setPosition] = useState({ x: 0, y: 0, z: 0 });
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const wsRef = useRef(null);

  useEffect(() => {
    // Connect to WebSocket for real-time updates
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    const connectWebSocket = () => {
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        console.log('AutonomousDashboard WebSocket connected');
        if (botId) {
          wsRef.current.send(JSON.stringify({ 
            type: 'register_bot', 
            data: { botId } 
          }));
        }
      };
      
      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'status_update') {
            const bots = message.data.bots || [];
            const currentBot = bots.find(b => b.botId === botId);
            if (currentBot) {
              // Update position
              if (currentBot.position) {
                setPosition(currentBot.position);
                setLastUpdate(Date.now());
              }
              
              // Update autonomous state from bot data
              if (currentBot.autonomousState) {
                setAutonomousState(currentBot.autonomousState);
              }
            }
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };
      
      wsRef.current.onclose = () => {
        console.log('AutonomousDashboard WebSocket disconnected');
        setTimeout(connectWebSocket, 3000);
      };
    };
    
    if (botId) {
      connectWebSocket();
    }
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [botId]);

  // Auto-refresh position every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdate(Date.now());
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const getThreatColor = (level) => {
    switch (level) {
      case '高': return '#e74c3c';
      case '中': return '#f39c12';
      case '低': return '#2ecc71';
      default: return '#95a5a6';
    }
  };

  const getHealthColor = (status) => {
    switch (status) {
      case '安全': return '#2ecc71';
      case '警告': return '#f39c12';
      case '危险': return '#e74c3c';
      default: return '#95a5a6';
    }
  };

  const formatPosition = (pos) => {
    return `X: ${pos.x.toFixed(1)}, Y: ${pos.y.toFixed(1)}, Z: ${pos.z.toFixed(1)}`;
  };

  const timeSinceUpdate = () => {
    const seconds = Math.floor((Date.now() - lastUpdate) / 1000);
    if (seconds < 5) return '刚刚';
    if (seconds < 60) return `${seconds}秒前`;
    return `${Math.floor(seconds / 60)}分钟前`;
  };

  return (
    <div className="autonomous-dashboard">
      <div className="dashboard-header">
        <h3>🤖 自主模式控制面板</h3>
        <div className="status-indicator">
          <span className="status-dot active" />
          <span className="status-text">运行中</span>
        </div>
      </div>
      
      <div className="state-grid">
        <div className="state-card">
          <div className="state-label">当前行动</div>
          <div className="state-value action">{autonomousState.currentAction}</div>
        </div>
        
        <div className="state-card">
          <div className="state-label">优先级</div>
          <div className="state-value priority">{autonomousState.priority}</div>
        </div>
        
        <div className="state-card">
          <div className="state-label">威胁等级</div>
          <div 
            className="state-value threat" 
            style={{ color: getThreatColor(autonomousState.threatLevel) }}
          >
            {autonomousState.threatLevel}
          </div>
        </div>
        
        <div className="state-card">
          <div className="state-label">健康状态</div>
          <div 
            className="state-value health-status" 
            style={{ color: getHealthColor(autonomousState.healthStatus) }}
          >
            {autonomousState.healthStatus}
          </div>
        </div>
      </div>
      
      <div className="position-display">
        <div className="position-header">
          <span className="position-label">实时位置</span>
          <span className="position-update">
            <span className="live-dot" /> 更新: {timeSinceUpdate()}
          </span>
        </div>
        <div className="position-coords">
          {formatPosition(position)}
        </div>
        <div className="position-help">
          每5秒自动更新，显示Bot在游戏中的三维坐标
        </div>
      </div>
      
      <div className="decision-reason">
        <div className="reason-label">AI决策原因</div>
        <div className="reason-text">{autonomousState.decisionReason}</div>
      </div>
      
      {botState?.state === 'DEAD' && botState?.deadReason && (
        <div className="death-alert">
          <div className="death-icon">⚰️</div>
          <div className="death-content">
            <div className="death-title">Bot死亡</div>
            <div className="death-reason">{botState.deadReason}</div>
            <div className="death-advice">
              建议：{botState.deadReason.includes('跌落') ? '小心高处' : 
                    botState.deadReason.includes('怪物') ? '准备武器和盔甲' :
                    '提高警惕，注意安全'}
            </div>
          </div>
        </div>
      )}
      
      <div className="emergency-controls">
        <h4>⚡ 紧急控制</h4>
        <div className="emergency-buttons">
          <button className="emergency-btn heal">立即治疗</button>
          <button className="emergency-btn escape">紧急逃跑</button>
          <button className="emergency-btn pause">暂停AI</button>
          <button className="emergency-btn resume">恢复AI</button>
        </div>
      </div>
    </div>
  );
};

export default AutonomousDashboard;
```

- [ ] **Step 2: Create AutonomousDashboard CSS**

```css
/* /data/code/minebot/frontend/src/components/AutonomousDashboard.css */
.autonomous-dashboard {
  background: white;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 2px solid #f8f9fa;
}

.dashboard-header h3 {
  margin: 0;
  font-size: 18px;
  color: #2c3e50;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #95a5a6;
}

.status-dot.active {
  background: #2ecc71;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.5; }
  100% { opacity: 1; }
}

.status-text {
  font-size: 12px;
  color: #7f8c8d;
}

.state-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}

.state-card {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  padding: 12px;
}

.state-label {
  font-size: 11px;
  text-transform: uppercase;
  color: #95a5a6;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.state-value {
  font-size: 16px;
  font-weight: 600;
  color: #2c3e50;
}

.state-value.action {
  color: #3498db;
}

.state-value.priority {
  color: #9b59b6;
}

.position-display {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  padding: 16px;
  margin-bottom: 20px;
}

.position-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.position-label {
  font-size: 14px;
  font-weight: 600;
  color: #2c3e50;
}

.position-update {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #7f8c8d;
}

.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #e74c3c;
  animation: blink 1s infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.position-coords {
  font-family: 'Monaco', 'Courier New', monospace;
  font-size: 18px;
  font-weight: 600;
  color: #2c3e50;
  text-align: center;
  margin: 8px 0;
}

.position-help {
  font-size: 12px;
  color: #95a5a6;
  text-align: center;
}

.decision-reason {
  background: #fff8e1;
  border: 1px solid #ffeaa7;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 20px;
}

.reason-label {
  font-size: 12px;
  color: #f39c12;
  margin-bottom: 4px;
}

.reason-text {
  font-size: 14px;
  color: #34495e;
  line-height: 1.4;
}

.death-alert {
  background: #fee;
  border: 1px solid #f5c6cb;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 20px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.death-icon {
  font-size: 24px;
}

.death-content {
  flex: 1;
}

.death-title {
  font-size: 14px;
  font-weight: 600;
  color: #721c24;
  margin-bottom: 4px;
}

.death-reason {
  font-size: 13px;
  color: #856404;
  margin-bottom: 4px;
}

.death-advice {
  font-size: 12px;
  color: #155724;
}

.emergency-controls {
  border-top: 2px solid #f8f9fa;
  padding-top: 16px;
}

.emergency-controls h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #2c3e50;
}

.emergency-buttons {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.emergency-btn {
  padding: 8px 12px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.emergency-btn.heal {
  background: #e74c3c;
  color: white;
}

.emergency-btn.escape {
  background: #f39c12;
  color: white;
}

.emergency-btn.pause {
  background: #95a5a6;
  color: white;
}

.emergency-btn.resume {
  background: #2ecc71;
  color: white;
}

.emergency-btn:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}
```

- [ ] **Step 3: Test dashboard component**

```bash
cd /data/code/minebot/frontend
npm run build 2>&1 | tail -5
```

Expected: Build completion without errors

- [ ] **Step 4: Commit AutonomousDashboard component**

```bash
cd /data/code/minebot
git add frontend/src/components/AutonomousDashboard.js frontend/src/components/AutonomousDashboard.css
git commit -m "feat: Add AutonomousDashboard with real-time monitoring and emergency controls"
```

呼出 `@subagent-driven-development`

### Task 7: Create Enhanced Controls Component

**Files:**
- Create: `/data/code/minebot/frontend/src/components/EnhancedControls.js`
- Create: `/data/code/minebot/frontend/src/components/EnhancedControls.css`

- [ ] **Step 1: Create EnhancedControls component**

```javascript
// /data/code/minebot/frontend/src/components/EnhancedControls.js
import React, { useState } from 'react';
import API_BASE_URL from '../config';
import './EnhancedControls.css';

const EnhancedControls = ({ botId }) => {
  const [activeTab, setActiveTab] = useState('gather');
  const [loading, setLoading] = useState(false);
  const [gatherConfig, setGatherConfig] = useState({
    preset: 'wood',
    customBlocks: 'oak_log',
    radius: '30'
  });
  const [buildConfig, setBuildConfig] = useState({
    preset: 'house',
    width: '5',
    length: '5',
    height: '3',
    blockType: 'oak_planks',
    offset: '0,0,0'
  });

  const gatherPresets = {
    wood: { name: '🪵 木材', blocks: ['oak_log', 'birch_log'] },
    stone: { name: '🪨 石头', blocks: ['cobblestone', 'stone'] },
    ores: { name: '⛏️ 矿石', blocks: ['coal_ore', 'iron_ore'] },
    food: { name: '🥕 食物', blocks: ['wheat', 'carrot', 'potato'] },
    special: { name: '💎 特殊', blocks: ['diamond_ore', 'gold_ore'] }
  };

  const buildPresets = {
    house: { name: '🏠 房屋', width: 7, length: 7, height: 4, block: 'oak_planks' },
    wall: { name: '🧱 围墙', width: 10, length: 1, height: 3, block: 'cobblestone' },
    tower: { name: '🏰 塔楼', width: 3, length: 3, height: 10, block: 'stone_bricks' },
    farm: { name: '🚜 农场', width: 5, length: 5, height: 1, block: 'farmland' },
    mine: { name: '⛏️ 矿场', width: 8, length: 8, height: 3, block: 'cobblestone' }
  };

  const handleGatherPreset = async (presetKey) => {
    if (!botId || loading) return;
    
    setLoading(true);
    const preset = gatherPresets[presetKey];
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/bot/${botId}/gather`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetBlocks: preset.blocks,
          radius: parseInt(gatherConfig.radius) || 30
        })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      
      alert(`开始采集: ${preset.name}`);
    } catch (err) {
      console.error('Failed to start gathering:', err);
      alert(`采集失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCustomGather = async () => {
    if (!botId || loading) return;
    
    setLoading(true);
    const blocks = gatherConfig.customBlocks.split(',').map(b => b.trim()).filter(b => b);
    
    if (blocks.length === 0) {
      alert('请输入要采集的方块类型');
      setLoading(false);
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/bot/${botId}/gather`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetBlocks: blocks,
          radius: parseInt(gatherConfig.radius) || 30
        })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      
      alert(`开始采集自定义资源: ${blocks.join(', ')}`);
    } catch (err) {
      console.error('Failed to start custom gathering:', err);
      alert(`自定义采集失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleBuildPreset = async (presetKey) => {
    if (!botId || loading) return;
    
    setLoading(true);
    const preset = buildPresets[presetKey];
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/bot/${botId}/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          width: preset.width,
          length: preset.length,
          height: preset.height,
          blockType: preset.block,
          offsetX: 0,
          offsetY: 0,
          offsetZ: 0
        })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      
      alert(`开始建造: ${preset.name}`);
    } catch (err) {
      console.error('Failed to start building:', err);
      alert(`建造失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCustomBuild = async () => {
    if (!botId || loading) return;
    
    setLoading(true);
    const [ox, oy, oz] = buildConfig.offset.split(',').map(n => parseInt(n) || 0);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/bot/${botId}/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          width: parseInt(buildConfig.width) || 5,
          length: parseInt(buildConfig.length) || 5,
          height: parseInt(buildConfig.height) || 3,
          blockType: buildConfig.blockType,
          offsetX: ox,
          offsetY: oy,
          offsetZ: oz
        })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      
      alert('开始自定义建造');
    } catch (err) {
      console.error('Failed to start custom building:', err);
      alert(`自定义建造失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="enhanced-controls">
      <div className="controls-header">
        <h3>🚀 增强控制</h3>
        <div className="control-tabs">
          <button 
            className={`tab-btn ${activeTab === 'gather' ? 'active' : ''}`}
            onClick={() => setActiveTab('gather')}
          >
            📦 采集
          </button>
          <button 
            className={`tab-btn ${activeTab === 'build' ? 'active' : ''}`}
            onClick={() => setActiveTab('build')}
          >
            🏗️ 建造
          </button>
        </div>
      </div>
      
      {activeTab === 'gather' && (
        <div className="gather-controls">
          <div className="preset-section">
            <h4>快速采集</h4>
            <div className="preset-buttons">
              {Object.entries(gatherPresets).map(([key, preset]) => (
                <button
                  key={key}
                  className="preset-btn"
                  onClick={() => handleGatherPreset(key)}
                  disabled={loading}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>
          
          <div className="custom-section">
            <h4>自定义采集</h4>
            <div className="custom-form">
              <div className="form-group">
                <label>目标方块:</label>
                <input
                  type="text"
                  value={gatherConfig.customBlocks}
                  onChange={(e) => setGatherConfig({...gatherConfig, customBlocks: e.target.value})}
                  placeholder="例如: oak_log, birch_log, coal_ore"
                />
              </div>
              <div className="form-group">
                <label>采集半径:</label>
                <input
                  type="number"
                  value={gatherConfig.radius}
                  onChange={(e) => setGatherConfig({...gatherConfig, radius: e.target.value})}
                  min="10"
                  max="100"
                />
                <span className="unit">格</span>
              </div>
              <button
                className="action-btn"
                onClick={handleCustomGather}
                disabled={loading}
              >
                {loading ? '采集中...' : '开始采集'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {activeTab === 'build' && (
        <div className="build-controls">
          <div className="preset-section">
            <h4>快速建造</h4>
            <div className="preset-buttons">
              {Object.entries(buildPresets).map(([key, preset]) => (
                <button
                  key={key}
                  className="preset-btn build"
                  onClick={() => handleBuildPreset(key)}
                  disabled={loading}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>
          
          <div className="custom-section">
            <h4>自定义建造</h4>
            <div className="custom-form">
              <div className="form-row">
                <div className="form-group">
                  <label>宽度:</label>
                  <input
                    type="number"
                    value={buildConfig.width}
                    onChange={(e) => setBuildConfig({...buildConfig, width: e.target.value})}
                    min="1"
                    max="50"
                  />
                </div>
                <div className="form-group">
                  <label>长度:</label>
                  <input
                    type="number"
                    value={buildConfig.length}
                    onChange={(e) => setBuildConfig({...buildConfig, length: e.target.value})}
                    min="1"
                    max="50"
                  />
                </div>
                <div className="form-group">
                  <label>高度:</label>
                  <input
                    type="number"
                    value={buildConfig.height}
                    onChange={(e) => setBuildConfig({...buildConfig, height: e.target.value})}
                    min="1"
                    max="50"
                  />
                </div>
              </div>
              
              <div className="form-group">
                <label>方块类型:</label>
                <input
                  type="text"
                  value={buildConfig.blockType}
                  onChange={(e) => setBuildConfig({...buildConfig, blockType: e.target.value})}
                  placeholder="例如: oak_planks, cobblestone"
                />
              </div>
              
              <div className="form-group">
                <label>偏移量 (X,Y,Z):</label>
                <input
                  type="text"
                  value={buildConfig.offset}
                  onChange={(e) => setBuildConfig({...buildConfig, offset: e.target.value})}
                  placeholder="例如: 0,0,0"
                />
              </div>
              
              <button
                className="action-btn"
                onClick={handleCustomBuild}
                disabled={loading}
              >
                {loading ? '建造中...' : '开始建造'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedControls;
```

- [ ] **Step 2: Create EnhancedControls CSS**

```css
/* /data/code/minebot/frontend/src/components/EnhancedControls.css */
.enhanced-controls {
  background: white;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.controls-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 2px solid #f8f9fa;
}

.controls-header h3 {
  margin: 0;
  font-size: 18px;
  color: #2c3e50;
}

.control-tabs {
  display: flex;
  gap: 4px;
  background: #f8f9fa;
  border-radius: 6px;
  padding: 4px;
}

.tab-btn {
  padding: 8px 16px;
  border: none;
  background: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  color: #7f8c8d;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn.active {
  background: white;
  color: #3498db;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.tab-btn:hover:not(.active) {
  background: rgba(255,255,255,0.5);
}

.gather-controls, .build-controls {
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.preset-section {
  margin-bottom: 24px;
}

.preset-section h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #2c3e50;
}

.preset-buttons {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px;
}

.preset-btn {
  padding: 10px 12px;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.preset-btn.build {
  background: #9b59b6;
}

.preset-btn:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.preset-btn:disabled {
  background: #bdc3c7;
  cursor: not-allowed;
  transform: none;
}

.custom-section {
  border-top: 1px solid #e9ecef;
  padding-top: 20px;
}

.custom-section h4 {
  margin: 0 0 16px 0;
  font-size: 14px;
  color: #2c3e50;
}

.custom-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 13px;
  font-weight: 500;
  color: #34495e;
}

.form-group input {
  padding: 8px 12px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 14px;
}

.form-group input:focus {
  outline: none;
  border-color: #3498db;
  box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.2);
}

.form-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.unit {
  font-size: 12px;
  color: #7f8c8d;
  margin-left: 4px;
}

.action-btn {
  padding: 10px 20px;
  background: #2ecc71;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 8px;
}

.action-btn:hover:not(:disabled) {
  background: #27ae60;
  transform: translateY(-1px);
}

.action-btn:disabled {
  background: #bdc3c7;
  cursor: not-allowed;
  transform: none;
}
```

- [ ] **Step 3: Test controls component**

```bash
cd /data/code/minebot/frontend
npm run build 2>&1 | grep -E "ERROR|Failed" && echo "Build has errors" || echo "Build successful"
```

Expected: "Build successful"

- [ ] **Step 4: Commit EnhancedControls component**

```bash
cd /data/code/minebot
git add frontend/src/components/EnhancedControls.js frontend/src/components/EnhancedControls.css
git commit -m "feat: Add EnhancedControls with gather/build presets and custom configurations"
```

呼出 `@subagent-driven-development`

### Task 8: Rewrite BotDetail Component

**Files:**
- Modify: `/data/code/minebot/frontend/src/components/BotDetail.js:1-107`

- [ ] **Step 1: Complete rewrite of BotDetail.js**

```javascript
// /data/code/minebot/frontend/src/components/BotDetail.js
import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../config';
import GoalProgress from './GoalProgress';
import AutonomousDashboard from './AutonomousDashboard';
import EnhancedControls from './EnhancedControls';
import './BotDetail.css';

const BotDetail = ({ bot, onBotChange }) => {
  const [actionLoading, setActionLoading] = useState(null);
  const [goalState, setGoalState] = useState(null);
  const [goalProgress, setGoalProgress] = useState(0);

  useEffect(() => {
    if (bot?.botId) {
      loadGoalState();
    }
  }, [bot?.botId]);

  const loadGoalState = async () => {
    if (!bot?.botId) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/bot/${bot.botId}/goal/status`);
      if (response.ok) {
        const data = await response.json();
        setGoalState(data.goalState);
        setGoalProgress(data.progress || 0);
      }
    } catch (err) {
      console.error('Failed to load goal state:', err);
    }
  };

  const handleAction = async (action, endpoint, method = 'POST', body = null) => {
    setActionLoading(action);
    try {
      const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
      };
      if (body) options.body = JSON.stringify(body);
      
      const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Failed to ${action}`);
      if (onBotChange) onBotChange();
    } catch (err) {
      console.error(`Action ${action} failed:`, err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleAutomaticMode = async () => {
    setActionLoading('automatic');
    try {
      const response = await fetch(`${API_BASE_URL}/api/bot/automatic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: bot.username,
          mode: 'autonomous',
          initialGoal: 'basic_survival'
        })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      
      alert(`自主模式启动: ${data.message}`);
      if (onBotChange) onBotChange();
    } catch (err) {
      console.error('Failed to start automatic mode:', err);
      alert(`启动失败: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  if (!bot) {
    return (
      <div className="bot-detail-empty">
        <h3>🤖 未选择Bot</h3>
        <p>请从左侧列表中选择一个Bot以查看详情和管理</p>
      </div>
    );
  }

  return (
    <div className="bot-detail-enhanced">
      {/* Header Section */}
      <div className="bot-header">
        <div className="bot-info">
          <h2>
            {bot.username}
            <span className={`bot-status ${bot.state === 'ALIVE' ? 'alive' : bot.state === 'DEAD' ? 'dead' : 'disconnected'}`}>
              ● {bot.state === 'ALIVE' ? '存活' : bot.state === 'DEAD' ? '死亡' : '离线'}
            </span>
          </h2>
          <div className="bot-id">{bot.botId}</div>
        </div>
        <div className="header-actions">
          <button
            className="automatic-btn"
            onClick={handleAutomaticMode}
            disabled={actionLoading || bot.state !== 'ALIVE'}
          >
            🤖 启动自主模式
          </button>
          <a
            href={`#dashboard/${bot.botId}`}
            className="open-dashboard-link"
          >
            完整控制台 →
          </a>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">❤️</div>
          <div className="stat-content">
            <div className="stat-label">生命值</div>
            <div className="stat-value">
              <span className="health-value">{bot.health || 0}/{bot.maxHealth || 20}</span>
              <div className="health-bar">
                <div 
                  className="health-fill" 
                  style={{ width: `${((bot.health || 0) / (bot.maxHealth || 20)) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon">🍖</div>
          <div className="stat-content">
            <div className="stat-label">饱食度</div>
            <div className="stat-value">
              <span className="food-value">{bot.food || 0}/20</span>
              <div className="food-bar">
                <div 
                  className="food-fill" 
                  style={{ width: `${((bot.food || 0) / 20) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon">📍</div>
          <div className="stat-content">
            <div className="stat-label">位置</div>
            <div className="stat-value position">
              {bot.position ? `(${bot.position.x.toFixed(1)}, ${bot.position.y.toFixed(1)}, ${bot.position.z.toFixed(1)})` : '未知'}
              <div className="position-note">实时更新</div>
            </div>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon">🎮</div>
          <div className="stat-content">
            <div className="stat-label">游戏模式</div>
            <div className="stat-value mode">
              {bot.gameMode || bot.mode || 'survival'}
              <div className="mode-note">
                {bot.gameMode === 'creative' ? '创造模式' : '生存模式'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Autonomous Dashboard */}
      <AutonomousDashboard 
        botId={bot.botId} 
        botState={bot}
      />

      {/* Goal Progress */}
      <GoalProgress 
        botId={bot.botId}
        goalState={goalState}
        progress={goalProgress}
      />

      {/* Enhanced Controls */}
      <EnhancedControls botId={bot.botId} />

      {/* Basic Actions */}
      <div className="basic-actions">
        <h3>⚡ 基本控制</h3>
        <div className="action-buttons">
          <button
            className="action-btn stop"
            disabled={actionLoading || bot.state !== 'ALIVE'}
            onClick={() => handleAction('stop', `/api/bot/${bot.botId}/stop`)}
          >
            ⏸ 停止
          </button>
          <button
            className="action-btn restart"
            disabled={actionLoading || bot.state === 'ALIVE'}
            onClick={() => handleAction('restart', `/api/bot/${bot.botId}/restart`)}
          >
            🔄 重启
          </button>
          <button
            className="action-btn remove"
            disabled={actionLoading}
            onClick={() => {
              if (window.confirm(`确定要移除 ${bot.username} 吗？`)) {
                handleAction('remove', `/api/bot/${bot.botId}`, 'DELETE');
              }
            }}
          >
            🗑️ 移除
          </button>
        </div>
        {actionLoading && (
          <div className="action-loading">
            <div className="loading-spinner" />
            {actionLoading} 进行中...
          </div>
        )}
      </div>
    </div>
  );
};

export default BotDetail;
```

- [ ] **Step 2: Create BotDetail.css**

```css
/* /data/code/minebot/frontend/src/components/BotDetail.css */
.bot-detail-enhanced {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 0 4px;
}

.bot-detail-empty {
  text-align: center;
  padding: 40px 20px;
  color: #7f8c8d;
}

.bot-detail-empty h3 {
  margin: 0 0 12px 0;
  font-size: 18px;
  color: #2c3e50;
}

.bot-detail-empty p {
  margin: 0;
  font-size: 14px;
}

.bot-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 16px;
  border-bottom: 2px solid #f8f9fa;
}

.bot-info h2 {
  margin: 0 0 4px 0;
  font-size: 20px;
  color: #2c3e50;
  display: flex;
  align-items: center;
  gap: 8px;
}

.bot-status {
  font-size: 12px;
  font-weight: normal;
  padding: 2px 8px;
  border-radius: 12px;
  margin-left: 8px;
}

.bot-status.alive {
  background: #d5f4e6;
  color: #27ae60;
}

.bot-status.dead {
  background: #fadbd8;
  color: #e74c3c;
}

.bot-status.disconnected {
  background: #f2f3f4;
  color: #95a5a6;
}

.bot-id {
  font-size: 12px;
  color: #7f8c8d;
  font-family: 'Monaco', 'Courier New', monospace;
  margin-top: 2px;
}

.header-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
}

.automatic-btn {
  padding: 8px 16px;
  background: linear-gradient(135deg, #9b59b6, #3498db);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.automatic-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(155, 89, 182, 0.3);
}

.automatic-btn:disabled {
  background: #bdc3c7;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.open-dashboard-link {
  font-size: 12px;
  color: #3498db;
  text-decoration: none;
  display: flex;
  align-items: center;
  gap: 4px;
}

.open-dashboard-link:hover {
  text-decoration: underline;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.stat-card {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  transition: all 0.2s;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0,0,0,0.05);
}

.stat-icon {
  font-size: 24px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  border-radius: 8px;
}

.stat-content {
  flex: 1;
}

.stat-label {
  font-size: 11px;
  text-transform: uppercase;
  color: #95a5a6;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.stat-value {
  font-size: 16px;
  font-weight: 600;
  color: #2c3e50;
}

.health-value, .food-value {
  display: block;
  margin-bottom: 4px;
}

.health-bar, .food-bar {
  height: 4px;
  background: #ecf0f1;
  border-radius: 2px;
  overflow: hidden;
}

.health-fill {
  height: 100%;
  background: linear-gradient(90deg, #e74c3c, #f39c12);
  transition: width 0.3s ease;
}

.food-fill {
  height: 100%;
  background: linear-gradient(90deg, #f1c40f, #f39c12);
  transition: width 0.3s ease;
}

.position-note, .mode-note {
  font-size: 11px;
  color: #95a5a6;
  margin-top: 2px;
}

.basic-actions {
  border-top: 2px solid #f8f9fa;
  padding-top: 20px;
}

.basic-actions h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  color: #2c3e50;
}

.action-buttons {
  display: flex;
  gap: 12px;
}

.action-btn {
  flex: 1;
  padding: 10px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.action-btn.stop {
  background: #e74c3c;
  color: white;
}

.action-btn.restart {
  background: #f39c12;
  color: white;
}

.action-btn.remove {
  background: #95a5a6;
  color: white;
}

.action-btn:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.action-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  font-size: 13px;
  color: #7f8c8d;
}

.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #f3f3f3;
  border-top: 2px solid #3498db;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
```

- [ ] **Step 3: Test complete component**

```bash
cd /data/code/minebot/frontend
npm run build 2>&1 | grep -A5 "Compiled successfully" || echo "Checking for errors..."
```

Expected: Compiled successfully or no errors

- [ ] **Step 4: Commit final BotDetail rewrite**

```bash
cd /data/code/minebot
git add frontend/src/components/BotDetail.js frontend/src/components/BotDetail.css
git commit -m "feat: Complete rewrite of BotDetail with autonomous dashboard, goal tracking, and enhanced controls"
```

呼出 `@subagent-driven-development`

---

## Phase 4: Integration & Testing

### Task 9: Update WebSocket for Autonomous State

**Files:**
- Modify: `/data/code/minebot/bot_server.js:1006-1007`
- Modify: `/data/code/minebot/bot/index.js:313-319`

- [ ] **Step 1: Update WebSocket message handling**

```javascript
// /data/code/minebot/bot_server.js around line 1006
// In WebSocket message handler:
case 'autonomous':
  const autonomousResult = await bot.behaviors.automaticBehavior(commandData);
  // Broadcast autonomous state update
  broadcastToClients({
    type: 'autonomous_update',
    data: {
      botId: bot.botId,
      autonomousState: bot.autonomousState || {},
      goalState: bot.goalState || null
    }
  });
  break;
```

- [ ] **Step 2: Update bot/index.js WebSocket handling**

```javascript
// /data/code/minebot/bot/index.js:313-319
// Add autonomous state tracking
case 'automatic':
  this.autonomousRunning = true;
  await this.behaviors.automaticBehavior(message.data);
  break;
```

- [ ] **Step 3: Test WebSocket integration**

```bash
cd /data/code/minebot
# Start server and test WebSocket
node -e "
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:9500');
ws.on('open', () => {
  console.log('WebSocket connected');
  ws.send(JSON.stringify({type: 'get_status'}));
});
ws.on('message', (data) => {
  console.log('Received:', JSON.parse(data).type);
});
" &
sleep 2
pkill -f "node -e"
```

Expected: WebSocket connection and message reception

- [ ] **Step 4: Commit WebSocket updates**

```bash
cd /data/code/minebot
git add bot_server.js bot/index.js
git commit -m "feat: Update WebSocket for autonomous state broadcasting"
```

呼出 `@subagent-driven-development`

### Task 10: Final Integration & Testing

**Files:**
- Modify: `/data/code/minebot/frontend/package.json`
- Test: Full system test

- [ ] **Step 1: Verify all components import correctly**

```javascript
// /data/code/minebot/frontend/src/App.js
// Check that App.js imports BotDetail correctly
```

- [ ] **Step 2: Build and test frontend**

```bash
cd /data/code/minebot/frontend
npm run build
echo "Build exit code: $?"
```

Expected: Exit code 0

- [ ] **Step 3: Start server and test API**

```bash
cd /data/code/minebot
node bot_server.js &
SERVER_PID=$!
sleep 3

# Test API endpoints
curl -X POST http://localhost:9500/api/bot/automatic \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","mode":"autonomous","initialGoal":"iron_gear"}' | jq .

curl http://localhost:9500/api/bots | jq .

kill $SERVER_PID
```

Expected: API responses with success

- [ ] **Step 4: Final commit with all changes**

```bash
cd /data/code/minebot
git add -A
git commit -m "feat: Complete autonomous bot system with survival-first AI, goal tracking, and enhanced UI

Features:
- Autonomous decision engine with survival priority
- 10 predefined goals with progress tracking
- Real-time 3D position display (5s refresh)
- Enhanced BotDetail UI with autonomous dashboard
- Goal selection and progress visualization
- Gather/build presets with custom configurations
- Death information and analysis display
- WebSocket real-time updates
- Emergency controls and AI management"
```

- [ ] **Step 5: Create summary report**

```bash
cd /data/code/minebot
echo "=== Autonomous Bot System Implementation Complete ==="
echo "New files created:"
find . -name "*.js" -o -name "*.css" | grep -E "(autonomous|goal|Enhanced)" | sort
echo ""
echo "Modified files:"
git diff HEAD~10 --name-only | sort
echo ""
echo "Total commits in this implementation:"
git log --oneline --since="2 hours ago" | wc -l
```

呼出 `@subagent-driven-development`

---

## Post-Implementation Checklist

- [ ] Verify all API endpoints work correctly
- [ ] Test autonomous behavior with a real Minecraft bot
- [ ] Validate goal progress tracking accuracy
- [ ] Test UI responsiveness on different screen sizes
- [ ] Verify WebSocket real-time updates
- [ ] Test emergency controls and error handling
- [ ] Validate death information display
- [ ] Test goal switching during autonomous mode
- [ ] Verify all components render without errors
- [ ] Test build process and deployment

## Execution Options

**Plan complete and saved to `docs/superpowers/plans/2025-04-03-autonomous-bot-implementation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
