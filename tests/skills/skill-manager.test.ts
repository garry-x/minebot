import { describe, it } from "node:test";
import assert from "node:assert";
import { Skill, SkillContext } from "../../src/skills/skill.js";
import { SkillManager } from "../../src/skills/skill-manager.js";

class CountingSkill extends Skill {
  public tickCount = 0;
  public entered = false;
  public exited = false;

  constructor(name: string, priority = 0) {
    super(name, priority);
  }

  async enter(_ctx: SkillContext): Promise<void> {
    this.entered = true;
  }

  async tick(_ctx: SkillContext): Promise<string | null> {
    this.tickCount++;
    return null;
  }

  async exit(_ctx: SkillContext): Promise<void> {
    this.exited = true;
  }
}

describe("SkillManager", () => {
  it("starts with no active skill", () => {
    const mgr = new SkillManager();
    assert.strictEqual(mgr.getCurrentSkillName(), null);
  });

  it("enters and ticks a skill", async () => {
    const mgr = new SkillManager();
    const skill = new CountingSkill("test", 0);
    mgr.register(skill);
    mgr.setCurrent("test", {} as SkillContext);

    assert.ok(skill.entered);
    await mgr.tick({} as SkillContext);
    assert.strictEqual(skill.tickCount, 1);
  });

  it("transitions between skills", async () => {
    const mgr = new SkillManager();
    const skillA = new CountingSkill("a", 0);
    const skillB = new CountingSkill("b", 0);
    mgr.register(skillA);
    mgr.register(skillB);

    mgr.setCurrent("a", {} as SkillContext);
    assert.ok(skillA.entered);
    assert.strictEqual(mgr.getCurrentSkillName(), "a");

    mgr.setCurrent("b", {} as SkillContext);
    assert.ok(skillA.exited);
    assert.ok(skillB.entered);
    assert.strictEqual(mgr.getCurrentSkillName(), "b");
  });

  it("handles transition requested by skill tick", async () => {
    const mgr = new SkillManager();

    class TransitionSkill extends Skill {
      constructor() { super("src", 0); }
      async enter(_ctx: SkillContext): Promise<void> {}
      async tick(_ctx: SkillContext): Promise<string | null> {
        return "target";
      }
      async exit(_ctx: SkillContext): Promise<void> {}
    }

    const src = new TransitionSkill();
    const target = new CountingSkill("target", 0);
    mgr.register(src);
    mgr.register(target);

    mgr.setCurrent("src", {} as SkillContext);
    assert.strictEqual(mgr.getCurrentSkillName(), "src");
    await mgr.tick({} as SkillContext);
    assert.strictEqual(mgr.getCurrentSkillName(), "target");
  });

  it("priority interrupt overrides current skill", async () => {
    const mgr = new SkillManager();
    const low = new CountingSkill("low", 0);
    const high = new CountingSkill("high", 10);
    mgr.register(low);
    mgr.register(high);

    mgr.setCurrent("low", {} as SkillContext);
    assert.strictEqual(mgr.getCurrentSkillName(), "low");

    mgr.requestWithPriority("high", {} as SkillContext);
    assert.strictEqual(mgr.getCurrentSkillName(), "high");
    assert.ok(low.exited);
  });

  it("ignores lower priority interrupt", async () => {
    const mgr = new SkillManager();
    const high = new CountingSkill("high", 10);
    const low = new CountingSkill("low", 0);
    mgr.register(high);
    mgr.register(low);

    mgr.setCurrent("high", {} as SkillContext);
    mgr.requestWithPriority("low", {} as SkillContext);
    assert.strictEqual(mgr.getCurrentSkillName(), "high");
    assert.ok(!high.exited);
  });
});
