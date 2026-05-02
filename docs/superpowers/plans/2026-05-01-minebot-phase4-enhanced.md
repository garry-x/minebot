# Phase 4 — 真实服务器集成验证、可观测性与故障恢复

## 目标

在真实服务器 `115.191.51.70:19132` 上完成端到端验证，确保 bot 能：
1. 稳定登录并持续运行
2. 所有技能（IDLE→GATHERING→COMBAT→CRAFTING→BUILDING→STRONGHOLD→DRAGON_HUNT）在真实环境中可触发
3. 遇到断线/死亡/异常时自动恢复
4. 提供足够运行时可见性以便诊断问题

## 约束

- **密码安全**：绝不写入任何文件，仅通过 stdin 或环境变量传入
- **真实账号**：使用 `duozui@yeah.net` 和对应密码
- **修复所有问题**：不记录为"已知限制"，每个 blocker 都必须解决

---

## 模块一：可观测性（Observability）

### 1.1 Metrics 收集器

新建 `src/telemetry/metrics.ts`：

```typescript
interface BotMetrics {
  tickCount: number;
  tickDurationMs: number[];        // 最近100次tick耗时滑动窗口
  tickDrops: number;               // 超时次数（>100ms）
  connectionUptimeMs: number;
  connectionReconnects: number;
  skillTransitions: Map<string, number>; // 每个技能切换次数
  pathfindingStats: {
    calls: number;
    avgNodes: number;
    avgDurationMs: number;
    failures: number;
  };
  packetStats: Map<string, { in: number; out: number }>;
  entityCount: number;
  chunkCount: number;
  memoryUsageMB: number;
}
```

**用途**：在 tick loop 中每 100 ticks（5s）采样一次，写入 `metrics` 日志字段。

### 1.2 实时状态面板

新建 `src/telemetry/dashboard.ts`：

```typescript
class Dashboard {
  print(): void {
    // 每5秒在终端打印一行状态
    // [16:42:01] IDLE | pos:(120,64,-45) | HP:20/20 | Hunger:18 | Mobs:2 | Chunks:144 | Tick:avg 12ms
  }
}
```

### 1.3 健康检查端点

新建 `src/telemetry/health.ts`：

```typescript
function getHealthReport(): {
  status: "healthy" | "degraded" | "critical";
  checks: {
    connected: boolean;
    tickHealthy: boolean;      // avg tick < 50ms
    pathfindingHealthy: boolean;
    memoryHealthy: boolean;    // < 200MB
  };
  lastError?: string;
}
```

### 1.4 Packet Tracer（调试模式）

在 `Connection` 中增加 `--trace-packets` 模式：
- 打印每个收发的 packet 名称和关键字段
- 不打印 payload 原始数据（避免刷屏）
- 可用于验证 chunk/entity/inventory 包是否到达

---

## 模块二：故障恢复（Resilience）

### 2.1 指数退避重连

在 `Connection` 中实现：

```typescript
class ReconnectPolicy {
  private attempts = 0;
  private maxAttempts = 5;
  private baseDelayMs = 1000;
  private maxDelayMs = 30000;

  nextDelay(): number | null {
    if (this.attempts >= this.maxAttempts) return null;
    const delay = Math.min(
      this.baseDelayMs * Math.pow(2, this.attempts),
      this.maxDelayMs
    );
    this.attempts++;
    return delay;
  }

  reset(): void { this.attempts = 0; }
}
```

**触发条件**：
- 收到 `disconnect` 事件
- `error` 事件（网络错误）
- `isConnected()` 返回 false 但 tick loop 仍在运行

**恢复流程**：
1. 停止 tick loop
2. 清空 WorldState entity cache（避免 stale 数据）
3. 关闭旧 Connection，延迟 `nextDelay()` 后新建 Connection
4. 成功连接后重置 `ReconnectPolicy`，重新开始 tick loop

### 2.2 死亡自动恢复

在 `Bot` 中实现：

```typescript
// 监听 player_death
this.events.on("player_death", ({ message }) => {
  logger.warn({ message }, "Bot died");
  this.isRunning = false;           // 暂停 tick
  this.skills.setCurrent("idle", ctx); // 重置技能
  // 等待 respawn 事件（或 start_game 重发）
});

// 监听 respawn / start_game
this.events.on("spawned", () => {
  if (!this.isRunning) {
    logger.info("Respawned, resuming");
    this.isRunning = true;
  }
});
```

### 2.3 技能崩溃隔离

在 `SkillManager.tick()` 中增强：

```typescript
async tick(ctx: SkillContext): Promise<void> {
  if (!this.current) return;
  try {
    const next = await this.current.tick(ctx);
    // ...
  } catch (err) {
    logger.error({ err, skill: this.current.name }, "Skill tick crashed");
    // 强制切回 idle，不中断 tick loop
    await this.transition(this.skills.get("idle")!, ctx);
    // 记录 metrics
    metrics.recordSkillCrash(this.current.name, err);
  }
}
```

### 2.4 状态快照与恢复

新建 `src/telemetry/snapshot.ts`：

```typescript
class StateSnapshot {
  save(bot: Bot): Snapshot {
    return {
      timestamp: Date.now(),
      position: bot.world.getPlayerPosition(),
      inventory: bot.inventory.getAllItems(),
      skill: bot.skills.getCurrentSkillName(),
      dimension: bot.world.getDimension(),
      health: bot.getHealth(),
      hunger: bot.hunger.getHungerRatio(),
    };
  }
}
```

**用途**：每次 skill 切换时保存快照，崩溃恢复后可打印 "最后已知状态"。

### 2.5 Pathfinding 熔断

在 `Pathfinder.findPath()` 中：

```typescript
if (iterations >= this.maxNodes) {
  logger.warn("Pathfinding timeout — abandoning target");
  metrics.recordPathfindingTimeout(start, end);
  return []; // 空路径触发 skill 的 replan 逻辑
}
```

连续 3 次熔断 → 临时禁用 pathfinding-based skills（如 GATHERING）5s，让 chunk 加载跟上。

---

## 模块三：诊断工具

### 3.1 Ping 工具

```bash
./minebot --host 115.191.51.70 --port 19132 --ping-only
```

输出：
```
Server: 115.191.51.70:19132
Version: bedrock 1.21.50
Players: 3/20
Latency: 45ms
Status: Online
```

### 3.2 连接诊断模式

```bash
./minebot --host 115.191.51.70 --port 19132 --email duozui@yeah.net --diagnose
```

输出每个阶段的耗时：
```
[AUTH] Starting Microsoft OAuth...
[AUTH] Device token obtained (1200ms)
[AUTH] Xbox token obtained (800ms)
[AUTH] Minecraft Bedrock token obtained (600ms)
[CONNECT] Creating RakNet connection...
[CONNECT] Connected (latency: 45ms)
[LOGIN] Sending login packet...
[LOGIN] Start game received (dimension: overworld)
[READY] Bot spawned at (120, 64, -45)
```

### 3.3 Packet 计数器

在 dashboard 中显示：
```
Packets: in 1240/s out 45/s | Chunks: 144 loaded | Entities: 23 tracked
```

---

## 模块四：密码安全

### 4.1 Stdin 密码输入

CLI 增强：如果 `--password` 未提供，提示 stdin 输入（隐藏回显）：

```bash
$ ./minebot --host 115.191.51.70 --port 19132 --email duozui@yeah.net
Password: ********
```

使用 Node.js `readline` + `process.stdin.setRawMode(true)` 隐藏输入。

### 4.2 环境变量支持

```bash
MINEBOT_PASSWORD=<password> ./minebot --host ... --email ...
```

CLI 优先读取 `--password`，其次 `MINEBOT_PASSWORD`，最后 stdin 提示。

---

## 实施计划（8个任务）

### Task 1: ESM Auth 修复
- 修复 `connection.ts` 中 `require('prismarine-auth')` 的 ESM 兼容问题
- 验证 `Authflow` 类在 ESM 下可正常实例化
- **验收标准**：`npx tsc --noEmit` 通过，import 无警告

### Task 2: 密码安全输入
- CLI 支持 `--password` / `MINEBOT_PASSWORD` / stdin 提示三选一
- 密码绝不写入任何文件或日志
- **验收标准**：运行 `./minebot --email duozui@yeah.net`（无密码）时提示输入，隐藏回显

### Task 3: 可观测性基础设施
- 新建 `src/telemetry/metrics.ts`、`dashboard.ts`、`health.ts`
- Bot.tick() 集成 metrics 采样
- 每5秒打印 dashboard 状态行
- **验收标准**：启动后终端每5秒显示 `[time] SKILL | pos | HP | Hunger | Mobs | Chunks | TickAvg`

### Task 4: 故障恢复 — 重连与死亡恢复
- `Connection` 实现指数退避重连（最多5次）
- `Bot` 实现死亡→暂停→respawn→恢复流程
- `SkillManager` 实现技能崩溃隔离
- **验收标准**：模拟 disconnect 后自动重连，模拟死亡后自动恢复 idle

### Task 5: 诊断工具
- 实现 `--ping-only` 模式
- 实现 `--diagnose` 模式（分阶段耗时打印）
- 实现 `--trace-packets` 模式
- **验收标准**：三个 CLI flag 均可独立运行并输出有效信息

### Task 6: 真实服务器端到端验证
- 使用 `duozui@yeah.net` 连接 `115.191.51.70:19132`
- 验证：登录成功 → spawn → IDLE 技能运行 → chunk/entity 数据接收
- 验证：手动在服务器放置矿石，触发 GATHERING 技能
- 验证：手动生成敌对生物，触发 COMBAT 技能
- **验收标准**：连接稳定运行 ≥ 5 分钟，技能可正常触发切换

### Task 7: 性能优化与路径熔断
- Pathfinding 增加熔断计数器和临时禁用逻辑
- Tick 耗时监控和自动降频
- Entity/Chunk 内存泄漏检查
- **验收标准**：64格半径寻路不阻塞 tick loop，内存稳定在 < 150MB

### Task 8: 最终集成检查
- 完整功能清单验证（14个技能/模块逐一确认）
- 错误场景测试（断线、死亡、技能崩溃、pathfinding 超时）
- 代码审查：无 console.log，无 TODO/FIXME，所有异常有日志
- **验收标准**：44个单元测试全通过，tsc 无错误，git clean

---

## 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI Layer                             │
│  --ping-only  --diagnose  --trace-packets  --password/stdin │
├─────────────────────────────────────────────────────────────┤
│                    Telemetry Layer                           │
│  Metrics ──▶ Dashboard ──▶ Health ──▶ StateSnapshot         │
├─────────────────────────────────────────────────────────────┤
│                   Resilience Layer                           │
│  ReconnectPolicy ──▶ DeathRecovery ──▶ SkillCrashGuard      │
│  PathfindingCircuitBreaker ──▶ TickThrottler                 │
├─────────────────────────────────────────────────────────────┤
│                    Core Bot (existing)                       │
│  Auth ──▶ Connection ──▶ WorldState ──▶ Skills ──▶ Planner  │
└─────────────────────────────────────────────────────────────┘
```

## 文件清单

```
src/
  telemetry/
    metrics.ts          # 指标收集
    dashboard.ts        # 实时状态面板
    health.ts           # 健康检查
    snapshot.ts         # 状态快照
  connection/
    reconnect-policy.ts # 重连策略
  cli.ts                # 增强：密码输入、新flag
  bot.ts                # 增强：死亡恢复、metrics集成
  skills/skill-manager.ts # 增强：崩溃隔离
  movement/pathfinding.ts # 增强：熔断逻辑
```
