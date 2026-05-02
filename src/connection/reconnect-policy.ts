export class ReconnectPolicy {
  private attempts = 0;
  private readonly maxAttempts = 5;
  private readonly baseDelayMs = 1000;
  private readonly maxDelayMs = 30000;

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
  getAttempts(): number { return this.attempts; }
}
