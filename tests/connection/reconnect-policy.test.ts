import { describe, it } from "node:test";
import assert from "node:assert";
import { ReconnectPolicy } from "../../src/connection/reconnect-policy.js";

describe("ReconnectPolicy", () => {
  it("first attempt returns 1000ms", () => {
    const policy = new ReconnectPolicy();
    assert.strictEqual(policy.nextDelay(), 1000);
  });

  it("second attempt returns 2000ms", () => {
    const policy = new ReconnectPolicy();
    policy.nextDelay();
    assert.strictEqual(policy.nextDelay(), 2000);
  });

  it("fifth attempt returns 16000ms", () => {
    const policy = new ReconnectPolicy();
    policy.nextDelay(); // 1
    policy.nextDelay(); // 2
    policy.nextDelay(); // 3
    policy.nextDelay(); // 4
    assert.strictEqual(policy.nextDelay(), 16000);
  });

  it("sixth attempt returns null", () => {
    const policy = new ReconnectPolicy();
    policy.nextDelay(); // 1
    policy.nextDelay(); // 2
    policy.nextDelay(); // 3
    policy.nextDelay(); // 4
    policy.nextDelay(); // 5
    assert.strictEqual(policy.nextDelay(), null);
  });

  it("reset returns to 1000ms", () => {
    const policy = new ReconnectPolicy();
    policy.nextDelay(); // 1
    policy.nextDelay(); // 2
    policy.reset();
    assert.strictEqual(policy.nextDelay(), 1000);
    assert.strictEqual(policy.getAttempts(), 1);
  });
});
