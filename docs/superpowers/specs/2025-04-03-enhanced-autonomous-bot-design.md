# Enhanced Autonomous Bot System Design

## Overview

Transform the current bot system into a fully autonomous intelligent agent that prioritizes survival, has built-in phased goals, supports user-selectable objectives, and reports progress in real-time. The bot should be fully autonomous by default with an intelligent decision-making algorithm.

## Requirements

### 1. Autonomous Survival-First Algorithm
- **Priority 1: Health & Safety** - Always maintain health > 10, avoid dangerous areas, eat when hungry
- **Priority 2: Basic Resources** - Auto-gather wood, stone, food for immediate survival needs
- **Priority 3: Equipment & Shelter** - Craft tools, build basic shelter for protection
- **Priority 4: Goal Progression** - Work towards current selected goal
- **Priority 5: Exploration** - Explore and map new areas when safe

### 2. 10 Pre-defined Phased Goals (用户可选择)

#### 新手期 (Beginner)
1. **基础生存** - 收集木材×64，石头×64，食物×10，建造3×3庇护所
2. **铁装备** - 制作全套铁装备（剑、镐、斧、铲、盔甲）
3. **下界探险** - 完成下界传送门建造，制作下界装备
4. **自动农场** - 建造小型自动小麦/胡萝卜农场（5×5）

#### 中期 (Intermediate)
5. **钻石装备** - 收集钻石×24，制作全套钻石装备
6. **自动化挖矿** - 建造3层自动挖矿系统（10×10×3）
7. **附魔台** - 制作附魔台，收集经验，附魔关键装备
8. **熔炉阵列** - 建造8熔炉自动熔炼系统

#### 高级 (Advanced)
9. **末地传送门** - 找到要塞，收集末影珍珠，激活传送门
10. **红石自动化** - 建造全自动物品分类和存储系统

### 3. Goal Progress Tracking System
- 每个目标拆分为多个子任务
- 实时显示完成进度（百分比）
- 显示当前进行的子任务
- 显示所需材料和已收集数量
- 支持目标中途变更

### 4. Intelligent Decision-Making Engine
- **状态评估** - 持续评估健康、饥饿、装备、库存、环境威胁
- **动态优先级** - 基于当前状态动态调整行为优先级
- **资源规划** - 智能规划资源收集路径和顺序
- **威胁响应** - 检测并响应怪物威胁（战斗或逃跑）
- **学习适应** - 从失败中学习，避免重复死亡原因

### 5. Enhanced BotDetail UI Components

#### 5.1 Real-time 3D Position Display
- Live position updates every 5 seconds
- Movement history visualization
- Terrain awareness indicators

#### 5.2 Death Information & Analysis
- Prominent death cause display
- Death location and environmental context
- Recommended prevention strategies
- Death statistics and patterns

#### 5.3 Goal Management Panel
- Dropdown with 10 pre-defined goals
- Current goal progress visualization
- Sub-task completion checklist
- Material requirements vs collected
- Change goal button with confirmation

#### 5.4 Autonomous Behavior Dashboard
- Current action: "采集木材", "建造庇护所", "战斗", "探索"
- AI decision reasoning display
- Priority status indicators
- Health/Safety warnings

#### 5.5 Enhanced Control Commands
- **Gather Presets**: 木材, 石头, 矿石, 食物, 特殊资源
- **Build Templates**: 庇护所, 农场, 矿场, 防御工事
- **Crafting Queue**: 装备制作队列和进度
- **Emergency Overrides**: 立即治疗, 逃跑, 暂停AI

## Technical Architecture

### 1. Autonomous Engine Core
```
┌─────────────────────────────────────────┐
│        Goal Manager                      │
│  - Goal tracking & progress              │
│  - Sub-task decomposition                │
│  - Material requirements                 │
└────────────────────┬─────────────────────┘
                     │
┌────────────────────▼─────────────────────┐
│        Decision Engine                    │
│  - State assessment (health, inv, env)   │
│  - Priority calculation                  │
│  - Action selection                      │
│  - Threat response                       │
└────────────────────┬─────────────────────┘
                     │
┌────────────────────▼─────────────────────┐
│        Behavior Executor                  │
│  - Gather resources                      │
│  - Build structures                      │
│  - Craft items                          │
│  - Combat logic                         │
│  - Exploration                          │
└─────────────────────────────────────────┘
```

### 2. Data Model Enhancements
```javascript
// Bot Goal State
const botGoalState = {
  currentGoal: "iron_gear", // 当前目标ID
  progress: 0.65, // 完成进度 0-1
  subTasks: [
    { id: "gather_iron", name: "收集铁矿石", completed: true },
    { id: "build_furnace", name: "建造熔炉", completed: true },
    { id: "smelt_iron", name: "熔炼铁锭", completed: false },
    { id: "craft_gear", name: "制作装备", completed: false }
  ],
  materials: {
    iron_ore: { required: 24, collected: 18 },
    coal: { required: 24, collected: 32 },
    wood: { required: 8, collected: 8 }
  }
};

// Autonomous Behavior State
const autonomousState = {
  currentAction: "gathering",
  actionTarget: "iron_ore",
  priority: "survival", // survival, resource, goal, explore
  decisionReason: "Low iron ore for goal progress",
  healthStatus: "safe", // safe, warning, critical
  threatLevel: "low" // low, medium, high
};
```

### 3. API Extensions
```javascript
// New API endpoints
POST /api/bot/:botId/goal/select      // 选择新目标
GET  /api/bot/:botId/goal/status      // 获取目标进度
POST /api/bot/:botId/ai/pause         // 暂停AI决策
POST /api/bot/:botId/ai/resume        // 恢复AI决策
GET  /api/bot/:botId/ai/decisions     // 获取AI决策日志

// Enhanced automatic mode
POST /api/bot/automatic
{
  "username": "player",
  "mode": "autonomous", // 新增模式
  "initialGoal": "basic_survival" // 初始目标
}
```

## UI Design Mockup

```
┌─────────────────────────────────────────────────────────────┐
│ Bot: testuser                          ● 自动模式运行中     │
│ 目标: 铁装备达成 (65% 完成)                                │
├─────────────────────────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│ │ 生命值   │ │ 饱食度   │ │ 实时位置 │ │ 威胁等级 │       │
│ │ 18/20 🟢 │ │ 15/20 🟡 │ │ Live:5s  │ │ 低 🟢    │       │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│ 位置: X: 42.5, Y: 67.0, Z: -12.3                           │
├─────────────────────────────────────────────────────────────┤
│ 🎯 目标进度: 铁装备达成                                    │
│ ├─✅ 收集铁矿石 (18/24)                                    │
│ ├─✅ 建造熔炉                                              │
│ ├─🔄 熔炼铁锭 (12/24)                                      │
│ └─⏳ 制作装备                                              │
├─────────────────────────────────────────────────────────────┤
│ 🤖 AI决策: 正在采集铁矿石                                  │
│ 原因: 需要更多铁锭完成目标 (还差12个)                      │
├─────────────────────────────────────────────────────────────┤
│ ⚠️  死亡警报: 无                                           │
├─────────────────────────────────────────────────────────────┤
│ 控制面板                                                    │
├─────────────────────────────────────────────────────────────┤
│ [更换目标] 当前: 铁装备达成 ▼                             │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ 1. 基础生存          6. 自动化挖矿                  │   │
│ │ 2. 铁装备           7. 附魔台                      │   │
│ │ 3. 下界探险         8. 熔炉阵列                    │   │
│ │ 4. 自动农场         9. 末地传送门                  │   │
│ │ 5. 钻石装备         10. 红石自动化                 │   │
│ └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│ [📦 快速采集] [🏗️ 快速建造] [⚡ 紧急控制]                │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ 木材  石头  铁矿  食物  金矿                        │   │
│ │ 庇护所 农场  矿场  围墙  塔楼                      │   │
│ │ 立即治疗  逃跑  暂停AI  恢复AI                     │   │
│ └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│ 基础控制: [⏸ 停止] [🔄 重启] [🗑️ 移除]                   │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Strategy

### Phase 1: Core Autonomous Engine
1. 增强behaviors.js中的自动行为算法
2. 实现生存优先决策逻辑
3. 添加状态评估和威胁检测
4. 创建目标管理系统框架

### Phase 2: Goal System & Progress Tracking
1. 定义10个目标的详细任务分解
2. 实现进度跟踪和状态持久化
3. 创建材料需求管理系统
4. 添加目标变更和进度同步

### Phase 3: Enhanced BotDetail UI
1. 重构BotDetail组件支持新功能
2. 添加实时3D位置和状态显示
3. 实现目标进度可视化
4. 添加AI决策显示和控制面板

### Phase 4: API & Integration
1. 扩展后端API支持新功能
2. 添加WebSocket实时更新
3. 实现数据持久化
4. 添加错误处理和恢复机制

## Success Metrics

1. ✅ Bot survival rate > 80% (不再频繁死亡)
2. ✅ Goal completion time < 预期时间20%
3. ✅ AI决策准确率 > 90% (合理的行为选择)
4. ✅ 用户目标变更响应时间 < 2秒
5. ✅ 实时进度更新延迟 < 5秒
6. ✅ UI响应性和易用性评分 > 4/5

## Next Steps

1. Review and approve this enhanced design
2. Create phased implementation plan
3. Implement core autonomous engine
4. Add goal system and progress tracking
5. Build enhanced UI components
6. Test, iterate, and deploy
