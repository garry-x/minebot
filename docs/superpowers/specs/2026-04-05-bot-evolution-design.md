# Bot 自我进化系统设计文档

> **版本**: 1.0  
> **日期**: 2026-04-05  
> **方法**: 自适应决策引擎 (Adaptive Decision Engine, ADE)  
> **状态**: 待评审

## 1. 概述

设计并实现Bot自动化自我进化能力，在Bot运行过程中持续优化达成目标的**路径策略**、**资源采集策略**、**行为决策算法**以及**多Bot协作策略**。系统基于混合指标（成功率、效率、完成时间等）实时调整决策权重，进化数据持久化到数据库，Bot重启后继续进化。

### 1.1 核心原则

- **深度集成**: 重构现有系统，将进化能力嵌入核心决策引擎
- **实时适应**: 每次行动后立即评估并调整权重
- **持久化学习**: 进化数据持久化，重启后保留并继续
- **透明可解释**: 每个进化决策都有明确原因，可追溯
- **安全第一**: 进化不覆盖生存优先级

### 1.2 四大进化域

| 域 | 优化目标 | 关键指标 |
|---|---|---|
| **路径优化** | 最小化到达时间，避免失败路径 | 到达时间、失败率、卡住次数 |
| **资源采集** | 最大化单位时间资源获取 | 采集速度、工具损耗、失败率 |
| **行为决策** | 最优决策序列 | 决策成功率、目标完成时间 |
| **多Bot协作** | 最小化总完成时间 | 任务分配效率、冲突次数 |

## 2. 系统架构

```
┌──────────────────────────────────────────────────────────────┐
│                  Bot 进化式决策系统                            │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │      Evolution-Aware Autonomous Engine (重构)         │    │
│  │                                                      │    │
│  │  assessState()    → 加入进化上下文                     │    │
│  │  calculatePriority() → 权重由进化系统动态提供           │    │
│  │  decideAction()   → 基于学习策略而非硬编码              │    │
│  │  executeAction()  → 记录经验并实时调整权重              │    │
│  └──────────────────────┬───────────────────────────────┘    │
│                         │                                    │
│  ┌──────────────────────▼───────────────────────────────┐    │
│  │           Strategy Evolution Manager (新增)            │    │
│  │                                                      │    │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐ │    │
│  │  │ Weight      │  │ Experience   │  │ Fitness      │ │    │
│  │  │ Engine      │  │ Logger       │  │ Calculator   │ │    │
│  │  └─────────────┘  └──────────────┘  └──────────────┘ │    │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐ │    │
│  │  │ Path        │  │ Resource     │  │ Behavior     │ │    │
│  │  │ Optimizer   │  │ Optimizer    │  │ Optimizer    │ │    │
│  │  └─────────────┘  └──────────────┘  └──────────────┘ │    │
│  └──────────────────────┬───────────────────────────────┘    │
│                         │                                    │
│  ┌──────────────────────▼───────────────────────────────┐    │
│  │           Evolution Storage (SQLite, 新增表)            │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │           重构现有系统                                 │    │
│  │  pathfinder.js: 支持进化权重                           │    │
│  │  behaviors.js: 支持进化采集策略                        │    │
│  │  goal-system.js: 支持进化目标规划                      │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

## 3. 核心组件

### 3.1 Strategy Evolution Manager (新增文件)

**文件**: `bot/evolution/strategy-manager.js`

职责:
- 协调四大优化器
- 管理权重生命周期
- 触发经验记录与权重更新

核心接口:

```javascript
class StrategyEvolutionManager {
  constructor(botId)
  getWeights(domain)           // 返回当前策略权重
  recordExperience(experience) // 记录经验并触发权重更新
  getOptimalAction(domain, context) // 基于学习返回最优决策
  getEvolutionStats()          // 返回进化统计信息
}
```

### 3.2 Weight Engine (新增文件)

**文件**: `bot/evolution/weight-engine.js`

职责:
- 管理权重向量
- 执行权重更新计算
- 确保归一化和安全边界

初始权重 Schema:

```javascript
const WEIGHT_SCHEMA = {
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
  },
  collaboration: {
    task_efficiency: 0.3,
    communication_cost: 0.2,
    redundancy_reduction: 0.25,
    specialization: 0.25
  }
};
```

### 3.3 Experience Logger (新增文件)

**文件**: `bot/evolution/experience-logger.js`

职责:
- 记录每次行动的上下文、行动、结果
- 批量写入经验记录

数据结构:

```javascript
{
  type: 'path|resource|behavior|collaboration',
  context: { /* 决策时上下文 */ },
  action: '具体行动描述',
  outcome: {
    success: true/false,
    duration_ms: number,
    resource_cost: number,
    health_change: number
  }
}
```

### 3.4 Fitness Calculator (新增文件)

**文件**: `bot/evolution/fitness-calculator.js`

职责:
- 计算经验适应度评分
- 为不同域提供专门的适应度函数

### 3.5 Evolution Storage (新增文件)

**文件**: `bot/evolution/evolution-storage.js`

职责:
- SQLite CRUD 操作
- 异步批量写入
- 快照管理

## 4. 数据流

```
行动开始
  │
  ▼
┌─────────────────────────────┐
│  AutonomousEngine.decide()  │  请求权重
│  ↓                          │
│  StrategyEvo.getWeights()   │  从内存/DB加载
│  ↓                          │
│  返回当前最优权重向量         │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│  基于权重执行决策             │
│  pathfinder.moveTo() 等       │
└──────────────┬──────────────┘
               │
               ▼ (行动完成)
┌─────────────────────────────┐
│  ExperienceLogger.record()  │  记录结果
│  ↓                          │
│  FitnessCalc.evaluate()     │  计算适应度评分
│  ↓                          │
│  WeightEngine.adjust()      │  实时更新权重
│  ↓                          │
│  Storage.persistAsync()     │  异步写入SQLite
└─────────────────────────────┘
```

## 5. 数据库设计

### 5.1 evolution_weights 表

```sql
CREATE TABLE evolution_weights (
  id INTEGER PRIMARY KEY,
  bot_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  weight_vector TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bot_id) REFERENCES bot_states(bot_id)
);
```

### 5.2 experience_log 表

```sql
CREATE TABLE experience_log (
  id INTEGER PRIMARY KEY,
  bot_id TEXT NOT NULL,
  type TEXT NOT NULL,
  context TEXT NOT NULL,
  action TEXT NOT NULL,
  outcome TEXT NOT NULL,
  fitness_score REAL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bot_id) REFERENCES bot_states(bot_id)
);

CREATE INDEX idx_exp_bot_type ON experience_log(bot_id, type, created_at);
```

### 5.3 evolution_snapshots 表

```sql
CREATE TABLE evolution_snapshots (
  id INTEGER PRIMARY KEY,
  bot_id TEXT NOT NULL,
  snapshot_type TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bot_id) REFERENCES bot_states(bot_id)
);

CREATE INDEX idx_weights_bot ON evolution_weights(bot_id, domain);
```

## 6. 权重更新算法

```javascript
// 学习率衰减
function getLearningRate(experienceCount) {
  return 0.1 * Math.pow(0.999, experienceCount);
}

// 权重更新
function updateWeights(currentWeights, experience) {
  const lr = getLearningRate(experienceCount);
  const fitness = calculateFitness(experience.outcome);
  const baseline = 0.5;
  
  for (const [key, weight] of Object.entries(currentWeights)) {
    const gradient = fitness - baseline;
    currentWeights[key] = clamp(weight + lr * gradient, 0.05, 0.95);
  }
  
  return normalizeWeights(currentWeights);
}
```

### 安全边界

- **权重范围**: [0.05, 0.95]
- **归一化**: 每次更新后总和=1
- **学习率上限**: 0.1
- **经验记录上限**: 每域1000条

## 7. 持久化策略

- **权重**: 每次更新后立即写入SQLite
- **经验记录**: 批量写入，每10条或每30秒刷新
- **快照**: 目标完成/每100次经验/权重重大变化时

## 8. 错误处理

| 场景 | 处理方式 | 恢复策略 |
|------|---------|---------|
| 权重数据损坏 | 回退到默认权重 | 从最近快照恢复 |
| 经验写入失败 | 内存缓冲，重试3次 | 失败则丢弃 |
| 学习率异常 | 重置为初始值 | 记录警告 |
| 权重发散 | 强制归一化 | 创建保护快照 |
| 数据库锁定 | 队列等待，最多5秒 | 超时降级 |
| 进化系统崩溃 | 降级到基础规则 | 不影响核心功能 |

## 9. 重构计划

### 9.1 autonomous-engine.js

- 构造函数注入 StrategyEvolutionManager
- calculatePriority() 使用动态权重
- decideAction() 调用 getOptimalAction()
- executeAction() 记录经验

### 9.2 pathfinder.js

- 添加 setEvolutionWeights(weights) 方法
- moveTo() 使用安全权重选择路径
- 记录路径结果到经验系统

### 9.3 behaviors.js

- gatherResources() 使用进化策略选择目标
- 记录采集结果到经验系统
- buildStructure() 优化建造顺序

### 9.4 bot/index.js

- 初始化 StrategyEvolutionManager
- 加载持久化权重
- 注入到各子系统

## 10. 测试策略

### 10.1 单元测试

- WeightEngine: 初始权重、归一化、安全边界
- FitnessCalculator: 各域适应度计算
- EvolutionStorage: 持久化与加载

### 10.2 集成测试

- 经验→评分→权重更新完整流程
- 100次模拟行动后权重收敛验证

### 10.3 覆盖目标

- **>85% 代码覆盖率**
- 回归测试确保不破坏现有功能

## 11. 成功指标

| 指标 | 目标 |
|------|------|
| 路径优化 | 到达时间减少 >20% |
| 资源采集 | 单位时间采集量增加 >15% |
| 决策质量 | 决策成功率 >90% |
| 目标完成 | 完成时间缩短 >25% |
| 学习收敛 | 50次经验内权重稳定 |
| 系统稳定性 | 零生产故障，降级机制100%有效 |

## 12. 文件结构

### 新增文件
- `bot/evolution/strategy-manager.js`
- `bot/evolution/weight-engine.js`
- `bot/evolution/experience-logger.js`
- `bot/evolution/fitness-calculator.js`
- `bot/evolution/evolution-storage.js`
- `bot/evolution/evolution.test.js`
- `config/models/EvolutionState.js`

### 修改文件
- `bot/autonomous-engine.js` - 集成进化感知决策
- `bot/pathfinder.js` - 支持进化权重
- `bot/behaviors.js` - 支持进化采集策略
- `bot/index.js` - 初始化进化系统
- `config/db.js` - 添加进化表初始化
- `bot_server.js` - 添加进化API端点

## 13. API 扩展

```
GET  /api/bot/:botId/evolution/stats     - 获取进化统计
GET  /api/bot/:botId/evolution/weights   - 获取当前权重
POST /api/bot/:botId/evolution/reset     - 重置进化数据
GET  /api/bot/:botId/evolution/history   - 获取经验历史
```
