import { MetricsCollector } from "./metrics.js";

const HEALTHY_TICK_MS = 50;
const HEALTHY_PATHFINDING_FAILURE_RATE = 0.1;
const HEALTHY_MEMORY_MB = 200;

export interface HealthReport {
  status: "healthy" | "degraded" | "critical";
  checks: {
    connected: boolean;
    tickHealthy: boolean;
    pathfindingHealthy: boolean;
    memoryHealthy: boolean;
  };
  lastError?: string;
}

export function getHealthReport(metrics: MetricsCollector, isConnected: boolean): HealthReport {
  const m = metrics.getMetrics();
  const avgTick = metrics.getAvgTickDurationMs();
  
  const checks = {
    connected: isConnected,
    tickHealthy: avgTick < HEALTHY_TICK_MS,
    pathfindingHealthy: m.pathfindingStats.calls === 0 || m.pathfindingStats.failures < m.pathfindingStats.calls * HEALTHY_PATHFINDING_FAILURE_RATE,
    memoryHealthy: m.memoryUsageMB < HEALTHY_MEMORY_MB,
  };

  let status: HealthReport["status"] = "healthy";
  const failedChecks = Object.values(checks).filter((v) => !v).length;
  if (failedChecks >= 2) status = "critical";
  else if (failedChecks === 1) status = "degraded";

  return { status, checks };
}
