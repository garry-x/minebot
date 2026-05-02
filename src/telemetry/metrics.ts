const TICK_WINDOW_SIZE = 100;
const TICK_DROP_THRESHOLD_MS = 100;

export interface BotMetrics {
  tickCount: number;
  tickDurationMs: number[];        // sliding window of last 100 ticks
  tickDrops: number;               // ticks > 100ms
  connectionUptimeMs: number;
  connectionReconnects: number;
  skillTransitions: Map<string, number>;
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

export class MetricsCollector {
  private metrics: BotMetrics;
  private connectionStartTime: number = 0;
  
  constructor() {
    this.metrics = {
      tickCount: 0,
      tickDurationMs: [],
      tickDrops: 0,
      connectionUptimeMs: 0,
      connectionReconnects: 0,
      skillTransitions: new Map(),
      pathfindingStats: { calls: 0, avgNodes: 0, avgDurationMs: 0, failures: 0 },
      packetStats: new Map(),
      entityCount: 0,
      chunkCount: 0,
      memoryUsageMB: 0,
    };
  }

  recordTick(durationMs: number): void {
    this.metrics.tickCount++;
    this.metrics.tickDurationMs.push(durationMs);
    if (this.metrics.tickDurationMs.length > TICK_WINDOW_SIZE) {
      this.metrics.tickDurationMs.shift();
    }
    if (durationMs > TICK_DROP_THRESHOLD_MS) {
      this.metrics.tickDrops++;
    }
  }

  recordSkillTransition(skillName: string): void {
    const count = this.metrics.skillTransitions.get(skillName) ?? 0;
    this.metrics.skillTransitions.set(skillName, count + 1);
  }

  recordPathfinding(nodes: number, durationMs: number, failed: boolean): void {
    const stats = this.metrics.pathfindingStats;
    stats.calls++;
    // rolling average
    stats.avgNodes = (stats.avgNodes * (stats.calls - 1) + nodes) / stats.calls;
    stats.avgDurationMs = (stats.avgDurationMs * (stats.calls - 1) + durationMs) / stats.calls;
    if (failed) stats.failures++;
  }

  recordPacket(direction: "in" | "out", packetName: string): void {
    const stats = this.metrics.packetStats.get(packetName) ?? { in: 0, out: 0 };
    stats[direction]++;
    this.metrics.packetStats.set(packetName, stats);
  }

  updateSystemStats(entityCount: number, chunkCount: number): void {
    this.metrics.entityCount = entityCount;
    this.metrics.chunkCount = chunkCount;
    this.metrics.memoryUsageMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    if (this.connectionStartTime > 0) {
      this.metrics.connectionUptimeMs = Date.now() - this.connectionStartTime;
    }
  }

  recordReconnect(): void {
    this.metrics.connectionReconnects++;
    this.connectionStartTime = Date.now();
  }

  startConnection(): void {
    this.connectionStartTime = Date.now();
  }

  getMetrics(): BotMetrics {
    return this.metrics;
  }

  getAvgTickDurationMs(): number {
    const arr = this.metrics.tickDurationMs;
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }
}
