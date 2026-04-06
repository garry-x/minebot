# MineBot CLI 功能点

## ✅ 已完成的功能

### 1. 系统命令
- [x] `minebot help` - 显示帮助信息（彩色输出）
- [x] `minebot status` - 显示系统状态
- [x] `minebot status --json` - JSON格式系统状态

### 2. 服务器管理
- [x] `minebot server start` - 启动Bot服务器
- [x] `minebot server stop` - 停止Bot服务器  
- [x] `minebot server restart` - 重启Bot服务器
- [x] `minebot server logs` - 查看服务器日志
  - [x] `--lines <n>` - 显示最近n行日志
  - [x] `--follow` - 实时跟踪日志
- [x] `minebot server help` - 服务器帮助

### 3. Minecraft服务器管理
- [x] `minebot mc start` - 启动Minecraft服务器
- [x] `minebot mc stop` - 停止Minecraft服务器
- [x] `minebot mc restart` - 重启Minecraft服务器
- [x] `minebot mc status` - 检查服务器状态
- [x] `minebot mc backup` - 显示备份说明
- [x] `minebot mc help` - Minecraft帮助

### 4. Bot控制
- [x] `minebot bot start <username>` - 启动Bot
- [x] `minebot bot stop <bot-id>` - 停止Bot
- [x] `minebot bot automatic <username> [mode]` - 启动自动行为
- [x] `minebot bot list` - 列出所有Bot（彩色状态显示）
- [x] `minebot bot restart <bot-id>` - 重启Bot
- [x] `minebot bot remove <bot-id>` - 移除Bot
- [x] `minebot bot remove all` - 移除所有Bot
- [x] `minebot bot cleanup` - 清理过时Bot
- [x] `minebot bot watch [bot-id]` - 实时监控Bot（合并monitor和inspect）
  - [x] `--interval <ms>` - 更新间隔
  - [x] `--count <n>` - 更新次数限制
- [x] `minebot bot gather` - 收集资源
  - [x] `--botId <id>` - Bot ID
  - [x] `--blocks <list>` - 目标方块列表
  - [x] `--radius <num>` - 搜索半径
- [x] `minebot bot build` - 建造结构
  - [x] `--botId <id>` - Bot ID
  - [x] `--block <type>` - 方块类型
  - [x] `--size <WxLxH>` - 结构尺寸
  - [x] `--offset <x,y,z>` - 偏移位置
- [x] `minebot bot help` - Bot控制帮助

### 5. 配置管理
- [x] `minebot config show` - 显示当前配置
- [x] `minebot config set <key> <value>` - 设置配置值
- [x] `minebot config help` - 配置帮助

### 6. 进化系统管理
- [x] `minebot evolution stats <bot-id>` - 显示进化统计
- [x] `minebot evolution reset <bot-id>` - 重置进化系统
- [x] `minebot evolution help` - 进化系统帮助

### 7. 目标系统管理
- [x] `minebot goal select <bot-id> <goal>` - 选择目标
- [x] `minebot goal status <bot-id>` - 显示目标状态
- [x] `minebot goal help` - 目标系统帮助

### 8. LLM策略管理
- [x] `minebot llm strategy <goal> [context]` - 获取策略建议
- [x] `minebot llm help` - LLM帮助

### 9. 开发模式
- [x] `minebot dev` - 启动开发环境

## 🔧 技术优化

### 用户界面改进
- [x] 彩色输出，提高可读性
- [x] 统一的错误消息格式（✗, ✓, ℹ, ⚠）
- [x] 改进的帮助文本结构
- [x] 参数解析支持 `--key value` 和 `-k value` 格式

### 错误处理
- [x] 连接错误检测（ECONNREFUSED）
- [x] Bot未找到处理
- [x] 服务器未运行时的有用提示
- [x] 超时处理

### 功能合并与优化
- [x] 合并 `monitor` 和 `inspect` 为 `watch`
- [x] 合并 `debug` 到 `server logs --follow`
- [x] 统一所有子系统的帮助格式
- [x] 移除前端依赖，纯CLI模式

## 📊 API覆盖情况

### 已覆盖的API端点
- GET `/api/health` - 系统状态
- GET `/api/bots` - Bot列表
- POST `/api/bot/start` - 启动Bot
- POST `/api/bot/automatic` - 自动行为
- POST `/api/bot/:botId/stop` - 停止Bot
- POST `/api/bot/:botId/restart` - 重启Bot
- DELETE `/api/bot/:botId` - 删除Bot
- DELETE `/api/bots` - 删除所有Bot
- POST `/api/bot/cleanup` - 清理
- GET `/api/bot/:botId/inspect` - 检查Bot
- POST `/api/bot/:botId/gather` - 收集资源
- POST `/api/bot/:botId/build` - 建造
- GET `/api/bot/:botId/evolution/stats` - 进化统计
- POST `/api/bot/:botId/evolution/reset` - 重置进化
- GET `/api/bot/:botId/goal/status` - 目标状态
- POST `/api/bot/:botId/goal/select` - 选择目标
- GET `/api/server/config` - 服务器配置
- PUT `/api/server/config/env` - 更新配置
- POST `/api/llm/strategy` - LLM策略
- GET `/api/server/logs` - 服务器日志
- POST `/api/server/stop` - 停止服务器

### 未覆盖的API端点
- GET `/api/bot/:botId/evolution/history` - 进化历史
- POST `/api/bot/:botId/evolution/record` - 记录经验
- POST `/api/bot/:botId/evolution/rollback` - 回滚进化
- PUT `/api/server/config/database` - 数据库配置
- GET `/api/server/status` - 服务器状态（与health合并）

## 🚀 使用示例

```bash
# 启动系统
minebot server start
minebot mc start

# 创建和管理Bot
minebot bot start MyBot
minebot bot automatic MyBot survival
minebot bot list
minebot bot watch bot_123 --interval 1000

# 资源收集和建造
minebot bot gather --botId bot_123 --blocks oak_log,cobblestone --radius 30
minebot bot build --botId bot_123 --block oak_log --size 5x5x3

# 系统管理
minebot config show
minebot evolution stats bot_123
minebot goal select bot_123 gather

# 监控和调试
minebot status
minebot server logs --follow
minebot server logs --lines 50

# 清理
minebot bot remove all
minebot bot cleanup
minebot server stop
minebot mc stop
```

## 🎯 设计原则

1. **一致性**：所有命令遵循相同的命名和参数模式
2. **可发现性**：帮助系统完整，错误信息有用
3. **用户体验**：彩色输出，进度指示，清晰的状态反馈
4. **功能完整性**：覆盖所有核心API功能
5. **模块化**：系统、子系统和功能清晰分离
6. **错误恢复**：提供有用的错误信息和恢复建议

## 📈 性能优化

1. **减少依赖**：移除前端，减小包大小
2. **并行处理**：异步API调用
3. **缓存优化**：减少重复请求
4. **连接复用**：HTTP连接池
5. **内存管理**：及时清理资源