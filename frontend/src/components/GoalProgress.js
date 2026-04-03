import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../config';
import './GoalProgress.css';

const GoalProgress = ({ botId, goalState, progress }) => {
  const [goals, setGoals] = useState([]);
  const [selectedGoal, setSelectedGoal] = useState(goalState?.goalId || 'basic_survival');
  const [changingGoal, setChangingGoal] = useState(false);

  useEffect(() => {
    const loadGoals = async () => {
      try {
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
      window.location.reload();
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
