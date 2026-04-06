# MineBot Admin Console 设计文档

## 概述

### 项目背景
MineBot项目已从Web+CLI混合架构成功转换为纯CLI架构。为了提供更便捷的系统管理和监控体验，需要在现有CLI基础上实现一个交互式管理控制台。

### 设计目标
1. 在现有CLI基础上提供交互式管理界面
2. 保持项目纯CLI架构，不引入Web依赖
3. 提供更直观的系统状态监控和管理功能
4. 与现有CLI命令无缝集成
5. 提供良好的终端用户体验

## 架构设计

### 系统架构
```
┌─────────────────────────────────────────────┐
│            Admin Console Module             │
├─────────────────────────────────────────────┤
│  Console Class   │  Command Parser          │
│  UI Manager      │  Session Manager         │
└─────────────────────────────────────────────┘
         │                     │
         ▼                     ▼
┌─────────────────────────────────────────────┐
│          Existing CLI System                │
│  (bot, mc, config, server, etc. subsystems) │
└─────────────────────────────────────────────┘
         │                     │
         ▼                     ▼
┌─────────────────────────────────────────────┐
│          Bot Server API                     │
│          Minecraft Server                   │
└─────────────────────────────────────────────┘
```

### 核心组件
1. **Console Class** - 主控制台类，管理交互状态和生命周期
2. **Command Parser** - 命令解析器，与现有CLI命令集成
3. **UI Manager** - 界面管理器，处理显示、布局和交互
4. **Session Manager** - 会话管理器，保持用户状态和上下文

### 技术栈
- **运行时**: Node.js (与现有项目一致)
- **UI库**: readline (Node.js内置)，chalk (已在使用)
- **架构**: 模块化设计，与现有CLI集成
- **无外部新依赖**

## 功能设计

### 主要功能模块

#### 1. 仪表盘 (Dashboard)
- 系统状态概览
- 服务器状态（Bot Server, Minecraft Server）
- Bot统计信息（活跃数量、状态分布）
- 资源使用情况（内存、CPU）
- 最近活动日志

#### 2. Bot管理 (Bot Management)
- 交互式Bot列表查看
- Bot启动/停止/重启
- Bot实时监控
- Bot详细信息查看
- 批量操作支持

#### 3. 服务器管理 (Server Control)
- 服务器启停控制
- 实时日志查看
- 服务器状态监控
- 配置查看和修改

#### 4. 配置管理 (Configuration)
- 环境变量查看
- 配置修改（交互式编辑）
- 配置验证和保存
- 配置备份和恢复

#### 5. 实时监控 (Real-time Watch)
- 多Bot实时状态显示
- 健康值、位置、状态监控
- 自定义更新频率
- 告警和通知

#### 6. 系统日志 (System Logs)
- 日志文件查看
- 实时日志跟踪
- 日志过滤和搜索
- 日志级别控制

### 交互特性
1. **彩色输出** - 使用现有chalk库，保持一致性
2. **快捷键支持** - Ctrl+C退出，Tab命令补全
3. **命令历史** - 上下箭头导航历史命令
4. **实时更新** - 状态自动刷新（可配置频率）
5. **分页显示** - 长列表分页，支持搜索
6. **上下文帮助** - 上下文相关的帮助信息

## 界面设计

### 主界面
```
┌─────────────────────────────────────────────┐
│ MineBot Admin Console v1.0                  │
│─────────────────────────────────────────────│
│ Server: ✓ Running | Bots: 3 | MC: ✓ Running │
│─────────────────────────────────────────────│
│ [1] Dashboard      [2] Bot Management       │
│ [3] Server Control [4] Configuration        │
│ [5] Real-time Watch [6] System Logs         │
│ [7] Help           [8] Exit                 │
│─────────────────────────────────────────────│
│ Enter command (help for options, exit to quit): │
│ > _                                          │
└─────────────────────────────────────────────┘
```

### 仪表盘视图
```
┌─────────────────────────────────────────────┐
│ Dashboard - System Status                    │
│─────────────────────────────────────────────│
│ Bot Server:    ✓ Running (uptime: 2h 15m)   │
│ MC Server:     ✓ Running (players: 0/20)    │
│ Active Bots:   3                            │
│ Total Memory:  1.2 GB / 4.0 GB              │
│ CPU Usage:     15%                          │
│─────────────────────────────────────────────│
│ Recent Activity:                            │
│ • 15:32: Bot01 started gathering            │
│ • 15:28: Bot02 completed building           │
│ • 15:25: Server restarted                   │
│─────────────────────────────────────────────│
│ Press 'm' for menu, 'q' to quit dashboard   │
└─────────────────────────────────────────────┘
```

### Bot管理视图
```
┌─────────────────────────────────────────────┐
│ Bot Management - Active Bots (3)            │
│─────────────────────────────────────────────│
│ [1] Bot01 (bot_xxxx)                        │
│     State: ✓ ALIVE | Health: 18/20          │
│     Position: 12.5, 64.0, -8.3              │
│                                             │
│ [2] Bot02 (bot_yyyy)                        │
│     State: ✓ ALIVE | Health: 20/20          │
│     Position: 45.2, 67.0, 12.1              │
│                                             │
│ [3] Bot03 (bot_zzzz)                        │
│     State: ⚠ IDLE | Health: 15/20          │
│     Position: -23.4, 65.0, 34.5             │
│─────────────────────────────────────────────│
│ Commands: start <id> | stop <id> | watch <id> │
│          list | refresh | back               │
│ > _                                          │
└─────────────────────────────────────────────┘
```

## 技术实现

### 文件结构
```
cli.js
├── Existing CLI functions
└── New Admin Console module
    ├── consoleMain() - 入口函数
    ├── Console class
    │   ├── constructor()
    │   ├── start()
    │   ├── displayMenu()
    │   ├── handleCommand()
    │   └── cleanup()
    ├── Dashboard module
    ├── BotManager module
    ├── ServerControl module
    └── helpers/
        ├── ui.js - UI辅助函数
        ├── parser.js - 命令解析
        └── session.js - 会话管理
```

### 关键实现点

#### 1. 控制台生命周期管理
```javascript
class Console {
  constructor() {
    this.rl = null;
    this.session = {};
    this.isRunning = false;
  }
  
  async start() {
    // 初始化readline
    // 显示欢迎界面
    // 启动主循环
  }
  
  async cleanup() {
    // 清理资源
    // 恢复终端状态
  }
}
```

#### 2. 命令解析和路由
```javascript
async handleCommand(input) {
  const [cmd, ...args] = input.trim().split(/\s+/);
  
  switch(cmd.toLowerCase()) {
    case '1':
    case 'dashboard':
      await this.showDashboard();
      break;
    case '2':
    case 'bot':
      await this.showBotManagement();
      break;
    // ... 其他命令
    default:
      // 尝试执行现有CLI命令
      await this.executeCliCommand(cmd, args);
  }
}
```

#### 3. 与现有CLI集成
```javascript
async executeCliCommand(command, args) {
  // 映射到现有CLI函数
  const commandMap = {
    'bot list': botList,
    'server status': checkServerStatus,
    'config show': showConfig,
    // ... 其他映射
  };
  
  const fullCommand = `${command} ${args.join(' ')}`.trim();
  const handler = this.findHandler(fullCommand);
  
  if (handler) {
    await handler();
  } else {
    console.log(`Unknown command: ${command}`);
  }
}
```

#### 4. 实时状态更新
```javascript
class StatusMonitor {
  constructor(updateInterval = 5000) {
    this.interval = updateInterval;
    this.timer = null;
    this.subscribers = [];
  }
  
  start() {
    this.timer = setInterval(async () => {
      const status = await this.fetchSystemStatus();
      this.notifySubscribers(status);
    }, this.interval);
  }
  
  subscribe(callback) {
    this.subscribers.push(callback);
  }
}
```

### 错误处理
1. **网络错误** - API调用失败时的优雅降级
2. **用户输入错误** - 友好的错误提示和重试
3. **资源清理** - 确保退出时清理所有资源
4. **状态恢复** - 错误后恢复到可用状态

### 性能考虑
1. **内存使用** - 避免内存泄漏，定期清理
2. **更新频率** - 可配置的更新间隔，避免过度请求
3. **响应时间** - 确保用户交互的响应性
4. **并发处理** - 合理处理多个异步操作

## 集成计划

### 阶段1：基础框架（预计：1-2天）
1. 实现Console类和基本生命周期
2. 实现主菜单和命令路由
3. 集成现有CLI命令执行

### 阶段2：核心功能（预计：2-3天）
1. 实现仪表盘模块
2. 实现Bot管理模块
3. 实现服务器控制模块

### 阶段3：增强功能（预计：1-2天）
1. 实现实时监控
2. 实现配置管理
3. 实现系统日志查看

### 阶段4：优化和测试（预计：1天）
1. 性能优化
2. 错误处理完善
3. 用户测试和反馈

## 成功标准

### 功能标准
1. ✅ 所有现有CLI功能可通过控制台访问
2. ✅ 提供交互式仪表盘和状态监控
3. ✅ 支持实时Bot监控和操作
4. ✅ 提供友好的错误处理和帮助信息
5. ✅ 保持与现有CLI命令的兼容性

### 技术标准
1. ✅ 无新增外部依赖
2. ✅ 代码结构清晰，易于维护
3. ✅ 良好的错误处理和恢复机制
4. ✅ 合理的性能表现
5. ✅ 完整的测试覆盖

### 用户体验标准
1. ✅ 直观的界面和导航
2. ✅ 响应迅速的用户交互
3. ✅ 清晰的反馈和提示
4. ✅ 易于学习和使用
5. ✅ 稳定的运行表现

## 风险与缓解

### 技术风险
1. **readline兼容性** - 使用标准Node.js readline，确保跨平台兼容性
2. **内存泄漏** - 实现完善的资源清理机制
3. **性能问题** - 优化更新频率，避免过度请求

### 项目风险
1. **范围蔓延** - 严格遵循设计文档，分阶段实施
2. **集成问题** - 充分测试与现有CLI的集成
3. **用户体验** - 早期用户测试，收集反馈

### 缓解措施
1. 分阶段实施，每阶段都有可验证的成果
2. 保持与现有架构的一致性
3. 充分的测试和验证
4. 渐进式功能增强

## 附录

### 命令参考
```
控制台命令：
  dashboard, 1      - 显示系统仪表盘
  bot, 2           - Bot管理
  server, 3        - 服务器控制
  config, 4        - 配置管理
  watch, 5         - 实时监控
  logs, 6          - 系统日志
  help, 7          - 帮助信息
  exit, 8, quit    - 退出控制台
  
通用命令：
  back             - 返回上级菜单
  refresh          - 刷新当前视图
  clear            - 清屏
  history          - 显示命令历史
```

### 快捷键参考
- `Ctrl+C` - 退出当前操作或整个控制台
- `Tab` - 命令补全
- `↑/↓` - 命令历史导航
- `Ctrl+L` - 清屏

### 状态指示符
- `✓` - 正常/运行中
- `⚠` - 警告/需要注意
- `✗` - 错误/停止
- `⏳` - 等待/处理中
- `ℹ` - 信息提示