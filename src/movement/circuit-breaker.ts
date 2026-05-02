import { getLogger } from "../utils/logger.js";

const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_COOLDOWN_MS = 5000;

export class PathfindingCircuitBreaker {
  private consecutiveFailures = 0;
  private disabledUntil = 0;

  recordResult(failed: boolean): void {
    if (failed) {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
        getLogger().warn(
          { consecutiveFailures: this.consecutiveFailures },
          "Pathfinding circuit breaker triggered — disabling for 5s"
        );
        this.disabledUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
      }
    } else {
      this.consecutiveFailures = 0;
    }
  }

  isDisabled(): boolean {
    if (Date.now() < this.disabledUntil) return true;
    if (this.disabledUntil > 0) {
      // Cooldown expired, reset
      this.disabledUntil = 0;
      this.consecutiveFailures = 0;
      getLogger().info("Pathfinding circuit breaker reset");
    }
    return false;
  }

  getStatus(): { failures: number; disabledMs: number } {
    return {
      failures: this.consecutiveFailures,
      disabledMs: Math.max(0, this.disabledUntil - Date.now()),
    };
  }
}
