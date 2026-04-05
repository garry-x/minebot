# Bot 自我进化系统设计文档

> **版本**: 2.0 (经评审修订)  
> **日期**: 2026-04-05  
> **方法**: 自适应决策引擎 (Adaptive Decision Engine, ADE)  
> **状态**: 已评审修订

## 1. 概述

设计并实现Bot自动化自我进化能力，在Bot运行过程中持续优化达成目标的**路径策略**、**资源采集策略**、**行为决策算法**。系统基于混合指标（成功率、效率、完成时间等）实时调整决策权重，进化数据持久化到数据库，Bot重启后继续进化。

### 1.1 核心原则

- **深度集成**: 重构现有系统，将进化能力嵌入核心决策引擎
- **实时适应**: 每次行动后立即评估并调整权重
- **持久化学习**: 进化数据持久化，重启后保留并继续
- **透明可解释**: 每个进化决策都有明确原因，可追溯
- **安全第一**: 进化不覆盖生存优先级，具备回滚和降级机制

### 1.2 三大进化域

| 域 | 优化目标 | 关键指标 |
|---|---|---|
| **路径优化** | 最小化到达时间，避免失败路径 | 到达时间、失败率、卡住次数 |
| **资源采集** | 最大化单位时间资源获取 | 采集速度、工具损耗、失败率 |
| **行为决策** | 最优决策序列 | 决策成功率、目标完成时间 |

> **注意**: 多Bot协作域暂缓实现。当前代码库无多Bot协调逻辑，需先建立基础进化能力后再扩展。

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
│  │  decideAction()   → 基于学习策略 + 硬编码兜底          │    │
│  │  executeAction()  → 记录经验并实时调整权重              │    │
│  └──────────────────────┬───────────────────────────────┘    │
│                         │                                    │
│  ┌──────────────────────▼───────────────────────────────┐    │
│  │           StrategyEvolutionManager (新增)              │    │
│  │                                                      │    │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐ │    │
│  │  │ Weight      │  │ Experience   │  │ Fitness      │ │    │
│  │  │ Engine      │  │ Logger       │  │ Calculator   │ │    │
│  │  └─────────────┘  └──────────────┘  └──────────────┘ │    │
│  └──────────────────────┬───────────────────────────────┘    │
│                         │                                    │
│  ┌──────────────────────▼───────────────────────────────┐    │
│  │           Evolution Storage (SQLite, 新增表)            │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │           重构现有系统                                 │    │
│  │  pathfinder.js: setEvolutionWeights() → 评分路径       │    │
│  │  behaviors.js: 接收进化回调，记录采集结果               │    │
│  │  goal-system.js: 使用进化策略排序子任务                 │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

## 3. 核心组件

### 3.1 StrategyEvolutionManager (新增文件)

**文件**: `bot/evolution/strategy-manager.js`

职责:
- 协调 WeightEngine、ExperienceLogger、FitnessCalculator
- 管理权重生命周期（加载、保存、重置）
- 提供统一的进化能力入口
- 检测性能退化并触发回滚

核心接口:

```javascript
class StrategyEvolutionManager {
  constructor(botId, options = {})
  getWeights(domain)
  async recordExperience(experience)
  getOptimalAction(domain, context)
  getEvolutionStats()
  async reset()
  async rollbackToSnapshot(snapshotId)
}
```

### 3.2 ExperienceRecord 数据结构

```javascript
{
  type: 'path' | 'resource' | 'behavior',
  context: {
    bot_position: { x: number, y: number, z: number },
    bot_health: number,
    bot_food: number,
    inventory_summary: { [itemName: string]: number },
    current_goal: string | null,
    time_of_day: number,
    nearby_threats: number,
    active_weights: { [dimension: string]: number }
  },
  action: string,
  outcome: {
    success: boolean,
    duration_ms: number,
    resource_cost: number,
    health_change: number,
    error_message: string | null
  },
  timestamp: string
}
```

### 3.3 ActionSuggestion 返回类型

```javascript
{
  action: string,
  target: any,
  confidence: number,
  reason: string
}
```

### 3.4 Weight Engine (新增文件)

**文件**: `bot/evolution/weight-engine.js`

职责:
- 管理权重向量的初始化和归一化
- 执行基于**信用分配**的权重更新
- 确保权重在安全边界内

初始权重 Schema:

```javascript
const WEIGHT_SCHEMA = {
  path: { distance: 0.3, safety: 0.3, speed: 0.2, terrain_type: 0.2 },
  resource: { value: 0.3, proximity: 0.3, safety: 0.2, tool_efficiency: 0.2 },
  behavior: { health_risk: 0.25, resource_urgency: 0.25, goal_progress: 0.25, exploration_value: 0.25 }
};
```

核心接口:

```javascript
class WeightEngine {
  constructor(domain)
  
  getWeights()                    // 返回当前权重向量 { dim1: 0.3, dim2: 0.3, ... }
  update(experience, fitnessScore) // 基于经验更新权重（内部追踪experienceCount）
  reset()                         // 重置为初始值
  isValid()                       // 检查权重是否有效（归一化、边界内）
  getExperienceCount()            // 返回累计经验数
}
```

权重更新算法（修复 experienceCount 作用域问题）:

```javascript
class WeightEngine {
  constructor(domain) {
    this.domain = domain;
    this.weights = { ...WEIGHT_SCHEMA[domain] };
    this.experienceCount = 0;
  }

  getLearningRate() {
    const base = 0.05;
    const minRate = 0.005;
    const decay = 0.9995;
    return Math.max(minRate, base * Math.pow(decay, this.experienceCount));
  }

  update(experience, fitnessScore) {
    const lr = this.getLearningRate();
    const baseline = 0.5;
    const delta = fitnessScore - baseline;
    
    const updated = {};
    const activeWeights = experience.context.active_weights || this.weights;
    const totalWeight = Object.values(activeWeights).reduce((a, b) => a + b, 0);
    
    for (const [dim, weight] of Object.entries(this.weights)) {
      const contributionRatio = (activeWeights[dim] || weight) / totalWeight;
      const credit = delta * contributionRatio;
      updated[dim] = clamp(weight + lr * credit, 0.05, 0.95);
    }
    
    this.weights = normalizeWeights(updated);
    this.experienceCount++;
  }
}
```

### 3.5 Experience Logger (新增文件)

**文件**: `bot/evolution/experience-logger.js`

职责:
- 收集经验记录到内存缓冲区
- 定期批量刷新到数据库
- 失败时持久化到WAL文件而非丢弃

核心接口:

```javascript
class ExperienceLogger {
  constructor(storage)
  async record(experience)
  async flush()
  async query(botId, type, limit)
}
```

### 3.6 Fitness Calculator (新增文件)

**文件**: `bot/evolution/fitness-calculator.js`

职责:
- 为每个进化域计算适应度评分 (0-1)
- 归一化不同域的量纲差异

核心接口:

```javascript
class FitnessCalculator {
  static calcPathFitness(outcome)
  static calcResourceFitness(outcome)
  static calcBehaviorFitness(outcome)
}
```

适应度计算公式:

```javascript
// 路径适应度: 综合成功率、速度、安全性
calcPathFitness(outcome) {
  if (!outcome.success) return 0.1;
  const timeScore = Math.max(0, 1 - (outcome.duration_ms / 60000));
  const healthScore = Math.max(0, 1 + outcome.health_change / 20);
  return 0.6 * timeScore + 0.4 * healthScore;
}

// 资源适应度: 综合成功率、效率、工具损耗
calcResourceFitness(outcome) {
  if (!outcome.success) return 0.1;
  const efficiencyScore = Math.min(1, outcome.resource_gained / (outcome.duration_ms / 1000));
  const costScore = Math.max(0, 1 - outcome.resource_cost / 10);
  return 0.7 * efficiencyScore + 0.3 * costScore;
}

// 行为适应度: 综合成功率和目标贡献
calcBehaviorFitness(outcome) {
  if (!outcome.success) return 0.1;
  return 0.5 + 0.5 * (outcome.duration_ms < 30000 ? 1 : 0.5);
}
```

### 3.7 Evolution Storage (新增文件)

**文件**: `bot/evolution/evolution-storage.js`

职责:
- SQLite CRUD 操作
- 异步批量写入
- 快照管理
- WAL失败回退

核心接口:

```javascript
class EvolutionStorage {
  async saveWeights(botId, domain, weights)  // 使用 INSERT OR REPLACE (UNIQUE约束)
  async loadWeights(botId, domain)           // 返回 { weight_vector, version, updated_at }
  async saveExperience(batch)                // 批量写入
  async saveSnapshot(botId, type, data)      // 创建快照
  async getSnapshots(botId, limit)           // 查询快照历史
  async loadSnapshot(snapshotId)             // 加载快照数据
  async restoreFromWal()                     // 从WAL文件恢复
  async queryExperience(botId, type, limit)  // 查询经验
}
```

### 3.8 getEvolutionStats() 返回类型

```javascript
{
  totalExperiences: number,
  experiencesByDomain: { path: number, resource: number, behavior: number },
  successRates: { path: number, resource: number, behavior: number },
  averageFitness: { path: number, resource: number, behavior: number },
  recentFitness: number[],      // 最近100次适应度评分
  baselineFitness: number,      // 历史基线（首次达到稳定后的平均值）
  currentWeights: {
    path: object, resource: object, behavior: object
  },
  lastSnapshot: { id: number, type: string, created_at: string } | null,
  experienceCount: number       // WeightEngine累计经验数
}
```

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
  weight_vector TEXT NOT NULL CHECK(json_valid(weight_vector)),
  version INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(bot_id, domain),
  FOREIGN KEY (bot_id) REFERENCES bot_states(bot_id)
);
```

### 5.2 experience_log 表

```sql
CREATE TABLE experience_log (
  id INTEGER PRIMARY KEY,
  bot_id TEXT NOT NULL,
  type TEXT NOT NULL,
  context TEXT NOT NULL CHECK(json_valid(context)),
  action TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(json_valid(outcome)),
  success INTEGER NOT NULL,
  fitness_score REAL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bot_id) REFERENCES bot_states(bot_id)
);

CREATE INDEX idx_exp_bot_type ON experience_log(bot_id, type, created_at);
CREATE INDEX idx_exp_success ON experience_log(bot_id, success, created_at);
```

> `success` 和 `fitness_score` 为 first-class 列，支持高效查询。

### 5.3 evolution_snapshots 表

```sql
CREATE TABLE evolution_snapshots (
  id INTEGER PRIMARY KEY,
  bot_id TEXT NOT NULL,
  snapshot_type TEXT NOT NULL CHECK(snapshot_type IN ('weight_update', 'milestone', 'goal_complete', 'pre_rollback', 'performance_degradation')),
  data TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bot_id) REFERENCES bot_states(bot_id)
);

CREATE INDEX idx_weights_bot ON evolution_weights(bot_id, domain);
```

## 6. 权重更新算法

### 6.1 核心算法: 基于信用分配的权重更新

旧算法的问题: 对所有维度应用相同的 gradient，导致归一化后权重无实质变化。

**新算法**: 为每个权重维度计算独立的 credit，基于该维度对结果的贡献程度。

```javascript
// 学习率: 使用缓慢衰减确保持续学习
function getLearningRate(experienceCount) {
  const base = 0.05;
  const minRate = 0.005;
  const decay = 0.9995;
  return Math.max(minRate, base * Math.pow(decay, experienceCount));
}

// 基于信用分配的权重更新
function updateWeights(currentWeights, experience, fitnessScore) {
  const lr = getLearningRate(experienceCount);
  const baseline = 0.5;
  const delta = fitnessScore - baseline;
  
  const updated = {};
  const activeWeights = experience.context.active_weights || currentWeights;
  
  for (const [dim, weight] of Object.entries(currentWeights)) {
    // 信用分配: 根据该维度在决策时的权重占比分配credit
    const totalWeight = Object.values(activeWeights).reduce((a, b) => a + b, 0);
    const contributionRatio = (activeWeights[dim] || weight) / totalWeight;
    
    // 独立维度更新
    const credit = delta * contributionRatio;
    updated[dim] = clamp(weight + lr * credit, 0.05, 0.95);
  }
  
  return normalizeWeights(updated);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeWeights(weights) {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  const normalized = {};
  for (const [key, value] of Object.entries(weights)) {
    normalized[key] = value / sum;
  }
  return normalized;
}
```

### 6.2 安全边界

- **权重范围**: [0.05, 0.95]
- **归一化**: 每次更新后总和=1
- **学习率**: 初始 0.05，最小 0.005，衰减因子 0.9995
- **经验记录上限**: 每域1000条，超出自动清理最旧记录
- **学习率衰减曲线**: 10000次经验后仍保持 ~0.003 的学习率

### 6.3 热身期策略

```javascript
// 经验数 < warmStartThreshold (默认20) 时:
// - 使用保守权重（均匀分布）
// - 不执行权重更新，仅记录经验
// - 决策时降低进化建议的置信度
```

### 6.4 getOptimalAction 算法

```javascript
getOptimalAction(domain, context) {
  const weights = this.getWeights(domain);
  const history = this.experienceLogger.query(this.botId, domain, 100);
  
  // 基于权重过滤历史经验，找出相似上下文的经验
  const similarExperiences = history.filter(exp => {
    return this.contextSimilarity(exp.context, context) > 0.7;
  });
  
  if (similarExperiences.length === 0) {
    return null; // 无历史经验，调用者使用硬编码兜底
  }
  
  // 按适应度排序
  const sorted = similarExperiences.sort((a, b) => b.fitness_score - a.fitness_score);
  const best = sorted[0];
  
  // 置信度 = 历史成功率
  const successRate = similarExperiences.filter(e => e.outcome.success).length / similarExperiences.length;
  
  return {
    action: best.action.split('_')[0],  // 'gather_oak_log' → 'gather'
    target: this.parseActionTarget(best.action),
    confidence: successRate,
    reason: `${domain} ${best.action} had ${Math.round(successRate * 100)}% success rate (${similarExperiences.length} experiences)`
  };
}
```

### 6.5 性能退化检测与回滚

```javascript
class PerformanceMonitor {
  constructor(storage, botId) {
    this.storage = storage;
    this.botId = botId;
    this.baselineFitness = null;
  }

  // 调用时机: 每记录10条经验时调用
  async checkRegression(domain) {
    const recent = await this.storage.queryExperience(this.botId, domain, 50);
    if (recent.length < 20) return false; // 样本不足
    
    const recentAvg = recent.reduce((sum, e) => sum + (e.fitness_score || 0), 0) / recent.length;
    
    // 初始化基线: 前50条经验的平均适应度
    if (!this.baselineFitness) {
      const initial = await this.storage.queryExperience(this.botId, domain, 100);
      this.baselineFitness = initial.length > 0
        ? initial.reduce((sum, e) => sum + (e.fitness_score || 0), 0) / initial.length
        : 0.5;
    }
    
    return recentAvg < this.baselineFitness * 0.7; // 退化 >30%
  }

  // 触发退化时执行回滚
  async rollbackOnRegression() {
    // 1. 创建回滚前快照
    await this.storage.saveSnapshot(this.botId, 'pre_rollback', {
      weights: this.weightEngine.getWeights(),
      reason: 'performance_degradation',
      currentFitness: this.baselineFitness * 0.7
    });
    
    // 2. 回滚到上一个里程碑快照
    const snapshots = await this.storage.getSnapshots(this.botId, 10);
    const milestone = snapshots.find(s => s.snapshot_type === 'milestone');
    if (milestone) {
      const data = JSON.parse(milestone.data);
      await this.weightEngine.setWeights(data.weights);
      await this.storage.saveWeights(this.botId, this.domain, data.weights);
    } else {
      // 无快照则重置
      await this.weightEngine.reset();
    }
    
    // 3. 记录回滚事件
    console.log(`[Evolution] Rolled back due to performance regression`);
  }
}
```

### 6.6 经验记录清理

- 触发时机: 每次 `flush()` 后检查
- 规则: 每域保留最近1000条，删除最旧记录
- 删除前计算该域统计摘要并存储到快照

### 6.7 快照数据格式

```javascript
// snapshot data 列 JSON 结构
{
  version: number,
  weights: { [domain: string]: { [dim: string]: number } },
  experienceCount: number,
  successRates: { [domain: string]: number },
  timestamp: string
}
```

## 7. 回滚机制

### 7.1 rollbackToSnapshot 行为

- 恢复权重到快照状态
- **不删除**快照之后的经验记录（保留学习历史）
- 更新 `evolution_weights.version`（+1）
- 创建 `pre_rollback` 类型快照记录回滚事件
- 防止回滚循环: 同一版本不连续回滚2次

### 7.2 触发方式

- 手动: `POST /api/bot/:botId/evolution/rollback`
- 自动: `PerformanceMonitor.checkRegression()` 检测到退化

## 8. 数据库迁移策略

### 8.1 迁移版本表

```sql
CREATE TABLE IF NOT EXISTS evolution_migrations (
  id INTEGER PRIMARY KEY,
  version INTEGER NOT NULL UNIQUE,
  description TEXT NOT NULL,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 8.2 迁移脚本

```javascript
const MIGRATIONS = [
  {
    version: 1,
    description: 'Initial evolution tables',
    up: async (db) => {
      await db.run(`CREATE TABLE evolution_weights ...`);
      await db.run(`CREATE TABLE experience_log ...`);
      await db.run(`CREATE TABLE evolution_snapshots ...`);
    }
  },
  {
    version: 2,
    description: 'Add created_at to evolution_weights',
    up: async (db) => {
      await db.run(`ALTER TABLE evolution_weights ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
    }
  }
];

async function runMigrations(db) {
  await db.run(`CREATE TABLE IF NOT EXISTS evolution_migrations (...)`);
  const applied = await db.all(`SELECT version FROM evolution_migrations`);
  const appliedVersions = new Set(applied.map(r => r.version));
  
  for (const migration of MIGRATIONS) {
    if (!appliedVersions.has(migration.version)) {
      console.log(`[Evolution] Running migration v${migration.version}: ${migration.description}`);
      await migration.up(db);
      await db.run(`INSERT INTO evolution_migrations (version, description) VALUES (?, ?)`,
        [migration.version, migration.description]);
    }
  }
}
```

### 8.3 回滚迁移

- 每个迁移脚本可选定义 `down` 函数
- 迁移失败时自动执行 `down` 回滚
- 日志记录所有迁移操作

## 11. 持久化策略

- **权重**: 每次更新后立即写入SQLite
- **经验记录**: 批量写入，每10条或每30秒刷新
- **失败回退**: 批量写入失败时写入WAL文件，下次启动时恢复
- **快照**: 目标完成/每100次经验/权重重大变化/性能退化时

## 12. 错误处理

| 场景 | 处理方式 | 恢复策略 |
|------|---------|---------|
| 权重数据损坏 | 回退到默认权重 | 从最近快照恢复 |
| 经验写入失败 | 写入WAL文件 | 下次启动时恢复 |
| 学习率异常 (NaN) | 重置为初始值 | 记录警告日志 |
| 权重发散 | 强制归一化 | 创建保护快照 |
| 数据库锁定 | 队列等待，最多5秒 | 超时写WAL文件 |
| 进化系统崩溃 | 降级到基础规则引擎 | 不影响Bot核心功能 |
| 权重Schema变更 | 迁移函数补全缺失维度 | 记录迁移日志 |

### 8.1 性能退化检测与回滚

```javascript
// 滑动窗口检测: 最近50次经验平均适应度 vs 历史基线
function detectPerformanceRegression(stats) {
  const recentAvg = stats.recentFitness.slice(-50).reduce((a,b) => a+b, 0) / 50;
  const baselineAvg = stats.baselineFitness;
  return recentAvg < baselineAvg * 0.7; // 退化超过30%触发回滚
}
```

## 9. 重构计划

### 9.1 autonomous-engine.js

当前构造函数: `constructor(bot, pathfinder, behaviors)`

新构造函数: `constructor(bot, pathfinder, behaviors, evolutionManager = null)`

- 如果 `evolutionManager` 为 null，使用原有硬编码逻辑（向后兼容）
- `calculatePriority()` 改为从进化系统获取动态权重
- `decideAction()` 调用 `evolutionManager.getOptimalAction()` 获取建议，与硬编码规则合并
- `executeAction()` 完成后调用 `evolutionManager.recordExperience()`

调用点更新 (`behaviors.js:automaticBehavior`):

```javascript
// 旧代码
const engine = new AutonomousEngine(bot, pathfinder, this);

// 新代码
const evoManager = new StrategyEvolutionManager(bot.botId);
const engine = new AutonomousEngine(bot, pathfinder, this, evoManager);
```

### 9.2 pathfinder.js

- 新增 `setEvolutionWeights(weights)` 方法
- `moveTo()` 使用安全/速度权重调整路径评分
- 路径完成后通过回调报告结果到进化系统

### 9.3 behaviors.js

- `gatherResources()` 完成后通过回调报告采集结果
- 回调通过 options 参数传入，避免循环依赖:

```javascript
gatherResources({ targetBlocks, radius, onResult: (result) => evoManager.recordExperience(result) })
```

### 9.4 bot/index.js

- spawn 回调中初始化 StrategyEvolutionManager
- 加载持久化权重
- 注入到 AutonomousEngine

### 9.5 config/db.js

- 添加进化表的初始化调用

### 9.6 bot_server.js

- 新增进化API端点

## 10. 测试策略

### 10.1 单元测试

- WeightEngine: 初始权重、归一化、安全边界、信用分配更新
- FitnessCalculator: 各域适应度计算（成功/失败/边界条件）
- EvolutionStorage: 持久化与加载、WAL恢复、UNIQUE约束

### 10.2 集成测试

- 经验→评分→权重更新完整流程
- 50次经验后权重向稳定方向收敛（非绝对值收敛，而是趋势验证）
- 性能退化检测触发回滚
- 热身期策略生效

### 10.3 回归测试

- evolutionManager=null 时 autonomous-engine.js 行为不变
- pathfinder.js 无进化权重时行为不变
- behaviors.js 无 onResult 回调时行为不变
- Bot在进化系统异常时仍能正常生存

### 10.4 性能测试

- 单次经验记录+权重更新 < 10ms
- 不影响Bot 5秒决策循环

### 10.5 覆盖目标

- **>85% 代码覆盖率**

## 11. 成功指标

| 指标 | 目标 |
|------|------|
| 路径优化 | 到达时间减少 >20% |
| 资源采集 | 单位时间采集量增加 >15% |
| 决策质量 | 决策成功率 >90% |
| 目标完成 | 完成时间缩短 >25% |
| 学习收敛 | 50次经验内权重向稳定方向演化 |
| 系统稳定性 | 零生产故障，降级机制100%有效 |

## 12. 文件结构

### 新增文件
- `bot/evolution/strategy-manager.js`
- `bot/evolution/weight-engine.js`
- `bot/evolution/experience-logger.js`
- `bot/evolution/fitness-calculator.js`
- `bot/evolution/evolution-storage.js`
- `bot/evolution/evolution.test.js`

### 修改文件
- `bot/autonomous-engine.js` - 可选注入进化感知决策
- `bot/pathfinder.js` - 支持进化权重
- `bot/behaviors.js` - 支持 onResult 回调
- `bot/index.js` - 初始化进化系统
- `config/db.js` - 添加进化表初始化
- `bot_server.js` - 添加进化API端点

## 13. API 扩展

```
GET  /api/bot/:botId/evolution/stats     - 获取进化统计
GET  /api/bot/:botId/evolution/weights   - 获取当前权重
POST /api/bot/:botId/evolution/reset     - 重置进化数据
GET  /api/bot/:botId/evolution/history   - 获取经验历史
POST /api/bot/:botId/evolution/rollback  - 回滚到指定快照
```

## 14. 多Bot隔离策略

- 每个Bot的进化数据独立存储（bot_id 隔离）
- 不共享权重或经验
- 未来可扩展为跨Bot学习（共享基线权重）

## 15. 域间冲突处理

- 各域权重独立管理，互不影响
- 行为决策域可以引用路径/资源权重作为输入，但不修改它们
- 如果域间出现冲突（如行为决策需要降低安全性权重但路径域提高了），各域保持独立演化

## 16. 安全考虑

- 所有进化API端点需要认证
- reset 操作需要确认
- 权重修改审计日志记录
